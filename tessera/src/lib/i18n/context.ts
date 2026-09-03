/**
 * THE MESSAGE CATALOGUE, AS CONTEXT
 * =================================
 *
 * `t` used to be a prop. It was declared on eight components and written out at
 * seventeen call sites, and every one of them said the same thing: "whatever my
 * parent has". A prop that is never anything but forwarded is not a prop; it is
 * a global with extra steps and a rename that touches eight files.
 *
 * WHY `createContext` AND NOT `getContext`
 * ----------------------------------------
 * `getContext('messages')` is a string key and an `any`. Two components can
 * disagree about what is under it, a typo is a runtime `undefined`, and the type
 * has to be re-asserted at every call. `createContext` — new in Svelte 5.57 —
 * hands back the accessors instead, so the key is a closure nobody can misspell
 * and the type is declared once, here.
 *
 * It returns three functions, and the third is the reason this file exists in
 * this shape:
 *
 *     const [read, provide, has] = createContext<T>();
 *
 *   * `read()` returns the value **or throws** if no ancestor provided one.
 *     Throwing is right: a component that needs messages and cannot find them is
 *     broken, and a silent `undefined` becomes `Cannot read properties of
 *     undefined` three frames later, in a component that is not the problem.
 *   * `provide(value)` sets it for this component and everything below it.
 *   * `has()` answers *without* throwing — the only way to ask whether you are
 *     inside a provider at all.
 *
 * WHY THE CONTEXT VALUE IS A FUNCTION
 * -----------------------------------
 * Context is set once, during initialisation, and never again. The catalogue is
 * not once: it is `$derived(messages(data.locale))`, and SvelteKit reuses a
 * component across navigations that match the same route — so going from
 * `/boards/abc` to `/fr/boards/abc` updates the prop *in place* on the component
 * that is already mounted.
 *
 * Putting the catalogue itself in context would capture English and keep it.
 * Putting a getter in context stores something that never changes — the function
 * — while what it returns tracks the prop. Consumers wrap the call in `$derived`
 * and read `t.thing` exactly as before.
 *
 * (`svelte-check` says this out loud if you get it wrong: "This reference only
 * captures the initial value of `t`". It was right.)
 *
 * WHERE `has` EARNS ITS PLACE
 * ---------------------------
 * The embeddable viewer. `TesseraBoard.svelte` is a custom element: its own
 * Svelte root, mounted by whatever page embedded it, with no ancestor of ours
 * above it. It has three strings to show — a loading line, a failure line and an
 * `aria-label` — which before this file were English literals sitting outside
 * the catalogue entirely. That is how a string stays untranslated for two years
 * without anybody filing it.
 *
 * `read()` there would throw on mount. `has()` lets one accessor serve both
 * trees: inside the workspace it is the viewer's language, inside somebody
 * else's page it is the default catalogue.
 */

import { createContext } from 'svelte';
import { en, type Messages } from './messages/en.ts';

const [read, provide, has] = createContext<() => Messages>();

/**
 * Provide the catalogue to everything below. Called once, in `Workspace.svelte`.
 *
 * Takes a getter rather than a value — see the note above. Must run during
 * component initialisation, the same rule as `setContext`, because it *is*
 * `setContext` with the key and the type already decided.
 */
export function setMessages(catalogue: () => Messages): void {
	provide(catalogue);
}

/**
 * The catalogue getter, for a component that is only ever inside the workspace.
 * Throws during initialisation if no ancestor provided one, which is the point.
 *
 *     const catalogue = requireMessages();
 *     const t = $derived(catalogue());
 */
export const requireMessages = read;

/**
 * The catalogue getter, or the default one.
 *
 * The fallback is not laziness. Two trees render translated strings: the
 * application, which always provides, and the embedded custom element, which
 * cannot. Throwing is correct for the first and wrong for the second, and
 * `has()` is what tells them apart — at initialisation, before anything has a
 * chance to throw.
 *
 * `en` directly rather than `messages(DEFAULT_LOCALE)`: importing the barrel
 * would pull French and Japanese into the embed bundle, and the embed's whole
 * argument for existing is that it is small.
 */
export function useMessages(): () => Messages {
	return has() ? read() : () => en;
}

/** Whether an ancestor provided a catalogue. Exported so tests can assert it. */
export const hasMessages = has;
