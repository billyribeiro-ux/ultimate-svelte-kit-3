<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
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
		<p><a href={localizeHref('/guides')}>← {m.guides_all()}</a></p>
		<h1>{data.guide.title}</h1>
		<p class="lede">{data.guide.summary}</p>
		<p class="cluster meta">
			{#if data.guide.placeName}<span class="chip">{data.guide.placeName}</span>{/if}
			<span>{m.guides_read_minutes({ minutes: data.guide.minutes })}</span>
			<span>·</span>
			<span>
				{m.guides_published({ date: formatDate(data.guide.published, locale, 'long') })}
			</span>
		</p>
	</header>

	<div class="prose">
		<Guide />
	</div>
</article>

<style>
	.guide {
		max-width: 40rem;
		padding-block: var(--space-6) var(--space-8);
	}

	.guide__header {
		margin-block-end: var(--space-6);
		padding-block-end: var(--space-5);
		border-bottom: 1px solid var(--line);
	}

	.lede {
		color: var(--ink-2);
		font-size: var(--text-md);
	}

	.meta {
		font-size: var(--text-sm);
		color: var(--ink-3);
	}
</style>
