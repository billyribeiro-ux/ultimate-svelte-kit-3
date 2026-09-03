/**
 * WHO IS THIS BROWSER
 * ===================
 *
 * A signed cookie says "this browser is user X". It is set after a passkey
 * ceremony succeeds (`passkeys.ts`) and read on every request by the
 * `handle` hook. Signed, not encrypted: its contents — an id and a name —
 * are not secret; nobody can *change* them, because the HMAC would no longer
 * match. `crypto.subtle` is in Node and in every browser, so this is four
 * lines rather than a dependency.
 *
 * Pure functions over strings, so the tests need no request.
 */

import * as v from 'valibot';

export interface User {
	id: string;
	name: string;
}

export const COOKIE = 'abacus_session';

/** Three to forty characters; what a person is called, not a login. */
export const NameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(2, 'Two characters at least'),
	v.maxLength(40, 'Forty characters at most')
);

const UserSchema = v.object({
	id: v.pipe(v.string(), v.regex(/^[a-z0-9]{6,32}$/)),
	name: NameSchema,
	/** Issued-at, so a session can be retired by age without a database lookup. */
	iat: v.pipe(v.number(), v.integer())
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

export function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
	const padded = text
		.replaceAll('-', '+')
		.replaceAll('_', '/')
		.padEnd(Math.ceil(text.length / 4) * 4, '=');
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** `payload.signature`, both base64url. */
export async function sign(user: User, secret: string, now = Date.now()): Promise<string> {
	const payload = base64url(
		encoder.encode(JSON.stringify({ id: user.id, name: user.name, iat: Math.floor(now / 1000) }))
	);
	const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload));
	return `${payload}.${base64url(new Uint8Array(signature))}`;
}

/** A session lives thirty days; after that the passkey is asked again. */
export const SESSION_SECONDS = 60 * 60 * 24 * 30;

/**
 * The user a token names, or `null` for anything wrong with it — a missing
 * dot, a bad signature, a payload that is not a user, a session too old. One
 * `null` for every failure, because a caller that distinguishes "tampered"
 * from "expired" is a caller that will one day treat one of them as trusted.
 */
export async function verify(
	token: string | undefined,
	secret: string,
	now = Date.now()
): Promise<User | null> {
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
			UserSchema,
			JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
		);
		if (!parsed.success) return null;
		if (parsed.output.iat + SESSION_SECONDS < Math.floor(now / 1000)) return null;
		return { id: parsed.output.id, name: parsed.output.name };
	} catch {
		return null;
	}
}

/** A new id: 16 characters from the URL-safe alphabet. */
export function newId(length = 16): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from(
		crypto.getRandomValues(new Uint8Array(length)),
		(b) => alphabet[b % alphabet.length]
	).join('');
}
