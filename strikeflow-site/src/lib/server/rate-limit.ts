/**
 * RATE LIMITING
 *
 * A public form with no rate limit is an open invitation. Within a week of going
 * live you will have thousands of junk signups, and if the form ever triggers an
 * email you're now a spam relay with your domain's reputation attached.
 *
 * This is a fixed-window counter: count requests per key per window, reject above a
 * threshold. About twenty lines and it stops the overwhelming majority of abuse.
 *
 * ═══ BE HONEST ABOUT THE LIMITS OF THIS ═══
 *
 * The state lives in a `Map` in this process's memory. That means:
 *
 *   - It resets on deploy or restart.
 *   - It does NOT work across multiple instances. Run four containers behind a load
 *     balancer and an attacker effectively gets 4× the limit.
 *   - It does nothing against a distributed attack from many IPs.
 *
 * For a single-instance marketing site it is genuinely adequate, and it's honest to
 * say so. The moment you scale horizontally, move this to Redis (`INCR` plus
 * `EXPIRE` is the same algorithm) or use your CDN's rate limiting, which sees the
 * traffic before it reaches you and is the better answer regardless.
 */

interface Bucket {
	count: number;
	/** Epoch ms when this window ends. */
	resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Reclaim memory from expired buckets.
 *
 * Without this the Map grows forever — one entry per unique IP, never removed. On a
 * long-running server that is a slow memory leak, and "slow memory leak" is how you
 * get paged at 4am six months from now.
 */
function sweep(now: number): void {
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

export interface RateLimitResult {
	readonly allowed: boolean;
	/** Requests left in the current window. */
	readonly remaining: number;
	/** Seconds until the window resets — suitable for a Retry-After header. */
	readonly retryAfterSeconds: number;
}

export interface RateLimitOptions {
	/** Max requests per window. */
	readonly limit?: number;
	/** Window length in milliseconds. */
	readonly windowMs?: number;
}

/**
 * Consume one unit of quota for `key`.
 *
 * @param key Usually the client IP. Could be an email, an API key, or a combination.
 */
export function rateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
	const { limit = 5, windowMs = 60_000 } = options;
	const now = Date.now();

	// Cheap probabilistic cleanup: sweep on roughly 1 in 50 calls rather than
	// running a timer. Avoids keeping a `setInterval` alive for the process lifetime.
	if (Math.random() < 0.02) sweep(now);

	const existing = buckets.get(key);

	if (!existing || existing.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
	}

	existing.count += 1;

	const allowed = existing.count <= limit;
	return {
		allowed,
		remaining: Math.max(0, limit - existing.count),
		retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000)
	};
}

/** Test helper — lets a test start from a known state. */
export function _resetRateLimits(): void {
	buckets.clear();
}
