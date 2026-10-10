<script lang="ts">
	import type { Snippet } from 'svelte';
	import { messages, ENDONYM, LOCALES } from '#lib/i18n/index.ts';
	import Logo from '#lib/components/Logo.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	const t = $derived(messages(data.locale));

	/**
	 * The language segment of every link in the chrome, or nothing.
	 *
	 * English is the unprefixed default — `/boards`, not `/en/boards` — and the
	 * route is `[[lang=locale]]`, an *optional* segment. `resolve()` drops an
	 * optional segment whose parameter is `undefined`, so one expression yields
	 * `/boards` for English and `/fr/boards` for French, and the "is this
	 * English?" question is asked here once rather than at every link.
	 *
	 * Why `resolve()` at all, rather than the string the browser will get? The
	 * route id is checked against the generated `RouteId` union, so renaming a
	 * route breaks these links in `svelte-check` instead of in production as a
	 * 404 — and SvelteKit 3's `$app/paths` exports only `asset` and `resolve`,
	 * which is the framework saying this is how links are meant to be built.
	 * `eslint-plugin-svelte` agrees: `no-navigation-without-resolve` flags a
	 * hand-assembled internal `href` now that the plugin recognises SvelteKit 3.
	 */
	const lang = $derived(data.locale === 'en' ? undefined : data.locale);

	/**
	 * The same page in another language.
	 *
	 * Built by replacing the language segment rather than by linking to the site
	 * root, so switching language on a board keeps you on that board. A switcher
	 * that sends people home is the reason people stop using switchers.
	 */
	function urlFor(locale: string): string {
		const rest = page.params.lang
			? page.url.pathname.slice(page.params.lang.length + 1)
			: page.url.pathname;
		return locale === 'en' ? rest || '/' : `/${locale}${rest}`;
	}
</script>

<a class="skip-link" href="#main">{t.a11y.skip}</a>

<header class="chrome">
	<a class="chrome__home" href={resolve('/[[lang=locale]]', { lang })}>
		<Logo size={22} wordmark />
	</a>

	<nav class="chrome__nav" aria-label="Main">
		{#if data.user}
			<a href={resolve('/[[lang=locale]]/boards', { lang })}>{t.nav.boards}</a>
		{:else}
			<a href={resolve('/[[lang=locale]]/sign-in', { lang })}>{t.nav.signIn}</a>
		{/if}
	</nav>

	<div class="chrome__tools">
		<label class="chrome__language">
			<span class="visually-hidden">{t.nav.language}</span>
			<select
				value={data.locale}
				onchange={(event) => {
					// A full navigation, not `goto`. The language decides which messages
					// the server renders, so the page has to come from the server.
					location.assign(urlFor(event.currentTarget.value));
				}}
			>
				{#each LOCALES as locale (locale)}
					<option value={locale}>{ENDONYM[locale]}</option>
				{/each}
			</select>
		</label>

		<ThemeToggle />
	</div>
</header>

<main id="main">
	{@render children()}
</main>

<style>
	.chrome {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
	}

	.chrome__home {
		text-decoration: none;
		color: inherit;
	}

	.chrome__nav {
		margin-left: auto;
		display: flex;
		gap: var(--space-4);
		font-size: var(--fs-sm);
	}

	.chrome__nav a {
		color: var(--text-muted);
		text-decoration: none;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}

	.chrome__nav a:hover {
		color: var(--text);
	}

	.chrome__tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.chrome__language select {
		min-height: 36px;
		padding: 0 var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		font-size: var(--fs-sm);
	}
</style>
