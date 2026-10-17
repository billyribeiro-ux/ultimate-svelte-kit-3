<script lang="ts">
	import { browser } from '$app/env';
	import { Debounced } from 'runed';
	import { ArrowRightIcon, MagnifyingGlassIcon, XIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { guideForPlace } from '#lib/guides/index.ts';
	import { places, type Place } from '#lib/remote/geo.remote.ts';
	import Empty from '#lib/ui/Empty.svelte';

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
	 * and the data on it is not. That split is what `prerender` is for. (On
	 * the server, rendering this page, the same call fetches that file from
	 * the app's public address, and falls back to running the function when
	 * it cannot; `geo.remote.ts` says why the function is `dynamic` for that.)
	 *
	 * `Intl.DisplayNames` turns `PT` into "Portugal", or "Portugal", or
	 * "Portugal" — and `JP` into "Japan", "Japan" and "Japão". The gazetteer
	 * stores a code and the browser's own locale data does the naming, which
	 * is a hundred strings per language that nobody had to translate.
	 */
	const locale = getLocale();
	const regions = new Intl.DisplayNames(locale, { type: 'region' });
	const countryName = (code: string) => regions.of(code) ?? code;

	/*
	 * `38.72° N, 9.14° W` reads as a place; `38.72°, -9.14°` reads as a
	 * spreadsheet. The compass letters are messages, because they are words:
	 * east is O in German (Ost) and L in Portuguese (leste), and west is O
	 * in Portuguese (oeste).
	 */
	const degrees = new Intl.NumberFormat(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
	const coords = (place: Place) =>
		`${degrees.format(Math.abs(place.lat))}° ${place.lat < 0 ? m.coord_south() : m.coord_north()}, ` +
		`${degrees.format(Math.abs(place.lng))}° ${place.lng < 0 ? m.coord_west() : m.coord_east()}`;

	/*
	 * What was typed before the page hydrated is kept. While this script runs
	 * on a server-rendered page, the server's input is still there with
	 * whatever a person typed into it, and hydration would write the empty
	 * string the server knew about over it — the bug `keepTyped()` fixes for
	 * the sign-in form (chapter 32), here for a plain `bind:value`. On a
	 * client-side navigation there is no such input yet, and the filter
	 * starts empty.
	 */
	let query = $state(
		(browser && document.querySelector<HTMLInputElement>('input.search__input')?.value) || ''
	);
	let search = $state<HTMLInputElement>();

	/*
	 * Both "clear" buttons remove themselves — the one in the field shows
	 * only while there is a query, the one in the empty state only while
	 * nothing matches — and a button that disappears under the keyboard's
	 * focus drops it to the top of the document. So clearing puts focus
	 * back in the field, where the next thing typed belongs. That is an
	 * imperative step in a click handler, so the field is held with
	 * `bind:this` for it.
	 */
	function clear() {
		query = '';
		search?.focus();
	}
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

	/*
	 * When the search row is stuck under the header it draws a hairline, so
	 * the cards sliding under it have an edge to slide under. A zero-height
	 * sentinel sits just above the row; once it has scrolled up behind the
	 * header, the row is stuck.
	 */
	let stuck = $state(false);

	function sentinel(element: HTMLElement) {
		const header = document.querySelector<HTMLElement>('.header');
		const top = header?.getBoundingClientRect().height ?? 56;
		const observer = new IntersectionObserver(
			([entry]) => {
				stuck = !!entry && !entry.isIntersecting && entry.boundingClientRect.top < top + 1;
			},
			{ rootMargin: `-${Math.ceil(top) + 1}px 0px 0px 0px` }
		);
		observer.observe(element);
		return () => observer.disconnect();
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

<section class="container explore">
	<header class="explore__header stack stack--sm">
		<h1 class="title-page">{m.explore_title()}</h1>
		<p class="lede">{m.explore_lede()}</p>
	</header>

	<!--
		The search row sticks under the header on every width, so the filter
		is never a scroll away from the list it filters. It steps out of the
		gutter and back in so the paper behind it covers the full width.
	-->
	<div class="toolbar__sentinel" aria-hidden="true" {@attach sentinel}></div>
	<div class={['toolbar', { 'toolbar--stuck': stuck }]}>
		<div class="search">
			<label class="search__label">
				<MagnifyingGlassIcon size={18} aria-hidden="true" class="search__icon" />
				<span class="visually-hidden">{m.explore_search()}</span>
				<input
					class="input search__input"
					type="search"
					bind:value={query}
					bind:this={search}
					placeholder={m.explore_search()}
				/>
			</label>
			<!-- Our own clear button: the browser's is a blue ×, the one native glyph left on the page. -->
			{#if query}
				<button
					class="btn btn--icon btn--ghost btn--sm search__clear"
					type="button"
					aria-label={m.explore_clear()}
					title={m.explore_clear()}
					onclick={clear}
				>
					<XIcon size={16} aria-hidden="true" />
				</button>
			{/if}
		</div>
		<!-- On a phone the count is the places alone, so it fits beside the search and the row is one row. -->
		<p class="count tabular" role="status">
			<span>{m.explore_places({ count: filtered.length })}</span>
			<span class="count__countries">· {m.explore_countries({ count: countries.length })}</span>
		</p>
	</div>

	{#if countries.length === 0}
		<div class="explore__empty">
			<Empty icon={MagnifyingGlassIcon} title={m.explore_none_title()} body={m.explore_none()}>
				{#snippet action()}
					<button class="btn btn--ghost" type="button" onclick={clear}>
						{m.explore_clear()}
					</button>
				{/snippet}
			</Empty>
		</div>
	{/if}

	<!--
		The countries are a grid in reading order — one column on a phone, two
		from 48em, three from 64em — so the alphabet runs across and then down,
		each country unbroken, its places one under another. They were CSS
		columns once: the alphabet ran down a 4,000px page and started again at
		the top of the next column, and "Hong Kong" sat beside "Argentina".

		A place is a card, not a link — its two buttons are the links — so it
		does not lift on hover: a lift says "this is a link".
	-->
	<div class="countries">
		{#each countries as country (country.code)}
			<section class="country">
				<h2 class="country__name">
					{country.name}
					<span class="country__count tabular">{country.places.length}</span>
				</h2>
				<ul class="places" role="list">
					{#each country.places as place (place.id)}
						{const guide = $derived(guideForPlace(place.id))}
						<li class="card place">
							<div class="place__body">
								<strong class="place__name">{place.name}</strong>
								<span class="place__coords tabular">{coords(place)}</span>
							</div>
							<div class="place__actions">
								{#if guide}
									<a
										class="btn btn--sm btn--ghost"
										href={href('/guides/[guide]', { guide: guide.slug })}
									>
										{m.explore_guide()}
									</a>
								{/if}
								<a class="btn btn--sm" href={href(`/(site)/(app)/trips/new?place=${place.id}`)}>
									{m.explore_start()}
									<ArrowRightIcon size={14} aria-hidden="true" />
								</a>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</section>

<style>
	.explore {
		padding-block: var(--space-6) var(--section);
	}

	.explore__header {
		padding-block-end: var(--space-4);
	}

	.lede {
		color: var(--ink-2);
		font-size: var(--text-lg);
		max-inline-size: var(--measure);
	}

	.toolbar {
		position: sticky;
		top: var(--header-h);
		z-index: var(--z-sticky);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-inline: calc(-1 * var(--gutter));
		padding: var(--space-3) var(--gutter);
		background: var(--paper);
		border-bottom: 1px solid transparent;
	}

	/* No transition: a border that fades in is a border nobody saw arrive. */
	.toolbar--stuck {
		border-bottom-color: var(--line);
	}

	.search {
		position: relative;
		flex: 1 1 12rem;
		max-width: 26rem;
	}

	.search__label {
		display: block;
	}

	.search__clear {
		position: absolute;
		top: 50%;
		right: var(--space-1);
		translate: 0 -50%;
		border-radius: 50%;
	}

	.search__input::-webkit-search-cancel-button {
		appearance: none;
	}

	.search :global(.search__icon) {
		position: absolute;
		left: 0.9rem;
		top: 50%;
		translate: 0 -50%;
		color: var(--ink-3);
		pointer-events: none;
	}

	/* A pill with the magnifier inside: the one input on the page that is a search. */
	.search__input {
		padding-inline: 2.6rem;
		border-radius: var(--radius-pill);
	}

	.count {
		flex: 0 0 auto;
		margin-inline-start: auto;
		color: var(--ink-3);
		font-size: var(--text-sm);
	}

	.count__countries {
		display: none;
	}

	.explore__empty {
		padding-block: var(--space-7);
	}

	/*
	 * Rhythm comes from the section. Each country keeps its own space below
	 * it, not above, so the countries at the top of a row line up; each sits
	 * at the top of its cell, so a country with one place beside a country
	 * with two leaves its space below, not in the middle.
	 */
	.countries {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
		column-gap: var(--space-5);
		padding-block-start: var(--space-6);
	}

	.country {
		padding-block-end: var(--space-6);
	}

	.country__name {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin-block-end: var(--space-3);
	}

	.country__count {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 400;
		letter-spacing: 0;
		color: var(--ink-3);
	}

	.places {
		display: grid;
		gap: var(--space-2);
	}

	/*
	 * `align-content: start`: the grid stretches every card in a row to the
	 * tallest, and a wrapping flex row would centre its one line in the
	 * extra height — a card without a guide link would sit its name lower
	 * than the cards beside it. The name lines up across the row instead.
	 */
	.place {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		align-content: start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}

	.place__body {
		display: grid;
		gap: var(--space-0);
		min-width: 0;
	}

	.place__name {
		font-weight: 600;
	}

	.place__coords {
		font-size: var(--text-xs);
		color: var(--ink-3);
	}

	.place__actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin-inline-start: auto;
	}

	@media (min-width: 48em) {
		.toolbar {
			margin-inline: 0;
			padding-inline: 0;
		}

		.count__countries {
			display: inline;
		}

		.countries {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (min-width: 64em) {
		.countries {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
