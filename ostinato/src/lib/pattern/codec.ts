/**
 * A PATTERN IN A URL
 * ==================
 *
 * `?p=…` on the studio is the whole pattern, so a link *is* a save. No account,
 * no database, no "this link will expire" — paste it into a chat and the other
 * person opens your groove.
 *
 * That only works if the encoding is small. JSON of a four-track pattern is
 * about two kilobytes, which some chat clients truncate and every one of them
 * makes ugly. This packs the same thing into around two hundred characters of
 * base64url, which is a line.
 *
 * THE FORMAT
 * ----------
 * A byte layout, big-endian where it matters, and versioned by its first byte
 * so that a link made today still opens after the format grows:
 *
 *   [version=1] [bpm] [swing×255] [title length] [title utf-8 …]
 *   [track count]
 *   per track:
 *     [kind index] [gain×255] [pan+1 ×127] [tone×255] [decay×255] [flags]
 *     [name length] [name utf-8 …]
 *     16 × [velocity]
 *     16 × [note]        — melodic tracks only; a drum has no use for one
 *
 * Track ids are not encoded — they are regenerated on decode, because they only
 * exist to key a `{#each}` and mean nothing to another browser.
 */

import { Note } from '#lib/music/note.ts';
import {
	defaultNote,
	KINDS,
	MAX_TRACKS,
	MELODIC,
	STEPS,
	shortId,
	type Kind,
	type Pattern,
	type Track
} from './model.ts';

const VERSION = 1;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A number in `[0, 1]` as one byte, and back. Symmetric to within 1/255. */
const toByte = (unit: number) => Math.round(Math.min(1, Math.max(0, unit)) * 255);
const fromByte = (byte: number) => byte / 255;

class Writer {
	#bytes: number[] = [];

	byte(value: number) {
		this.#bytes.push(value & 0xff);
	}

	/** A length-prefixed UTF-8 string, capped at 255 bytes. */
	text(value: string) {
		const bytes = encoder.encode(value).slice(0, 255);
		this.byte(bytes.length);
		for (const b of bytes) this.byte(b);
	}

	finish(): Uint8Array {
		return Uint8Array.from(this.#bytes);
	}
}

class Reader {
	#offset = 0;

	constructor(private readonly bytes: Uint8Array) {}

	byte(): number {
		const value = this.bytes[this.#offset];
		if (value === undefined) throw new RangeError('Pattern data ended early');
		this.#offset += 1;
		return value;
	}

	text(): string {
		const length = this.byte();
		const slice = this.bytes.subarray(this.#offset, this.#offset + length);
		if (slice.length < length) throw new RangeError('Pattern data ended early');
		this.#offset += length;
		return decoder.decode(slice);
	}
}

export function encodePattern(pattern: Pattern): string {
	const w = new Writer();

	w.byte(VERSION);
	w.byte(pattern.bpm);
	w.byte(toByte(pattern.swing));
	w.text(pattern.title);
	w.byte(Math.min(MAX_TRACKS, pattern.tracks.length));

	for (const track of pattern.tracks.slice(0, MAX_TRACKS)) {
		w.byte(KINDS.indexOf(track.kind));
		w.byte(toByte(track.gain));
		w.byte(Math.round(((track.pan + 1) / 2) * 254));
		w.byte(toByte(track.tone));
		w.byte(toByte(track.decay));
		w.byte((track.muted ? 1 : 0) | (track.solo ? 2 : 0));
		w.text(track.name);
		for (let i = 0; i < STEPS; i += 1) w.byte(track.steps[i]?.velocity ?? 0);
		if (MELODIC.has(track.kind)) {
			for (let i = 0; i < STEPS; i += 1) w.byte(track.steps[i]?.note.midi ?? 60);
		}
	}

	return base64url(w.finish());
}

/**
 * Throws on anything malformed. The caller — the studio's load — catches it and
 * opens an empty pattern with a message, because a person who pasted a link
 * that got cut in half should see "that link is damaged", not a blank screen.
 */
export function decodePattern(text: string): Pattern {
	const r = new Reader(fromBase64url(text));

	const version = r.byte();
	if (version !== VERSION) throw new RangeError(`Unknown pattern format ${version}`);

	const bpm = r.byte();
	const swing = fromByte(r.byte());
	const title = r.text();
	const count = r.byte();
	if (count < 1 || count > MAX_TRACKS) throw new RangeError(`Bad track count ${count}`);

	const tracks: Track[] = [];
	for (let t = 0; t < count; t += 1) {
		const kind: Kind | undefined = KINDS[r.byte()];
		if (!kind) throw new RangeError('Unknown instrument');

		const gain = fromByte(r.byte());
		const pan = (r.byte() / 254) * 2 - 1;
		const tone = fromByte(r.byte());
		const decay = fromByte(r.byte());
		const flags = r.byte();
		const name = r.text();

		const velocities = Array.from({ length: STEPS }, () => r.byte());
		const notes = MELODIC.has(kind)
			? Array.from({ length: STEPS }, () => new Note(r.byte()))
			: Array.from({ length: STEPS }, () => defaultNote(kind));

		tracks.push({
			id: shortId(),
			kind,
			name,
			gain,
			pan,
			tone,
			decay,
			muted: (flags & 1) !== 0,
			solo: (flags & 2) !== 0,
			steps: velocities.map((velocity, i) => ({ velocity, note: notes[i]! }))
		});
	}

	return { title, bpm, swing, tracks };
}

/*
 * base64url: base64 with `+/` swapped for `-_` and no `=` padding, so the result
 * survives a query string without percent-encoding. `btoa` wants a "binary
 * string", which is a JavaScript string whose char codes are the bytes.
 */
function base64url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array {
	const padded = text
		.replaceAll('-', '+')
		.replaceAll('_', '/')
		.padEnd(Math.ceil(text.length / 4) * 4, '=');
	const binary = atob(padded);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
