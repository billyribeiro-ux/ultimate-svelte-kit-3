/**
 * THREE PATTERNS TO START FROM
 * ============================
 *
 * Written as strings rather than arrays of objects, because a groove is
 * something you *read*: `x---x---x---x---` is four on the floor to anybody who
 * has seen a drum machine, and sixteen `{ velocity: 112 }` objects are not.
 *
 *   `x`  accent      `o`  soft      `-`  rest
 *
 * Melodic tracks take a note name per step instead, with `.` for a rest.
 */

import { Note } from '#lib/music/note.ts';
import { createTrack, defaultNote, type Kind, type Pattern, type Step } from './model.ts';

function drums(
	kind: Kind,
	hits: string,
	overrides: Partial<Parameters<typeof createTrack>[1]> = {}
) {
	const note = defaultNote(kind);
	const steps: Step[] = [...hits].map((glyph) => ({
		velocity: glyph === 'x' ? 112 : glyph === 'o' ? 64 : 0,
		note
	}));
	return createTrack(kind, { steps, ...overrides });
}

function melody(
	kind: Kind,
	notes: string,
	overrides: Partial<Parameters<typeof createTrack>[1]> = {}
) {
	const fallback = defaultNote(kind);
	const steps: Step[] = notes
		.trim()
		.split(/\s+/)
		.map((token) =>
			token === '.' ? { velocity: 0, note: fallback } : { velocity: 100, note: Note.parse(token) }
		);
	return createTrack(kind, { steps, ...overrides });
}

export const PRESETS: Record<string, () => Pattern> = {
	'four-on-the-floor': () => ({
		title: 'Four on the floor',
		bpm: 124,
		swing: 0,
		tracks: [
			drums('kick', 'x---x---x---x---', { decay: 0.55 }),
			drums('clap', '----x-------x---', { gain: 0.6 }),
			drums('hat', 'o-x-o-x-o-x-o-x-', { gain: 0.5, tone: 0.7, decay: 0.25 }),
			melody('bass', 'A1 . . A1 . A1 . . C2 . . C2 . G1 . .', { tone: 0.35, decay: 0.4 })
		]
	}),

	'boom-bap': () => ({
		title: 'Boom bap',
		bpm: 92,
		swing: 0.45,
		tracks: [
			drums('kick', 'x-----x--x--x---', { decay: 0.6, tone: 0.4 }),
			drums('snare', '----x-------x---', { gain: 0.85, tone: 0.55 }),
			drums('hat', 'x-o-x-o-x-o-x-o-', { gain: 0.45, tone: 0.5, decay: 0.2 }),
			melody('lead', 'E4 . G4 . . A4 . . E4 . D4 . . . . .', { gain: 0.5, tone: 0.6, decay: 0.35 })
		]
	}),

	'two-step': () => ({
		title: 'Two-step',
		bpm: 132,
		swing: 0.3,
		tracks: [
			drums('kick', 'x-----x---x-----', { decay: 0.5 }),
			drums('snare', '----x-------x---', { tone: 0.65 }),
			drums('hat', '--x---x---x---x-', { gain: 0.55, tone: 0.8, decay: 0.15 }),
			drums('clap', '----x-----o-x---', { gain: 0.5 }),
			melody('bass', 'F1 . . F1 . . G#1 . . . A#1 . . . G#1 .', { tone: 0.45, decay: 0.45 })
		]
	})
};

export const PRESET_NAMES = Object.keys(PRESETS) as (keyof typeof PRESETS)[];

export function preset(name: string): Pattern {
	const build = PRESETS[name];
	if (!build) throw new Error(`No preset called "${name}"`);
	return build();
}
