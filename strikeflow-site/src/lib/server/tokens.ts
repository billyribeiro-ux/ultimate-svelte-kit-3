/**
 * SIGNED DOWNLOAD TOKENS
 * ======================
 *
 * The ebook is gated behind an email address. That gate is worthless if the download
 * URL is guessable or shareable forever, so we hand out a signed, expiring token.
 *
 * WHY NOT JUST A RANDOM ID IN A DATABASE?
 * You could. A signed token has one advantage that matters here: it's *stateless*.
 * The token carries its own expiry and its own proof of authenticity, so verifying it
 * is pure computation — no database round-trip, and it works identically across as
 * many server instances as you like.
 *
 * HOW AN HMAC WORKS, IN ONE PARAGRAPH
 * We take the data we want to protect (`payload`) and run it through a hash together
 * with a secret only the server knows. The result is a signature. Anyone can read the
 * payload — it isn't encrypted — but nobody can produce a valid signature for a
 * *modified* payload without the secret. So a user can see their token expires at
 * 3pm, and can't change it to next year.
 *
 * The file lives in `src/lib/server/`. SvelteKit refuses to bundle anything under
 * that directory into client code — if you accidentally import it into a component,
 * the build fails rather than shipping your signing key to the browser. That's a
 * hard guarantee from the framework, not a convention.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { EBOOK_TOKEN_SECRET } from '$app/env/private';

/**
 * The signing key.
 *
 * If `EBOOK_TOKEN_SECRET` is unset we generate a random one at boot. That keeps the
 * project runnable with zero setup, at the cost of invalidating every outstanding
 * link on restart — a deliberately visible symptom, so it gets fixed before deploy
 * rather than silently running on a default key in production.
 */
const secret: string = EBOOK_TOKEN_SECRET ?? randomBytes(32).toString('hex');

if (!EBOOK_TOKEN_SECRET) {
	console.warn(
		'[tokens] EBOOK_TOKEN_SECRET is not set — using an ephemeral key.\n' +
			'         Download links will stop working when the server restarts.\n' +
			'         Set it in .env before deploying. See .env.example.'
	);
}

/** How long a download link stays valid. Long enough to be useful; short enough to matter. */
const TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

interface TokenPayload {
	/** Who it was issued to. Lets us attribute a download without a database lookup. */
	email: string;
	/** Expiry, as epoch milliseconds. */
	exp: number;
}

/**
 * base64url — the URL-safe variant of base64.
 *
 * Standard base64 uses `+`, `/` and `=`, all of which need escaping in a query
 * string. base64url swaps them for `-`, `_` and nothing. Node supports it natively.
 */
function encode(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
	return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Issue a token for an email address. */
export function createDownloadToken(email: string): string {
	const payload: TokenPayload = {
		email,
		exp: Date.now() + TTL_MS
	};

	const encoded = encode(JSON.stringify(payload));
	return `${encoded}.${sign(encoded)}`;
}

export type TokenResult =
	| { valid: true; email: string }
	| { valid: false; reason: 'malformed' | 'bad-signature' | 'expired' };

/**
 * Verify a token.
 *
 * Returns a discriminated union rather than throwing, so the caller has to handle
 * the failure case — and can tell "expired" (offer a re-send) apart from
 * "bad signature" (someone is poking at it).
 */
export function verifyDownloadToken(token: string | null): TokenResult {
	if (!token) return { valid: false, reason: 'malformed' };

	const parts = token.split('.');
	if (parts.length !== 2) return { valid: false, reason: 'malformed' };

	const [encoded, signature] = parts;
	if (!encoded || !signature) return { valid: false, reason: 'malformed' };

	const expected = sign(encoded);

	/*
	 * `timingSafeEqual`, NOT `===`.
	 *
	 * A normal string comparison returns as soon as it finds a differing character.
	 * That means comparing "aaaa" takes fractionally longer than "zaaa" when the real
	 * signature starts with "a" — and an attacker who can measure that difference can
	 * recover the signature one character at a time. It's called a timing attack, and
	 * it's practical over a local network.
	 *
	 * `timingSafeEqual` always compares the full length. It requires equal-length
	 * buffers, so we length-check first — and that check is safe to short-circuit,
	 * because the length of a signature isn't a secret.
	 */
	const expectedBuffer = Buffer.from(expected);
	const providedBuffer = Buffer.from(signature);

	if (expectedBuffer.length !== providedBuffer.length) {
		return { valid: false, reason: 'bad-signature' };
	}

	if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
		return { valid: false, reason: 'bad-signature' };
	}

	// Only now, with the signature proven, do we trust the payload's contents.
	let payload: TokenPayload;
	try {
		payload = JSON.parse(decode(encoded)) as TokenPayload;
	} catch {
		return { valid: false, reason: 'malformed' };
	}

	if (typeof payload.exp !== 'number' || typeof payload.email !== 'string') {
		return { valid: false, reason: 'malformed' };
	}

	if (Date.now() > payload.exp) {
		return { valid: false, reason: 'expired' };
	}

	return { valid: true, email: payload.email };
}
