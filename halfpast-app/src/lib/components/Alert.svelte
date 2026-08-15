<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CheckCircleIcon, InfoIcon, WarningIcon, WarningCircleIcon } from 'phosphor-svelte';

	/**
	 * A message that needs to be noticed.
	 *
	 * The `role` is the whole point of this component and the part that is
	 * usually wrong. `role="alert"` interrupts a screen reader immediately — the
	 * right thing for "that time was just taken", and rude for "your appointment
	 * is confirmed", which the reader will reach on its own a second later.
	 *
	 * So: errors assert, everything else announces politely. Getting this
	 * backwards is invisible to anybody testing with their eyes.
	 */

	type Tone = 'info' | 'success' | 'warning' | 'error';

	let {
		tone = 'info',
		title,
		children
	}: { tone?: Tone; title?: string; children: Snippet } = $props();

	const assertive = $derived(tone === 'error');
</script>

<div
	class="alert {tone}"
	role={assertive ? 'alert' : 'status'}
	aria-live={assertive ? 'assertive' : 'polite'}
>
	<span class="icon" aria-hidden="true">
		{#if tone === 'success'}
			<CheckCircleIcon weight="fill" />
		{:else if tone === 'warning'}
			<WarningIcon weight="fill" />
		{:else if tone === 'error'}
			<WarningCircleIcon weight="fill" />
		{:else}
			<InfoIcon weight="fill" />
		{/if}
	</span>

	<div class="body">
		{#if title}<p class="title">{title}</p>{/if}
		<div class="text">{@render children()}</div>
	</div>
</div>

<style>
	.alert {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-4);
		border: var(--border) solid;
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}

	.icon {
		flex-shrink: 0;
		font-size: 1.25rem;
		line-height: 1;
		/* Optically centre the icon against the first line of text. */
		margin-block-start: -0.05em;
	}

	.body {
		min-width: 0;
	}

	.title {
		font-weight: var(--weight-semibold);
		margin-block-end: var(--space-1);
		max-width: none;
	}

	.text :global(p) {
		max-width: none;
	}

	.text :global(p + p) {
		margin-block-start: var(--space-2);
	}

	.info {
		background: var(--surface-sunken);
		border-color: var(--line);
		color: var(--ink);
	}
	.info .icon {
		color: var(--ink-muted);
	}

	.success {
		background: var(--ok-soft);
		border-color: var(--ok-line);
		color: var(--ink);
	}
	.success .icon {
		color: var(--ok);
	}

	.warning {
		background: var(--warn-soft);
		border-color: var(--warn-line);
		color: var(--ink);
	}
	.warning .icon {
		color: var(--warn);
	}

	.error {
		background: var(--danger-soft);
		border-color: var(--danger-line);
		color: var(--ink);
	}
	.error .icon {
		color: var(--danger);
	}
</style>
