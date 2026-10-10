<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { CheckIcon, CopyIcon } from 'phosphor-svelte';
	import { toast } from 'svelte-sonner';
	import { m } from '#lib/paraglide/messages.js';
	import type { Visibility } from '#lib/domain/schemas.ts';
	import { pop } from '#lib/motion/transitions.ts';

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
		visibility: Visibility;
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

	/* Which snippet was copied a moment ago; its button shows a check for 1.6s. */
	let copied = $state<'frame' | 'element' | null>(null);

	async function copy(which: 'frame' | 'element', text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(m.companions_copied());
			copied = which;
			setTimeout(() => (copied = null), 1600);
		} catch {
			// The snippet is on screen; a person can still select it.
		}
	}
</script>

<!--
	Each button says what it copies — "Copy the frame code", "Copy the
	element code" — to a screen reader, and "Copy" on screen, under the
	heading that already says which. The toast announces "Copied"; the
	button does not repeat it.
-->
{#snippet copyButton(which: 'frame' | 'element', text: string)}
	<button
		class="btn btn--sm snippet__copy"
		type="button"
		aria-label={which === 'frame' ? m.embed_copy_frame() : m.embed_copy_element()}
		onclick={() => copy(which, text)}
	>
		{#if copied === which}
			<span class="copy__icon" in:pop><CheckIcon size={14} aria-hidden="true" /></span>
		{:else}
			<span class="copy__icon"><CopyIcon size={14} aria-hidden="true" /></span>
		{/if}
		{m.embed_copy()}
	</button>
{/snippet}

<section class="card card--pad stack">
	<h2>{m.embed_heading()}</h2>
	{#if visibility !== 'link'}
		<p class="muted">{m.embed_only_link()}</p>
	{:else}
		<div class="stack stack--sm">
			<div class="snippet__head">
				<h3 class="overline">{m.embed_iframe()}</h3>
				{@render copyButton('frame', frameSnippet)}
			</div>
			<pre class="snippet well"><code>{frameSnippet}</code></pre>
		</div>
		<div class="stack stack--sm">
			<div class="snippet__head">
				<h3 class="overline">{m.embed_element()}</h3>
				{@render copyButton('element', elementSnippet)}
			</div>
			<pre class="snippet well"><code>{elementSnippet}</code></pre>
		</div>
		<!-- The real element, in a tier-2 well, so what a host page would show is shown here first. -->
		<div class="stack stack--sm">
			<h3 class="overline">{m.embed_preview()}</h3>
			<div class="preview well">
				<meridian-route {slug} {origin}></meridian-route>
			</div>
		</div>
	{/if}
</section>

<style>
	.snippet__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.snippet {
		font-size: var(--text-xs);
		overflow-x: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.preview {
		padding: var(--space-4);
	}

	.copy__icon {
		display: inline-grid;
		place-items: center;
	}
</style>
