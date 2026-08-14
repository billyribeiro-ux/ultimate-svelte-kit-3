import { browser } from '$app/env';

/**
 * The theme preference: light, dark, or follow the operating system.
 *
 * A `.svelte.ts` file — the extension is what tells the Svelte compiler to
 * process runes in a plain module. Without it, `$state` here is just an
 * undefined function.
 *
 * The state lives in a module rather than a component because the switch in the
 * header and the page it recolours are not in a parent/child relationship, and
 * threading a prop between them through four layouts to make them agree would be
 * worse than a shared module by every measure.
 */

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'halfpast-theme';

function isTheme(value: unknown): value is Theme {
	return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * What is stored, read once at startup.
 *
 * The inline script in `app.html` already applied this before first paint. This
 * reads the same key so the switch's UI agrees with what is on screen — the two
 * are separate on purpose: one has to run before the framework exists, the
 * other has to be reactive.
 */
function readStored(): Theme {
	if (!browser) return 'system';
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isTheme(stored) ? stored : 'system';
	} catch {
		return 'system';
	}
}

class ThemeStore {
	/** The visitor's *choice*, which may be "let the OS decide". */
	#preference = $state<Theme>(readStored());

	/** What the OS currently says, tracked live so `resolved` stays honest. */
	#systemIsDark = $state(false);

	constructor() {
		if (!browser) return;

		const query = window.matchMedia('(prefers-color-scheme: dark)');
		this.#systemIsDark = query.matches;

		// The OS theme can change while the page is open — most desktops switch
		// automatically at sunset. Without this listener the page would keep the
		// theme it started with until a reload.
		query.addEventListener('change', (event) => {
			this.#systemIsDark = event.matches;
		});
	}

	get preference(): Theme {
		return this.#preference;
	}

	/** What is actually on screen right now: never `'system'`. */
	get resolved(): 'light' | 'dark' {
		if (this.#preference === 'system') return this.#systemIsDark ? 'dark' : 'light';
		return this.#preference;
	}

	set(next: Theme): void {
		this.#preference = next;
		if (!browser) return;

		try {
			if (next === 'system') localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Private mode. The choice still applies for this page's lifetime.
		}

		/*
		 * Remove the attribute for `system` rather than writing the resolved value.
		 * Pinning it would freeze the page at whatever the OS said at that moment,
		 * and the listener above would have nothing to change.
		 */
		if (next === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = next;
	}

	/** Cycle light → dark → system, for a single-button switch. */
	cycle(): void {
		const index = THEMES.indexOf(this.#preference);
		this.set(THEMES[(index + 1) % THEMES.length] ?? 'system');
	}
}

export const theme = new ThemeStore();
