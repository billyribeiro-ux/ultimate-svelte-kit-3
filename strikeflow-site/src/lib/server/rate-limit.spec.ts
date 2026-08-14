import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { rateLimit, _resetRateLimits } from './rate-limit.ts';

describe('rate limiting', () => {
	beforeEach(() => {
		_resetRateLimits();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('allows requests up to the limit', () => {
		for (let i = 0; i < 5; i += 1) {
			expect(rateLimit('1.2.3.4', { limit: 5 }).allowed).toBe(true);
		}
	});

	it('blocks the request after the limit', () => {
		for (let i = 0; i < 5; i += 1) rateLimit('1.2.3.4', { limit: 5 });

		const result = rateLimit('1.2.3.4', { limit: 5 });
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('counts down remaining correctly', () => {
		expect(rateLimit('a', { limit: 3 }).remaining).toBe(2);
		expect(rateLimit('a', { limit: 3 }).remaining).toBe(1);
		expect(rateLimit('a', { limit: 3 }).remaining).toBe(0);
	});

	it('tracks keys independently', () => {
		for (let i = 0; i < 5; i += 1) rateLimit('noisy', { limit: 5 });

		expect(rateLimit('noisy', { limit: 5 }).allowed).toBe(false);
		// A different client must not be punished for someone else's traffic.
		expect(rateLimit('quiet', { limit: 5 }).allowed).toBe(true);
	});

	it('resets once the window has passed', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));

		for (let i = 0; i < 5; i += 1) rateLimit('1.2.3.4', { limit: 5, windowMs: 60_000 });
		expect(rateLimit('1.2.3.4', { limit: 5, windowMs: 60_000 }).allowed).toBe(false);

		// Step past the end of the window.
		vi.setSystemTime(new Date('2026-08-14T12:01:01Z'));

		expect(rateLimit('1.2.3.4', { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
	});

	it('reports a sensible retry-after', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));

		for (let i = 0; i < 3; i += 1) rateLimit('x', { limit: 3, windowMs: 60_000 });

		// 20 seconds into the window, 40 should remain.
		vi.setSystemTime(new Date('2026-08-14T12:00:20Z'));
		const result = rateLimit('x', { limit: 3, windowMs: 60_000 });

		expect(result.allowed).toBe(false);
		expect(result.retryAfterSeconds).toBe(40);
	});
});
