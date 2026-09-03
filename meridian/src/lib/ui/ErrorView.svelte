<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';

	/**
	 * What an error page says. Two `+error.svelte` files render it — the root
	 * one, for a URL that matches no route, and the one inside `(site)`, for
	 * an error on a page that has a header — so the words live once.
	 */
	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{page.status} — {m.app_name()}</title>
</svelte:head>

<section class="container error stack">
	<p class="muted tabular">{page.status}</p>
	<h1>{notFound ? m.error_not_found() : m.error_title()}</h1>
	{#if !notFound && page.error?.message}
		<p class="muted">{page.error.message}</p>
	{/if}
	{#if page.error?.id}
		<p class="hint"><code>{m.error_id({ id: page.error.id })}</code></p>
	{/if}
	<p><a class="btn" href={localizeHref('/trips')}>{m.error_back()}</a></p>
</section>

<style>
	.error {
		padding-block: var(--space-8);
		max-width: 40rem;
	}
</style>
