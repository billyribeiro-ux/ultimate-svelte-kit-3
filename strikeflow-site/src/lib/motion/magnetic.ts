/**
 * MAGNETIC POINTER ATTRACTION
 * ===========================
 *
 * The button leans very slightly toward the cursor as it approaches, and springs
 * back when the cursor leaves. It is the detail that makes an interface feel
 * physical rather than drawn, and it is used on almost every award-winning agency
 * site of the last five years.
 *
 * IT IS ALSO THE EASIEST EFFECT TO OVERDO
 * ---------------------------------------
 * Three rules keep it tasteful:
 *
 *   1. **Small.** Maximum ~8px of travel. Any more and the button appears to be
 *      dodging the user, which is actively annoying to click.
 *   2. **Damped.** The element moves a *fraction* of the cursor's offset, not the
 *      whole of it. It should feel attracted, not attached.
 *   3. **Desktop only.** There is no cursor on a touchscreen. Running this there
 *      wastes battery on pointer maths nobody will ever see.
 *
 * PERFORMANCE
 * -----------
 * `pointermove` fires at the display's refresh rate — 120Hz on a recent phone or a
 * ProMotion display. We do not tween on every event; we use `gsap.quickTo`, which
 * creates the tween once and then only updates its target value. That is roughly an
 * order of magnitude cheaper than calling `gsap.to()` on each move, and it is the
 * difference between smooth and stuttering under load.
 */

import type { Attachment } from 'svelte/attachments';
import { loadMotion } from './gsap.ts';

export interface MagneticOptions {
	/** How far the element travels at maximum pull, in pixels. Keep it under ~10. */
	strength?: number;
	/**
	 * How far outside the element the pull begins, in pixels.
	 * A little padding makes the attraction feel like a field rather than a switch.
	 */
	radius?: number;
}

export function magnetic(options: MagneticOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		let cancelled = false;
		let cleanup: (() => void) | undefined;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;

			/*
			 * `pointer: fine` means a precise pointing device — a mouse or trackpad.
			 * Touchscreens report `pointer: coarse`, and a stylus reports fine but with
			 * no hover. Combining both checks is the reliable test for "there is a
			 * cursor that hovers".
			 */
			const hasFinePointer = window.matchMedia('(pointer: fine) and (hover: hover)').matches;
			if (!hasFinePointer) return;

			const { gsap } = motion;
			const { strength = 7, radius = 28 } = options;

			/*
			 * quickTo returns a setter function bound to one property of one element.
			 * The tween is built once; each call just retargets it. This is the
			 * documented way to drive GSAP from a high-frequency event.
			 */
			const moveX = gsap.quickTo(node, 'x', { duration: 0.45, ease: 'power3.out' });
			const moveY = gsap.quickTo(node, 'y', { duration: 0.45, ease: 'power3.out' });

			function handleMove(event: PointerEvent) {
				const rect = node.getBoundingClientRect();

				// Cursor offset from the element's centre.
				const offsetX = event.clientX - (rect.left + rect.width / 2);
				const offsetY = event.clientY - (rect.top + rect.height / 2);

				// Normalise to roughly -1..1 across the element plus its radius, so the
				// pull is proportional to how close the cursor is rather than absolute.
				const normalX = offsetX / (rect.width / 2 + radius);
				const normalY = offsetY / (rect.height / 2 + radius);

				// Clamp, so a fast cursor sweeping past cannot fling the button.
				moveX(gsap.utils.clamp(-1, 1, normalX) * strength);
				moveY(gsap.utils.clamp(-1, 1, normalY) * strength);
			}

			function handleLeave() {
				// A gentle overshoot on the way back reads as elasticity. This is the
				// one place in the project where a bounce is warranted.
				gsap.to(node, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' });
			}

			/*
			 * Listening on the element rather than the document. A document-level
			 * pointermove listener for every magnetic button on the page would be a
			 * meaningful waste; `pointerenter`/`pointerleave` scope it to when it matters.
			 */
			node.addEventListener('pointerenter', handleMove);
			node.addEventListener('pointermove', handleMove);
			node.addEventListener('pointerleave', handleLeave);

			cleanup = () => {
				node.removeEventListener('pointerenter', handleMove);
				node.removeEventListener('pointermove', handleMove);
				node.removeEventListener('pointerleave', handleLeave);
				gsap.killTweensOf(node);
				gsap.set(node, { clearProps: 'transform' });
			};
		});

		return () => {
			cancelled = true;
			cleanup?.();
		};
	};
}
