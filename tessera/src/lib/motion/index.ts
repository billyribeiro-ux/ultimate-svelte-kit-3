/**
 * MOTION
 * ======
 *
 * Two systems, deliberately, and the split is the interesting part.
 *
 *   `svelte/motion`   for anything a person is *driving*. The camera is a
 *                     `Tween` because its value has to be readable, settable and
 *                     interruptible mid-flight, and because a pointer drag must
 *                     be able to set it with `duration: 0`.
 *
 *   GSAP              for anything that *plays*. The marketing page's entrance
 *                     is a timeline with stagger and overlap, which is exactly
 *                     what GSAP is for and exactly what expressing it as six
 *                     coordinated tweens is not.
 *
 * Using one for both is the mistake in either direction: GSAP driving the camera
 * means fighting its tweening for control of a value the pointer owns, and a
 * hand-rolled timeline for the entrance means reimplementing stagger.
 *
 * GSAP is loaded only when it is used, and never when the visitor has asked for
 * reduced motion — so the people least served by the animation do not pay to
 * download it.
 */

import type { Attachment } from 'svelte/attachments';
import { browser } from '$app/env';

/**
 * Does this visitor want motion?
 *
 * Read at the moment of use rather than cached at import time: the setting can
 * change while the page is open, and somebody who turns it on mid-session should
 * not have to reload to be believed.
 */
export function wantsMotion(): boolean {
	if (!browser) return false;
	return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface RevealOptions {
	/** Seconds between each child's start. */
	stagger?: number;
	/** How far, in pixels, each child rises from. */
	distance?: number;
	delay?: number;
}

/**
 * Bring a group of children in, once, on mount.
 *
 * The critical property is what happens when this does *nothing*: the elements
 * must already be in their final state. Animating from `opacity: 0` set in CSS
 * would mean a failed import, a reduced-motion visitor or a JavaScript error
 * leaves the page permanently blank — the single most damaging animation bug
 * there is, because the page looks broken rather than unanimated.
 *
 * So the starting state is set *by the animation*, in the same frame it starts.
 * No JavaScript, no animation, no problem.
 */
export function reveal(options: RevealOptions = {}): Attachment<HTMLElement> {
	return (element) => {
		if (!wantsMotion()) return;

		let cancelled = false;
		let context: { revert: () => void } | null = null;

		void import('gsap').then(({ gsap }) => {
			if (cancelled) return;

			/*
			 * `gsap.context` scopes every tween created inside it to this element, so
			 * `revert()` in the cleanup undoes exactly what this attachment did and
			 * nothing else — including restoring inline styles GSAP set. Without it,
			 * a navigation away mid-animation leaves elements frozen at whatever
			 * opacity they had reached.
			 */
			context = gsap.context(() => {
				const children = element.querySelectorAll(':scope > *');
				if (children.length === 0) return;

				gsap.from(children, {
					opacity: 0,
					y: options.distance ?? 14,
					duration: 0.6,
					ease: 'power3.out',
					stagger: options.stagger ?? 0.06,
					delay: options.delay ?? 0,
					// Clear the inline styles GSAP added once it is finished, so the
					// elements go back to being styled entirely by the stylesheet.
					clearProps: 'opacity,transform'
				});
			}, element);
		});

		return () => {
			cancelled = true;
			context?.revert();
		};
	};
}
