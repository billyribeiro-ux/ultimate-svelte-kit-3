<script lang="ts">
	import { page } from '$app/state';
	import { TranslateIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref, locales, type Locale } from '#lib/paraglide/runtime.js';

	const names: Record<Locale, string> = { en: 'English', de: 'Deutsch', 'pt-br': 'Português' };
	const codes: Record<Locale, string> = { en: 'EN', de: 'DE', 'pt-br': 'PT' };

	/*
	 * A prerendered page has no query string — it is one file, served for
	 * every request — and SvelteKit says so loudly: reading `url.search`
	 * while prerendering is an error, not an empty string. The guides layout
	 * passes `keepSearch={false}`; the site header, which is never
	 * prerendered, keeps `?tab=map` across a language switch.
	 *
	 * `compact` is for a header that has to fit a nav beside it: below 64em
	 * the links show two-letter codes — EN · DE · PT — and the full names
	 * come back from 64em, where there is room. A phone needs it most: with
	 * full names the guides header wrapped to three rows.
	 *
	 * A compact link is named with both — "Português (PT)" — so its name
	 * holds the words on it. Named "Português" while it showed "PT", it was
	 * a link speech input could not find ("click PT"), and it passed for
	 * English and German only because their names happen to start with
	 * their codes. The full name is still the first word, so the link is
	 * still "Deutsch" to the end-to-end suite.
	 */
	interface Props {
		keepSearch?: boolean;
		compact?: boolean;
	}

	let { keepSearch = true, compact = false }: Props = $props();

	/*
	 * Links, not a `<select>` with an `onchange`. A link to `/de/trips` is a
	 * link: it works before JavaScript loads, it can be opened in a new tab,
	 * and a crawler finds the German site through it. `data-sveltekit-reload`
	 * makes it a full navigation, so the server middleware runs again, sets
	 * the cookie, and writes `lang="de"` on the document — a client-side
	 * navigation would swap the messages and leave `<html lang>` wrong.
	 */
	const current = $derived(getLocale());
	const here = $derived(keepSearch ? page.url.pathname + page.url.search : page.url.pathname);
</script>

<nav class="locales" class:locales--compact={compact} aria-label={m.locale_label()}>
	<TranslateIcon size={16} aria-hidden="true" />
	<!--
		The one link in the app that bypasses `#lib/href.ts`: `here` is whatever
		page this is, in another language — a pathname, not a route id, and there
		is nothing for `resolve()` to check. Said so to the linter, out loud.
	-->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	{#each locales as locale (locale)}
		<a
			href={localizeHref(here, { locale })}
			hreflang={locale}
			lang={locale}
			title={compact ? names[locale] : undefined}
			aria-label={compact ? `${names[locale]} (${codes[locale]})` : undefined}
			aria-current={locale === current ? 'true' : undefined}
			data-sveltekit-reload
		>
			<span class="locales__code" aria-hidden="true">{codes[locale]}</span>
			<span class="locales__name">{names[locale]}</span>
		</a>
	{/each}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</nav>

<style>
	.locales {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--ink-2);
		font-size: var(--text-xs);
	}

	.locales a {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--control-sm);
		min-height: var(--control-sm);
		padding: 0.15rem 0.45rem;
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--ink-2);
	}

	.locales a:hover {
		background: var(--paper-3);
		color: var(--ink);
	}

	.locales a[aria-current='true'] {
		color: var(--ink);
		font-weight: 600;
	}

	/*
	 * 36px drawn, 44px under a finger: the pseudo-element reaches 4px past
	 * each edge, and the links move 12px apart so two reaches never meet —
	 * at 8px they would touch, and on a screen of fractional device pixels
	 * a press on the seam could go to either code.
	 */
	@media (pointer: coarse) {
		.locales {
			gap: var(--space-3);
		}
		.locales a::after {
			content: '';
			position: absolute;
			inset: -4px;
		}
	}

	.locales__code {
		display: none;
	}

	/*
	 * Compact, mobile first: the code is shown and the name is hidden the
	 * `visually-hidden` way — clipped, not `display: none` — so it still
	 * names the link. `display: none` would take it out of the
	 * accessibility tree and the link would be called "DE". From 64em the
	 * names come back (min-width only, the house rule).
	 */
	.locales--compact .locales__code {
		display: inline;
	}

	.locales--compact .locales__name {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	@media (min-width: 64em) {
		.locales--compact .locales__code {
			display: none;
		}
		.locales--compact .locales__name {
			position: static;
			width: auto;
			height: auto;
			overflow: visible;
			clip: auto;
		}
	}
</style>
