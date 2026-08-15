<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A labelled form field with its error message wired up properly.
	 *
	 * Three things have to be true for a field to be usable without sight, and
	 * all three are easy to get wrong:
	 *
	 *   1. The label must be *associated* with the input, not merely next to it.
	 *      `<label for>` / `id` does that.
	 *   2. An error must be *announced*, not just coloured red. `aria-describedby`
	 *      pointing at the message does that, and `role="alert"` on the message
	 *      makes it interrupt when it appears.
	 *   3. The input must say it is invalid. `aria-invalid` does that.
	 *
	 * This component owns all three so no caller has to remember them. The `id`
	 * is generated rather than passed, because two of the same field on one page
	 * with the same hard-coded id silently breaks the label association for one
	 * of them.
	 */

	let {
		label,
		hint,
		error,
		required = false,
		children
	}: {
		label: string;
		hint?: string;
		/** A message from the server, or from client-side validation. */
		error?: string | undefined;
		required?: boolean;
		/** Receives the ids to wire onto the control. */
		children: Snippet<[{ id: string; describedBy: string | undefined; invalid: boolean }]>;
	} = $props();

	// `$props.id()` gives a stable, hydration-safe unique id — the same string on
	// the server and in the browser, which `crypto.randomUUID()` would not be.
	const uid = $props.id();
	const id = `${uid}-field`;
	const hintId = `${uid}-hint`;
	const errorId = `${uid}-error`;

	const describedBy = $derived(
		[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="field">
	<label for={id}>
		{label}
		{#if !required}<span class="optional">(optional)</span>{/if}
	</label>

	{#if hint}
		<p id={hintId} class="hint">{hint}</p>
	{/if}

	{@render children({ id, describedBy, invalid: Boolean(error) })}

	{#if error}
		<p id={errorId} class="error" role="alert">{error}</p>
	{/if}
</div>

<style>
	.field {
		display: block;
	}

	.optional {
		font-weight: var(--weight-regular);
		color: var(--ink-faint);
		margin-inline-start: var(--space-1);
	}

	.hint {
		font-size: var(--text-sm);
		color: var(--ink-muted);
		margin-block-end: var(--space-2);
		max-width: none;
	}

	.error {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-block-start: var(--space-2);
		font-size: var(--text-sm);
		color: var(--danger);
		max-width: none;
	}

	/*
	 * A shape as well as a colour. Roughly one man in twelve cannot reliably
	 * distinguish red from the surrounding text, so red alone is not a signal.
	 */
	.error::before {
		content: '!';
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 1.1em;
		height: 1.1em;
		border-radius: 50%;
		background: var(--danger);
		color: var(--on-accent);
		font-size: 0.75em;
		font-weight: var(--weight-bold);
	}
</style>
