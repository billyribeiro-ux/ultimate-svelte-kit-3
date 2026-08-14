/**
 * Identifier generation.
 *
 * Three different jobs, three different shapes — because an ID that is good at
 * one of them is usually bad at the others.
 */

/**
 * Crockford's Base32: the digits, then the alphabet minus I, L, O and U.
 *
 * I/1, L/1 and O/0 are removed because a customer will read a booking reference
 * off a screen and type it into a phone. U is removed because dropping it makes
 * accidental profanity essentially impossible.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * `n` random characters from the alphabet above, drawn from the platform CSPRNG.
 *
 * The rejection loop matters. `randomValue % 32` looks equivalent and is not:
 * a byte is 0–255, and 256 is exactly 8 × 32, so for a 32-character alphabet the
 * modulo happens to be uniform. Change the alphabet length to 33 tomorrow and the
 * first few characters silently become more likely than the rest — a bias that no
 * test will catch and that quietly shrinks your keyspace. Rejecting the values
 * that do not divide evenly is uniform for *any* alphabet length.
 */
function randomString(n: number): string {
	const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
	let out = '';
	const buffer = new Uint8Array(n * 2);

	while (out.length < n) {
		crypto.getRandomValues(buffer);
		for (const byte of buffer) {
			if (byte >= max) continue;
			out += ALPHABET[byte % ALPHABET.length];
			if (out.length === n) break;
		}
	}

	return out;
}

/**
 * A primary key for a row. Never shown to a human, never in a URL, so a UUID's
 * ugliness costs nothing and its collision resistance is free.
 */
export function newId(): string {
	return crypto.randomUUID();
}

/**
 * A booking reference a human reads aloud: `HP-7K3QD9`.
 *
 * 8 random characters from a 32-symbol alphabet is 40 bits — about a trillion
 * possibilities. It is short enough to say over the phone and long enough that a
 * unique index will effectively never reject one. It is NOT a secret: knowing a
 * reference proves nothing, which is why cancelling needs the token below.
 */
export function newBookingReference(): string {
	return `HP-${randomString(8)}`;
}

/**
 * The secret in the "manage your booking" link we email to a customer.
 *
 * This is a bearer credential — whoever holds it can cancel the appointment — so
 * it is sized like one. 26 characters is 130 bits, comfortably beyond guessing,
 * and it is compared in the database by a unique index rather than by a `LIKE`.
 */
export function newManageToken(): string {
	return randomString(26);
}
