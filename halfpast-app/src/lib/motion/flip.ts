import { loadMotion } from './gsap.ts';

/**
 * FLIP — the technique that makes a live-updating grid feel like an object
 * rather than a slideshow.
 *
 * The name is the method: **F**irst, **L**ast, **I**nvert, **P**lay.
 *
 *   First   — measure where everything is, right now.
 *   Last    — let the DOM change. Items appear, disappear, move.
 *   Invert  — instantly transform each survivor back to where it *was*, so the
 *             frame looks identical to before the change.
 *   Play    — animate those transforms away. The elements slide to their new
 *             homes because the browser has already decided where those are.
 *
 * The trick is that nothing animates layout. Layout happens once, in a single
 * frame; what animates is a `transform`, which the compositor handles without
 * touching the main thread. Animating `top` and `left` directly forces a reflow
 * every frame and drops to roughly 20fps on a phone with forty cells on screen.
 *
 * Why it matters here specifically: when somebody else books the 11:00 slot,
 * that button vanishes and every later slot shifts up. Without FLIP the grid
 * snaps and the customer's finger is suddenly over a different time than the one
 * they were reaching for. With it, the movement is visible — which is the point.
 */

export interface FlipRunner {
	/** Call *before* the DOM changes, to capture the current positions. */
	capture(): void;
	/** Call *after* the DOM has changed, to animate from the captured state. */
	play(): Promise<void>;
}

export interface FlipOptions {
	readonly duration?: number;
	/** Stagger between items, in seconds. Keep it tiny or the grid ripples. */
	readonly stagger?: number;
	/** How new items arrive: fade up from slightly below. */
	readonly enterY?: number;
}

/**
 * A FLIP runner scoped to one container.
 *
 * Two calls rather than one wrapper, because the DOM change in between is
 * Svelte's to make, not ours — the caller captures, awaits `tick()`, and plays.
 *
 * If GSAP is unavailable or motion is reduced, both calls become no-ops and the
 * grid updates instantly. For somebody who asked for less motion that is not a
 * degraded experience, it is the correct one.
 */
export function createFlip(getElements: () => Element[], options: FlipOptions = {}): FlipRunner {
	const { duration = 0.4, stagger = 0.012, enterY = 8 } = options;

	/*
	 * The capture is asynchronous, because GSAP is loaded on demand — and `play()`
	 * may be called before that load finishes. Holding a *promise* of the captured
	 * state rather than the state itself makes the ordering explicit: `play()`
	 * awaits whatever `capture()` started, so the two can never cross.
	 *
	 * Storing the raw state instead produced a genuinely nasty bug: `play()` found
	 * `null`, returned early, and left elements that `Flip.from` had already
	 * pinned with `position: absolute` stranded there — a grid of slots stacked
	 * on top of each other at the wrong coordinates, with no error anywhere.
	 */
	let pending: Promise<unknown> | null = null;

	/** Nothing to animate *from* on the first render — there was no "before". */
	let primed = false;

	return {
		capture() {
			pending = loadMotion().then((motion) => {
				if (!motion) return null;
				return motion.Flip.getState(getElements());
			});
		},

		async play() {
			const capture = pending;
			pending = null;

			if (!capture) return;

			const [motion, state] = await Promise.all([loadMotion(), capture]);
			if (!motion || !state) return;

			// Skip the very first play: the "before" and "after" are identical, so
			// the tween does nothing visible but still costs a frame of pinning.
			if (!primed) {
				primed = true;
				return;
			}

			await new Promise<void>((resolve) => {
				motion.Flip.from(state as Parameters<typeof motion.Flip.from>[0], {
					duration,
					ease: 'power2.inOut',
					stagger,

					/*
					 * DELIBERATELY NOT `absolute: true`.
					 *
					 * That option takes elements out of flow for the duration of the
					 * tween so they can cross each other freely. It also means that if
					 * the tween is interrupted — a second live update arriving mid-
					 * animation, which on a busy salon page is normal — the elements
					 * stay `position: absolute` forever. A grid is a simple enough
					 * layout that it does not need the option, and not needing it is
					 * worth more than the smoother crossfade it would buy.
					 */
					onEnter: (elements) =>
						motion.gsap.fromTo(
							elements,
							{ opacity: 0, y: enterY, scale: 0.96 },
							{ opacity: 1, y: 0, scale: 1, duration: duration * 0.8, ease: 'power3.out' }
						),

					// Leaving items fade where they stood, which reads as "that one is
					// gone" far more clearly than a gap silently closing.
					onLeave: (elements) =>
						motion.gsap.to(elements, {
							opacity: 0,
							scale: 0.94,
							duration: duration * 0.6,
							ease: 'power2.in'
						}),

					onComplete: resolve,
					// A tween that is interrupted never fires `onComplete`, so resolve on
					// interruption too. Without this the caller's promise hangs forever
					// and any `await flip.play()` in a chain stops there.
					onInterrupt: resolve
				});
			});
		}
	};
}
