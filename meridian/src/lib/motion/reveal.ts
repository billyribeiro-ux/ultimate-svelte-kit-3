/**
 * REVEAL ON SCROLL
 * ================
 *
 * An attachment: a function that receives an element and returns a cleanup.
 * `{@attach reveal()}` on a container fades its children in, staggered,
 * the first time it scrolls into view.
 *
 * Three rules keep it honest:
 *
 *   1. Nothing is hidden until JavaScript runs. The server renders every
 *      element visible; only this function, in the browser, sets the
 *      starting opacity. With JavaScript off, or before it loads, the page
 *      is simply there.
 *   2. Reduced motion means no motion. Not "less" — none. The function
 *      returns before touching a style.
 *   3. It runs once. An `IntersectionObserver` fires when the container is
 *      in view, the tween plays, and the observer disconnects. Scrolling
 *      back up does not replay it; that is a slot machine, not a page.
 */

import type { Attachment } from 'svelte/attachments';
import { gsap } from 'gsap';

export interface RevealOptions {
	/** pixels the children travel up as they appear */
	y?: number;
	/** seconds between each child starting */
	stagger?: number;
	/** seconds each child takes */
	duration?: number;
}

export function reveal({
	y = 18,
	stagger = 0.07,
	duration = 0.7
}: RevealOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		const targets = node.children.length > 0 ? Array.from(node.children) : [node];
		gsap.set(targets, { opacity: 0, y });

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				gsap.to(targets, {
					opacity: 1,
					y: 0,
					duration,
					stagger,
					ease: 'power3.out',
					overwrite: true
				});
				observer.disconnect();
			},
			{ rootMargin: '0px 0px -10% 0px' }
		);
		observer.observe(node);

		return () => {
			observer.disconnect();
			gsap.killTweensOf(targets);
		};
	};
}
