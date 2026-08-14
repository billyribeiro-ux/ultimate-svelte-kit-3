<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRightIcon, WarningIcon } from 'phosphor-svelte';

	import Seo from '#lib/seo/Seo.svelte';
	import { breadcrumbSchema, softwareApplicationSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl } from '#lib/data/site.ts';

	import Button from '#lib/components/ui/Button.svelte';
	import SectionHeader from '#lib/components/marketing/SectionHeader.svelte';
	import FeatureGrid from '#lib/components/marketing/FeatureGrid.svelte';
	import CtaBand from '#lib/components/marketing/CtaBand.svelte';
	import { reveal, revealGroup } from '#lib/motion/index.ts';

	const pageUrl = absoluteUrl('/features');

	const limitations = [
		'We infer dealer positioning from public volume and open interest. Nobody can observe it directly, so treat every gamma figure as a well-informed estimate.',
		'The consolidated tape does not report whether a trade opened or closed a position. Our opening-position detection is probabilistic, and we show you the confidence.',
		'Starter plan data is delayed fifteen minutes. That is the standard non-professional market data entitlement, not a limitation we invented.'
	];
</script>

<Seo
	title="Features — the full options tape, classified in real time"
	description="Live flow scanning, unusual activity baselines, dealer gamma exposure, dark pool prints, a real alerts engine and full tick replay. Here is exactly what StrikeFlow does."
	schema={[
		softwareApplicationSchema(),
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Features', path: '/features' }
		])
	]}
/>

<section class="page-hero">
	<div class="container container--wide">
		<SectionHeader
			animate
			level={2}
			eyebrow="Platform"
			title="Everything the tape will tell you, if you can read it fast enough"
			lede="Six tools, each built because a common shortcut in flow analysis throws away the part that carried the information."
		>
			<Button href={resolve('/guide')}>
				Get the free guide
				{#snippet iconTrailing()}<ArrowRightIcon />{/snippet}
			</Button>
			<Button href={resolve('/pricing')} variant="secondary">Compare plans</Button>
		</SectionHeader>
	</div>
</section>

<!--
	This page's <h1> is visually hidden because the section header above carries the
	visual weight. Every page still needs exactly one h1 for the document outline —
	hiding it visually is fine; omitting it is not.
-->
<h1 class="visually-hidden">StrikeFlow features</h1>

<section class="section" aria-label="Feature details">
	<div class="container container--wide">
		<div {@attach revealGroup('.feature-grid__item', { scale: true })}>
			<FeatureGrid detailed level={3} />
		</div>
	</div>
</section>

<!--
	THE HONESTY SECTION.

	Stating your limitations on a marketing page feels counterintuitive, and it is
	one of the strongest trust signals a financial site can send. Google's quality
	rater guidelines explicitly reward accuracy and transparency on YMYL topics, and
	buyers in this market have been burned by tools that overclaim.
-->
<section class="section limits" aria-labelledby="limits-heading">
	<div class="container">
		<div class="limits__panel" data-reveal {@attach reveal()}>
			<span class="limits__icon" aria-hidden="true">
				<WarningIcon size={26} weight="duotone" />
			</span>

			<div>
				<h2 id="limits-heading" class="limits__title">What this data cannot tell you</h2>
				<p class="limits__lede">
					Any tool that claims certainty about institutional intent is guessing and charging you for
					it. Here is where our data stops.
				</p>

				<ul class="limits__list" role="list">
					{#each limitations as limitation (limitation)}
						<li>{limitation}</li>
					{/each}
				</ul>

				<p class="limits__footer">
					StrikeFlow is market data and analytics. We do not issue recommendations, and nothing in
					the product is investment advice. Read the
					<a href={resolve('/legal/risk-disclosure')}>full risk disclosure</a>.
				</p>
			</div>
		</div>
	</div>
</section>

<CtaBand />

<style>
	.page-hero {
		padding-block: calc(var(--header-height) + var(--space-10)) var(--space-4);
		background:
			radial-gradient(
				70% 60% at 20% -10%,
				color-mix(in srgb, var(--brand-500) 14%, transparent),
				transparent 70%
			),
			var(--bg-root);
	}

	.limits {
		background-color: var(--bg-canvas);
		border-block: 1px solid var(--border);
	}

	.limits__panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.limits__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3.25rem;
		height: 3.25rem;
		flex-shrink: 0;
		border-radius: var(--radius-lg);
		background-color: color-mix(in srgb, var(--warn) 14%, transparent);
		color: var(--warn-400);
	}

	.limits__title {
		font-size: var(--fs-xl);
		margin-block-end: var(--space-3);
	}

	.limits__lede {
		color: var(--text-secondary);
	}

	.limits__list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-block-start: var(--space-5);
	}

	.limits__list li {
		position: relative;
		padding-inline-start: var(--space-5);
		font-size: var(--fs-sm);
		color: var(--text-secondary);
		margin: 0;
	}

	.limits__list li::before {
		content: '';
		position: absolute;
		inset-block-start: 0.65em;
		inset-inline-start: 0;
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background-color: var(--warn);
	}

	.limits__footer {
		margin-block-start: var(--space-6);
		padding-block-start: var(--space-5);
		border-top: 1px solid var(--border);
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	@media (min-width: 48em) {
		.limits__panel {
			flex-direction: row;
			gap: var(--space-6);
		}
	}
</style>
