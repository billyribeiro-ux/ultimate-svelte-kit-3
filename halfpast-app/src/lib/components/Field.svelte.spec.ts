import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Field from './Field.svelte';

/**
 * `Field` in a real browser, asked the questions a screen reader asks.
 *
 * The component's whole job is wiring: a label joined to its control, an error
 * that is part of the control's description, and `aria-invalid` saying so.
 * None of that is visible, so none of it is caught by looking at the page. The
 * assertions here read the *accessible* name and description, worked out from
 * the rendered DOM by the W3C accessible-name algorithm — `for`, `id`,
 * `aria-describedby`, `aria-hidden` and the text itself — rather than checking
 * that the attributes exist. An `aria-describedby` pointing at an id that is
 * not on the page passes an attribute check and announces nothing. The first
 * run of this file found that the error's red "!" mark, drawn with CSS
 * `content`, was part of the description, so it was being read out.
 *
 * This is the `client` project in `vite.config.ts`: a `.svelte.spec.ts` file,
 * run in headless Chromium.
 */

type Wiring = { id: string; describedBy: string | undefined; invalid: boolean };

/**
 * The control a page would put inside `<Field>`, as a snippet built in code.
 *
 * `createRawSnippet` is how a test hands a component a snippet without writing
 * a wrapper component: `render` returns the element's HTML, and it receives
 * the snippet's parameters as a function, the same `{ id, describedBy,
 * invalid }` a page's `{#snippet children(...)}` destructures.
 */
const textInput = createRawSnippet<[Wiring]>((wiring) => ({
	render: () => {
		const { id, describedBy, invalid } = wiring();
		const description = describedBy ? ` aria-describedby="${describedBy}"` : '';
		return `<input type="email" id="${id}"${description} aria-invalid="${invalid}" />`;
	}
}));

describe('Field', () => {
	it('names the control with its label', async () => {
		const screen = await render(Field, { label: 'Email', required: true, children: textInput });

		const input = screen.getByRole('textbox', { name: 'Email' });
		await expect.element(input).toBeInTheDocument();
		await expect.element(input).toHaveAttribute('aria-invalid', 'false');
		await expect.element(input).not.toHaveAttribute('aria-describedby');
	});

	it('makes the hint part of what the control says about itself', async () => {
		const screen = await render(Field, {
			label: 'Email',
			hint: 'We send your confirmation here.',
			children: textInput
		});

		await expect
			.element(screen.getByRole('textbox', { name: /Email/ }))
			.toHaveAccessibleDescription('We send your confirmation here.');
	});

	it('announces an error as invalid, and reads it out with the hint', async () => {
		const screen = await render(Field, {
			label: 'Email',
			required: true,
			hint: 'We send your confirmation here.',
			error: 'That does not look like an email address',
			children: textInput
		});

		const input = screen.getByRole('textbox', { name: 'Email' });
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');
		await expect
			.element(input)
			.toHaveAccessibleDescription(
				'We send your confirmation here. That does not look like an email address'
			);
		// And it interrupts: the message the description points at is a
		// `role="alert"` region, announced the moment it appears.
		await expect.element(screen.getByRole('alert')).toBeVisible();
	});
});
