/**
 * WHO IS THIS BROWSER
 * ===================
 *
 * Ostinato has no sign-in. When somebody publishes a pattern they choose a
 * handle, and from then on a signed cookie says "this browser is @handle".
 * That is enough to own patterns and to delete them, and it is the whole of
 * the identity system.
 *
 * THE COOKIE IS SIGNED, NOT ENCRYPTED
 * -----------------------------------
 * Its contents — an id and a handle — are not secret; anybody can read them
 * and nobody can *change* them, because the signature would no longer match.
 * HMAC-SHA256 over the payload with `SESSION_SECRET` is what makes forging a
 * cookie for somebody else's handle infeasible, and `crypto.subtle` is what
 * makes that four lines rather than a dependency.
 *
 * Pure functions over strings, so the tests need no request.
 */

import * as v from 'valibot';
import { HandleSchema } from '#lib/handle.ts';

export interface Artist {
	id: string;
	handle: string;
}

export const COOKIE = 'ostinato_artist';

export { HandleSchema } from '#lib/handle.ts';

const ArtistSchema = v.object({
	id: v.pipe(v.string(), v.regex(/^[a-z0-9]{6,32}$/)),
	handle: HandleSchema
});

const encoder = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
	const padded = text
		.replaceAll('-', '+')
		.replaceAll('_', '/')
		.padEnd(Math.ceil(text.length / 4) * 4, '=');
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** `payload.signature`, both base64url. */
export async function sign(artist: Artist, secret: string): Promise<string> {
	const payload = base64url(encoder.encode(JSON.stringify(artist)));
	const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload));
	return `${payload}.${base64url(new Uint8Array(signature))}`;
}

/**
 * The artist a token names, or `null` for anything wrong with it — a missing
 * dot, a bad signature, a payload that is not an artist. One `null` for every
 * failure, because a caller that distinguishes "tampered" from "malformed"
 * is a caller that will one day treat one of them as trusted.
 */
export async function verify(token: string | undefined, secret: string): Promise<Artist | null> {
	if (!token) return null;
	const dot = token.indexOf('.');
	if (dot === -1) return null;

	const payload = token.slice(0, dot);
	const signature = token.slice(dot + 1);

	let ok: boolean;
	try {
		ok = await crypto.subtle.verify(
			'HMAC',
			await key(secret),
			fromBase64url(signature),
			encoder.encode(payload)
		);
	} catch {
		return null;
	}
	if (!ok) return null;

	try {
		const parsed = v.safeParse(
			ArtistSchema,
			JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
		);
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
}

/** A new artist id: 16 characters from the URL-safe alphabet. */
export function artistId(): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from(
		crypto.getRandomValues(new Uint8Array(16)),
		(b) => alphabet[b % alphabet.length]
	).join('');
}
