<script lang="ts">
	import { page } from '$app/state';
	import { TranslateIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref, locales, type Locale } from '#lib/paraglide/runtime.js';

	const names: Record<Locale, string> = { en: 'English', de: 'Deutsch', 'pt-br': 'Português' };

	/*
	 * A prerendered page has no query string — it is one file, served for
	 * every request — and SvelteKit says so loudly: reading `url.search`
	 * while prerendering is an error, not an empty string. The guides layout
	 * passes `keepSearch={false}`; the site header, which is never
	 * prerendered, keeps `?tab=map` across a language switch.
	 */
	interface Props {
		keepSearch?: boolean;
	}

	let { keepSearch = true }: Props = $props();

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

<nav class="locales" aria-label={m.locale_label()}>
	<TranslateIcon size={16} aria-hidden="true" />
	{#each locales as locale (locale)}
		<a
			href={localizeHref(here, { locale })}
			hreflang={locale}
			lang={locale}
			aria-current={locale === current ? 'true' : undefined}
			data-sveltekit-reload
		>
			{names[locale]}
		</a>
	{/each}
</nav>

<style>
	.locales {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--ink-3);
		font-size: var(--text-xs);
	}

	.locales a {
		text-decoration: none;
		color: var(--ink-2);
		padding: 0.15rem 0.35rem;
		border-radius: var(--radius-sm);
	}

	.locales a:hover {
		background: var(--paper-3);
	}

	.locales a[aria-current='true'] {
		color: var(--ink);
		font-weight: 600;
	}
</style>
