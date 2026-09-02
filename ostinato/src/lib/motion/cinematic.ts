/**
 * THE ENTRANCE
 * ============
 *
 * The landing page's one flourish: the title rises word by word and the pads
 * of the demo grid light up in sequence, over about a second. It is an
 * attachment, so the markup says `{@attach cinematic()}` and nothing else.
 *
 * THREE RULES IT KEEPS
 * --------------------
 *   1. GSAP is imported *dynamically*, inside the attachment, so the sixty
 *      kilobytes of it never reach anyone who does not see the animation.
 *   2. Somebody who asked for reduced motion gets no import and no animation:
 *      `prefersReducedMotion` is checked first, and the page is already in its
 *      final state because the animation only ever moves things *from*
 *      somewhere *to* where the CSS put them.
 *   3. It cannot blank the page. Nothing starts at `opacity: 0` in the
 *      stylesheet; GSAP's `from` sets the start state at the moment it begins,
 *      so a failed import leaves everything visible.
 */

import type { Attachment } from 'svelte/attachments';
import { prefersReducedMotion } from 'svelte/motion';

export function cinematic(): Attachment<HTMLElement> {
	return (root) => {
		if (prefersReducedMotion.current) return;

		let cancelled = false;
		let timeline: { kill(): void } | null = null;

		void import('gsap').then(({ gsap }) => {
			if (cancelled) return;

			const words = root.querySelectorAll('[data-word]');
			const pads = root.querySelectorAll('[data-pad]');
			const rest = root.querySelectorAll('[data-rise]');

			timeline = gsap
				.timeline({ defaults: { ease: 'power3.out' } })
				.from(words, { y: 28, opacity: 0, duration: 0.7, stagger: 0.06 })
				.from(
					pads,
					{ scale: 0.4, opacity: 0, duration: 0.35, stagger: { each: 0.012, from: 'start' } },
					'<0.2'
				)
				.from(rest, { y: 16, opacity: 0, duration: 0.5, stagger: 0.08 }, '<0.3');
		});

		return () => {
			cancelled = true;
			timeline?.kill();
		};
	};
}
