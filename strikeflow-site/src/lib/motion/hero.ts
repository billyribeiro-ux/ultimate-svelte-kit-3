/**
 * THE HERO SEQUENCE
 * =================
 *
 * One choreographed timeline for the whole above-the-fold area, rather than six
 * elements each animating on their own schedule.
 *
 * WHY A SINGLE TIMELINE
 * ---------------------
 * If each element animates independently you get six things that happen to start at
 * roughly the same time. A timeline gives you one thing with six parts. The
 * difference is audible in film terms: a group of musicians versus an orchestra with
 * a conductor.
 *
 * Concretely, a timeline lets us express relationships — "start the lede 0.55
 * seconds before the headline finishes" — which is what produces overlap. And
 * overlap is the entire difference between motion that feels designed and motion
 * that feels queued.
 *
 * THE POSITION PARAMETER
 * ----------------------
 * The last argument to `.to()` is where on the timeline it goes:
 *
 *   (none)   immediately after the previous tween ends — sequential, and usually wrong
 *   '<'      at the same time as the previous tween started
 *   '<0.15'  0.15s after the previous tween started
 *   '-=0.6'  0.6s before the end of the timeline so far — i.e. overlapping
 *   0.3      absolute: 0.3s from the very start
 *
 * Almost every line below uses a negative offset or a `<`. That is the point.
 *
 * READING ORDER VS ANIMATION ORDER
 * --------------------------------
 * The sequence animates roughly in reading order: badge, headline, lede, buttons.
 * That is not decorative. Motion directs the eye, and directing it anywhere other
 * than where you want the person to read is working against yourself.
 */

import type { Attachment } from 'svelte/attachments';
import { loadMotion, releaseMotionGate } from './gsap.ts';
import { duration, stagger, travel } from './config.ts';

export function heroSequence(): Attachment<HTMLElement> {
	return (node) => {
		let cancelled = false;
		let context: { revert: () => void } | undefined;
		let split: { revert: () => void; lines: Element[] } | undefined;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;

			const { gsap, SplitText } = motion;

			const find = (name: string) => node.querySelector<HTMLElement>(`[data-hero="${name}"]`);

			const badge = find('badge');
			const heading = find('headline');
			const lede = find('lede');
			const actions = find('actions');
			const assurances = find('assurances');
			const panel = find('panel');

			context = gsap.context(() => {
				/* ---- Split the headline into masked lines ---- */
				let lines: Element[] = [];
				if (heading) {
					split = new SplitText(heading, {
						type: 'lines',
						mask: 'lines',
						linesClass: 'split-line',
						autoSplit: true,
						aria: 'auto' // keeps the headline readable to screen readers
					});
					lines = split.lines;
				}

				/* ---- Set every starting position BEFORE releasing the CSS gate ---- */
				if (badge) gsap.set(badge, { opacity: 0, y: travel.sm, scale: 0.94 });
				if (lines.length) gsap.set(lines, { yPercent: 118, opacity: 0 });
				if (lede) gsap.set(lede, { opacity: 0, y: travel.base });
				if (actions?.children.length) gsap.set(actions.children, { opacity: 0, y: travel.base });
				if (assurances) gsap.set(assurances, { opacity: 0, y: travel.sm });
				if (panel) gsap.set(panel, { opacity: 0, y: travel.lg, scale: 0.96 });

				// Everything is now positioned by inline styles, so it is safe to drop
				// the CSS gate. Do this before the gate's 2.5s failsafe fires.
				releaseMotionGate();

				/* ---- The sequence ---- */
				const timeline = gsap.timeline({
					// A short beat before anything moves. Starting on the very first
					// frame reads as a page that has not finished loading; a small pause
					// reads as deliberate. This is the same instinct as a beat of black
					// before a title card.
					delay: 0.12,
					defaults: { ease: 'sf.out' }
				});

				if (badge) {
					timeline.to(badge, {
						opacity: 1,
						y: 0,
						scale: 1,
						duration: duration.base
					});
				}

				if (lines.length) {
					timeline.to(
						lines,
						{
							yPercent: 0,
							opacity: 1,
							duration: duration.cinematic,
							stagger: stagger.base
						},
						// Overlaps the badge by 0.45s — they are one gesture, not two.
						'-=0.45'
					);
				}

				if (panel) {
					timeline.to(
						panel,
						{
							opacity: 1,
							y: 0,
							scale: 1,
							// Slower than the text. A large object should feel heavier
							// than a small one — that is the whole of "weight" in motion.
							duration: duration.cinematic + 0.15
						},
						// Starts 0.3s after the headline begins, so the eye is drawn left
						// first and the chart arrives as the headline is still settling.
						'<0.3'
					);
				}

				if (lede) {
					timeline.to(lede, { opacity: 1, y: 0, duration: duration.base }, '-=0.85');
				}

				if (actions?.children.length) {
					timeline.to(
						actions.children,
						{
							opacity: 1,
							y: 0,
							duration: duration.base,
							stagger: stagger.tight,
							clearProps: 'transform' // so `magnetic` can take over cleanly
						},
						'-=0.5'
					);
				}

				if (assurances) {
					timeline.to(assurances, { opacity: 1, y: 0, duration: duration.base }, '-=0.45');
				}
			}, node);
		});

		return () => {
			cancelled = true;
			context?.revert();
			split?.revert();
		};
	};
}

/**
 * PARALLAX
 *
 * Moves an element at a different rate to the scroll, creating an illusion of depth.
 *
 * The single most abused effect on the web. Two rules:
 *
 *   1. **Backgrounds only.** Parallaxing text or anything the user needs to read or
 *      click makes the page feel like it is fighting them.
 *   2. **Subtle.** A `speed` of 0.15 means the element moves at 15% of scroll speed.
 *      Anything above about 0.3 and people notice the effect rather than the depth,
 *      which is the point at which it stops working.
 *
 * `scrub: true` ties progress directly to scroll position — the animation is
 * scrubbed by the scrollbar like a video timeline, rather than being triggered and
 * playing on its own clock. For parallax that link must be exact, or it detaches
 * from the scroll and feels broken.
 */
export function parallax(speed = 0.15): Attachment<HTMLElement> {
	return (node) => {
		let cancelled = false;
		let context: { revert: () => void } | undefined;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;
			const { gsap } = motion;

			context = gsap.context(() => {
				gsap.to(node, {
					yPercent: speed * 100,
					ease: 'none', // parallax must be linear — it tracks scroll, not time
					scrollTrigger: {
						trigger: node.parentElement ?? node,
						start: 'top top',
						end: 'bottom top',
						scrub: true
					}
				});
			}, node);
		});

		return () => {
			cancelled = true;
			context?.revert();
		};
	};
}
