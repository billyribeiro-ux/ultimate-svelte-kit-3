/**
 * A CLOCK THAT ONLY RUNS WHEN SOMEBODY IS LOOKING
 * ===============================================
 *
 * "Two minutes ago" has to become "three minutes ago" on its own, and that
 * means something has to tick. The question is what, and how many of them.
 *
 * THE OBVIOUS VERSION, AND WHY IT IS A PROBLEM
 * --------------------------------------------
 * Each component that shows a relative time starts its own `setInterval` in an
 * effect and clears it on teardown. It works. It also means a results table with
 * two hundred visible rows has two hundred intervals, each waking the main
 * thread once a second at a slightly different moment, which on a laptop on
 * battery is measurable — and every one of them keeps firing while the tab is in
 * a background window nobody is looking at.
 *
 * The fix people reach for is a module-level singleton with a `$state` field and
 * an interval that starts at import time. That collapses two hundred timers into
 * one, and introduces a worse bug: the interval now runs for the life of the
 * page whether or not anything is displaying a time. On a dashboard left open
 * overnight, that is a wake-up every second, forever, to update nothing.
 *
 * WHAT `createSubscriber` IS FOR
 * ------------------------------
 * `createSubscriber` gives a plain object the one thing it is missing:
 * knowledge of whether any effect is currently reading it. You hand it a start
 * function; Svelte calls that the first time the value is read inside an effect,
 * and calls the teardown it returns when the last such effect is destroyed.
 *
 * So: one timer for the whole page, started by the first component that renders
 * a relative time and stopped when the last one goes away. No registration, no
 * reference counting in application code, and no way to leak one by forgetting
 * to unsubscribe — because nothing subscribed.
 *
 * This is also the answer to "how do I make an external thing reactive without
 * copying its state into `$state`" in general: a `MediaQuery`, a `WebSocket`
 * ready state, `navigator.onLine`, the size of a `ResizeObserver`. `$state`
 * mirrors; `createSubscriber` adapts.
 */

import { createSubscriber } from 'svelte/reactivity';

export class Clock {
	readonly #interval: number;
	/**
	 * A plain field, not `$state`.
	 *
	 * The reactivity comes from `#subscribe()` in the getter and `update()` in the
	 * timer. Making it `$state` as well would work and would be two mechanisms
	 * doing one job — and the `$state` one would keep no timer alive, so the class
	 * would look reactive while quietly never ticking for anyone.
	 */
	#now = Date.now();
	readonly #subscribe: () => void;

	constructor(interval = 1_000) {
		this.#interval = interval;

		this.#subscribe = createSubscriber((update) => {
			let timer = 0;

			const tick = () => {
				this.#now = Date.now();
				update();
			};

			const start = () => {
				stop();
				timer = setInterval(tick, this.#interval) as unknown as number;
			};

			const stop = () => {
				if (timer) clearInterval(timer);
				timer = 0;
			};

			/*
			 * Stop while the tab is hidden, and catch up on the way back.
			 *
			 * Browsers already throttle background timers, but "throttled to once a
			 * minute" is still a wake-up a minute for a tab nobody is looking at, and
			 * a dashboard is the tab people leave open the longest. Stopping outright
			 * costs one line and the `tick()` on the way back means the first frame
			 * after switching is already correct rather than up to a second stale.
			 */
			const visibility = () => {
				if (document.visibilityState === 'hidden') stop();
				else {
					tick();
					start();
				}
			};

			start();
			document.addEventListener('visibilitychange', visibility);

			return () => {
				stop();
				document.removeEventListener('visibilitychange', visibility);
			};
		});
	}

	/**
	 * Epoch milliseconds, rounded to the tick.
	 *
	 * Reading this inside an effect or a `$derived` is what starts the timer.
	 * Reading it outside one — in an event handler, say — returns the current
	 * value and subscribes to nothing, which is the correct behaviour and worth
	 * knowing: `createSubscriber` makes a value reactive *where reactivity is
	 * being tracked*, and is inert everywhere else.
	 */
	get now(): number {
		this.#subscribe();
		return this.#now;
	}
}

/**
 * The shared one-second clock.
 *
 * A module-level instance is safe here in a way a module-level `$state` would
 * not be, because it holds no per-user data: it is the wall clock, which is the
 * same for everybody. Server-side rendering never reads it inside an effect, so
 * no timer is ever created there — which is the property that makes a shared
 * instance acceptable in a SvelteKit app at all.
 */
export const clock = new Clock(1_000);

/**
 * "just now" / "3m ago" / "2h ago".
 *
 * Deliberately coarse. A relative time that says "1 minute 43 seconds ago" is
 * precise and unreadable, and the moment somebody needs the exact instant they
 * need the absolute timestamp instead — which is why every place this is used
 * puts the real one in a `title`.
 */
export function relative(at: number, now: number): string {
	const seconds = Math.round((now - at) / 1000);

	if (seconds < 0) return 'in the future';
	if (seconds < 5) return 'just now';
	if (seconds < 60) return `${seconds}s ago`;

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	return `${Math.floor(hours / 24)}d ago`;
}
