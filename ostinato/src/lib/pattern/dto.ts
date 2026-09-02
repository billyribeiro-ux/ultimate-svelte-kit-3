/**
 * THE PATTERN, AS IT IS STORED
 * ============================
 *
 * The database keeps a pattern as one JSON column, and JSON has no idea what a
 * `Note` is. This is the conversion in both directions, and the schema for what
 * comes *out* of the column — because a row written by last year's version of
 * the app is exactly as untrusted as a request body.
 *
 * Only two places touch a DTO: the storage layer, and the publish form, which
 * carries the pattern in one hidden field because a form field cannot hold a
 * class either. Everything else in the project works with `Pattern`.
 */

import * as v from 'valibot';
import { Note } from '#lib/music/note.ts';
import { KINDS, STEPS, MAX_TRACKS, type Pattern, type Track } from './model.ts';

const unit = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

export const StepDtoSchema = v.object({
	v: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(127)),
	n: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(127))
});

export const TrackDtoSchema = v.object({
	id: v.pipe(v.string(), v.regex(/^[a-z0-9]{6,12}$/)),
	kind: v.picklist(KINDS),
	name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(24)),
	gain: unit,
	pan: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
	tone: unit,
	decay: unit,
	muted: v.boolean(),
	solo: v.boolean(),
	steps: v.pipe(v.array(StepDtoSchema), v.length(STEPS))
});

export const PatternDtoSchema = v.object({
	title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Give it a title'), v.maxLength(60)),
	bpm: v.pipe(v.number(), v.integer(), v.minValue(40), v.maxValue(240)),
	swing: unit,
	tracks: v.pipe(v.array(TrackDtoSchema), v.minLength(1), v.maxLength(MAX_TRACKS))
});

export type PatternDto = v.InferOutput<typeof PatternDtoSchema>;

export function toDto(pattern: Pattern): PatternDto {
	return {
		title: pattern.title,
		bpm: pattern.bpm,
		swing: pattern.swing,
		tracks: pattern.tracks.map((track) => ({
			id: track.id,
			kind: track.kind,
			name: track.name,
			gain: track.gain,
			pan: track.pan,
			tone: track.tone,
			decay: track.decay,
			muted: track.muted,
			solo: track.solo,
			steps: track.steps.map((step) => ({ v: step.velocity, n: step.note.midi }))
		}))
	};
}

export function fromDto(dto: PatternDto): Pattern {
	return {
		title: dto.title,
		bpm: dto.bpm,
		swing: dto.swing,
		tracks: dto.tracks.map((track): Track => ({
			id: track.id,
			kind: track.kind,
			name: track.name,
			gain: track.gain,
			pan: track.pan,
			tone: track.tone,
			decay: track.decay,
			muted: track.muted,
			solo: track.solo,
			steps: track.steps.map((step) => ({ velocity: step.v, note: new Note(step.n) }))
		}))
	};
}

/**
 * Parse a JSON column. Throws a valibot error with the path of the first bad
 * field, which is the message you want when a migration went wrong and the
 * message you never get from `JSON.parse(row.data) as Pattern`.
 */
export function parseStored(json: string): Pattern {
	return fromDto(v.parse(PatternDtoSchema, JSON.parse(json)));
}
