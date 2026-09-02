/**
 * THE PATTERN
 * ===========
 *
 * Everything the sequencer plays, as plain data: a tempo, a swing amount, and
 * up to eight tracks of sixteen steps. This file is the vocabulary the rest of
 * the project speaks — the studio edits one of these, the scheduler plays one,
 * the codec squeezes one into a URL, the server stores one.
 *
 * PLAIN OBJECTS, ON PURPOSE
 * -------------------------
 * A pattern is `$state` in the studio, and `$state` proxies plain objects and
 * arrays *deeply*: toggling `pattern.tracks[2].steps[7].velocity` updates the
 * one grid cell that reads it and nothing else. A class with methods would be
 * left alone by the proxy, and every change would have to replace the whole
 * track to be noticed. So the model is data, and the operations on it are
 * functions that take a pattern and mutate it in place.
 *
 * The exception is `Note`, which is a class and is immutable — see
 * `music/note.ts` for why that combination is exactly what `$state` wants.
 */

import * as v from 'valibot';
import { HIGHEST, LOWEST, Note } from '#lib/music/note.ts';

/** Sixteen sixteenths: one bar of 4/4. */
export const STEPS = 16;
export const MAX_TRACKS = 8;

/** The instruments. `sample` plays whatever file somebody dropped on the track. */
export const KINDS = ['kick', 'snare', 'hat', 'clap', 'bass', 'lead', 'sample'] as const;
export type Kind = (typeof KINDS)[number];

/** The kinds that care which note a step carries. */
export const MELODIC: ReadonlySet<Kind> = new Set(['bass', 'lead']);

export interface Step {
	/** 0 is a rest; 1–127 is how hard the step is hit. */
	velocity: number;
	/** Ignored by drums, kept so switching a track to `bass` does not lose it. */
	note: Note;
}

export interface Track {
	id: string;
	kind: Kind;
	name: string;
	/** 0–1, applied as a gain before the pan. */
	gain: number;
	/** -1 (left) to 1 (right). */
	pan: number;
	/** 0–1; what it means depends on the instrument — filter cutoff, mostly. */
	tone: number;
	/** 0–1; how long the sound lasts. */
	decay: number;
	muted: boolean;
	solo: boolean;
	steps: Step[];
}

export interface Pattern {
	title: string;
	bpm: number;
	/** 0 is straight sixteenths; 1 is a full triplet feel. */
	swing: number;
	tracks: Track[];
}

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */

/*
 * The same shape, as a valibot schema, so that a pattern arriving from a URL, a
 * form or a database row is checked before anything trusts it. `v.instance(Note)`
 * is what ties the schema to the class: a step whose `note` is a bare number
 * fails here, which is the point — the transport hook is supposed to have
 * turned it into a `Note` already, and if it has not, something upstream is
 * wrong and this is where it should be found.
 */
const unit = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

export const StepSchema = v.object({
	velocity: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(127)),
	note: v.instance(Note)
});

export const TrackSchema = v.object({
	id: v.pipe(v.string(), v.regex(/^[a-z0-9]{6,12}$/)),
	kind: v.picklist(KINDS),
	name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(24)),
	gain: unit,
	pan: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
	tone: unit,
	decay: unit,
	muted: v.boolean(),
	solo: v.boolean(),
	steps: v.pipe(v.array(StepSchema), v.length(STEPS))
});

export const PatternSchema = v.object({
	title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Give it a title'), v.maxLength(60)),
	bpm: v.pipe(v.number(), v.integer(), v.minValue(40), v.maxValue(240)),
	swing: unit,
	tracks: v.pipe(v.array(TrackSchema), v.minLength(1), v.maxLength(MAX_TRACKS))
});

/* ------------------------------------------------------------------ */
/* Factories                                                           */
/* ------------------------------------------------------------------ */

/**
 * A short random id, safe in a URL and a CSS selector.
 *
 * `crypto.randomUUID()` would do, but a 36-character id on every one of a
 * hundred and twenty-eight grid cells is a lot of DOM for a keyed `{#each}`.
 */
export function shortId(): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Sixteen rests on the note the instrument sounds best at. */
export function emptySteps(note: Note = defaultNote('kick')): Step[] {
	return Array.from({ length: STEPS }, () => ({ velocity: 0, note }));
}

/** Where a melodic track starts, and a placeholder for drums. */
export function defaultNote(kind: Kind): Note {
	return new Note(kind === 'bass' ? 40 : kind === 'lead' ? 64 : 60);
}

const LABELS: Record<Kind, string> = {
	kick: 'Kick',
	snare: 'Snare',
	hat: 'Hi-hat',
	clap: 'Clap',
	bass: 'Bass',
	lead: 'Lead',
	sample: 'Sample'
};

export function createTrack(kind: Kind, overrides: Partial<Track> = {}): Track {
	return {
		id: shortId(),
		kind,
		name: LABELS[kind],
		gain: 0.8,
		pan: 0,
		tone: 0.5,
		decay: 0.5,
		muted: false,
		solo: false,
		steps: emptySteps(defaultNote(kind)),
		...overrides
	};
}

export function emptyPattern(): Pattern {
	return {
		title: 'Untitled',
		bpm: 120,
		swing: 0,
		tracks: [createTrack('kick'), createTrack('snare'), createTrack('hat'), createTrack('bass')]
	};
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

/**
 * The steps a velocity toggle cycles through. Off → accent → soft → off is
 * what a hardware groovebox does with repeated presses of a pad, and it is a
 * better default than off/on because a groove is mostly ghost notes.
 */
export function cycleVelocity(velocity: number): number {
	if (velocity === 0) return 112;
	if (velocity > 80) return 64;
	return 0;
}

/** Which tracks actually sound, given mutes and solos. */
export function audibleTracks(pattern: Pattern): Track[] {
	const soloed = pattern.tracks.some((track) => track.solo);
	return pattern.tracks.filter((track) => (soloed ? track.solo : !track.muted));
}

/** Everything a track's steps contain, on one line — a mini grid in a URL title. */
export function stepGlyphs(track: Track): string {
	return track.steps
		.map((step) => (step.velocity === 0 ? '·' : step.velocity > 80 ? '█' : '▄'))
		.join('');
}

/** Clamp a note into the sequenceable range; used by the piano-roll keys. */
export function clampNote(midi: number): Note {
	return new Note(Math.min(HIGHEST, Math.max(LOWEST, midi)));
}

/**
 * A deep copy with no proxies in it.
 *
 * `$state.snapshot` does the same thing for reactive state and is what callers
 * inside a component should reach for; this exists for the places that hold a
 * pattern outside Svelte — the scheduler's timer, the WAV renderer — and want
 * a copy nothing else can mutate under them.
 */
export function clonePattern(pattern: Pattern): Pattern {
	return {
		...pattern,
		tracks: pattern.tracks.map((track) => ({
			...track,
			steps: track.steps.map((step) => ({ ...step }))
		}))
	};
}
