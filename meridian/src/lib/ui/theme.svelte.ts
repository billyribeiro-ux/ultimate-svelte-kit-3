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
 *
 * WHY ONE INSTANCE IN A MODULE, WHEN SVELTE ADVISES CONTEXT
 * ---------------------------------------------------------
 * Svelte's best practices prefer context to state in a shared module, for a
 * reason that matters on a server: a module is loaded once per process, so
 * state in it is shared by every request the process renders, and one
 * person's value can be rendered into another person's page. This module is
 * safe from that by construction, and the constructor and `set` are where it
 * is decided. On the server the constructor returns before it reads
 * anything, and `set` is only ever called from a change handler, which never
 * runs there — so the server's instance is `'system'` for its whole life and
 * holds nothing of anybody's. The person's choice reaches a server render
 * another way: as `data.theme`, read from the cookie for that one request.
 */

import { MediaQuery } from 'svelte/reactivity';
import { browser } from '$app/env';
import { THEME_COOKIE } from './theme-cookie.ts';

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

		/*
		 * The two things outside the stylesheet that follow the choice, the
		 * same way the boot script in `app.html` sets them on load: the
		 * browser chrome's `theme-color`, and the cookie the server reads.
		 */
		for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
			const scheme = meta.dataset.scheme;
			meta.media =
				next === 'system'
					? `(prefers-color-scheme: ${scheme})`
					: scheme === next
						? 'all'
						: 'not all';
		}
		document.cookie =
			next === 'system'
				? `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
				: `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
	}
}

export const theme = new ThemeState();
