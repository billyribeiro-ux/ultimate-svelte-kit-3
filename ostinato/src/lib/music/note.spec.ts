import { describe, expect, it } from 'vitest';
import { HIGHEST, LOWEST, Note } from './note.ts';
import { stepAt, stepSeconds, swingOffset, velocityGain } from './time.ts';

describe('Note', () => {
	it('tunes A4 to 440 and middle C to 261.63', () => {
		expect(new Note(69).frequency).toBe(440);
		expect(new Note(60).frequency).toBeCloseTo(261.63, 2);
	});

	it('names notes the way a keyboard prints them', () => {
		expect(new Note(60).name).toBe('C4');
		expect(new Note(61).name).toBe('C♯4');
		expect(new Note(59).name).toBe('B3');
		expect(new Note(21).name).toBe('A0');
	});

	it('parses the names it prints, and the ASCII ones people type', () => {
		expect(Note.parse('C4').midi).toBe(60);
		expect(Note.parse('c#4').midi).toBe(61);
		expect(Note.parse('Bb3').midi).toBe(58);
		expect(Note.parse('A♯2').midi).toBe(46);
		expect(() => Note.parse('H2')).toThrow(SyntaxError);
	});

	it('transposes immutably and clamps at the ends of the range', () => {
		const c4 = new Note(60);
		const g4 = c4.transpose(7);

		expect(g4.name).toBe('G4');
		expect(c4.midi).toBe(60);
		expect(new Note(HIGHEST).transpose(5).midi).toBe(HIGHEST);
		expect(new Note(LOWEST).transpose(-5).midi).toBe(LOWEST);
		// Returning `this` when nothing changes keeps `$state` from seeing a change.
		const top = new Note(HIGHEST);
		expect(top.transpose(5)).toBe(top);
	});

	it('refuses to be something MIDI cannot say', () => {
		expect(() => new Note(128)).toThrow(RangeError);
		expect(() => new Note(-1)).toThrow(RangeError);
		expect(() => new Note(60.5)).toThrow(RangeError);
	});

	it('serialises as its number, which is what the transport hook relies on', () => {
		expect(JSON.stringify({ note: new Note(57) })).toBe('{"note":57}');
	});
});

describe('time', () => {
	it('makes a sixteenth at 120bpm last an eighth of a second', () => {
		expect(stepSeconds(120)).toBeCloseTo(0.125, 6);
	});

	it('swings only the odd steps, up to a triplet', () => {
		expect(swingOffset(0, 120, 1)).toBe(0);
		expect(swingOffset(2, 120, 1)).toBe(0);
		expect(swingOffset(1, 120, 0)).toBe(0);
		// A third of a step: the distance from halfway to two thirds of the pair.
		expect(swingOffset(1, 120, 1)).toBeCloseTo(0.125 / 3, 6);
		expect(swingOffset(1, 120, 0.5)).toBeCloseTo(0.125 / 6, 6);
		expect(swingOffset(1, 120, 4)).toBeCloseTo(0.125 / 3, 6); // clamped
	});

	it('wraps the playhead around the loop', () => {
		expect(stepAt(0, 120, 16)).toBe(0);
		expect(stepAt(0.125 * 15, 120, 16)).toBe(15);
		expect(stepAt(0.125 * 16, 120, 16)).toBe(0);
		expect(stepAt(0.125 * 37, 120, 16)).toBe(5);
	});

	it('maps velocity to gain on a curve, with the ends fixed', () => {
		expect(velocityGain(0)).toBe(0);
		expect(velocityGain(127)).toBe(1);
		expect(velocityGain(64)).toBeLessThan(0.5);
		expect(velocityGain(200)).toBe(1);
	});
});
