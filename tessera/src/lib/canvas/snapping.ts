/**
 * ALIGNMENT AND SNAPPING
 * ======================
 *
 * When a shape is dragged near an edge or centre line of another shape, it
 * clicks into place and a guide is drawn. It is the difference between a diagram
 * that looks tidy and one that is tidy.
 *
 * TWO RULES THAT MAKE IT FEEL RIGHT RATHER THAN FIGHT
 * ---------------------------------------------------
 * The threshold is in **screen** pixels, not board units. Snapping that gets
 * stronger as you zoom in is exactly backwards — zooming in is what people do
 * when they want fine control.
 *
 * Only the **nearest** candidate on each axis wins. Collecting every match and
 * applying them all makes a shape jump between two equally close neighbours as
 * the pointer moves, which reads as the shape being unable to make up its mind.
 */

import type { Rect } from '#lib/board/index.ts';

/** How close, in screen pixels, before a shape snaps. */
export const SNAP_THRESHOLD = 6;

export interface Guide {
	readonly axis: 'x' | 'y';
	/** Board coordinate of the line. */
	readonly at: number;
	/** The span the guide is drawn across, so it reaches both shapes. */
	readonly from: number;
	readonly to: number;
}

export interface SnapResult {
	readonly dx: number;
	readonly dy: number;
	readonly guides: readonly Guide[];
}

/** The three interesting lines on each axis: both edges and the centre. */
function linesX(rect: Rect): number[] {
	return [rect.x, rect.x + rect.w / 2, rect.x + rect.w];
}

function linesY(rect: Rect): number[] {
	return [rect.y, rect.y + rect.h / 2, rect.y + rect.h];
}

/**
 * Work out how far to nudge `moving` so it lines up with something in `others`.
 *
 * @param scale the camera's zoom, so the threshold stays constant on screen.
 */
export function snapTo(moving: Rect, others: readonly Rect[], scale: number): SnapResult {
	const threshold = SNAP_THRESHOLD / Math.max(scale, 0.0001);

	let bestX: { delta: number; at: number; other: Rect } | null = null;
	let bestY: { delta: number; at: number; other: Rect } | null = null;

	for (const other of others) {
		for (const mine of linesX(moving)) {
			for (const theirs of linesX(other)) {
				const delta = theirs - mine;
				if (Math.abs(delta) > threshold) continue;
				if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
					bestX = { delta, at: theirs, other };
				}
			}
		}

		for (const mine of linesY(moving)) {
			for (const theirs of linesY(other)) {
				const delta = theirs - mine;
				if (Math.abs(delta) > threshold) continue;
				if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
					bestY = { delta, at: theirs, other };
				}
			}
		}
	}

	const guides: Guide[] = [];

	if (bestX) {
		guides.push({
			axis: 'x',
			at: bestX.at,
			// The guide spans both shapes, so it visibly connects them rather than
			// floating as an unexplained line.
			from: Math.min(moving.y, bestX.other.y),
			to: Math.max(moving.y + moving.h, bestX.other.y + bestX.other.h)
		});
	}

	if (bestY) {
		guides.push({
			axis: 'y',
			at: bestY.at,
			from: Math.min(moving.x, bestY.other.x),
			to: Math.max(moving.x + moving.w, bestY.other.x + bestY.other.w)
		});
	}

	return { dx: bestX?.delta ?? 0, dy: bestY?.delta ?? 0, guides };
}
