import { describe, expect, it } from 'vitest';
import { Note } from '#lib/music/note.ts';
import { decodePattern, encodePattern } from './codec.ts';
import { toDto } from './dto.ts';
import { createTrack, emptyPattern, KINDS, MELODIC, STEPS } from './model.ts';
import { PRESETS } from './presets.ts';

/**
 * A codec has one job — `decode(encode(x))` is `x` — and one way to fail that
 * nobody notices until a link from last month opens as silence. Every preset
 * goes through here, and so does a pattern built to hit every edge at once.
 */

describe('round trips', () => {
	it.each(Object.entries(PRESETS))('%s survives the URL', (_, build) => {
		const original = build();
		const restored = decodePattern(encodePattern(original));

		expect(restored.title).toBe(original.title);
		expect(restored.bpm).toBe(original.bpm);
		expect(restored.swing).toBeCloseTo(original.swing, 2);
		expect(restored.tracks).toHaveLength(original.tracks.length);

		for (const [i, track] of original.tracks.entries()) {
			const back = restored.tracks[i]!;
			expect(back.kind).toBe(track.kind);
			expect(back.name).toBe(track.name);
			expect(back.gain).toBeCloseTo(track.gain, 2);
			expect(back.pan).toBeCloseTo(track.pan, 2);
			expect(back.steps.map((s) => s.velocity)).toEqual(track.steps.map((s) => s.velocity));
			if (MELODIC.has(track.kind)) {
				expect(back.steps.map((s) => s.note.midi)).toEqual(track.steps.map((s) => s.note.midi));
			}
		}
	});

	it('keeps every instrument, both flags, and the ends of every range', () => {
		const pattern = emptyPattern();
		pattern.title = 'Ünïcödé — and “quotes” 🎛️';
		pattern.bpm = 240;
		pattern.swing = 1;
		pattern.tracks = KINDS.map((kind, i) =>
			createTrack(kind, {
				name: `T${i}`,
				gain: i % 2 ? 1 : 0,
				pan: i % 2 ? 1 : -1,
				tone: 1,
				decay: 0,
				muted: i % 2 === 0,
				solo: i % 3 === 0,
				steps: Array.from({ length: STEPS }, (_, s) => ({
					velocity: s % 2 ? 127 : 0,
					note: new Note(24 + s * 4)
				}))
			})
		);

		const back = decodePattern(encodePattern(pattern));

		expect(back.title).toBe(pattern.title);
		expect(back.bpm).toBe(240);
		expect(back.swing).toBe(1);
		expect(back.tracks.map((t) => t.kind)).toEqual([...KINDS]);
		expect(back.tracks.map((t) => t.muted)).toEqual(pattern.tracks.map((t) => t.muted));
		expect(back.tracks.map((t) => t.solo)).toEqual(pattern.tracks.map((t) => t.solo));
		expect(back.tracks[1]!.pan).toBe(1);
		expect(back.tracks[0]!.pan).toBe(-1);
		// Notes survive on the melodic tracks (index 4 is `bass`) and are not encoded for drums.
		expect(back.tracks[4]!.steps[5]!.note.midi).toBe(44);
		expect(back.tracks[0]!.steps[5]!.note.midi).toBe(60);
	});

	it('gives every track a fresh id, because ids mean nothing to another browser', () => {
		const pattern = emptyPattern();
		const back = decodePattern(encodePattern(pattern));

		expect(back.tracks.map((t) => t.id)).not.toEqual(pattern.tracks.map((t) => t.id));
		expect(new Set(back.tracks.map((t) => t.id)).size).toBe(back.tracks.length);
	});
});

describe('the encoding itself', () => {
	it('is a single line that needs no escaping in a query string', () => {
		const text = encodePattern(PRESETS['two-step']!());

		expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(encodeURIComponent(text)).toBe(text);
	});

	it('is small — the whole point', () => {
		// Four tracks with names, one of them melodic: around two hundred
		// characters, against a JSON form seven or eight times the size.
		const pattern = PRESETS['four-on-the-floor']!();
		const text = encodePattern(pattern);
		const json = JSON.stringify(toDto(pattern));

		expect(text.length).toBeLessThan(240);
		expect(text.length * 6).toBeLessThan(json.length);
	});
});

describe('damaged links', () => {
	it('rejects an unknown version rather than guessing', () => {
		expect(() => decodePattern('AgAA')).toThrow(/format/);
	});

	it('rejects data that ends early', () => {
		// Cut on a four-character boundary so the base64 itself is intact and the
		// failure is the one this test is about: valid bytes, not enough of them.
		const good = encodePattern(emptyPattern());
		const half = good.slice(0, Math.floor(good.length / 8) * 4);
		expect(() => decodePattern(half)).toThrow(/ended early/);
	});

	it('rejects text that is not base64 at all', () => {
		expect(() => decodePattern('not a link!')).toThrow();
	});

	it('rejects an instrument it has never heard of', () => {
		// version 1, bpm 120, swing 0, empty title, one track of kind 200
		const bytes = Uint8Array.from([1, 120, 0, 0, 1, 200]);
		const text = btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
		expect(() => decodePattern(text)).toThrow(/instrument/);
	});
});
