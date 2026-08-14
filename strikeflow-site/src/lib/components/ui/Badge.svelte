<!-- BADGE — a small pill for labels, tags and status. -->

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'neutral' | 'brand' | 'bull' | 'bear' | 'warn';
		children: Snippet;
	}

	let { tone = 'neutral', children }: Props = $props();
</script>

<span class="badge badge--{tone}">{@render children()}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-family: var(--font-heading);
		font-size: var(--fs-xs);
		font-weight: var(--weight-semibold);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
		padding: 0.25rem 0.625rem;
		border-radius: var(--radius-full);
		border: 1px solid transparent;
		white-space: nowrap;
	}

	/*
	 * `color-mix()` derives the background from the same token as the text, so a
	 * badge stays coherent if the palette changes. Beats hand-picking a second
	 * hex value that then drifts out of sync.
	 */
	.badge--neutral {
		background-color: var(--surface-overlay);
		border-color: var(--border);
		color: var(--text-secondary);
	}

	.badge--brand {
		background-color: color-mix(in srgb, var(--brand-500) 16%, transparent);
		border-color: color-mix(in srgb, var(--brand-500) 40%, transparent);
		color: var(--brand-300);
	}

	.badge--bull {
		background-color: color-mix(in srgb, var(--bull) 16%, transparent);
		border-color: color-mix(in srgb, var(--bull) 40%, transparent);
		color: var(--bull-400);
	}

	.badge--bear {
		background-color: color-mix(in srgb, var(--bear) 16%, transparent);
		border-color: color-mix(in srgb, var(--bear) 40%, transparent);
		color: var(--bear-400);
	}

	.badge--warn {
		background-color: color-mix(in srgb, var(--warn) 16%, transparent);
		border-color: color-mix(in srgb, var(--warn) 40%, transparent);
		color: var(--warn-400);
	}
</style>
