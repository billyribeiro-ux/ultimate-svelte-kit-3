/**
 * LIGHT, DARK, OR WHATEVER THE SYSTEM SAYS
 * ========================================
 *
 * The CSS does the real work: every colour token is a `light-dark()` pair
 * and `color-scheme` picks the side. This class only decides what
 * `color-scheme` is — the system's preference by default, or the person's
 * choice, remembered in `localStorage` and applied as `data-theme` on
 * `<html>` (the inline script in `app.html` applies it before first paint).
 *
 * `MediaQuery` from `svelte/reactivity` is the system's preference as a
 * reactive value: `resolved` updates when the OS switches at sunset without
 * anybody polling.
 */

import { MediaQuery } from 'svelte/reactivity';
import { browser } from '$app/env';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'meridian:theme';

class ThemeState {
	choice: Theme = $state('system');

	#systemDark = new MediaQuery('(prefers-color-scheme: dark)');

	readonly resolved: 'light' | 'dark' = $derived(
		this.choice === 'system' ? (this.#systemDark.current ? 'dark' : 'light') : this.choice
	);

	constructor() {
		if (!browser) return;
		try {
			const saved = localStorage.getItem(KEY);
			if (saved === 'light' || saved === 'dark') this.choice = saved;
		} catch {
			// Storage can be unavailable (private mode, blocked). The system wins.
		}
	}

	set(next: Theme): void {
		this.choice = next;
		if (!browser) return;
		try {
			if (next === 'system') localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, next);
		} catch {
			// same as above
		}
		if (next === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = next;
	}
}

export const theme = new ThemeState();
