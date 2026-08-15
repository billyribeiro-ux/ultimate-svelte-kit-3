/**
 * SCROLL REVEALS
 * ==============
 *
 * The workhorse. Elements rise and fade as they scroll into view.
 *
 * THE SEQUENCING PROBLEM, AND HOW WE SOLVE IT
 * -------------------------------------------
 * GSAP loads asynchronously, so there is a window — maybe 200ms, maybe 2s on a bad
 * connection — where the page has rendered but nothing is animating yet. Two naive
 * approaches both fail:
 *
 *   Hide it in CSS and reveal with JS → if JS never arrives, the content is gone
 *     forever. That is a blank page, and it is the single worst bug in this category.
 *
 *   Hide it in JS once GSAP loads → the element renders visible, then jumps to
 *     hidden, then animates in. A visible flicker on every page load.
 *
 * So we do both, in a specific order:
 *
 *   1. An inline script in `app.html` adds `motion-pending` to <html> before first
 *      paint. CSS hides reveal elements only while that class is present.
 *   2. That same script sets a 2.5-second failsafe to remove the class regardless.
 *      If GSAP never loads, the content appears anyway.
 *   3. When GSAP does load, it applies the *same* initial state as an inline style,
 *      and only then removes the class. The element never becomes visible in
 *      between, so there is no flicker.
 *
 * That is three mechanisms for one visual effect, which sounds excessive until you
 * have shipped a page that was blank for everyone with a slow connection.
 */

import type { Attachment } from 'svelte/attachments';
import { loadMotion, releaseMotionGate } from './gsap.ts';
import { duration, stagger, travel, trigger } from './config.ts';

export interface RevealOptions {
	/** Direction of travel. `up` is the default and should stay the default. */
	from?: 'up' | 'down' | 'left' | 'right' | 'none';
	/** Distance in pixels. Defaults to `travel.base` (28px). */
	distance?: number;
	/** Seconds to wait after the trigger fires. */
	delay?: number;
	duration?: number;
	/**
	 * Stagger children matching this selector instead of animating the element
	 * itself. This is what turns a grid of six cards into one coordinated wave.
	 */
	items?: string;
	staggerAmount?: number;
	/** Scroll position that starts it. See `trigger` in config.ts. */
	start?: string;
	/** Adds a slight scale-up. Use on panels and images, not on text. */
	scale?: boolean;
	/** Replay every time it scrolls into view. Off by default — see the note below. */
	repeat?: boolean;
}

export function reveal(options: RevealOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		let cancelled = false;
		/** GSAP's Context: cleans up every tween and ScrollTrigger created inside it. */
		let context: { revert: () => void } | undefined;

		void loadMotion().then((motion) => {
			// `null` means reduced motion or SSR. The CSS gate has already been
			// released by the inline script in that case, so content is visible.
			if (!motion || cancelled) return;

			const { gsap } = motion;

			const {
				from = 'up',
				distance = travel.base,
				delay = 0,
				duration: dur = duration.base,
				items,
				staggerAmount = stagger.base,
				start = trigger.enter,
				scale = false,
				repeat = false
			} = options;

			/* What we animate, and in which direction. */
			const targets = items ? node.querySelectorAll(items) : node;

			const offset: Record<string, number> = {};
			if (from === 'up') offset.y = distance;
			if (from === 'down') offset.y = -distance;
			if (from === 'left') offset.x = distance;
			if (from === 'right') offset.x = -distance;

			context = gsap.context(() => {
				/*
				 * Apply the hidden state as an inline style FIRST, then release the CSS
				 * gate. Ordering matters: swap these two lines and you get a one-frame
				 * flash of fully-visible content on every page load.
				 */
				gsap.set(targets, {
					opacity: 0,
					...offset,
					...(scale ? { scale: 0.97 } : {}),
					/*
					 * `force3D` promotes the element to its own GPU layer for the duration
					 * of the tween, which is what keeps a six-card stagger at 60fps on a
					 * mid-range phone. GSAP removes the promotion afterwards — a permanent
					 * `will-change` on dozens of elements exhausts GPU memory and makes
					 * things slower, which is the classic way this optimisation backfires.
					 */
					force3D: true
				});

				releaseMotionGate();

				gsap.to(targets, {
					opacity: 1,
					y: 0,
					x: 0,
					scale: 1,
					duration: dur,
					delay,
					stagger: items ? staggerAmount : 0,
					// `clearProps` strips the inline transform once the tween finishes,
					// so the element goes back to being styled purely by CSS. Without it,
					// a leftover `transform: translate3d(0,0,0)` creates a containing
					// block that quietly breaks any `position: fixed` descendant.
					clearProps: 'transform',
					scrollTrigger: {
						trigger: node,
						start,
						toggleActions: repeat ? 'play reverse play reverse' : 'play none none none'
					}
				});
			}, node);
		});

		return () => {
			cancelled = true;
			// `revert()` kills every tween and ScrollTrigger created in the context and
			// restores the original inline styles. Skip it and each client-side
			// navigation leaks a ScrollTrigger that keeps recalculating on every
			// scroll event, forever.
			context?.revert();
		};
	};
}

/**
 * Convenience wrapper for the common case: stagger a group of children.
 *
 * `{@attach revealGroup('.card')}` reads better at the call site than passing an
 * options object, and it is the pattern used most often in this project.
 */
export function revealGroup(
	items: string,
	options: Omit<RevealOptions, 'items'> = {}
): Attachment<HTMLElement> {
	return reveal({ ...options, items });
}
