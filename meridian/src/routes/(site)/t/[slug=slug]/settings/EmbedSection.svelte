<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * PUTTING A TRIP ON ANOTHER PAGE
	 * ==============================
	 *
	 * Two ways, and the snippets for both. The frame is `/embed/<slug>`, the
	 * one route the security hook allows to be framed. The element is
	 * `<meridian-route>`, a custom element built from `src/lib/embed` — here
	 * it is imported on mount, so the preview below is the real thing, and
	 * the standalone file a host page would load is built by
	 * `vite.element.config.ts` into `static/embed/`.
	 *
	 * Only a trip visible by link can be embedded; both routes say no to a
	 * private one, and so does this section.
	 */
	interface Props {
		slug: string;
		visibility: string;
	}

	let { slug, visibility }: Props = $props();

	onMount(() => {
		void import('#lib/embed/element.ts');
	});

	const origin = $derived(page.url.origin);

	// Assembled in two halves: a literal closing script tag inside this script
	// block would end the block, as far as the Svelte parser is concerned.
	const closeScript = '</' + 'script>';
	const frameSnippet = $derived(
		`<iframe src="${origin}/embed/${slug}" width="400" height="420" loading="lazy" title="Meridian"></iframe>`
	);
	const elementSnippet = $derived(
		`<script src="${origin}/embed/meridian-route.js">${closeScript}\n<meridian-route slug="${slug}" origin="${origin}"></meridian-route>`
	);
</script>

<section class="card card--pad stack">
	<h2>{m.embed_heading()}</h2>
	{#if visibility !== 'link'}
		<p class="muted">{m.embed_only_link()}</p>
	{:else}
		<div class="stack stack--sm">
			<h3 class="label">{m.embed_iframe()}</h3>
			<pre class="snippet"><code>{frameSnippet}</code></pre>
		</div>
		<div class="stack stack--sm">
			<h3 class="label">{m.embed_element()}</h3>
			<pre class="snippet"><code>{elementSnippet}</code></pre>
		</div>
		<meridian-route {slug} {origin}></meridian-route>
	{/if}
</section>

<style>
	.snippet {
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--paper-3);
		font-size: var(--text-xs);
		overflow-x: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
