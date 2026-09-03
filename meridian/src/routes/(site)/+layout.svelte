<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import Footer from '#lib/ui/Footer.svelte';
	import Header from '#lib/ui/Header.svelte';

	/*
	 * THE SITE
	 * ========
	 *
	 * Everything that is rendered per request: the home page, the trips, the
	 * sign-in pages, the trip itself. `+layout.server.ts` beside this file
	 * loads who is signed in, and this layout puts it in the header. The
	 * guides, which are prerendered, live outside this group — the root
	 * layout says why.
	 */
	let { data, children } = $props();
</script>

<a class="skip" href="#main">{m.nav_skip()}</a>

<Header user={data.user} />

<main id="main" class="main">
	{@render children()}
</main>

<Footer />

<style>
	.main {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
	}

	.skip {
		position: absolute;
		top: -100%;
		left: var(--space-4);
		z-index: 50;
		padding: var(--space-2) var(--space-3);
		background: var(--ink);
		color: var(--paper);
		border-radius: var(--radius);
		text-decoration: none;
	}

	.skip:focus {
		top: var(--space-2);
	}
</style>
