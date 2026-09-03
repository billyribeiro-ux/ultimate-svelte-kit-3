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

import { untrack } from 'svelte';
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

/** The three keys this workspace owns. Anything else in the URL is left alone. */
const KEYS = ['q', 'range', 'view'] as const;

/** `?a=b` and `a=b` are the same search string. Comparing them raw is a bug. */
function normalise(search: string): string {
	return search.startsWith('?') ? search.slice(1) : search;
}

export class Workspace {
	readonly params: SvelteURLSearchParams;

	/**
	 * TWO MARKERS, NOT ONE, AND THIS IS THE WHOLE CORRECTNESS ARGUMENT.
	 *
	 * `#urlSeen` is the last address-bar value this instance has *read*.
	 * `#written` is the last value it has *put there*.
	 *
	 * The first version of this class had one field for both, and it was wrong in
	 * a way that no unit test would have found. `adopt` ended with
	 * `#synced = params.toString()` — so every time the params changed, the adopt
	 * effect re-ran, saw a URL it had not written, and quietly recorded the
	 * *current params* as "already synced". `flush` then compared equal and did
	 * nothing, and the debounced write did nothing, and the query in the address
	 * bar never changed again.
	 *
	 * The end-to-end test that types a query and presses Run immediately is what
	 * found it: with a pause between the two it worked, because the debounce had
	 * already fired. That is the shape of the bug this separation removes — one
	 * marker cannot answer both "has the URL changed under me" and "have my edits
	 * been written out".
	 */
	#urlSeen = '';
	#written = '';
	#timer = 0;

	constructor(init: WorkspaceInit) {
		this.params = new SvelteURLSearchParams();
		this.params.set('q', init.q);
		this.params.set('range', init.range);
		this.params.set('view', init.view);
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

	/** The query string as it would appear in the address bar, without the `?`. */
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
	 * The params are read and written inside `untrack`, so the effect that calls
	 * this depends **only** on the URL. Without it, every keystroke re-runs the
	 * adopt effect — which is how the two markers above got conflated in the first
	 * place, and would be a loop even with them separated.
	 */
	adopt(search: string): void {
		const incoming = normalise(search);
		if (incoming === this.#urlSeen) return;
		this.#urlSeen = incoming;

		untrack(() => {
			// A plain `URLSearchParams`: parsed here, read three times, discarded. The
			// reactive version would be a signal nothing ever writes to.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const values = new URLSearchParams(incoming);
			for (const key of KEYS) {
				const value = values.get(key);
				if (value !== null && this.params.get(key) !== value) this.params.set(key, value);
			}
		});

		/*
		 * The address bar now says exactly `incoming`.
		 *
		 * Not `params.toString()` — the two differ whenever the URL omits a key this
		 * workspace holds, which is the ordinary case for a hand-written link like
		 * `?q=from+logs`. Recording the params here would mark those defaults as
		 * already written, and they would never reach the URL.
		 */
		this.#written = incoming;
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
	 *
	 * A consequence worth naming: arriving on `?q=from+logs` with no `range` or
	 * `view` rewrites the URL to include them, once, shortly after load. That is
	 * deliberate. The address bar is the state, so it should say all of it — and a
	 * link copied a moment later then carries the whole view rather than the half
	 * somebody happened to type.
	 */
	sync(): () => void {
		const search = this.search;
		if (search === this.#written) return () => {};

		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.#write(search), SETTLE) as unknown as number;

		return () => clearTimeout(this.#timer);
	}

	/** Flush immediately. Used when running a query, so the URL is right to copy. */
	flush(): void {
		clearTimeout(this.#timer);
		this.#write(this.search);
	}

	#write(search: string): void {
		if (search === this.#written) return;

		// Both markers move together: the URL now says this, and we are the ones who
		// said it — so the adopt effect that fires next is a no-op rather than a
		// round trip back through the params.
		this.#written = search;
		this.#urlSeen = search;

		replaceState(`?${search}`, {});
	}
}
