/**
 * API KEY CRYPTOGRAPHY
 * ====================
 *
 * Minting, hashing and the visible prefix. Deliberately free of any database
 * import, which is not tidiness — it is what lets the seed script and the test
 * suite use exactly the same functions the server uses, under plain Node, with
 * no Vite and no `$app/env`. A helper that reaches for the database drags the
 * whole environment in with it.
 */

/**
 * A key's visible prefix, for telling two apart in a list.
 *
 * `sxt_` then eight characters. The prefix is stored in clear and the rest never
 * is, which is what lets the interface show `sxt_a1b2c3d4…` beside "created by
 * Ada, last used 3 minutes ago" without the row being a live credential.
 */
export function prefixOf(key: string): string {
	return key.slice(0, 12);
}

/**
 * Hash a key for storage and lookup.
 *
 * SHA-256 rather than a password hash, and that is a deliberate difference from
 * how passwords are stored. A password is low-entropy and human-chosen, so it
 * needs a slow hash to make guessing expensive. An API key is 256 bits of
 * randomness from `crypto.getRandomValues`, so guessing is not a threat and the
 * only requirement is that the stored form is not usable — which SHA-256 gives.
 *
 * The practical consequence is that key lookup is an indexed equality on a hash
 * computed in microseconds, rather than a scan comparing bcrypt hashes one row
 * at a time. Using bcrypt here would mean ingest could not look a key up at all
 * without scanning every key the tenant has.
 */
export async function hashKey(key: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Mint a key. Returned once, in clear, and never recoverable afterwards. */
export function newKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const body = [...bytes].map((byte) => byte.toString(36).padStart(2, '0')).join('');
	return `sxt_${body.slice(0, 40)}`;
}
