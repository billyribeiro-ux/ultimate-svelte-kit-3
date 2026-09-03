import { browser } from '$app/env';

/**
 * WHAT WAS TYPED BEFORE THE PAGE WOKE UP
 * ======================================
 *
 * A server-rendered form is usable before the JavaScript arrives — that is
 * the point of rendering it on the server. On a slow connection a person can
 * have typed their email into it by the time the client bundle runs. Then
 * hydration happens: the remote form's fields spread their *current* value
 * onto the inputs, the current value is the empty string the server knew
 * about, and what was typed is gone. The person presses the button and the
 * browser says "Please fill out this field" about a field they filled.
 *
 * The end-to-end suite found this: Playwright types faster than a bundle
 * loads, and one run in ten signed in with an email that had vanished.
 *
 * The fix runs in the component's `<script>`, which executes *before* the
 * template is hydrated and while the server's HTML is still on the page:
 * read what is in each input now, and make it the field's value, so that
 * hydration writes the typed text back rather than nothing. Client-side
 * navigations are unaffected — there is no server HTML to read, the query
 * finds nothing, and nothing happens.
 *
 * Each input is found by its exact generated name (`email/<hash>/signIn`),
 * which the field's own `as()` reports, so a field on another form can never
 * be mistaken for this one.
 */
interface TextField {
	as(type: 'text'): { readonly name: string };
	value(): string | undefined;
	set(value: string): unknown;
}

export function keepTyped(...fields: readonly TextField[]): void {
	if (!browser) return;
	for (const field of fields) {
		const { name } = field.as('text');
		const input = document.querySelector<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`);
		if (input?.value && !field.value()) field.set(input.value);
	}
}
