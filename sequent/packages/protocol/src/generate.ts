/**
 * Identifier generation. Server side only, and enforced by the module graph.
 *
 * This file is deliberately **not** re-exported from `index.ts`. It is reached
 * as `@sequent/protocol/generate`, which means:
 *
 *   - the browser bundle cannot pull it in, because importing it would drag
 *     `node:crypto` into a client build and the bundler would refuse;
 *   - `@sequent/core` — the matching engine — cannot reach it either, because
 *     the engine imports the package root and nothing else.
 *
 * That second point is the one that matters. The engine must be a pure function
 * of its input log, and a single `newId()` call inside it would break replay in
 * a way no test would notice: the books would match, the trade identifiers
 * would not, and every downstream join would silently start returning nothing.
 *
 * A comment saying "don't call this from the engine" would be a wish. A module
 * the engine cannot import is a rule.
 */

import { randomFillSync } from 'node:crypto';

/**
 * Crockford's Base32 alphabet.
 *
 * Thirty-two characters with `I`, `L`, `O` and `U` removed. The first three go
 * because they are indistinguishable from `1`, `1` and `0` when somebody reads
 * an identifier off a screen and types it into a support ticket; `U` goes
 * because its absence means the encoding cannot accidentally spell anything
 * unfortunate.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A fresh, sortable, unguessable identifier.
 *
 * The layout is ULID-shaped: 48 bits of millisecond timestamp, then 80 bits of
 * randomness, encoded as 26 characters of Base32.
 *
 * **Sortable** is not a nicety. Because the timestamp is most-significant,
 * sorting these strings sorts them by creation time — so a database index on an
 * id column is also an index on age, and every insert lands at the right-hand
 * edge of the B-tree instead of scattering through it. A UUIDv4 primary key on
 * a busy table fragments the index and turns inserts into random writes; this
 * does not.
 *
 * **Unguessable** matters because these identifiers appear in URLs and API
 * responses. 80 bits of entropy per millisecond is enough that enumerating
 * other firms' orders is not a thing anybody will manage.
 *
 * `now` is a parameter rather than a call to `Date.now()` inside, purely so the
 * tests can assert that two ids minted in the same millisecond still differ and
 * that ids minted later sort after ids minted earlier.
 */
export function newId(now: number = Date.now()): string {
	if (!Number.isInteger(now) || now < 0) {
		throw new RangeError(`timestamp must be a non-negative integer, got ${now}`);
	}

	const bytes = randomFillSync(new Uint8Array(10));

	// 48 bits of timestamp → 10 characters.
	let timestamp = now;
	let out = '';
	for (let i = 0; i < 10; i += 1) {
		out = CROCKFORD[timestamp % 32]! + out;
		timestamp = Math.floor(timestamp / 32);
	}

	/*
	 * 80 bits of randomness → 16 characters.
	 *
	 * `BigInt` rather than shifting a `number`, because JavaScript's bitwise
	 * operators coerce to 32-bit integers. Shifting 80 bits of entropy through
	 * `>>` would silently discard everything above bit 31 and leave the last few
	 * characters constant — an entropy loss that produces perfectly
	 * plausible-looking ids and no error at all.
	 */
	let carry = 0n;
	for (const byte of bytes) carry = (carry << 8n) | BigInt(byte);

	let random = '';
	for (let i = 0; i < 16; i += 1) {
		random = CROCKFORD[Number(carry & 31n)]! + random;
		carry >>= 5n;
	}

	return out + random;
}
