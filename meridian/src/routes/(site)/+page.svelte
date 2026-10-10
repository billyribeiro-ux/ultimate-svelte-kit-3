<script lang="ts">
	import {
		ArrowRightIcon,
		GlobeHemisphereWestIcon,
		MapPinIcon,
		ReceiptIcon,
		UsersThreeIcon
	} from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { hero, inview } from '#lib/motion/hero.ts';
</script>

<svelte:head>
	<title>{m.app_name()} — {m.app_tagline()}</title>
	<meta name="description" content={m.home_hero_lede()} />
</svelte:head>

<!--
	The hero is the one cinematic moment the product allows itself: the title
	in the display face at its largest cut, a glow of the sea colour behind
	the image, and the image itself bleeding to the screen's edge on a phone
	and sitting in a soft frame on a desktop. `{@attach hero()}` plays the
	one GSAP timeline, once, on mount; the copy and the image are marked with
	data attributes so the attachment finds them without knowing the markup.
-->
<section class="hero" {@attach hero()}>
	<div class="container hero__grid">
		<div class="hero__copy stack" data-hero-copy>
			<p class="overline">{m.app_tagline()}</p>
			<h1 class="hero__title">{m.home_hero_title()}</h1>
			<p class="hero__lede">{m.home_hero_lede()}</p>
			<div class="hero__actions">
				<a class="btn btn--primary hero__btn" href={href('/(site)/(app)/trips/new')}>
					{m.home_cta()}
				</a>
				<a
					class="btn btn--ghost hero__btn"
					href={href('/(site)/t/[slug=slug]', { slug: 'seedjapan2' })}
				>
					{m.home_cta_secondary()}
					<ArrowRightIcon size={16} aria-hidden="true" />
				</a>
			</div>
		</div>

		<!--
			`<enhanced:img>` is rewritten at build time into a `<picture>` with AVIF
			and WebP sources at several widths, plus width/height so nothing shifts
			while it loads. The source is a PNG drawn by `scripts/make-hero.ts`.
			`sizes` tells the browser how wide the image is on screen, so it picks
			the smallest file that is still sharp for that width.
		-->
		<div class="hero__figure" data-hero-image>
			<enhanced:img
				class="hero__img"
				src="../../lib/assets/hero.png"
				alt=""
				sizes="(min-width: 64em) 40rem, 100vw"
				fetchpriority="high"
			/>
		</div>
	</div>
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

<!-- The cards rise in 70ms apart the first time they scroll into view; CSS does the motion, `inview` says when. -->
<section class="container features grid" {@attach inview()}>
	{#each features as feature, i (feature.title)}
		{@const Icon = feature.icon}
		<article class="card card--pad feature stack stack--sm" style:--i={i}>
			<span class="feature__icon" aria-hidden="true">
				<Icon size={28} weight="duotone" />
			</span>
			<h2 class="feature__title">{feature.title}</h2>
			<p class="feature__text">{feature.text}</p>
		</article>
	{/each}
</section>

<style>
	/*
	 * The glow: a radial of the soft sea colour behind the image, in both
	 * themes. It is the single decorative gradient in the product, and it is
	 * on the section rather than the image so the image can bleed over it.
	 */
	.hero {
		position: relative;
		padding-block: var(--space-7) var(--space-6);
		background: radial-gradient(
			60% 50% at 70% 40%,
			color-mix(in oklab, var(--sea-soft) 60%, transparent),
			transparent 70%
		);
		overflow: clip;
	}

	.hero__grid {
		display: grid;
		gap: var(--space-6);
		align-items: center;
	}

	/* The largest cut Fraunces draws, a hair lighter than the headings, and tight. */
	.hero__title {
		font-size: var(--text-4xl);
		font-weight: 450;
		font-variation-settings: 'opsz' 144;
		line-height: var(--leading-display);
		letter-spacing: var(--tracking-4xl);
		max-inline-size: 12ch;
	}

	.hero__lede {
		font-size: var(--text-lg);
		line-height: var(--leading-body);
		color: var(--ink-2);
		max-inline-size: 38ch;
	}

	.hero__actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-block-start: var(--space-2);
	}

	/* The two calls to action are the tallest buttons in the product: 48px, full width on a phone. */
	.hero__btn {
		min-height: 3rem;
		font-size: var(--text-md);
	}

	/*
	 * Phone: the image is the full width of the screen — it steps out of the
	 * gutter — with no frame, and a mask that fades both its edges into the
	 * paper, so it has no hard line where it starts and no line where it
	 * ends. The mask changes nothing about layout, so the space the
	 * `<picture>`'s width and height reserve is still exact.
	 */
	.hero__figure {
		position: relative;
		margin-inline: calc(-1 * var(--gutter));
		mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 70%, transparent);
	}

	.hero :global(.hero__img) {
		width: 100%;
		height: auto;
		aspect-ratio: 16 / 10;
		object-fit: cover;
	}

	/*
	 * THE PRINT AT NIGHT
	 * ------------------
	 * The picture is drawn on cream. On a dark page it was the brightest
	 * thing on the screen, a flat grey slab; a veil over it only made the
	 * slab darker grey. So in the dark theme the print is developed as a
	 * negative: inverted, which turns the cream into near-black and the ink
	 * into light, then turned half way round the colour wheel, which puts
	 * the teal route back to teal — a dark paper map with a light-teal
	 * route, a shade under the page's own paper. Two rules, because the
	 * theme is either chosen (`data-theme`) or followed from the system.
	 */
	:global(:root[data-theme='dark']) .hero :global(.hero__img) {
		filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.92);
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .hero :global(.hero__img) {
			filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.92);
		}
	}

	.features {
		padding-block: var(--space-6) var(--section);
		--grid-min: 15rem;
	}

	.feature__icon {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius);
		background: var(--sea-soft);
		color: var(--sea);
	}

	.feature__title {
		font-size: var(--text-lg);
		letter-spacing: 0;
	}

	.feature__text {
		color: var(--ink-2);
		font-size: var(--text-sm);
	}

	/*
	 * Rule 1 of the hero: nothing is hidden until JavaScript runs. The
	 * attachment sets `data-animate` only in the browser, and only when
	 * motion is wanted; without it, this rule never matches and every card
	 * is simply there. `:global` because the attributes are written by the
	 * attachment, not the template, and the compiler would otherwise drop
	 * a selector it cannot see matching.
	 */
	@media (prefers-reduced-motion: no-preference) {
		:global(.features[data-animate]:not([data-inview]) .feature) {
			opacity: 0;
		}
		:global(.features[data-inview] .feature) {
			animation: rise var(--dur-5) var(--ease-out) both;
			animation-delay: calc(var(--i) * 70ms);
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			translate: 0 12px;
		}
	}

	@media (min-width: 40em) {
		.hero__actions {
			flex-direction: row;
		}
	}

	@media (min-width: 64em) {
		.hero {
			padding-block: var(--section);
		}

		.hero__grid {
			grid-template-columns: 1fr 1.1fr;
			gap: var(--space-8);
		}

		/*
		 * Desktop: the image sits in a soft frame — a large shadow and the
		 * hairline ring, no border — raised 4% so it is not quite level with
		 * the copy, and its bottom-right corner sinks into the page through
		 * the gradient on `::after`. Static: a composition, not a parallax.
		 */
		.hero__figure {
			position: relative;
			margin-inline: 0;
			translate: 0 -4%;
			mask-image: none;
			border-radius: var(--radius-xl);
			box-shadow: var(--shadow-3), var(--ring-hairline);
			overflow: hidden;
		}

		.hero__figure::after {
			content: '';
			position: absolute;
			inset: 0;
			border-radius: inherit;
			background: linear-gradient(
				160deg,
				transparent 55%,
				color-mix(in oklab, var(--paper) 40%, transparent)
			);
			pointer-events: none;
		}

		.hero :global(.hero__img) {
			border-radius: var(--radius-xl);
		}
	}
</style>
