import { browser } from '$app/env';

/**
 * WHAT WAS TYPED BEFORE THE PAGE WOKE UP
 * ======================================
 *
 * A server-rendered form can be filled in before the JavaScript arrives — that
 * is the point of rendering it on the server. Then hydration happens, and a
 * remote form's fields spread their *current* value onto the controls: the
 * current value is what the server knew about, which is nothing, and what was
 * typed is gone. The person presses the button and the browser says "Please
 * fill out this field" about a field they filled.
 *
 * The end-to-end suite found it on the phone profile, minting an API key on the
 * settings page: Playwright typed the key's name a few dozen milliseconds before
 * the bundle had hydrated, hydration emptied the field, and the `required` check
 * stopped the submission without a request ever leaving the browser. A select
 * goes the same way, which is worse, because nothing stops that submission: a
 * `read` key chosen before hydration would quietly come back as `ingest`.
 *
 * `bind:value` does not have this problem. While hydrating, Svelte compares an
 * input's `value` with its `defaultValue` — the value the server rendered — and
 * keeps whichever the person changed it to. A spread from `field.as(…)` is an
 * attribute, not a binding, so it gets no such care. This applies the same
 * test, from the component's `<script>`, which runs *before* its template is
 * hydrated and while the server's controls are still on the page: a control
 * whose value differs from what the server rendered was changed by somebody,
 * and its value becomes the field's — so hydration writes it straight back.
 *
 * Client-side navigations are unaffected: the controls are not on the page
 * yet, the query finds nothing, and nothing happens. Each control is found by
 * the exact generated name its field reports (`name/<hash>/createKey`), so a
 * control that belongs to another form can never be mistaken for this one.
 *
 * It is not automatic, so every typed field the server renders has to ask for
 * it. There are two: the key form in settings, and the saved-view name on the
 * explore page. The alert rule form is not one of them, because it only exists
 * after a click, by which time the page has long since hydrated.
 */
interface Field {
	as(type: 'text'): { readonly name: string };
	set(value: string): unknown;
}

export function keepTyped(...fields: readonly Field[]): void {
	if (!browser) return;

	for (const field of fields) {
		// `as('text')` only to learn the name: a `select` field's is the same.
		const { name } = field.as('text');
		const control = document.querySelector(`[name="${CSS.escape(name)}"]`);
		if (control && changedSinceRendered(control)) field.set(control.value);
	}
}

/** Whether somebody changed this control after the server rendered it. */
function changedSinceRendered(
	control: Element
): control is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
	if (control instanceof HTMLSelectElement) {
		return Array.from(control.options).some((option) => option.selected !== option.defaultSelected);
	}
	if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
		return control.value !== control.defaultValue;
	}
	return false;
}
