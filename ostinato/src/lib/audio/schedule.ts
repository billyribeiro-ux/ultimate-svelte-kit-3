/**
 * ONE STEP, SCHEDULED
 * ===================
 *
 * The function both players share: the live scheduler in
 * `scheduler.svelte.ts`, which calls it a tenth of a second before each step
 * is due, and the offline renderer in `render.ts`, which calls it for every
 * step of every bar at once. Sharing it is what makes "the WAV sounds exactly
 * like the studio" a property rather than a hope.
 *
 * It knows nothing about time beyond the number it is given. Swing is applied
 * here — a step's *position* in the bar decides its delay — so that the caller
 * keeps a plain, even clock.
 */

import { stepSeconds, swingOffset } from '#lib/music/time.ts';
import { audibleTracks, type Pattern, type Track } from '#lib/pattern/model.ts';
import * as voices from './voices.ts';

export interface Outputs {
	/** Where a track's sound goes: its channel strip on the live engine, or a plain gain offline. */
	output(track: Track): AudioNode;
	/** The decoded file on a `sample` track, if one has been loaded. */
	sample(track: Track): AudioBuffer | undefined;
}

/**
 * Schedule every audible hit of step `index` to sound at `time`.
 *
 * @param time the step's position on the context's clock, *before* swing
 * @returns the time the earliest voice was scheduled for — the playhead uses it
 */
export function scheduleStep(
	ctx: BaseAudioContext,
	outputs: Outputs,
	pattern: Pattern,
	index: number,
	time: number
): number {
	const at = time + swingOffset(index, pattern.bpm, pattern.swing);
	// Hold a melodic note for most of its step; the gap is what makes two
	// consecutive notes sound like two notes rather than one long one.
	const duration = stepSeconds(pattern.bpm) * 0.8;

	for (const track of audibleTracks(pattern)) {
		const step = track.steps[index];
		if (!step || step.velocity === 0) continue;

		const out = outputs.output(track);
		const voice = { time: at, velocity: step.velocity, tone: track.tone, decay: track.decay };
		const melodic = { ...voice, frequency: step.note.frequency, duration };

		// Every kind, and `satisfies never` at the end: adding an instrument to
		// `KINDS` without adding a case here fails to compile rather than
		// playing silence.
		switch (track.kind) {
			case 'bass':
				voices.bass(ctx, out, melodic);
				break;
			case 'lead':
				voices.lead(ctx, out, melodic);
				break;
			case 'kick':
				voices.kick(ctx, out, voice);
				break;
			case 'snare':
				voices.snare(ctx, out, voice);
				break;
			case 'hat':
				voices.hat(ctx, out, voice);
				break;
			case 'clap':
				voices.clap(ctx, out, voice);
				break;
			case 'sample': {
				const buffer = outputs.sample(track);
				// A sample track with nothing loaded is silent, not an error: the
				// person is probably about to drop a file on it.
				if (buffer) voices.sample(ctx, out, voice, buffer);
				break;
			}
			default:
				track.kind satisfies never;
		}
	}

	return at;
}
