/**
 * CINEMATIC HEADLINE REVEAL
 * =========================
 *
 * The single most recognisable "expensive website" effect: a headline whose lines
 * rise into view from behind an invisible edge, each one fractionally after the last.
 *
 * HOW THE MASK WORKS — this is the whole trick
 * --------------------------------------------
 * SplitText wraps each visual line of text in a `<div>`. We then wrap each of those
 * in a second `<div>` with `overflow: hidden`.
 *
 * Now when we slide the inner div down by 100% of its own height, it is not merely
 * off-position — it is clipped completely out of existence by its parent. Animating
 * it back to 0 makes the text appear to emerge from behind a hard edge, the way
 * film titles do.
 *
 * Without the mask you get text sliding up from nowhere, overlapping whatever is
 * above it, and the effect looks cheap. The `overflow: hidden` is doing all the work.
 *
 * WHY LINES AND NOT CHARACTERS
 * ----------------------------
 * Splitting by character looks impressive in a demo reel and is wrong for a headline
 * a person needs to read. It takes longer to resolve into words, it destroys the
 * accessibility tree if done carelessly, and on a long headline it reads as a gimmick.
 * Lines are what film titles use. Words are acceptable for three or four of them.
 * Characters are for a logo.
 */

import type { Attachment } from 'svelte/attachments';
import { loadMotion, releaseMotionGate } from './gsap.ts';
import { duration, stagger } from './config.ts';

export interface HeadlineOptions {
	/** Seconds before it starts. Use to choreograph against other hero elements. */
	delay?: number;
	duration?: number;
	staggerAmount?: number;
	/** Split by line (default) or by word. Never by character for body headings. */
	by?: 'lines' | 'words';
	/**
	 * Run on scroll into view rather than immediately.
	 * The hero headline is already visible on load, so it should not wait.
	 */
	onScroll?: boolean;
	/** A slight rotation on entry. Adds depth; keep it under about 4 degrees. */
	rotate?: number;
}

export function headline(options: HeadlineOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		let cancelled = false;
		let context: { revert: () => void } | undefined;
		/*
		 * Typed structurally rather than importing the SplitText class type. GSAP is
		 * loaded dynamically, so a value import here would defeat the code splitting —
		 * and this is the only surface we touch.
		 */
		let split: { revert: () => void; lines: Element[]; words: Element[] } | undefined;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;

			const { gsap, SplitText } = motion;

			const {
				delay = 0,
				duration: dur = duration.slow,
				staggerAmount = stagger.base,
				by = 'lines',
				onScroll = false,
				rotate = 0
			} = options;

			context = gsap.context(() => {
				/*
				 * `mask: 'lines'` tells SplitText to create the overflow-hidden wrapper
				 * around each line for us. Before GSAP made this free, everyone
				 * hand-rolled it and got the wrapper's line-height subtly wrong, which
				 * clips descenders — the tails of g, j, p, q, y.
				 *
				 * `autoSplit: true` re-splits when the element resizes. Without it, a
				 * headline split at desktop width keeps its old line breaks after the
				 * user rotates their phone, and the mask clips mid-sentence.
				 */
				split = new SplitText(node, {
					type: by,
					mask: by,
					linesClass: 'split-line',
					wordsClass: 'split-word',
					autoSplit: true,
					/*
					 * CRITICAL for accessibility. SplitText shreds the text into dozens of
					 * divs, which a screen reader would otherwise read out one fragment at
					 * a time — "Read", "institutional", "options flow" as three separate
					 * announcements. `aria: 'auto'` puts the original string back on the
					 * parent as an aria-label and hides the fragments.
					 *
					 * Skip this and you have made your headline actively worse for the
					 * people who least need a visual flourish.
					 */
					aria: 'auto'
				});

				const targets = by === 'lines' ? split.lines : split.words;

				gsap.set(targets, { yPercent: 115, opacity: 0, rotate, force3D: true });
				releaseMotionGate();

				gsap.to(targets, {
					yPercent: 0,
					opacity: 1,
					rotate: 0,
					duration: dur,
					delay,
					stagger: staggerAmount,
					...(onScroll ? { scrollTrigger: { trigger: node, start: 'top 85%' } } : {})
				});
			}, node);
		});

		return () => {
			cancelled = true;
			// Order matters. `context.revert()` first kills the tweens; `split.revert()`
			// then puts the original DOM back. Reverse them and GSAP is animating
			// elements that no longer exist.
			context?.revert();
			split?.revert();
		};
	};
}
