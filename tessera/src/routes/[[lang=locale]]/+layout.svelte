<script lang="ts">
	import type { Snippet } from 'svelte';
	import { messages, ENDONYM, LOCALES } from '#lib/i18n/index.ts';
	import Logo from '#lib/components/Logo.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	const t = $derived(messages(data.locale));

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
	<a class="chrome__home" href={data.locale === 'en' ? '/' : `/${data.locale}`}>
		<Logo size={22} wordmark />
	</a>

	<nav class="chrome__nav" aria-label="Main">
		{#if data.user}
			<a href={data.locale === 'en' ? '/boards' : `/${data.locale}/boards`}>{t.nav.boards}</a>
		{:else}
			<a href={data.locale === 'en' ? '/sign-in' : `/${data.locale}/sign-in`}>{t.nav.signIn}</a>
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
