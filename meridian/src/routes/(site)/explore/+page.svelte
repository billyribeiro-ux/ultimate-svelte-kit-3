<script lang="ts">
	import { Debounced } from 'runed';
	import { MagnifyingGlassIcon } from 'phosphor-svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
	import { guideForPlace } from '#lib/guides/index.ts';
	import { places, type Place } from '#lib/remote/geo.remote.ts';

	/*
	 * EXPLORE
	 * =======
	 *
	 * The hundred places in the gazetteer, grouped by country, with a filter.
	 * Two things to notice.
	 *
	 * `places()` is a `prerender` remote function: its answer was written to a
	 * static file at build time, so the first call is a GET of a file a CDN
	 * can cache, and the browser keeps it in the Cache API across reloads.
	 * The page itself is dynamic — it has a header that knows who you are —
	 * and the data on it is not. That split is what `prerender` is for.
	 *
	 * `Intl.DisplayNames` turns `PT` into "Portugal", or "Portugal", or
	 * "Portugal" — and `JP` into "Japan", "Japan" and "Japão". The gazetteer
	 * stores a code and the browser's own locale data does the naming, which
	 * is a hundred strings per language that nobody had to translate.
	 */
	const locale = getLocale();
	const regions = new Intl.DisplayNames(locale, { type: 'region' });
	const countryName = (code: string) => regions.of(code) ?? code;

	let query = $state('');
	/*
	 * runed's `Debounced` follows a reactive value with a delay: `current`
	 * changes 150 ms after the last keystroke, so the list is not rebuilt
	 * on every one. It is a getter, so `query` stays a plain `$state`.
	 */
	const settled = new Debounced(() => query, 150);

	const all = await places();

	const filtered = $derived.by(() => {
		const needle = settled.current.trim().toLocaleLowerCase(locale);
		if (!needle) return all;
		return all.filter(
			(place) =>
				place.name.toLocaleLowerCase(locale).includes(needle) ||
				countryName(place.country).toLocaleLowerCase(locale).includes(needle)
		);
	});

	interface Country {
		readonly code: string;
		readonly name: string;
		readonly places: Place[];
	}

	const countries: Country[] = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built whole inside the derivation, never mutated after
		const groups = new Map<string, Place[]>();
		for (const place of filtered) {
			const list = groups.get(place.country);
			if (list) list.push(place);
			else groups.set(place.country, [place]);
		}
		return [...groups]
			.map(([code, places]) => ({ code, name: countryName(code), places }))
			.sort((a, b) => a.name.localeCompare(b.name, locale));
	});
</script>

<svelte:head>
	<title>{m.explore_title()} — {m.app_name()}</title>
	<meta name="description" content={m.explore_lede()} />
</svelte:head>

<section class="container explore stack stack--lg">
	<header class="stack stack--sm">
		<h1>{m.explore_title()}</h1>
		<p class="lede">{m.explore_lede()}</p>
	</header>

	<div class="cluster cluster--between">
		<label class="search">
			<MagnifyingGlassIcon size={18} aria-hidden="true" />
			<span class="visually-hidden">{m.explore_search()}</span>
			<input class="input" type="search" bind:value={query} placeholder={m.explore_search()} />
		</label>
		<p class="muted" role="status">
			{m.explore_places({ count: filtered.length })} · {m.explore_countries({
				count: countries.length
			})}
		</p>
	</div>

	{#if countries.length === 0}
		<p class="card card--pad muted">{m.explore_none()}</p>
	{/if}

	{#each countries as country (country.code)}
		<section class="stack stack--sm">
			<h2 class="country">
				{country.name}
				<span class="muted tabular">{country.places.length}</span>
			</h2>
			<ul class="places" role="list">
				{#each country.places as place (place.id)}
					{@const guide = guideForPlace(place.id)}
					<li class="card place">
						<div class="stack stack--sm">
							<strong>{place.name}</strong>
							<span class="muted tabular coords">
								{place.lat.toFixed(2)}°, {place.lng.toFixed(2)}°
							</span>
						</div>
						<div class="cluster">
							{#if guide}
								<a
									class="btn btn--sm btn--ghost"
									href={localizeHref(resolve('/guides/[guide]', { guide: guide.slug }))}
								>
									{m.explore_guide()}
								</a>
							{/if}
							<a
								class="btn btn--sm"
								href={localizeHref(`${resolve('/(site)/(app)/trips/new')}?place=${place.id}`)}
							>
								{m.explore_start()}
							</a>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</section>

<style>
	.explore {
		padding-block: var(--space-6) var(--space-8);
	}

	.lede {
		color: var(--ink-2);
		max-width: var(--measure);
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1 1 18rem;
		max-width: 24rem;
	}

	.search .input {
		flex: 1;
	}

	.country {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-size: var(--text-lg);
	}

	.places {
		display: grid;
		gap: var(--space-2);
	}

	.place {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}

	.coords {
		font-size: var(--text-xs);
	}

	@media (min-width: 48em) {
		.places {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
