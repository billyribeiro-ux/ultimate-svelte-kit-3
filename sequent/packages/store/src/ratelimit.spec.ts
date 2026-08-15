import { describe, expect, it } from 'vitest';
import { bucketFor, RateLimiter, rateLimitHeaders } from './ratelimit.ts';

/*
 * Every test here drives time with a number. Nothing sleeps.
 *
 * A rate-limiter suite built on `setTimeout` takes minutes, goes flaky the
 * moment CI is busy, and cannot test the cases that matter — a clock jumping
 * backwards, or an hour passing between two requests.
 */

const CONFIG = { ratePerSecond: 10, capacity: 20 };
const T0 = 1_700_000_000_000;

describe('the bucket', () => {
	it('starts full, so a new client is not throttled on its first request', () => {
		const limiter = new RateLimiter();
		expect(limiter.peek('key-a', CONFIG, T0)).toBe(20);
	});

	it('allows a burst up to capacity', () => {
		const limiter = new RateLimiter();

		for (let index = 0; index < 20; index += 1) {
			expect(limiter.take('key-a', CONFIG, T0).allowed).toBe(true);
		}
	});

	it('refuses once the burst is spent', () => {
		const limiter = new RateLimiter();
		for (let index = 0; index < 20; index += 1) limiter.take('key-a', CONFIG, T0);

		expect(limiter.take('key-a', CONFIG, T0).allowed).toBe(false);
	});

	it('refills at the configured rate', () => {
		const limiter = new RateLimiter();
		for (let index = 0; index < 20; index += 1) limiter.take('key-a', CONFIG, T0);

		// Half a second at 10/s is five tokens.
		expect(limiter.peek('key-a', CONFIG, T0 + 500)).toBe(5);
	});

	it('never refills past capacity, however long the client was idle', () => {
		const limiter = new RateLimiter();
		limiter.take('key-a', CONFIG, T0);

		expect(limiter.peek('key-a', CONFIG, T0 + 86_400_000)).toBe(20);
	});

	it('does not charge for a refused request', () => {
		const limiter = new RateLimiter();
		for (let index = 0; index < 20; index += 1) limiter.take('key-a', CONFIG, T0);

		// Ten refusals, then a second passes. If refusals cost tokens, the bucket
		// would be ten in debt and this would still be empty.
		for (let index = 0; index < 10; index += 1) limiter.take('key-a', CONFIG, T0);

		expect(limiter.peek('key-a', CONFIG, T0 + 1000)).toBe(10);
	});

	it('keeps one client out of another client´s bucket', () => {
		const limiter = new RateLimiter();
		for (let index = 0; index < 20; index += 1) limiter.take('noisy', CONFIG, T0);

		expect(limiter.take('quiet', CONFIG, T0).allowed).toBe(true);
	});
});

describe('the sustained rate', () => {
	it('holds a client at the refill rate once its burst is gone', () => {
		const limiter = new RateLimiter();
		for (let index = 0; index < 20; index += 1) limiter.take('key-a', CONFIG, T0);

		// Ten seconds, asking twice as fast as allowed. At 10/s the answer is 100.
		let allowed = 0;
		for (let ms = 100; ms <= 10_000; ms += 50) {
			if (limiter.take('key-a', CONFIG, T0 + ms).allowed) allowed += 1;
		}

		expect(allowed).toBe(100);
	});

	it('does not let a minute boundary through a double burst', () => {
		/*
		 * The bug a fixed-window counter has: 20 at the end of one window and 20 at
		 * the start of the next is 40 in an instant, and both windows report
		 * compliance. The bucket cannot do it — there are only ever 20 tokens.
		 */
		const limiter = new RateLimiter();

		let allowed = 0;
		for (let index = 0; index < 20; index += 1) {
			if (limiter.take('key-a', CONFIG, T0 + 59_999).allowed) allowed += 1;
		}
		for (let index = 0; index < 20; index += 1) {
			if (limiter.take('key-a', CONFIG, T0 + 60_000).allowed) allowed += 1;
		}

		// 20 from the burst, plus the single token that accrued in the 1ms gap
		// (which rounds to zero), so: 20.
		expect(allowed).toBe(20);
	});
});

describe('clocks that misbehave', () => {
	it('does not lock a client out when time steps backwards', () => {
		const limiter = new RateLimiter();
		limiter.take('key-a', CONFIG, T0 + 60_000);

		// NTP corrects the clock back a minute. A naive `elapsed` is -60s, which
		// would remove 600 tokens and lock the key out for a minute.
		expect(limiter.take('key-a', CONFIG, T0).allowed).toBe(true);
		expect(limiter.peek('key-a', CONFIG, T0)).toBeGreaterThan(0);
	});
});

describe('what the client is told', () => {
	it('reports remaining tokens', () => {
		const limiter = new RateLimiter();
		expect(limiter.take('key-a', CONFIG, T0).remaining).toBe(19);
	});

	it('gives a retry-after of at least one second, never zero', () => {
		const limiter = new RateLimiter();
		for (let index = 0; index < 20; index += 1) limiter.take('key-a', CONFIG, T0);

		// One token at 10/s is 0.1s. Telling a client to wait 0 seconds produces an
		// immediate retry that fails again.
		expect(limiter.take('key-a', CONFIG, T0).retryAfter).toBe(1);
	});

	it('reports a reset time in the future while the bucket is not full', () => {
		const limiter = new RateLimiter();
		const verdict = limiter.take('key-a', CONFIG, T0);

		expect(verdict.resetAt).toBeGreaterThan(T0);
	});

	it('sends Retry-After only on a refusal', () => {
		const limiter = new RateLimiter();

		const ok = rateLimitHeaders(limiter.take('key-a', CONFIG, T0), CONFIG);
		expect(ok['Retry-After']).toBeUndefined();
		expect(ok['RateLimit-Remaining']).toBe('19');

		for (let index = 0; index < 20; index += 1) limiter.take('key-a', CONFIG, T0);
		const refused = rateLimitHeaders(limiter.take('key-a', CONFIG, T0), CONFIG);
		expect(refused['Retry-After']).toBe('1');
	});
});

describe('housekeeping', () => {
	it('forgets buckets nobody has used', () => {
		const limiter = new RateLimiter(60_000);
		limiter.take('gone', CONFIG, T0);
		limiter.take('here', CONFIG, T0 + 120_000);

		expect(limiter.sweep(T0 + 120_000)).toBe(1);
		expect(limiter.size).toBe(1);
	});

	it('loses nothing by forgetting a full bucket', () => {
		const limiter = new RateLimiter(60_000);
		limiter.take('key-a', CONFIG, T0);
		limiter.sweep(T0 + 120_000);

		// Recreated full, which is exactly what the swept bucket had refilled to.
		expect(limiter.peek('key-a', CONFIG, T0 + 120_000)).toBe(20);
	});
});

describe('bucketFor', () => {
	it('gives two seconds of burst', () => {
		expect(bucketFor(20)).toEqual({ ratePerSecond: 20, capacity: 40 });
	});

	it('floors the burst so a slow key is still usable concurrently', () => {
		// At 1/s, two tokens of capacity trips on any client with a bit of
		// parallelism. Five is the smallest number that is not immediately annoying.
		expect(bucketFor(1).capacity).toBe(5);
	});
});
