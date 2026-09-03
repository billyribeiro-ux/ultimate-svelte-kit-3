/**
 * THE CAMERA
 * ==========
 *
 * One transform — pan and scale — and the two conversions everything else needs:
 * screen coordinates to board coordinates and back.
 *
 * WHY A TWEEN HOLDS THE STATE
 * ---------------------------
 * Direct manipulation must be exact. A box dragged with the pointer has to sit
 * under the pointer, not approach it over 300ms, and a camera that interpolates
 * during a pan feels like driving on ice.
 *
 * Programmatic movement must not be. "Zoom to fit" that teleports leaves people
 * with no idea where they went; the same move animated over a third of a second
 * is legible.
 *
 * Both live in one `Tween`, which is set with `duration: 0` for the first case
 * and its default for the second. The alternative — raw state plus a separate
 * animation path — is two sources of truth for one number, and they disagree the
 * first time somebody pans during a fit.
 */

import { Tween } from 'svelte/motion';
import { cubicOut } from 'svelte/easing';
import type { Point, Rect } from '#lib/board/index.ts';

export interface Transform {
	/** Board coordinate at the viewport's left edge, times scale. */
	x: number;
	y: number;
	scale: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;

/** How long a programmatic camera move takes. Long enough to follow, short enough not to wait for. */
const GLIDE_MS = 320;

export class Camera {
	readonly #motion: Tween<Transform>;

	/**
	 * The viewport in CSS pixels.
	 *
	 * `$state.raw` — it is replaced wholesale by a `ResizeObserver` and never
	 * mutated, so per-property reactivity would cost two proxies for nothing.
	 */
	size = $state.raw<{ w: number; h: number }>({ w: 0, h: 0 });

	constructor(initial: Transform = { x: 0, y: 0, scale: 1 }) {
		// Must be constructed inside an effect root — in practice, during a
		// component's initialisation, which is where the board creates it.
		this.#motion = new Tween(initial, { duration: GLIDE_MS, easing: cubicOut });
	}

	get transform(): Transform {
		return this.#motion.current;
	}

	get scale(): number {
		return this.#motion.current.scale;
	}

	/** The CSS transform for the layer that holds every node. */
	get css(): string {
		const { x, y, scale } = this.#motion.current;
		/*
		 * `translate` before `scale`, and `translate3d` rather than `translate`.
		 *
		 * The order is not stylistic: CSS applies these right to left, so this
		 * scales the content and then moves it, which is what the maths below
		 * assumes. Swap them and the board drifts as you zoom.
		 *
		 * The `3d` promotes the layer to the compositor, so panning a thousand nodes
		 * is a matrix change on one layer rather than a re-layout of a thousand
		 * elements. It is the single biggest performance decision in the renderer.
		 */
		return `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
	}

	/** Screen (client) coordinates to board coordinates. */
	toBoard(point: Point): Point {
		const { x, y, scale } = this.#motion.current;
		return { x: (point.x - x) / scale, y: (point.y - y) / scale };
	}

	/** Board coordinates to screen coordinates. */
	toScreen(point: Point): Point {
		const { x, y, scale } = this.#motion.current;
		return { x: point.x * scale + x, y: point.y * scale + y };
	}

	/**
	 * The region of the board currently on screen.
	 *
	 * Used for culling. It is deliberately *not* padded here — the caller decides
	 * how much margin it wants, because the right margin differs between "which
	 * nodes to render" and "which nodes to run an entrance animation on".
	 */
	get visible(): Rect {
		const { x, y, scale } = this.#motion.current;
		return {
			x: -x / scale,
			y: -y / scale,
			w: this.size.w / scale,
			h: this.size.h / scale
		};
	}

	/** Move immediately, for pointer-driven panning. */
	panBy(dx: number, dy: number): void {
		const { x, y, scale } = this.#motion.current;
		void this.#motion.set({ x: x + dx, y: y + dy, scale }, { duration: 0 });
	}

	/**
	 * Zoom about a fixed screen point — the pointer, or the centre for a keyboard
	 * shortcut.
	 *
	 * The board point under `origin` must not move. Solving for the new pan is
	 * three lines and is the difference between zooming feeling like a camera and
	 * feeling like the board is running away.
	 */
	zoomAt(origin: Point, factor: number): void {
		const current = this.#motion.current;
		const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
		if (scale === current.scale) return;

		const board = this.toBoard(origin);

		void this.#motion.set(
			{ x: origin.x - board.x * scale, y: origin.y - board.y * scale, scale },
			{ duration: 0 }
		);
	}

	/** Animate to a specific transform. Resolves when the movement finishes. */
	glideTo(transform: Transform): Promise<void> {
		return this.#motion.set({
			...transform,
			scale: clamp(transform.scale, MIN_SCALE, MAX_SCALE)
		});
	}

	/**
	 * Frame a rectangle, with breathing room.
	 *
	 * Returns without doing anything when the viewport has no size, which happens
	 * on the very first render before the `ResizeObserver` has reported. Dividing
	 * by zero there produces `Infinity`, the transform becomes `NaN`, and every
	 * node disappears — from a board that is perfectly fine.
	 *
	 * `magnify` caps how far this may zoom *in*, and defaults to 1:1. Fitting is
	 * about bringing things into view, not about making them bigger: a board with
	 * one box in it would otherwise open at four times actual size, which looks
	 * broken and — because the renderer culls anything outside the viewport —
	 * means a colleague's next shape is drawn off screen and never appears. That
	 * combination cost an afternoon, in a test that looked like a sync failure.
	 */
	fit(target: Rect, padding = 64, magnify = 1): Promise<void> {
		const { w, h } = this.size;
		if (w === 0 || h === 0) return Promise.resolve();
		if (target.w === 0 || target.h === 0) return Promise.resolve();

		const scale = clamp(
			Math.min((w - padding * 2) / target.w, (h - padding * 2) / target.h, magnify),
			MIN_SCALE,
			MAX_SCALE
		);

		return this.glideTo({
			x: w / 2 - (target.x + target.w / 2) * scale,
			y: h / 2 - (target.y + target.h / 2) * scale,
			scale
		});
	}

	/** Centre a point without changing the zoom. */
	centreOn(point: Point): Promise<void> {
		const { scale } = this.#motion.current;
		return this.glideTo({
			x: this.size.w / 2 - point.x * scale,
			y: this.size.h / 2 - point.y * scale,
			scale
		});
	}
}

function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value));
}
