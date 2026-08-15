import type { Attachment } from 'svelte/attachments';
import { loadMotion } from './gsap.ts';

/**
 * Motion, packaged as attachments.
 *
 * `{@attach reveal()}` is Svelte 5's replacement for `use:reveal`. The
 * difference that matters here: an attachment is a plain function that receives
 * the element and returns its own cleanup, and — unlike an action — it can be
 * passed around as a value, spread from a props object, and created inside an
 * `$derived`. It is just a function, so it is trivially testable.
 *
 * Every one of these degrades to "nothing happens, the page is fine".
 */

export interface RevealOptions {
	/** How far it travels, in pixels. Small numbers read as confident. */
	readonly y?: number;
	readonly duration?: number;
	readonly delay?: number;
	/** Fraction of the element that must be visible before it starts. */
	readonly threshold?: number;
}

/**
 * Fade and lift an element the first time it comes into view.
 *
 * Uses `IntersectionObserver` rather than a scroll listener. A scroll handler
 * runs on the main thread on every scroll event and is the classic way to make
 * a page feel sticky on a mid-range phone; an observer is handed off to the
 * browser's compositor and costs nothing until it fires.
 *
 * `once: true` in spirit — the observer disconnects after firing. An element
 * that re-animates every time you scroll past it is a novelty for ten seconds
 * and an irritation forever after.
 */
export function reveal(options: RevealOptions = {}): Attachment<HTMLElement> {
	const { y = 16, duration = 0.55, delay = 0, threshold = 0.15 } = options;

	return (node) => {
		let cancelled = false;
		let observer: IntersectionObserver | undefined;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;

			const { gsap } = motion;

			// `from` rather than `fromTo`: the element's real state is the end state,
			// so GSAP animates *towards* the DOM rather than towards a value we
			// wrote down. If this tween never runs, the element is already correct.
			const play = () => {
				gsap.from(node, {
					opacity: 0,
					y,
					duration,
					delay,
					ease: 'power3.out',
					// Removes the inline transform when finished, so the element goes
					// back to being laid out by CSS rather than pinned by a matrix.
					clearProps: 'transform,opacity'
				});
			};

			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (!entry.isIntersecting) continue;
						observer?.disconnect();
						play();
					}
				},
				{ threshold, rootMargin: '0px 0px -8% 0px' }
			);

			observer.observe(node);
		});

		return () => {
			cancelled = true;
			observer?.disconnect();
		};
	};
}

export interface StaggerOptions {
	/** CSS selector for the children to stagger. Defaults to every element child. */
	readonly selector?: string;
	readonly y?: number;
	readonly each?: number;
	readonly duration?: number;
	/** Wait for the container to be scrolled into view first. */
	readonly onView?: boolean;
}

/**
 * Bring a list in one item at a time.
 *
 * The `each` default of 30ms is deliberately short. A stagger's job is to give
 * the eye a direction to read in, not to make somebody wait — a 40-slot grid at
 * 80ms per item takes three and a half seconds, by which point the customer has
 * already decided the site is broken. `amount` would cap the total, but capping
 * it makes long lists feel different from short ones; a small `each` keeps the
 * rhythm identical and the total honest.
 */
export function stagger(options: StaggerOptions = {}): Attachment<HTMLElement> {
	const { selector, y = 10, each = 0.03, duration = 0.45, onView = true } = options;

	return (node) => {
		let cancelled = false;
		let observer: IntersectionObserver | undefined;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;

			const children = selector
				? node.querySelectorAll(selector)
				: (Array.from(node.children) as HTMLElement[]);

			if (children.length === 0) return;

			const play = () => {
				motion.gsap.from(children, {
					opacity: 0,
					y,
					duration,
					ease: 'power3.out',
					stagger: each,
					clearProps: 'transform,opacity'
				});
			};

			if (!onView) {
				play();
				return;
			}

			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (!entry.isIntersecting) continue;
						observer?.disconnect();
						play();
					}
				},
				{ threshold: 0.1 }
			);

			observer.observe(node);
		});

		return () => {
			cancelled = true;
			observer?.disconnect();
		};
	};
}

/**
 * Count a number up to its final value.
 *
 * Takes the target as an argument rather than reading it from the DOM, because
 * reading it from the DOM means parsing formatted text back into a number and
 * getting it wrong for every locale that uses a comma as a decimal separator.
 */
export function countUp(
	target: number,
	format: (value: number) => string = (value) => String(Math.round(value))
): Attachment<HTMLElement> {
	return (node) => {
		let cancelled = false;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;

			const state = { value: 0 };

			motion.gsap.to(state, {
				value: target,
				duration: 1.1,
				ease: 'power2.out',
				onUpdate: () => {
					node.textContent = format(state.value);
				},
				// Guarantees the final frame is exact. Easing arithmetic can leave a
				// counter one short of its target, which nobody notices until the
				// number is a price.
				onComplete: () => {
					node.textContent = format(target);
				}
			});
		});

		return () => {
			cancelled = true;
		};
	};
}

/**
 * Nudge an element towards the pointer.
 *
 * `quickTo` is the reason this is smooth. It creates one reusable tween and
 * updates its target value, instead of allocating a new tween on every
 * `pointermove` — which at 120Hz is 120 objects a second for the garbage
 * collector to deal with, and is exactly what makes hand-rolled magnetic
 * buttons stutter.
 *
 * Pointer-only: a touch device has no hover, and `(pointer: fine)` is how you
 * ask "is there a mouse" without sniffing the user agent.
 */
export function magnetic(strength = 0.25): Attachment<HTMLElement> {
	return (node) => {
		let cancelled = false;
		let teardown: (() => void) | undefined;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;
			if (!window.matchMedia('(pointer: fine)').matches) return;

			const { gsap } = motion;
			const moveX = gsap.quickTo(node, 'x', { duration: 0.4, ease: 'power3.out' });
			const moveY = gsap.quickTo(node, 'y', { duration: 0.4, ease: 'power3.out' });

			const onMove = (event: PointerEvent) => {
				const box = node.getBoundingClientRect();
				moveX((event.clientX - (box.left + box.width / 2)) * strength);
				moveY((event.clientY - (box.top + box.height / 2)) * strength);
			};

			const onLeave = () => {
				moveX(0);
				moveY(0);
			};

			node.addEventListener('pointermove', onMove);
			node.addEventListener('pointerleave', onLeave);

			teardown = () => {
				node.removeEventListener('pointermove', onMove);
				node.removeEventListener('pointerleave', onLeave);
				gsap.killTweensOf(node);
				gsap.set(node, { x: 0, y: 0 });
			};
		});

		return () => {
			cancelled = true;
			teardown?.();
		};
	};
}
