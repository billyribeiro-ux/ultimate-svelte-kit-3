/**
 * MUSICAL TIME, IN SECONDS
 * ========================
 *
 * The scheduler thinks in the audio clock — seconds since the `AudioContext`
 * was created — and the pattern thinks in steps. These are the conversions,
 * kept apart from both so they can be tested with a calculator.
 *
 * A **step** is a sixteenth note: four to a beat, sixteen to a bar of 4/4.
 */

/** Sixteenth notes per beat. */
export const STEPS_PER_BEAT = 4;

/** How long one step lasts at a tempo, with no swing. */
export function stepSeconds(bpm: number): number {
	return 60 / bpm / STEPS_PER_BEAT;
}

/**
 * SWING
 * =====
 *
 * Straight sixteenths land on an even grid. Swing delays every *second* step —
 * the "and" of each eighth note — so a pair of steps becomes long-short rather
 * than equal. At `amount = 0` the grid is straight; at `amount = 1` the second
 * step lands two thirds of the way through the pair, which is a full triplet
 * feel and about as far as anybody pushes it.
 *
 * Returned as an offset in seconds to add to the odd steps, so the caller keeps
 * one simple clock and applies the feel on top. Swing that shortens the
 * *following* step rather than delaying this one sounds identical and is far
 * harder to reason about, because it makes the step length depend on the step.
 */
export function swingOffset(step: number, bpm: number, amount: number): number {
	if (step % 2 === 0) return 0;
	const clamped = Math.min(1, Math.max(0, amount));
	// A third of a step is the distance from the straight position (1/2 of the
	// pair) to the triplet position (2/3 of the pair).
	return stepSeconds(bpm) * clamped * (1 / 3);
}

/** The step that is sounding at `elapsed` seconds into a loop of `steps`. */
export function stepAt(elapsed: number, bpm: number, steps: number): number {
	const step = Math.floor(elapsed / stepSeconds(bpm));
	return ((step % steps) + steps) % steps;
}

/** MIDI velocity (0–127) as a gain (0–1), on a curve that feels linear to an ear. */
export function velocityGain(velocity: number): number {
	const v = Math.min(127, Math.max(0, velocity)) / 127;
	// Perceived loudness is closer to the square of the control than to the
	// control itself; a straight line makes the bottom half of the range inaudible.
	return v * v;
}
