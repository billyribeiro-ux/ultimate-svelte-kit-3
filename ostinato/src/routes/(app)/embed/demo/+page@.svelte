<script lang="ts">
	import { page } from '$app/state';

	/**
	 * A HOST PAGE
	 * ===========
	 *
	 * What somebody else's site looks like with the player on it: no header, no
	 * stylesheet of ours beyond the root layout, and the element loaded from the
	 * *standalone* bundle in `static/embed` rather than from the app's modules.
	 * The `@` in `+page@.svelte` resets this page to the root layout, skipping
	 * the `(app)` layout with its navigation.
	 *
	 * The end-to-end suite opens this page, which is the only honest test of
	 * the standalone build: the app never loads that file itself.
	 */
	const id = $derived(page.url.hash.slice(1) || 'seedfour');
</script>

<svelte:head>
	<title>Somebody else's page</title>
	<script src="/embed/ostinato-player.js"></script>
</svelte:head>

<main class="host">
	<h1>A blog post about a groove</h1>
	<p>Here is the pattern I was talking about. Press play.</p>
	<ostinato-player pattern={id}></ostinato-player>
	<p><a href="/">← Back to Ostinato</a></p>
</main>

<style>
	.host {
		max-width: 40rem;
		margin: 3rem auto;
		padding: 0 1rem;
		font-family: Georgia, serif;
	}
</style>
