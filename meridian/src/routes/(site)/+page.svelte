<script lang="ts">
	import {
		GlobeHemisphereWestIcon,
		MapPinIcon,
		ReceiptIcon,
		UsersThreeIcon
	} from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import { reveal } from '#lib/motion/reveal.ts';
</script>

<svelte:head>
	<title>{m.app_name()} — {m.app_tagline()}</title>
	<meta name="description" content={m.home_hero_lede()} />
</svelte:head>

<section class="hero container">
	<div class="hero__copy stack" {@attach reveal()}>
		<p class="eyebrow">{m.app_tagline()}</p>
		<h1 class="hero__title">{m.home_hero_title()}</h1>
		<p class="hero__lede">{m.home_hero_lede()}</p>
		<div class="cluster">
			<a class="btn btn--primary" href={localizeHref('/trips/new')}>{m.home_cta()}</a>
			<a class="btn" href={localizeHref('/t/seedjapan2')}>{m.home_cta_secondary()}</a>
		</div>
	</div>

	<!--
		`<enhanced:img>` is rewritten at build time into a `<picture>` with AVIF
		and WebP sources at several widths, plus width/height so nothing shifts
		while it loads. The source is a PNG drawn by `scripts/make-hero.ts`.
		`sizes` tells the browser how wide the image is on screen, so it picks
		the smallest file that is still sharp for that width.
	-->
	<enhanced:img
		class="hero__img"
		src="../../lib/assets/hero.png"
		alt=""
		sizes="(min-width: 64em) 40rem, 100vw"
		fetchpriority="high"
	/>
</section>

<!--
	`{const}` in markup: the list of features exists only for this loop, so it
	is declared where the loop is, in the markup, rather than a screen away in
	the script. It re-runs when the messages' locale changes.
-->
{const features = [
	{ icon: MapPinIcon, title: m.home_feature_map_title(), text: m.home_feature_map_text() },
	{
		icon: GlobeHemisphereWestIcon,
		title: m.home_feature_globe_title(),
		text: m.home_feature_globe_text()
	},
	{ icon: ReceiptIcon, title: m.home_feature_split_title(), text: m.home_feature_split_text() },
	{ icon: UsersThreeIcon, title: m.home_feature_live_title(), text: m.home_feature_live_text() }
]}

<section class="container features grid" {@attach reveal({ stagger: 0.1 })}>
	{#each features as feature (feature.title)}
		{@const Icon = feature.icon}
		<article class="card card--pad stack stack--sm">
			<Icon size={28} weight="duotone" class="feature__icon" aria-hidden="true" />
			<h2>{feature.title}</h2>
			<p class="muted">{feature.text}</p>
		</article>
	{/each}
</section>

<style>
	.hero {
		display: grid;
		gap: var(--space-6);
		padding-block: var(--space-7) var(--space-6);
		align-items: center;
	}

	.hero__title {
		font-size: var(--text-3xl);
		max-width: 14ch;
	}

	.hero__lede {
		font-size: var(--text-lg);
		color: var(--ink-2);
		max-width: 46ch;
	}

	.eyebrow {
		color: var(--sea);
		font-weight: 600;
		font-size: var(--text-sm);
		letter-spacing: 0.02em;
	}

	.hero :global(.hero__img) {
		width: 100%;
		height: auto;
		border-radius: var(--radius-lg);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-3);
	}

	.features {
		padding-block: var(--space-6) var(--space-8);
		--grid-min: 16rem;
	}

	.features :global(.feature__icon) {
		color: var(--sea);
	}

	@media (min-width: 64em) {
		.hero {
			grid-template-columns: 1.1fr 1fr;
			padding-block: var(--space-8);
		}
	}
</style>
