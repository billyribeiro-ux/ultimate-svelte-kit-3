<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { forgetPages } from '#lib/offline/pages.ts';
	import Footer from '#lib/ui/Footer.svelte';
	import Header from '#lib/ui/Header.svelte';
	import type { LayoutProps } from './$types';

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
	let { data, children }: LayoutProps = $props();

	/*
	 * NOBODY SIGNED IN, NOTHING KEPT
	 * ------------------------------
	 * The service worker keeps a copy of each page for offline reading, and
	 * those copies were rendered for whoever was signed in. The sign-out
	 * button empties them first; this catches every other way a session
	 * ends — it expired, it was signed out before the page had hydrated, it
	 * was revoked from another device. Whenever this layout finds nobody
	 * signed in, the copies go. An effect, because it writes to something
	 * outside the component (the device's Cache Storage) in answer to a
	 * value; it reads `data.user`, so it runs again when that changes.
	 */
	$effect(() => {
		if (!data.user) void forgetPages();
	});
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
		left: var(--gutter);
		z-index: var(--z-skip);
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
