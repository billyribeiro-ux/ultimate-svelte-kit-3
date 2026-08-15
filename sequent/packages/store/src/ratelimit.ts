/**
 * Rate limiting: a token bucket, and why not the simpler thing.
 *
 * ## The simpler thing, and what it does wrong
 *
 * The obvious limiter is a counter per minute: allow 60, reset on the minute.
 * It is three lines and it has a hole you can drive a lorry through. A client
 * sends 60 requests at 11:00:59 and 60 more at 11:01:00 — two counters, both
 * within limit, 120 requests in one second. The venue sees exactly the burst
 * the limit existed to prevent, and the graph of "requests per minute" says
 * everything is fine.
 *
 * ## The token bucket
 *
 * A bucket holds tokens. Each request costs one. Tokens refill at a steady
 * rate, and the bucket has a ceiling.
 *
 * That gives you two knobs that mean different things, which is the whole
 * point. The **refill rate** is the sustained throughput you are willing to
 * serve. The **capacity** is how much burst you will tolerate from a client
 * that has been quiet — and a market maker who sits still for a minute and then
 * cancels forty orders because the market moved is doing something entirely
 * reasonable that a flat counter would punish.
 *
 * ## No timers
 *
 * The bucket does not refill on a schedule. It works out how much time has
 * passed since it was last touched and adds that much, at the moment somebody
 * asks. Ten thousand idle keys cost ten thousand small objects and zero
 * scheduled work; with a timer per key they would cost ten thousand wakeups a
 * second to do nothing.
 *
 * `now` is a parameter, so the tests drive time by passing numbers rather than
 * by sleeping. A rate-limit test suite built on `setTimeout` is slow, flaky on
 * a loaded CI box, and cannot check the interesting cases at all.
 *
 * ## What this is not
 *
 * It is in-memory and therefore per-process. Two web servers behind a load
 * balancer give a client two buckets. That is a deliberate limit, not an
 * oversight: a shared limiter needs Redis or similar in the request path, and
 * for a venue whose gateway is a single writer anyway, the honest fix is to say
 * so rather than to pretend a local counter is global.
 */

export interface BucketConfig {
	/** Tokens added per second — the sustained rate. */
	readonly ratePerSecond: number;
	/** Ceiling — the largest burst allowed after an idle period. */
	readonly capacity: number;
}

export interface Verdict {
	readonly allowed: boolean;
	/** Whole tokens left after this request. What goes in `X-RateLimit-Remaining`. */
	readonly remaining: number;
	/** Seconds until one token exists, for `Retry-After`. Zero when allowed. */
	readonly retryAfter: number;
	/** Unix ms at which the bucket is full again, for `X-RateLimit-Reset`. */
	readonly resetAt: number;
}

interface Bucket {
	tokens: number;
	lastRefill: number;
}

/**
 * A set of buckets, one per key.
 *
 * A class rather than module-level state because tests need a fresh limiter per
 * case, and a module-level `Map` makes every test depend on the order the
 * others ran in.
 */
export class RateLimiter {
	readonly #buckets = new Map<string, Bucket>();
	readonly #sweepAfterMs: number;

	constructor(sweepAfterMs = 10 * 60_000) {
		this.#sweepAfterMs = sweepAfterMs;
	}

	/**
	 * Spend a token if there is one.
	 *
	 * Note that a refused request does **not** consume a token. A limiter that
	 * charges for rejections punishes a client that is already backing off, and
	 * pushes a misbehaving one into a state it can never leave — every retry
	 * resets the clock, so the retries never stop.
	 */
	take(key: string, config: BucketConfig, now: number, cost = 1): Verdict {
		const bucket = this.#refill(key, config, now);

		if (bucket.tokens < cost) {
			const short = cost - bucket.tokens;
			return {
				allowed: false,
				remaining: Math.floor(bucket.tokens),
				// Rounded **up**: telling a client to wait 0 seconds when it needs 0.4
				// produces a retry that fails again immediately.
				retryAfter: Math.max(1, Math.ceil(short / config.ratePerSecond)),
				resetAt: this.#fullAt(bucket, config, now)
			};
		}

		bucket.tokens -= cost;

		return {
			allowed: true,
			remaining: Math.floor(bucket.tokens),
			retryAfter: 0,
			resetAt: this.#fullAt(bucket, config, now)
		};
	}

	/** What `take` would say, without spending anything. For diagnostics. */
	peek(key: string, config: BucketConfig, now: number): number {
		return Math.floor(this.#refill(key, config, now).tokens);
	}

	/**
	 * Drop buckets nobody has touched in a while.
	 *
	 * Without this the map grows once per key seen, forever, and a venue that has
	 * issued fifty thousand keys over two years holds fifty thousand buckets to
	 * rate-limit the four that are still in use. A full bucket carries no
	 * information — recreating it gives exactly the same answer — so forgetting it
	 * is free.
	 */
	sweep(now: number): number {
		let dropped = 0;

		for (const [key, bucket] of this.#buckets) {
			if (now - bucket.lastRefill > this.#sweepAfterMs) {
				this.#buckets.delete(key);
				dropped += 1;
			}
		}

		return dropped;
	}

	get size(): number {
		return this.#buckets.size;
	}

	#refill(key: string, config: BucketConfig, now: number): Bucket {
		const existing = this.#buckets.get(key);

		if (!existing) {
			// A key seen for the first time starts full. The alternative — starting
			// empty — throttles every new client's first request, which looks exactly
			// like the venue being down.
			const fresh: Bucket = { tokens: config.capacity, lastRefill: now };
			this.#buckets.set(key, fresh);
			return fresh;
		}

		/*
		 * `Math.max(0, ...)` guards against time going backwards.
		 *
		 * It does, on real machines: NTP steps the clock, and a container can be
		 * migrated. A negative elapsed would *remove* tokens, and a bucket driven
		 * negative by a clock adjustment locks a client out for as long as the jump
		 * was — which is a five-minute outage caused by a time sync, and one nobody
		 * would think to look for.
		 */
		const elapsed = Math.max(0, now - existing.lastRefill) / 1000;

		existing.tokens = Math.min(config.capacity, existing.tokens + elapsed * config.ratePerSecond);
		existing.lastRefill = now;

		return existing;
	}

	#fullAt(bucket: Bucket, config: BucketConfig, now: number): number {
		const missing = config.capacity - bucket.tokens;
		if (missing <= 0) return now;
		return now + Math.ceil((missing / config.ratePerSecond) * 1000);
	}
}

/**
 * The bucket for a key, derived from its configured rate.
 *
 * Capacity is two seconds' worth, with a floor of five. The floor exists
 * because a key rated at one request a second would otherwise have a capacity
 * of two, and two is close enough to zero that any client with a bit of
 * concurrency trips it constantly.
 */
export function bucketFor(ratePerSecond: number): BucketConfig {
	return {
		ratePerSecond,
		capacity: Math.max(5, ratePerSecond * 2)
	};
}

/** The headers every rate-limited response carries, allowed or not. */
export function rateLimitHeaders(verdict: Verdict, config: BucketConfig): Record<string, string> {
	const headers: Record<string, string> = {
		'RateLimit-Limit': String(config.capacity),
		'RateLimit-Remaining': String(verdict.remaining),
		'RateLimit-Reset': String(Math.ceil(verdict.resetAt / 1000))
	};

	// `Retry-After` is only meaningful on a refusal, and sending it on a 200
	// confuses clients that treat its presence as "back off".
	if (!verdict.allowed) headers['Retry-After'] = String(verdict.retryAfter);

	return headers;
}
