/**
 * GSAP LOADER
 * ===========
 *
 * GSAP core plus ScrollTrigger, SplitText and CustomEase is roughly 90kB gzipped.
 * That is a lot of JavaScript for a marketing site, and shipping it in the initial
 * bundle would directly harm the Largest Contentful Paint score we spent chapter 5
 * protecting.
 *
 * So it is loaded lazily, exactly once, only in the browser, and only when something
 * actually needs it. Three mechanisms do that:
 *
 * 1. `await import(...)` — tells the bundler to split GSAP into its own chunk, which
 *    the initial page load never requests.
 * 2. A single shared promise — twelve components asking for GSAP triggers one
 *    network request, not twelve.
 * 3. A reduced-motion check that returns `null` before importing anything at all.
 *    A user who has asked for less motion does not download an animation library.
 *
 * That last point is worth sitting with. Respecting the setting is not just about
 * suppressing the animation; it is about not making that person pay for it either.
 */

import { browser } from '$app/env';
import { duration, easePath, stagger, travel, trigger } from './config.ts';

/** The subset of GSAP the rest of the app is allowed to touch. */
export interface MotionApi {
	gsap: typeof import('gsap').gsap;
	ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;
	SplitText: typeof import('gsap/SplitText').SplitText;
	duration: typeof duration;
	stagger: typeof stagger;
	travel: typeof travel;
	trigger: typeof trigger;
}

/** Shared across every caller. `undefined` until the first request. */
let motionPromise: Promise<MotionApi | null> | undefined;

/**
 * Has the user asked for reduced motion?
 *
 * Read fresh each time rather than cached, because someone can change the setting
 * while the page is open and we should honour that on the next animation.
 */
export function prefersReducedMotion(): boolean {
	if (!browser) return true; // no motion during SSR — there is nothing to animate
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Load GSAP, register the plugins, and define our custom eases.
 *
 * Returns `null` when motion should not run — during SSR, or when the user has
 * asked for reduced motion. **Every caller must handle null**, which is the point:
 * it makes the reduced-motion path impossible to forget.
 */
export function loadMotion(): Promise<MotionApi | null> {
	if (!browser || prefersReducedMotion()) {
		// Release the gate immediately rather than waiting out the 2.5s failsafe.
		//
		// The inline script in app.html already skips adding the class for these
		// users, so this is belt and braces — but the two checks can disagree (a
		// user toggling the OS setting after load, an emulated environment), and
		// the cost of being wrong is content that stays hidden for 2.5 seconds.
		releaseMotionGate();
		return Promise.resolve(null);
	}

	motionPromise ??= (async () => {
		const [{ gsap }, { ScrollTrigger }, { SplitText }, { CustomEase }] = await Promise.all([
			import('gsap'),
			import('gsap/ScrollTrigger'),
			import('gsap/SplitText'),
			import('gsap/CustomEase')
		]);

		gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);

		/*
		 * Register our signature curves by name, so components write
		 * `ease: 'sf.out'` rather than repeating a Bézier path. Same reasoning as
		 * design tokens: the curve is part of the brand, and it should be defined once.
		 */
		CustomEase.create('sf.out', easePath.out);
		CustomEase.create('sf.inOut', easePath.inOut);
		CustomEase.create('sf.overshoot', easePath.overshoot);

		/*
		 * Project-wide defaults. Every tween that does not say otherwise inherits
		 * these, which means consistency is the default rather than something you
		 * have to remember.
		 */
		gsap.defaults({ ease: 'sf.out', duration: duration.base });

		/*
		 * A NOTE ON `ScrollTrigger.normalizeScroll(true)` — WE DELIBERATELY DO NOT USE IT.
		 *
		 * It is widely recommended, and it does fix a real problem: on mobile, the
		 * address bar shrinking as you scroll resizes the viewport, which invalidates
		 * every cached ScrollTrigger position and makes animations fire ~60px off.
		 *
		 * The way it fixes that is by taking over scrolling entirely and reimplementing
		 * it in JavaScript. That means:
		 *   - native momentum and rubber-banding are replaced by an approximation
		 *   - anything that scrolls then measures — including every automated test —
		 *     ends up fighting it, exactly like `scroll-behavior: smooth` did
		 *   - accessibility tools that drive scrolling programmatically get worse
		 *
		 * `ignoreMobileResize` fixes the same underlying problem by telling
		 * ScrollTrigger not to recalculate on the address-bar resize, and it leaves
		 * native scrolling completely alone. Same benefit, none of the cost.
		 *
		 * The general principle, which this project has now learned twice: do not
		 * globally override native scrolling.
		 */
		ScrollTrigger.config({ ignoreMobileResize: true });

		/*
		 * ScrollTrigger caches element positions. When a font loads and reflows the
		 * page, or an image finally arrives, every one of those positions is stale
		 * and animations fire at the wrong scroll offset.
		 *
		 * Our metric-matched fallbacks (chapter 5) mean the font swap barely moves
		 * anything — but "barely" is not "not at all", and this is one line.
		 */
		void document.fonts?.ready.then(() => ScrollTrigger.refresh());

		return { gsap, ScrollTrigger, SplitText, duration, stagger, travel, trigger };
	})();

	return motionPromise;
}

/**
 * Reveal any element still hiding behind a motion class.
 *
 * The failsafe. If GSAP fails to load — a blocked CDN, a chunk that 404s after a
 * bad deploy, a browser extension eating the request — elements whose initial
 * hidden state came from CSS would stay invisible forever. This guarantees the
 * content appears no matter what.
 *
 * Animation is an enhancement. Content is not.
 */
export function releaseMotionGate(): void {
	if (!browser) return;
	document.documentElement.classList.remove('motion-pending');
}
