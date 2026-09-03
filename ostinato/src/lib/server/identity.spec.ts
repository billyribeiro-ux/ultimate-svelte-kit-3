import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { HandleSchema, sign, verify } from './identity.ts';

const SECRET = 'a-test-secret-that-is-at-least-thirty-two-characters';
const artist = { id: 'abcdefghij123456', handle: 'drummachine' };

describe('the artist cookie', () => {
	it('round-trips', async () => {
		const token = await sign(artist, SECRET);
		expect(await verify(token, SECRET)).toEqual(artist);
	});

	it('is two base64url parts joined by a dot', async () => {
		const token = await sign(artist, SECRET);
		expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
	});

	it('refuses a payload that was edited', async () => {
		const token = await sign(artist, SECRET);
		const [, signature] = token.split('.');
		const forged = btoa(JSON.stringify({ ...artist, handle: 'someoneelse' }))
			.replaceAll('+', '-')
			.replaceAll('/', '_')
			.replace(/=+$/, '');

		expect(await verify(`${forged}.${signature}`, SECRET)).toBeNull();
	});

	it('refuses a token signed with a different secret', async () => {
		const token = await sign(artist, 'another-secret-that-is-also-thirty-two-chars');
		expect(await verify(token, SECRET)).toBeNull();
	});

	it('refuses garbage without throwing', async () => {
		expect(await verify(undefined, SECRET)).toBeNull();
		expect(await verify('', SECRET)).toBeNull();
		expect(await verify('no-dot-here', SECRET)).toBeNull();
		expect(await verify('a.b', SECRET)).toBeNull();
		expect(await verify('!!!.???', SECRET)).toBeNull();
	});

	it('refuses a correctly signed payload that is not an artist', async () => {
		// Sign something with the right secret but the wrong shape, by going
		// through `sign` with a value the types would not normally allow.
		const token = await sign({ id: 'x', handle: 'y' } as never, SECRET);
		expect(await verify(token, SECRET)).toBeNull();
	});
});

describe('handles', () => {
	it('lower-cases and trims', () => {
		expect(v.parse(HandleSchema, '  DrumMachine ')).toBe('drummachine');
	});

	it('rejects what would not survive a URL', () => {
		expect(v.safeParse(HandleSchema, 'ab').success).toBe(false);
		expect(v.safeParse(HandleSchema, 'has space').success).toBe(false);
		expect(v.safeParse(HandleSchema, 'twenty-one-characters!').success).toBe(false);
		expect(v.safeParse(HandleSchema, 'fine_123').success).toBe(true);
	});
});
