/**
 * Two kinds of identifier, for two audiences.
 *
 * `newId()` is a UUID: for rows, never shown to a person, never typed.
 * `newSlug()` is ten characters from an alphabet with no `0`/`o`, `1`/`l`/`i`
 * confusions, because a trip's slug is read out loud across a table
 * ("meridian.app/t/kx7m4p2q9w") and typed from a photo.
 */

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newId(): string {
	return crypto.randomUUID();
}

/**
 * Ten random characters is ~49 bits — nobody guesses one. The `% 31` has a
 * bias of one part in 256 per character, which matters for a password and
 * not for a share link.
 */
export function newSlug(length = 10): string {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let out = '';
	for (const byte of bytes) out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
	return out;
}

/** What `src/params/slug.ts` and the schemas accept. */
export const SLUG = /^[a-z2-9]{6,32}$/;
