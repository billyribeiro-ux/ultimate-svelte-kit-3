<!--
	STAT STRIP — a row of headline numbers.

	Uses <dl> (description list) rather than divs. A number and its label are
	genuinely a term/definition pair, and marking them up as one means a screen
	reader announces "median latency, 240 milliseconds" instead of two orphaned
	strings that happen to sit near each other.
-->

<script lang="ts">
	export interface Stat {
		readonly value: string;
		readonly label: string;
		/** Optional footnote — use it to qualify a claim honestly. */
		readonly note?: string;
	}

	interface Props {
		stats: readonly Stat[];
		bordered?: boolean;
	}

	let { stats, bordered = true }: Props = $props();
</script>

<dl class="stats" class:stats--bordered={bordered}>
	{#each stats as stat (stat.label)}
		<div class="stats__item">
			<dt class="stats__label">{stat.label}</dt>
			<dd class="stats__value tabular">{stat.value}</dd>
			{#if stat.note}
				<dd class="stats__note">{stat.note}</dd>
			{/if}
		</div>
	{/each}
</dl>

<style>
	.stats {
		display: grid;
		/* Two across on a phone, then let auto-fit take over on wider screens.
		   One-per-row on mobile wastes an enormous amount of vertical space. */
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-6) var(--space-4);
		margin: 0;
	}

	.stats--bordered {
		padding: var(--space-6) 0;
		border-block: 1px solid var(--border);
	}

	.stats__item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	/* The label sits ABOVE the number visually, but after it in the DOM would be
	   wrong for a <dl> — dt must precede dd. `order` handles the visual swap without
	   breaking the semantic pairing. */
	.stats__label {
		order: 2;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.stats__value {
		order: 1;
		margin: 0;
		font-family: var(--font-heading);
		font-size: var(--fs-xl);
		font-weight: var(--weight-bold);
		color: var(--text-primary);
		line-height: var(--lh-tight);
		letter-spacing: var(--tracking-tight);
	}

	.stats__note {
		order: 3;
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-muted);
		opacity: 0.75;
	}

	@media (min-width: 48em) {
		.stats {
			grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
			gap: var(--space-8);
		}
	}
</style>
