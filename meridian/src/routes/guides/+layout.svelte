<script lang="ts">
	import { CompassRoseIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import Footer from '#lib/ui/Footer.svelte';
	import LocaleSwitcher from '#lib/ui/LocaleSwitcher.svelte';

	/*
	 * A CHROME THAT DOES NOT KNOW YOU
	 * ===============================
	 *
	 * These pages are prerendered and served with no JavaScript, so nothing
	 * here can depend on who is looking. There is no "signed in as", no theme
	 * button (the theme still applies: the boot script in `app.html` reads
	 * the stored choice before the first paint), and the language links are
	 * plain links. It is a small, honest header for a small, static site
	 * inside the app.
	 */
	let { children } = $props();
</script>

<a class="skip" href="#main">{m.nav_skip()}</a>

<header class="guides-header">
	<div class="container cluster cluster--between">
		<a class="brand" href={localizeHref('/')}>
			<CompassRoseIcon size={22} weight="duotone" aria-hidden="true" />
			{m.app_name()}
		</a>
		<nav class="cluster" aria-label={m.nav_menu()}>
			<a href={localizeHref('/guides')} aria-current="page">{m.nav_guides()}</a>
			<a href={localizeHref('/explore')}>{m.nav_explore()}</a>
			<a href={localizeHref('/trips')}>{m.nav_trips()}</a>
			<LocaleSwitcher keepSearch={false} />
		</nav>
	</div>
</header>

<main id="main" class="main">
	{@render children()}
</main>

<Footer />

<style>
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

	.guides-header {
		padding-block: var(--space-3);
		border-bottom: 1px solid var(--line);
		background: var(--paper);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-display);
		font-weight: 600;
		text-decoration: none;
	}

	nav a {
		text-decoration: none;
		color: var(--ink-2);
	}

	nav a[aria-current='page'] {
		color: var(--ink);
		font-weight: 600;
	}

	.main {
		flex: 1 0 auto;
	}
</style>
