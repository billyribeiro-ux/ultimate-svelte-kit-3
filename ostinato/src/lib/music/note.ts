/**
 * A MUSICAL NOTE
 * ==============
 *
 * One number, the MIDI note — 60 is middle C, and each step up is a semitone —
 * and everything a sequencer needs to know about it derived from that number.
 *
 * A class rather than a bare number, for two reasons that both matter:
 *
 *   1. `frequency` and `name` are the two things every part of the app asks a
 *      note for, and computing them in four places is how one of the four ends
 *      up with `A = 435`.
 *   2. It is a type. `transpose(note, 7)` on a number silently accepts a
 *      velocity, a step index or a track count. On a `Note` it accepts a note.
 *
 * It is **immutable**. `transpose()` returns a new one. That is what lets a
 * `Note` live inside `$state` without being proxied: Svelte leaves class
 * instances alone, and an object that never changes has nothing to observe —
 * replacing it is the change, and replacing a property of a `$state` object is
 * exactly what Svelte does observe.
 *
 * The same immutability is what makes it safe to send across the wire. The
 * `transport` hook in `src/hooks.ts` encodes a `Note` as its MIDI number and
 * decodes it back, so a pattern that leaves the server with `Note`s in it
 * arrives in the browser with `Note`s in it — not with `{ midi: 57 }` objects
 * that have forgotten how to be notes.
 */

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

/** The lowest and highest notes worth sequencing on a groovebox. */
export const LOWEST = 24; // C1
export const HIGHEST = 96; // C7

export class Note {
	readonly midi: number;

	constructor(midi: number) {
		if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
			throw new RangeError(`Not a MIDI note: ${midi}`);
		}
		this.midi = midi;
	}

	/**
	 * Equal temperament, tuned to A4 = 440Hz.
	 *
	 * Each semitone multiplies the frequency by the twelfth root of two, so a
	 * note `n` semitones above A4 is `440 × 2^(n/12)`. A4 is MIDI 69.
	 */
	get frequency(): number {
		return 440 * 2 ** ((this.midi - 69) / 12);
	}

	/** `C4`, `F♯2` — the octave changes between B and C, as on a piano. */
	get name(): string {
		return `${this.pitchClass}${this.octave}`;
	}

	/** `C`, `F♯` — the letter without the octave, for a compact grid label. */
	get pitchClass(): string {
		return NAMES[this.midi % 12]!;
	}

	/** MIDI 60 is C4 under the convention most instruments print. */
	get octave(): number {
		return Math.floor(this.midi / 12) - 1;
	}

	/**
	 * A new note `semitones` away, clamped to the sequenceable range.
	 *
	 * Clamped rather than thrown: this is called from a keyboard shortcut, and a
	 * person holding the up arrow at the top of the range wants the note to stay
	 * put, not an exception.
	 */
	transpose(semitones: number): Note {
		const midi = Math.min(HIGHEST, Math.max(LOWEST, this.midi + semitones));
		return midi === this.midi ? this : new Note(midi);
	}

	equals(other: Note): boolean {
		return this.midi === other.midi;
	}

	toString(): string {
		return this.name;
	}

	/** `JSON.stringify` writes the number; `Note.from` reads it back. */
	toJSON(): number {
		return this.midi;
	}

	static from(midi: number): Note {
		return new Note(midi);
	}

	/**
	 * Parse `A3`, `f#2`, `Bb4`. Used by the tests and by the URL codec's
	 * human-readable form; the app itself only ever moves by semitones.
	 */
	static parse(text: string): Note {
		const match = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(text.trim());
		if (!match) throw new SyntaxError(`Not a note name: ${text}`);

		const [, letter, accidental, octave] = match;
		const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter!.toUpperCase()]!;
		const shift = accidental === '#' || accidental === '♯' ? 1 : accidental ? -1 : 0;

		return new Note((Number(octave) + 1) * 12 + base + shift);
	}
}
