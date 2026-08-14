<!--
	FEATURE GRID

	Renders the shared `features` array. Because the home page, the features page and
	the structured data all read from that same array, they can't drift apart.
-->

<script lang="ts">
	import { features as allFeatures, type Feature } from '#lib/data/features.ts';
	import { featureIcons } from '#lib/components/ui/icons.ts';
	import Card from '#lib/components/ui/Card.svelte';

	interface Props {
		/** Defaults to every feature. Pass a slice for a teaser grid. */
		items?: readonly Feature[];
		/** Show the three bullet points under each summary. */
		detailed?: boolean;
		/** Heading level for each card title — see the note in SectionHeader. */
		level?: 3 | 4;
	}

	let { items = allFeatures, detailed = false, level = 3 }: Props = $props();
</script>

<!--
	`role="list"` is here because our CSS sets `list-style: none`, and Safari's
	VoiceOver *removes list semantics* from any <ul> whose list-style is none. That's
	a deliberate (if unpopular) WebKit behaviour. Re-declaring the role restores the
	"list of 6 items" announcement.
-->
<ul class="feature-grid auto-grid" role="list">
	{#each items as feature (feature.id)}
		{@const Icon = featureIcons[feature.icon]}
		<li class="feature-grid__item">
			<Card as="article">
				<span class="feature-grid__icon" aria-hidden="true">
					<Icon size={26} weight="duotone" />
				</span>

				<svelte:element this={`h${level}`} class="feature-grid__title" id={feature.id}>
					{feature.title}
				</svelte:element>

				<p class="feature-grid__summary">{feature.summary}</p>

				{#if detailed}
					<p class="feature-grid__detail">{feature.detail}</p>
					<ul class="feature-grid__points" role="list">
						{#each feature.points as point (point)}
							<li>{point}</li>
						{/each}
					</ul>
				{/if}
			</Card>
		</li>
	{/each}
</ul>

<style>
	.feature-grid {
		/* Consumed by `.auto-grid` — the grid decides its own column count from this. */
		--grid-min: 17.5rem;
		--grid-gap: var(--space-5);
	}

	/* The <li> is a pure grid cell; the Card inside does the visual work. */
	.feature-grid__item {
		display: flex;
		max-width: none;
		margin: 0;
	}

	.feature-grid__item :global(.card) {
		flex: 1;
	}

	.feature-grid__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		border-radius: var(--radius-md);
		background-color: color-mix(in srgb, var(--brand-500) 14%, transparent);
		color: var(--brand-400);
		margin-block-end: var(--space-5);
	}

	.feature-grid__title {
		font-size: var(--fs-lg);
		margin-block-end: var(--space-2);
	}

	.feature-grid__summary {
		color: var(--text-secondary);
		max-width: none;
	}

	.feature-grid__detail {
		margin-block-start: var(--space-3);
		font-size: var(--fs-sm);
		color: var(--text-muted);
		max-width: none;
	}

	.feature-grid__points {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-block-start: var(--space-4);
		padding-block-start: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.feature-grid__points li {
		position: relative;
		padding-inline-start: var(--space-5);
		font-size: var(--fs-sm);
		color: var(--text-secondary);
		max-width: none;
		margin: 0;
	}

	/* A CSS-drawn tick. No icon component, no extra DOM node, and `aria-hidden`
	   is unnecessary because pseudo-elements aren't in the accessibility tree. */
	.feature-grid__points li::before {
		content: '';
		position: absolute;
		inset-block-start: 0.55em;
		inset-inline-start: 0.15rem;
		width: 0.45rem;
		height: 0.25rem;
		border-inline-start: 2px solid var(--bull);
		border-block-end: 2px solid var(--bull);
		transform: rotate(-45deg);
	}
</style>
