/**
 * THE HERO, ONCE
 * ==============
 *
 * The one GSAP timeline in the product, as an attachment: a function that
 * receives the hero element and returns a cleanup. `{@attach hero()}` on
 * the hero section plays it on mount — the copy rises in, then the image
 * unmasks — and GSAP ships only in the home route's chunk, because this is
 * the only file that imports it.
 *
 * Four rules keep it honest:
 *
 *   1. Nothing is hidden until JavaScript runs. The server renders every
 *      element visible; only this function, in the browser, sets the
 *      starting opacity. With JavaScript off, or before it loads, the page
 *      is simply there.
 *   2. Nothing that has been seen is taken away. On the first load the
 *      server's hero is painted long before the JavaScript arrives, and
 *      the first version then snapped the title, the lede and the image to
 *      nothing and faded them back in — the text a visitor had started to
 *      read blinked out. So when the hero is being *hydrated* (the root
 *      layout has not yet marked the document `data-hydrated`) and the
 *      browser has already painted (a `first-contentful-paint` entry
 *      exists), the timeline does not run. It plays when the hero arrives
 *      with a navigation — a click on the brand from another page — where
 *      the elements are new and nobody has seen them yet.
 *   3. Reduced motion means no motion. Not "less" — none. The function
 *      returns before touching a style.
 *   4. It runs once, on mount. Scrolling back up does not replay it; that
 *      is a slot machine, not a page.
 *
 * Nothing else in the app uses GSAP; the rest of what moves is CSS, a
 * Svelte tween or a library's own animation. If this timeline ever goes,
 * GSAP leaves the dependency list the same day.
 */

import type { Attachment } from 'svelte/attachments';
import { gsap } from 'gsap';
import { reducedMotion } from './prefers.svelte.ts';

export function hero(): Attachment<HTMLElement> {
	return (node) => {
		if (reducedMotion.current) return;
		if (alreadySeen()) return;

		const copy = Array.from(node.querySelectorAll<HTMLElement>('[data-hero-copy] > *'));
		const image = node.querySelector<HTMLElement>('[data-hero-image]');

		gsap.set(copy, { opacity: 0, y: 16 });
		if (image) gsap.set(image, { opacity: 0, clipPath: 'inset(0 0 12% 0)' });

		const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
		timeline.to(copy, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06 });
		if (image) {
			timeline.to(image, { opacity: 1, clipPath: 'inset(0 0 0% 0)', duration: 0.9 }, 0.15);
		}

		return () => {
			timeline.kill();
			gsap.set([...copy, ...(image ? [image] : [])], { clearProps: 'all' });
		};
	};
}

/** Hydrating a page the browser has already painted: the hero is on screen, and stays as it is. */
function alreadySeen(): boolean {
	const hydrating = !('hydrated' in document.documentElement.dataset);
	const painted = performance
		.getEntriesByType('paint')
		.some((entry) => entry.name === 'first-contentful-paint');
	return hydrating && painted;
}

/**
 * The features grid: CSS does the stagger (`animation-delay` from `--i`),
 * and this only says *when* — the first time the grid scrolls into view,
 * `data-inview` is set and the observer is done. Rule 1 still holds: the
 * CSS that hides a card is scoped to `[data-inview]`'s absence *and* to
 * JavaScript having run, so a page without JavaScript shows every card.
 */
export function inview(): Attachment<HTMLElement> {
	return (node) => {
		if (reducedMotion.current) {
			node.dataset.inview = '';
			return;
		}
		// Already on screen when the script arrives: there is nothing to wait for.
		if (node.getBoundingClientRect().top < innerHeight * 0.9) {
			node.dataset.inview = '';
			return;
		}
		node.dataset.animate = '';
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				node.dataset.inview = '';
				observer.disconnect();
			},
			{ rootMargin: '0px 0px -10% 0px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	};
}
