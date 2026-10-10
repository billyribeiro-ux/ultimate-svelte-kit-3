<script lang="ts">
	import { page } from '$app/state';
	import { CompassRoseIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';

	/**
	 * What an error page says. Two `+error.svelte` files render it — the root
	 * one, for a URL that matches no route, and the one inside `(site)`, for
	 * an error on a page that has a header — so the words live once.
	 *
	 * The status code is set in the display face at its largest cut, in the
	 * tertiary grey: it is decoration, and the heading carries the meaning.
	 * Behind it, a compass rose drawn thin from the icon set the app already
	 * ships — the one illustration in the product.
	 */
	const notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{page.status} — {m.app_name()}</title>
</svelte:head>

<section class="container error">
	<p class="error__status tabular" aria-hidden="true">
		<span class="error__rose"><CompassRoseIcon size="100%" weight="thin" /></span>
		{page.status}
	</p>
	<h1 class="error__title">{notFound ? m.error_not_found() : m.error_title()}</h1>
	{#if !notFound && page.error?.message}
		<p class="error__message">{page.error.message}</p>
	{/if}
	{#if page.error?.id}
		<p class="hint"><code>{m.error_id({ id: page.error.id })}</code></p>
	{/if}
	<p class="error__actions">
		<a class="btn btn--primary" href={href('/(site)/(app)/trips')}>{m.error_back()}</a>
		<a class="btn btn--ghost" href={href('/(site)/explore')}>{m.error_explore()}</a>
	</p>
</section>

<style>
	.error {
		position: relative;
		display: grid;
		align-content: center;
		gap: var(--space-3);
		min-height: 60dvh;
		max-width: 36rem;
		padding-block: var(--section);
	}

	/*
	 * The numeral is as wide as its digits (`justify-self: start`), so the
	 * rose inside it can be centred on them, and `isolation` gives it a layer
	 * of its own where `z-index: -1` puts the rose behind the digits and not
	 * behind the page. Sized in `em`, it grows with the numeral from phone to
	 * desktop, and it sits a little high so it never reaches the heading.
	 */
	.error__status {
		position: relative;
		isolation: isolate;
		justify-self: start;
		font-family: var(--font-display);
		font-size: var(--text-4xl);
		font-weight: 450;
		font-variation-settings: 'opsz' 144;
		line-height: var(--leading-display);
		letter-spacing: var(--tracking-4xl);
		color: var(--ink-3);
	}

	.error__rose {
		position: absolute;
		z-index: -1;
		top: 50%;
		left: 50%;
		width: 1.7em;
		height: 1.7em;
		translate: -50% -56%;
		color: var(--line-2);
		opacity: 0.5;
		pointer-events: none;
	}

	.error__message {
		color: var(--ink-2);
	}

	.error__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding-block-start: var(--space-3);
	}
</style>
