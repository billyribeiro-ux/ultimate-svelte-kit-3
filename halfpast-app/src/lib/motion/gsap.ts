import { browser } from '$app/env';

/**
 * GSAP, loaded only when it will actually be used.
 *
 * Three rules run through this whole directory, and they are worth stating once
 * rather than repeating in every file:
 *
 * 1. **Motion is never load-bearing.** Every animated element is already in its
 *    final position in the HTML. Animation moves it *from* somewhere; it never
 *    moves it *to* somewhere. If this module fails to load, if the CDN is down,
 *    if a script blocker eats it — the page is complete and usable, just still.
 *    The alternative, hiding things in CSS and revealing them with JavaScript,
 *    means a failed script leaves a blank page.
 *
 * 2. **Reduced motion is honoured before anything is imported.** Somebody who
 *    has asked their operating system for less movement should not pay 70kB to
 *    be told about it.
 *
 * 3. **It is a separate chunk.** A dynamic `import()` inside a function is what
 *    tells the bundler to split it out. GSAP never lands in the entry bundle, so
 *    first paint does not wait for an animation library.
 */

/** Whether the visitor has asked for less movement. Re-read, never cached. */
export function prefersReducedMotion(): boolean {
	if (!browser) return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The subset of GSAP this app uses, resolved once and shared. */
type GsapModule = typeof import('gsap');
type FlipModule = typeof import('gsap/Flip');

interface Motion {
	gsap: GsapModule['gsap'];
	Flip: FlipModule['Flip'];
}

let pending: Promise<Motion | null> | null = null;

/**
 * Load GSAP, or resolve to `null` if motion should not happen.
 *
 * `null` rather than throwing, because "this visitor does not want animation" is
 * not an error and every call site would have to wrap it in a try/catch that
 * does nothing. A caller writes:
 *
 *     const motion = await loadMotion();
 *     if (!motion) return;
 *
 * and that early return is the entire accessibility story.
 *
 * The promise is memoised, so twenty components mounting at once produce one
 * network request rather than twenty.
 */
export function loadMotion(): Promise<Motion | null> {
	if (!browser || prefersReducedMotion()) return Promise.resolve(null);

	pending ??= (async () => {
		try {
			const [{ gsap }, { Flip }] = await Promise.all([import('gsap'), import('gsap/Flip')]);

			gsap.registerPlugin(Flip);

			// GSAP's default is a gentle ease-out over half a second, which is a
			// reasonable default for a marketing page and too slow for a tool
			// somebody uses forty times a day. These match the CSS tokens so a
			// GSAP transition and a CSS one feel like the same system.
			gsap.defaults({ duration: 0.35, ease: 'power3.out' });

			return { gsap, Flip };
		} catch (thrown) {
			// A blocked or failed chunk must not take the page with it.
			console.warn('[motion] GSAP failed to load; continuing without animation', thrown);
			return null;
		}
	})();

	return pending;
}
