/**
 * ONE CUSTOM TRANSITION
 * =====================
 *
 * `pop` is for a small thing that confirms something — the check mark that
 * replaces a copy icon for a moment. It scales from 60% with its opacity,
 * on the `--ease-out` curve, and takes 0ms when motion is reduced, so a
 * component that uses it does not have to ask.
 *
 * A Svelte transition is a function of the element that returns `duration`,
 * `easing` and a `css` function of `t` (0 → 1 on the way in). Returning
 * `css` rather than `tick` lets Svelte run it as a CSS animation, off the
 * main thread, which is why the built-in ones do the same.
 */

import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import { reducedMotion } from './prefers.svelte.ts';

export function pop(
	_node: Element,
	{ duration = 160 }: { duration?: number } = {}
): TransitionConfig {
	return {
		duration: reducedMotion.current ? 0 : duration,
		easing: cubicOut,
		css: (t) => `opacity: ${t}; scale: ${0.6 + 0.4 * t}`
	};
}
