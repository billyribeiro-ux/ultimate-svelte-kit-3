<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/domain/dates.ts';
	import { guides } from '#lib/guides/index.ts';

	const locale = getLocale();
</script>

<svelte:head>
	<title>{m.guides_title()} — {m.app_name()}</title>
	<meta name="description" content={m.guides_lede()} />
</svelte:head>

<section class="container guides stack stack--lg">
	<header class="stack stack--sm">
		<h1 class="title-page">{m.guides_title()}</h1>
		<p class="lede">{m.guides_lede()}</p>
	</header>

	<ul class="list" role="list">
		{#each guides as guide (guide.slug)}
			<li class="card card--pad card--link stack stack--sm">
				<!--
					`resolve` from `$app/paths` takes a route id and its parameters and
					gives back a pathname — type-checked against the routes that exist,
					so renaming the folder is a compile error here rather than a 404.
				-->
				{#if guide.placeName}<p><span class="chip">{guide.placeName}</span></p>{/if}
				<h2 class="title">
					<a href={href('/guides/[guide]', { guide: guide.slug })}>
						{guide.title}
					</a>
				</h2>
				<p class="summary">{guide.summary}</p>
				<p class="meta dotted">
					<span>{m.guides_read_minutes({ minutes: guide.minutes })}</span>
					<time datetime={guide.published}>{formatDate(guide.published, locale, 'long')}</time>
				</p>
			</li>
		{/each}
	</ul>

	<p class="hint">{m.guides_static_note()}</p>
</section>

<style>
	.guides {
		max-width: var(--measure);
		padding-block: var(--space-6) var(--section);
	}

	.lede {
		color: var(--ink-2);
		font-size: var(--text-lg);
		max-inline-size: var(--measure);
	}

	.list {
		display: grid;
		gap: var(--space-3);
	}

	/* The title is the link, and the whole card lifts for it; `::after` makes the card the target. */
	.list > li {
		position: relative;
	}

	.title {
		font-size: var(--text-xl);
	}

	.title a {
		text-decoration: none;
	}

	.title a::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	.summary {
		color: var(--ink-2);
	}

	.meta {
		font-size: var(--text-xs);
		color: var(--ink-3);
	}
</style>
