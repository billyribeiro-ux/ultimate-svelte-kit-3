/**
 * THE URL IS THE STATE
 * ====================
 *
 * A query, a time range and a selected tab. Three pieces of state, and the whole
 * design of this file is the decision to keep them in the address bar rather
 * than in a component.
 *
 * WHY THAT IS WORTH THE TROUBLE
 * -----------------------------
 * Because of what people do with an observability tool. They find something and
 * paste it into a chat. If the state lives in a component, the link they paste
 * opens an empty page and the next message is "what did you search for?" — which
 * is the entire product failing at the only moment it mattered.
 *
 * The address bar also gives three more things for free, each of which is real
 * work to build otherwise: the back button undoes a change to the query, a
 * reload does not lose it, and the server can render the first result rather
 * than shipping an empty shell that fetches after hydration.
 *
 * WHY `SvelteURLSearchParams`
 * ---------------------------
 * The obvious implementation is `goto('?q=' + …)` on every keystroke. That puts
 * a navigation in the typing path — a hundred history entries for a sentence,
 * and a re-run of every `load` on the route — so the real shape is: **edit a
 * local reactive params object, and sync it to the address bar when it settles.**
 *
 * `SvelteURLSearchParams` is exactly that object. It is a `URLSearchParams` whose
 * reads are tracked and whose writes are reactive, so `params.get('q')` inside a
 * `$derived` re-runs when anything sets `q` — including a browser back button,
 * once the sync below feeds navigation back in. A plain `URLSearchParams` in
 * `$state` would need replacing wholesale on every edit to be reactive at all,
 * and `.set()` on it would silently do nothing.
 */

import { SvelteURLSearchParams } from 'svelte/reactivity';
import { replaceState } from '$app/navigation';
import { DEFAULT_RANGE } from '#lib/time/range.ts';

/** The parts of a workspace that live in the URL. Everything else is component state. */
export interface WorkspaceInit {
	readonly q: string;
	readonly range: string;
	readonly view: View;
}

export const VIEWS = ['table', 'chart'] as const;
export type View = (typeof VIEWS)[number];

/**
 * How long to wait before writing to the address bar.
 *
 * Long enough that typing a query produces one history entry rather than forty,
 * short enough that copying the URL a moment after typing gets the current
 * query. 400ms is roughly the gap between words.
 *
 * This is the one debounce in the application, and it is here rather than around
 * the parser because *this* is the expensive side effect: `history.replaceState`
 * on every keystroke is what makes a browser's address bar stutter.
 */
const SETTLE = 400;

export class Workspace {
	readonly params: SvelteURLSearchParams;

	/** The last search string written to or read from the address bar. */
	#synced: string;
	#timer = 0;

	constructor(init: WorkspaceInit) {
		this.params = new SvelteURLSearchParams();
		this.params.set('q', init.q);
		this.params.set('range', init.range);
		this.params.set('view', init.view);
		this.#synced = this.params.toString();
	}

	get q(): string {
		return this.params.get('q') ?? '';
	}

	set q(value: string) {
		this.params.set('q', value);
	}

	get range(): string {
		return this.params.get('range') || DEFAULT_RANGE;
	}

	set range(value: string) {
		this.params.set('range', value);
	}

	get view(): View {
		const value = this.params.get('view');
		return VIEWS.includes(value as View) ? (value as View) : 'table';
	}

	set view(value: View) {
		this.params.set('view', value);
	}

	/** The query string as it would appear in the address bar. */
	get search(): string {
		return this.params.toString();
	}

	/**
	 * Adopt a search string that came from somewhere else.
	 *
	 * The somewhere else is a back button, a forward button, or a link from
	 * another page. Without this the address bar changes and the interface does
	 * not, which is the single most common bug in a URL-driven application and the
	 * reason "the back button does nothing" is such a familiar complaint.
	 *
	 * Guarded on equality, because this is called from an effect that also depends
	 * on the params it writes — and an unguarded version is an infinite loop that
	 * only shows up as the fan spinning up.
	 */
	adopt(search: string): void {
		if (search === this.#synced) return;

		// A plain `URLSearchParams`, deliberately: this one is read once, inside this
		// function, and thrown away. Making it reactive would create a dependency on
		// a value that cannot change, in an effect that writes the params it reads.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const incoming = new URLSearchParams(search);
		for (const key of ['q', 'range', 'view']) {
			const value = incoming.get(key);
			if (value !== null && this.params.get(key) !== value) this.params.set(key, value);
		}

		this.#synced = this.params.toString();
	}

	/**
	 * Write to the address bar once the edits settle.
	 *
	 * `replaceState` and not `goto`. `goto` runs the route's `load` functions,
	 * which for this page would mean a round trip per keystroke; `replaceState`
	 * changes the URL and nothing else, which is right because the data is fetched
	 * by a remote function that this page calls itself.
	 *
	 * The other half of the decision is *replace* rather than *push*: pushing
	 * would put one history entry per pause in typing, so leaving the page would
	 * take fifteen presses of the back button. Pushing is correct for a
	 * deliberate act — opening a trace — which is why the drawer uses `pushState`
	 * and this does not.
	 */
	sync(): () => void {
		const search = this.search;
		if (search === this.#synced) return () => {};

		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#synced = search;
			replaceState(`?${search}`, {});
		}, SETTLE) as unknown as number;

		return () => clearTimeout(this.#timer);
	}

	/** Flush immediately. Used when running a query, so the URL is right to copy. */
	flush(): void {
		clearTimeout(this.#timer);
		const search = this.search;
		if (search === this.#synced) return;
		this.#synced = search;
		replaceState(`?${search}`, {});
	}
}
