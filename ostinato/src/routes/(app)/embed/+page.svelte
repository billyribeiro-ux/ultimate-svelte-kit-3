<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import { page } from '$app/state';
	import Section from '#lib/components/Section.svelte';

	/**
	 * `<ostinato-player>` is defined by importing its module. Inside the app
	 * that import is dynamic and happens on mount: the element is client-only
	 * — a shadow root does not exist until JavaScript runs — and the docs page
	 * has no business shipping it to a server render.
	 */
	onMount(() => {
		void import('#lib/embed/element.ts');
	});

	/**
	 * `SvelteURL` is a `URL` whose parts are reactive. The two fields below
	 * bind to `url.hostname` and `url.port`, and the snippet reads
	 * `url.origin`, which is *derived from* both — change either and the
	 * origin follows, because the class does the parsing that a string
	 * template would have to redo. (Two fields rather than one `host`, because
	 * a `host` assigned without a port keeps the old one, as the URL standard
	 * says it should — and a person typing a bare domain does not expect that.)
	 */
	const url = new SvelteURL(`${page.url.origin}/embed/ostinato-player.js`);

	const id = $derived(page.url.hash.slice(1) || 'seedfour');

	// Assembled in two halves: a literal closing script tag inside a `<script>`
	// block would end this block, as far as the Svelte parser is concerned.
	const closeScript = '</' + 'script>';
	const snippet = $derived(
		`<script src="${url.origin}/embed/ostinato-player.js">${closeScript}
<ostinato-player pattern="${id}"></ostinato-player>`
	);
</script>

<svelte:head>
	<title>Embed — Ostinato</title>
	<meta
		name="description"
		content="Put a playable Ostinato pattern on any page with one script tag and one element."
	/>
</svelte:head>

<div class="page">
	<Section eyebrow="Embed" title="A player for any page">
		<p class="prose">
			One script, one element. No framework on the host page, no iframe. The element fetches the
			pattern, synthesises the sound, and dispatches <code>ready</code>, <code>play</code> and
			<code>stop</code> events you can listen for like any other.
		</p>

		<div class="cluster">
			<label class="field">
				<span class="field__label">Where the app is hosted</span>
				<input class="input mono" bind:value={url.hostname} />
			</label>
			<label class="field">
				<span class="field__label">Port (blank for the default)</span>
				<input class="input mono port" bind:value={url.port} />
			</label>
		</div>

		<figure class="code">
			<figcaption>Paste this where you want the player</figcaption>
			<pre class="mono">{snippet}</pre>
		</figure>

		<h3>It looks like this</h3>
		<ostinato-player pattern={id}></ostinato-player>

		<p class="prose">
			Call <code>player.play()</code> or <code>player.stop()</code> on the element — the methods
			exist before the player has even loaded. Or set the <code>playing</code> attribute. See it on
			a page with none of this site around it: <a href="/embed/demo#{id}">the bare demo</a>.
		</p>
	</Section>
</div>

<style>
	.code {
		margin: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		overflow: hidden;
	}

	.code figcaption {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.port {
		width: 7rem;
	}

	pre {
		margin: 0;
		padding: var(--space-3);
		overflow-x: auto;
		font-size: var(--fs-sm);
	}
</style>
