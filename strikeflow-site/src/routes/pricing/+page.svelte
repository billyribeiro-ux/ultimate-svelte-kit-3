<script lang="ts">
	import Seo from '#lib/seo/Seo.svelte';
	import { breadcrumbSchema, faqSchema, softwareApplicationSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl } from '#lib/data/site.ts';
	import { faqs } from '#lib/data/faq.ts';

	import SectionHeader from '#lib/components/marketing/SectionHeader.svelte';
	import PricingTable from '#lib/components/marketing/PricingTable.svelte';
	import FaqAccordion from '#lib/components/marketing/FaqAccordion.svelte';
	import CtaBand from '#lib/components/marketing/CtaBand.svelte';
	import { revealGroup } from '#lib/motion/index.ts';

	const pageUrl = absoluteUrl('/pricing');
</script>

<Seo
	title="Pricing — plans from $49/month"
	description="Three plans for options flow data: Starter on a delayed feed, Pro with the full real-time tape, and Desk with API access and tick replay. Seven-day free trial on all of them."
	schema={[
		softwareApplicationSchema(),
		faqSchema(faqs),
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Pricing', path: '/pricing' }
		])
	]}
/>

<section class="page-hero">
	<div class="container container--wide">
		<div class="text-center">
			<h1 class="page-hero__title">Straightforward pricing for serious data</h1>
			<p class="lede">
				Every plan is per user, per month, and cancellable in one click. The only thing that changes
				between them is how much of the tape you get and how fast.
			</p>
		</div>
	</div>
</section>

<section class="section section--tight" aria-label="Plans">
	<div class="container container--wide">
		<div {@attach revealGroup('.pricing__item', { scale: true, staggerAmount: 0.09 })}>
			<PricingTable />
		</div>
	</div>
</section>

<section class="section faq-section" aria-labelledby="faq-heading">
	<div class="container">
		<SectionHeader
			animate
			id="faq-heading"
			align="center"
			eyebrow="Questions"
			title="The things people ask before signing up"
		/>

		<div class="faq-section__body" {@attach revealGroup('.faq__item', { staggerAmount: 0.05 })}>
			<FaqAccordion items={faqs} />
		</div>
	</div>
</section>

<CtaBand
	title="Not sure which plan yet?"
	body="Start with the free guide. It covers the concepts the product assumes you already know — and it will tell you fairly quickly whether real-time flow data is something you'd actually use."
/>

<style>
	.page-hero {
		padding-block: calc(var(--header-height) + var(--space-10)) var(--space-4);
		background:
			radial-gradient(
				70% 60% at 50% -10%,
				color-mix(in srgb, var(--brand-500) 14%, transparent),
				transparent 70%
			),
			var(--bg-root);
	}

	.page-hero__title {
		margin-inline: auto;
		max-width: 18ch;
	}

	.page-hero .lede {
		margin-block-start: var(--space-5);
	}

	.faq-section {
		background-color: var(--bg-canvas);
		border-block: 1px solid var(--border);
	}

	.faq-section__body {
		margin-block-start: var(--space-8);
	}
</style>
