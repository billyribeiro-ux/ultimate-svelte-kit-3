<script lang="ts">
	import TranslateIcon from 'phosphor-svelte/lib/Translate';
	import {
		messages,
		langParam,
		ENDONYM,
		HTML_LANG,
		LOCALES,
		type Locale
	} from '#lib/i18n/index.ts';
	import Logo from '#lib/components/Logo.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	let { data, children }: LayoutProps = $props();

	const t = $derived(messages(data.locale));

	/**
	 * The language segment of every link in the chrome, or nothing.
	 *
	 * English is the unprefixed default — `/boards`, not `/en/boards` — and the
	 * route is `[[lang=locale]]`, an *optional* segment. `resolve()` drops an
	 * optional segment whose parameter is `undefined`, which is what `langParam`
	 * returns for English, so one expression yields `/boards` for English and
	 * `/fr/boards` for French.
	 *
	 * Why `resolve()` at all, rather than the string the browser will get? The
	 * route id is checked against the generated `RouteId` union, so renaming a
	 * route breaks these links in `svelte-check` instead of in production as a
	 * 404, and the parameters are checked against the route's own. It also puts
	 * the base path in front, if the app is ever served from one.
	 * `eslint-plugin-svelte` holds the line: `no-navigation-without-resolve`
	 * flags an internal `href` that is not a `resolve()` call, or a value typed
	 * as what one returns.
	 */
	const lang = $derived(langParam(data.locale));

	/**
	 * This page, in another language.
	 *
	 * The same URL with its language segment swapped, query string and hash
	 * included, rather than a link to the site root: a switcher that sends people
	 * home is the reason people stop using switchers.
	 *
	 * The one link here not built from a route id, because it is the one that has
	 * to work on whichever page it is rendered on. It edits the URL it is given,
	 * and `resolve()` takes the result as a pathname — written without its leading
	 * slash, which is how `resolve()` tells a pathname from a route id — so the
	 * value is a `ResolvedPathname` like every other link in the chrome.
	 */
	function inLanguage(locale: Locale) {
		const { pathname, search, hash } = page.url;
		const rest = page.params.lang ? pathname.slice(page.params.lang.length + 1) : pathname;
		const path = [langParam(locale), rest.replace(/^\//, '')].filter(Boolean).join('/');
		return resolve(`${path}${search}${hash}`);
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
		<!--
			Links, not a `<select>` that navigates when it changes.

			In Chromium on Windows and Linux, arrowing through a closed `<select>`
			fires `change` at every step, so a keyboard user heading for 日本語 was
			sent to Français on the first key press. Choosing a language is a
			navigation, and a link is the control that says so: it works before the
			JavaScript has loaded, and nothing happens until somebody picks one.

			`data-sveltekit-reload` because the language decides what the server
			renders, so the page has to come from the server rather than the client
			router. `lang` lets a screen reader pronounce each name in its own
			language, and `hreflang` says which language the page it leads to is in.
		-->
		<details class="chrome__language">
			<summary>
				<TranslateIcon size={18} aria-hidden="true" />
				<span class="visually-hidden">{t.nav.language}:</span>
				<span lang={HTML_LANG[data.locale]}>{ENDONYM[data.locale]}</span>
			</summary>

			<ul class="chrome__languages">
				{#each LOCALES as locale (locale)}
					<li>
						<a
							href={inLanguage(locale)}
							hreflang={HTML_LANG[locale]}
							lang={HTML_LANG[locale]}
							aria-current={locale === data.locale ? 'page' : undefined}
							data-sveltekit-reload
						>
							{ENDONYM[locale]}
						</a>
					</li>
				{/each}
			</ul>
		</details>

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

	.chrome__language {
		position: relative;
	}

	.chrome__language summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 44px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-md);
		font-size: var(--fs-sm);
		color: var(--text-muted);
		cursor: pointer;
		list-style: none;
	}

	.chrome__language summary::-webkit-details-marker {
		display: none;
	}

	.chrome__language summary:hover,
	.chrome__language[open] summary {
		background: var(--surface-hover);
		color: var(--text);
	}

	.chrome__languages {
		position: absolute;
		inset-inline-end: 0;
		top: calc(100% + var(--space-1));
		z-index: var(--z-dialog);
		min-width: 10rem;
		margin: 0;
		padding: var(--space-1);
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		box-shadow: var(--shadow-panel);
	}

	.chrome__languages a {
		display: flex;
		align-items: center;
		min-height: 44px;
		padding: 0 var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--fs-sm);
		text-decoration: none;
	}

	.chrome__languages a:hover {
		background: var(--surface-hover);
	}

	.chrome__languages a[aria-current='page'] {
		color: var(--accent);
		font-weight: var(--weight-semibold);
	}
</style>
