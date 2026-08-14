<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRightIcon,
		LightningIcon,
		ShieldCheckIcon,
		DatabaseIcon,
		BroadcastIcon,
		StrategyIcon
	} from 'phosphor-svelte';

	import Seo from '#lib/seo/Seo.svelte';
	import { softwareApplicationSchema } from '#lib/seo/schema.ts';
	import { site } from '#lib/data/site.ts';

	import Button from '#lib/components/ui/Button.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import FlowChart from '#lib/components/charts/FlowChart.svelte';
	import SectionHeader from '#lib/components/marketing/SectionHeader.svelte';
	import FeatureGrid from '#lib/components/marketing/FeatureGrid.svelte';
	import StatStrip from '#lib/components/marketing/StatStrip.svelte';
	import CtaBand from '#lib/components/marketing/CtaBand.svelte';
	import { heroSequence, parallax, reveal, revealGroup } from '#lib/motion/index.ts';

	const stats = [
		{ value: '<250ms', label: 'Tape to screen', note: 'Median, Pro and Desk plans' },
		{ value: '16', label: 'Exchanges consolidated', note: 'Full OPRA feed' },
		{ value: '1.4M', label: 'Prints per session', note: 'Peak, classified in real time' },
		{ value: '7 yrs', label: 'Tick history', note: 'Back to January 2019' }
	];

	const steps = [
		{
			icon: DatabaseIcon,
			title: 'We take the whole tape',
			body: 'Direct OPRA ingest across all sixteen US options exchanges, plus FINRA dark pool reporting. No aggregator in the middle adding seconds and dropping fields.'
		},
		{
			icon: StrategyIcon,
			title: 'We work out what it means',
			body: 'Every print is matched against the quote at execution to find the aggressor, stitched back together with its other legs, and scored against that contract’s own ninety-day baseline.'
		},
		{
			icon: BroadcastIcon,
			title: 'You see intent, not noise',
			body: 'What reaches your screen is a classified, deduplicated stream you can filter and set rules on — rather than a wall of prints you have to interpret yourself.'
		}
	];
</script>

<Seo
	title="Real-time options flow, decoded"
	description={site.description}
	schema={[softwareApplicationSchema()]}
/>

<!-- ============================================================
	 HERO
	 ============================================================ -->
<section class="hero" {@attach heroSequence()}>
	<!--
		The background glow parallaxes at 12% of scroll speed. It is decorative and
		behind everything, which is the only place parallax belongs.
	-->
	<div class="hero__glow" aria-hidden="true" {@attach parallax(0.12)}></div>

	<div class="container container--wide">
		<div class="hero__grid">
			<div class="hero__copy">
				<span data-hero="badge">
					<Badge tone="brand">Live options flow</Badge>
				</span>

				<!--
					The one <h1> on the page.

					It states what the product does in the language a buyer would use,
					not a slogan. "Read institutional options flow as it prints" tells
					both a human and a search engine what this page is about; something
					like "Trade smarter" tells neither.
				-->
				<h1 class="hero__title" data-hero="headline">
					Read institutional options flow as it prints
				</h1>

				<p class="hero__lede" data-hero="lede">
					StrikeFlow streams the entire US options tape — sweeps, blocks, dark pool prints and
					dealer gamma — in under 250 milliseconds. Stop reconstructing what happened an hour ago.
				</p>

				<div class="hero__actions" data-hero="actions">
					<Button href={resolve('/guide')} size="lg" pull>
						Get the free guide
						{#snippet iconTrailing()}<ArrowRightIcon />{/snippet}
					</Button>
					<Button href={resolve('/features')} variant="secondary" size="lg">
						See how it works
					</Button>
				</div>

				<ul class="hero__assurances" role="list" data-hero="assurances">
					<li>
						<LightningIcon size={16} weight="fill" aria-hidden="true" />
						<span>7-day free trial</span>
					</li>
					<li>
						<ShieldCheckIcon size={16} weight="fill" aria-hidden="true" />
						<span>Never connects to your broker</span>
					</li>
				</ul>
			</div>

			<div class="hero__chart" data-hero="panel">
				<FlowChart height={320} symbol="SPY" />
			</div>
		</div>

		<div class="hero__stats" data-reveal {@attach reveal({ delay: 0.1 })}>
			<StatStrip {stats} animated />
		</div>
	</div>
</section>

<!-- ============================================================
	 FEATURES
	 ============================================================ -->
<section class="section" aria-labelledby="features-heading">
	<div class="container container--wide">
		<SectionHeader
			animate
			id="features-heading"
			eyebrow="The platform"
			title="Six tools that answer one question: what is actually happening?"
			lede="Everything here exists because reading the raw tape by eye is impossible, and every shortcut most tools take throws away the part that mattered."
		/>

		<div class="section__body" {@attach revealGroup('.feature-grid__item', { scale: true })}>
			<FeatureGrid />
		</div>

		<div class="section__more" data-reveal {@attach reveal()}>
			<Button href={resolve('/features')} variant="secondary">
				Full feature breakdown
				{#snippet iconTrailing()}<ArrowRightIcon />{/snippet}
			</Button>
		</div>
	</div>
</section>

<!-- ============================================================
	 HOW IT WORKS
	 ============================================================ -->
<section class="section how" aria-labelledby="how-heading">
	<div class="container container--wide">
		<SectionHeader
			animate
			id="how-heading"
			eyebrow="How it works"
			title="Three steps between the exchange and your screen"
			lede="No black box. Here is exactly what happens to a print between the moment it crosses the tape and the moment you see it."
		/>

		<ol
			class="how__steps"
			role="list"
			{@attach revealGroup('.how__step', { from: 'up', scale: true })}
		>
			{#each steps as step, index (step.title)}
				{@const Icon = step.icon}
				<li class="how__step">
					<span class="how__number tabular" aria-hidden="true">0{index + 1}</span>
					<span class="how__icon" aria-hidden="true">
						<Icon size={24} weight="duotone" />
					</span>
					<h3 class="how__title">{step.title}</h3>
					<p class="how__body">{step.body}</p>
				</li>
			{/each}
		</ol>
	</div>
</section>

<CtaBand />

<style>
	/* ---------------------------------------------------------------
	 * HERO
	 * --------------------------------------------------------------- */
	.hero {
		position: relative;
		/* Extra top padding clears the sticky header, which overlaps the page. */
		padding-block: calc(var(--header-height) + var(--space-8)) var(--section-y);
		background-color: var(--bg-root);
		/* The glow layer is taller than the hero and moves; without this it would
		   paint over the section below as it parallaxes. */
		overflow: hidden;
	}

	/*
	 * The glow lives on its own element so it can be transformed independently.
	 * Animating a `background` gradient is a paint operation on every frame;
	 * animating a positioned element is a compositor operation. Same visual, an
	 * order of magnitude cheaper.
	 */
	.hero__glow {
		position: absolute;
		inset-block-start: -20%;
		inset-inline: 0;
		/* Taller than its container, so parallax never exposes an edge. */
		height: 140%;
		pointer-events: none;
		z-index: 0;
		background: radial-gradient(
			80% 60% at 50% 10%,
			color-mix(in srgb, var(--brand-500) 16%, transparent),
			transparent 70%
		);
	}

	.hero .container {
		position: relative;
		z-index: 1;
	}

	.hero__grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-10);
	}

	.hero__copy {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-5);
	}

	.hero__title {
		font-size: var(--fs-4xl);
		max-width: 15ch;
	}

	.hero__lede {
		font-size: var(--fs-md);
		color: var(--text-secondary);
		max-width: 52ch;
	}

	.hero__actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: 100%;
	}

	.hero__assurances {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
		margin-block-start: var(--space-2);
	}

	.hero__assurances li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin: 0;
		max-width: none;
	}

	.hero__assurances :global(svg) {
		color: var(--bull);
		flex-shrink: 0;
	}

	.hero__stats {
		margin-block-start: var(--space-12);
	}

	/* From 30em there's room for side-by-side buttons. Below that they stack
	   full-width, which is both easier to tap and the conventional mobile pattern. */
	@media (min-width: 30em) {
		.hero__actions {
			flex-direction: row;
			flex-wrap: wrap;
			width: auto;
		}
	}

	@media (min-width: 64em) {
		.hero__grid {
			flex-direction: row;
			align-items: center;
			gap: var(--space-16);
		}

		.hero__copy {
			flex: 1 1 46%;
		}

		.hero__chart {
			flex: 1 1 54%;
			min-width: 0; /* lets the chart shrink inside flex instead of overflowing */
		}
	}

	/* ---------------------------------------------------------------
	 * SECTIONS
	 * --------------------------------------------------------------- */
	.section__body {
		margin-block-start: var(--space-10);
	}

	.section__more {
		display: flex;
		justify-content: center;
		margin-block-start: var(--space-10);
	}

	/* ---------------------------------------------------------------
	 * HOW IT WORKS
	 * --------------------------------------------------------------- */
	.how {
		background-color: var(--bg-canvas);
		border-block: 1px solid var(--border);
	}

	.how__steps {
		display: grid;
		gap: var(--space-6);
		margin-block-start: var(--space-10);
		padding: 0;
	}

	.how__step {
		position: relative;
		padding: var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background-color: var(--surface);
		margin: 0;
		max-width: none;
	}

	.how__number {
		position: absolute;
		inset-block-start: var(--space-5);
		inset-inline-end: var(--space-5);
		font-family: var(--font-heading);
		font-size: var(--fs-lg);
		font-weight: var(--weight-black);
		color: var(--ink-500);
	}

	.how__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-md);
		background-color: color-mix(in srgb, var(--brand-500) 14%, transparent);
		color: var(--brand-400);
		margin-block-end: var(--space-4);
	}

	.how__title {
		font-size: var(--fs-lg);
		margin-block-end: var(--space-2);
	}

	.how__body {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		max-width: none;
	}

	@media (min-width: 64em) {
		.how__steps {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
