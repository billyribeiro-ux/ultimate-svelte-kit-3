/**
 * Token signing tests.
 *
 * These run in the "server" Vitest project — plain Node, no browser. That's correct:
 * this module uses `node:crypto` and has no DOM involvement whatsoever.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDownloadToken, verifyDownloadToken } from './tokens.ts';

describe('download tokens', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('round-trips a valid token', () => {
		const token = createDownloadToken('reader@example.com');
		const result = verifyDownloadToken(token);

		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.email).toBe('reader@example.com');
		}
	});

	it('rejects a null token', () => {
		const result = verifyDownloadToken(null);
		expect(result).toEqual({ valid: false, reason: 'malformed' });
	});

	it('rejects a token with no signature', () => {
		const result = verifyDownloadToken('just-a-payload');
		expect(result).toEqual({ valid: false, reason: 'malformed' });
	});

	it('rejects a token with too many segments', () => {
		const result = verifyDownloadToken('a.b.c');
		expect(result).toEqual({ valid: false, reason: 'malformed' });
	});

	/**
	 * The important one. If this test ever fails, anyone can mint themselves a
	 * download link — or change whose email is attributed to a download.
	 */
	it('rejects a tampered payload', () => {
		const token = createDownloadToken('reader@example.com');
		const [, signature] = token.split('.');

		// Re-encode a payload claiming a different email, keeping the old signature.
		const forgedPayload = Buffer.from(
			JSON.stringify({ email: 'attacker@example.com', exp: Date.now() + 100_000 })
		).toString('base64url');

		const result = verifyDownloadToken(`${forgedPayload}.${signature}`);
		expect(result).toEqual({ valid: false, reason: 'bad-signature' });
	});

	it('rejects a tampered signature', () => {
		const token = createDownloadToken('reader@example.com');
		const [payload] = token.split('.');
		const result = verifyDownloadToken(`${payload}.notarealsignature`);

		expect(result.valid).toBe(false);
	});

	it('rejects an expired token', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));

		const token = createDownloadToken('reader@example.com');
		expect(verifyDownloadToken(token).valid).toBe(true);

		// Tokens last 24 hours. Step 25 hours forward.
		vi.setSystemTime(new Date('2026-08-15T13:00:00Z'));

		expect(verifyDownloadToken(token)).toEqual({ valid: false, reason: 'expired' });
	});

	it('is still valid just before expiry', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));

		const token = createDownloadToken('reader@example.com');

		// 23 hours 59 minutes later — inside the window.
		vi.setSystemTime(new Date('2026-08-15T11:59:00Z'));

		expect(verifyDownloadToken(token).valid).toBe(true);
	});

	it('preserves an email containing a plus tag', () => {
		// A real address people use to filter mail. Mangling it loses them the guide.
		const token = createDownloadToken('reader+strikeflow@example.com');
		const result = verifyDownloadToken(token);

		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.email).toBe('reader+strikeflow@example.com');
		}
	});

	it('produces URL-safe output', () => {
		// base64url must not contain +, / or = — all of which would need escaping
		// in a query string and would break the link when copied out of an email.
		for (const email of ['a@b.com', 'someone.long+tag@subdomain.example.co.uk']) {
			const token = createDownloadToken(email);
			expect(token).not.toMatch(/[+/=]/);
		}
	});
});
