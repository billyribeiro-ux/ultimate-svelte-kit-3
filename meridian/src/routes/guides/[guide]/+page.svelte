<script lang="ts">
	import { ArrowLeftIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/domain/dates.ts';

	let { data } = $props();

	const locale = getLocale();
	/*
	 * The guide is a component — mdsvex compiled the Markdown into one — and
	 * `load` handed it over. Rendering a component held in a variable is
	 * `<Guide />`, the same as any other.
	 */
	const Guide = $derived(data.guide.component);
</script>

<svelte:head>
	<title>{data.guide.title} — {m.guides_title()}</title>
	<meta name="description" content={data.guide.summary} />
</svelte:head>

<article class="container guide">
	<header class="guide__header stack stack--sm">
		<p class="back">
			<a class="btn btn--ghost btn--sm" href={href('/guides')}>
				<ArrowLeftIcon size={14} aria-hidden="true" />
				{m.guides_all()}
			</a>
		</p>
		<h1 class="title-page">{data.guide.title}</h1>
		<p class="lede">{data.guide.summary}</p>
		<!-- The chip sits outside the dotted row: an item with a background would wear its dot inside it. -->
		<div class="cluster meta">
			{#if data.guide.placeName}<span class="chip">{data.guide.placeName}</span>{/if}
			<p class="dotted">
				<span>{m.guides_read_minutes({ minutes: data.guide.minutes })}</span>
				<span>{m.guides_published({ date: formatDate(data.guide.published, locale, 'long') })}</span
				>
			</p>
		</div>
	</header>

	<div class="prose">
		<Guide />
	</div>
</article>

<style>
	/* The reading column is the measure: 68 characters of the body size. */
	.guide {
		max-width: var(--measure);
		padding-block: var(--space-6) var(--section);
	}

	.guide__header {
		margin-block-end: var(--space-6);
		padding-block-end: var(--space-5);
		border-bottom: 1px solid var(--line);
	}

	.back {
		margin-inline-start: calc(-1 * var(--space-3));
	}

	.lede {
		color: var(--ink-2);
		font-size: var(--text-lg);
	}

	.meta {
		font-size: var(--text-sm);
		color: var(--ink-3);
	}
</style>
