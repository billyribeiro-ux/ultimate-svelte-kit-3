import { describe, expect, it } from 'vitest';
import { sign, verify, SESSION_SECONDS } from './identity.ts';

const SECRET = 'a-test-secret-that-is-at-least-thirty-two-characters';
const user = { id: 'abcdefghij123456', name: 'Ada' };

describe('the session cookie', () => {
	it('round-trips', async () => {
		expect(await verify(await sign(user, SECRET), SECRET)).toEqual(user);
	});

	it('refuses an edited payload, another secret, and garbage', async () => {
		const token = await sign(user, SECRET);
		const [, signature] = token.split('.');
		const forged = btoa(JSON.stringify({ ...user, name: 'Eve', iat: 1 }))
			.replaceAll('+', '-')
			.replaceAll('/', '_')
			.replace(/=+$/, '');
		expect(await verify(`${forged}.${signature}`, SECRET)).toBeNull();
		expect(await verify(token, 'another-secret-that-is-also-thirty-two-chars')).toBeNull();
		expect(await verify(undefined, SECRET)).toBeNull();
		expect(await verify('no-dot', SECRET)).toBeNull();
		expect(await verify('a.b', SECRET)).toBeNull();
	});

	it('expires without a database', async () => {
		const issued = Date.UTC(2026, 0, 1);
		const token = await sign(user, SECRET, issued);
		expect(await verify(token, SECRET, issued + (SESSION_SECONDS - 1) * 1000)).toEqual(user);
		expect(await verify(token, SECRET, issued + (SESSION_SECONDS + 1) * 1000)).toBeNull();
	});
});
