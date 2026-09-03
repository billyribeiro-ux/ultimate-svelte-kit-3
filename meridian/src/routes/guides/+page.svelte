<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
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
		<h1>{m.guides_title()}</h1>
		<p class="lede">{m.guides_lede()}</p>
	</header>

	<ul class="list" role="list">
		{#each guides as guide (guide.slug)}
			<li class="card card--pad stack stack--sm">
				<!--
					`resolve` from `$app/paths` takes a route id and its parameters and
					gives back a pathname — type-checked against the routes that exist,
					so renaming the folder is a compile error here rather than a 404.
				-->
				<h2 class="title">
					<a href={localizeHref(resolve('/guides/[guide]', { guide: guide.slug }))}>
						{guide.title}
					</a>
				</h2>
				<p class="muted">{guide.summary}</p>
				<p class="cluster meta">
					{#if guide.placeName}<span class="chip">{guide.placeName}</span>{/if}
					<span>{m.guides_read_minutes({ minutes: guide.minutes })}</span>
					<span>·</span>
					<time datetime={guide.published}>{formatDate(guide.published, locale, 'long')}</time>
				</p>
			</li>
		{/each}
	</ul>

	<p class="hint">{m.guides_static_note()}</p>
</section>

<style>
	.guides {
		max-width: 44rem;
		padding-block: var(--space-6) var(--space-8);
	}

	.lede {
		color: var(--ink-2);
		max-width: var(--measure);
	}

	.list {
		display: grid;
		gap: var(--space-3);
	}

	.title {
		font-size: var(--text-lg);
	}

	.title a {
		text-decoration: none;
	}

	.title a:hover {
		text-decoration: underline;
	}

	.meta {
		font-size: var(--text-sm);
		color: var(--ink-3);
	}
</style>
