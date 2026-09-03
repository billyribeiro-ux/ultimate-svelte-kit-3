/**
 * Light, dark, or whatever the operating system says.
 *
 * Three states, not two. A toggle that only knows light and dark has to pick one
 * as its starting point, and it will be the wrong one for half the people who
 * open it — the machine already knows the answer and was never asked.
 */

import { MediaQuery } from 'svelte/reactivity';
import { browser } from '$app/env';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'tessera:theme';

/**
 * `MediaQuery` from `svelte/reactivity` rather than `matchMedia` plus a
 * listener plus an `$effect` to remove it. It is the same thing, correct, in one
 * line — and it is safe to construct during SSR, where it reports the fallback
 * rather than throwing on a missing `window`.
 */
const prefersDark = new MediaQuery('prefers-color-scheme: dark', false);

class Theme {
	/**
	 * What the person chose. `app.html` has already applied the stored value to
	 * `<html>` before first paint, so this only has to agree with it.
	 */
	choice = $state<ThemeChoice>('system');

	/** What is actually on screen right now. */
	readonly resolved = $derived<'light' | 'dark'>(
		this.choice === 'system' ? (prefersDark.current ? 'dark' : 'light') : this.choice
	);

	constructor() {
		if (!browser) return;

		try {
			const stored = localStorage.getItem(KEY);
			if (stored === 'light' || stored === 'dark') this.choice = stored;
		} catch {
			// Storage blocked. The system preference still applies.
		}
	}

	set(choice: ThemeChoice): void {
		this.choice = choice;
		if (!browser) return;

		/*
		 * The attribute and the stored value are set here rather than in an
		 * `$effect`.
		 *
		 * An effect would also run on the *first* render, writing the attribute that
		 * `app.html`'s inline script already set — harmless — and writing to
		 * localStorage on every page load, which is a synchronous disk touch for no
		 * reason. This only runs when somebody actually chooses.
		 */
		const root = document.documentElement;

		if (choice === 'system') {
			delete root.dataset.theme;
			try {
				localStorage.removeItem(KEY);
			} catch {
				// Nothing to do; the choice lasts for this page.
			}
			return;
		}

		root.dataset.theme = choice;
		try {
			localStorage.setItem(KEY, choice);
		} catch {
			// As above.
		}
	}

	/** Cycle in the order the button's icons suggest. */
	next(): void {
		this.set(this.choice === 'system' ? 'light' : this.choice === 'light' ? 'dark' : 'system');
	}
}

export const theme = new Theme();
