<script lang="ts">
	import { CompassRoseIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
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

<!--
	Two rows on a phone, by design: the brand and the language codes on the
	first, the three links under them. From 48em one row: brand, links,
	languages.
-->
<header class="guides-header">
	<div class="container guides-header__row">
		<a class="brand" href={href('/(site)')}>
			<CompassRoseIcon size={22} weight="duotone" aria-hidden="true" />
			{m.app_name()}
		</a>
		<nav class="guides-nav" aria-label={m.nav_menu()}>
			<a href={href('/guides')} aria-current="page">{m.nav_guides()}</a>
			<a href={href('/(site)/explore')}>{m.nav_explore()}</a>
			<a href={href('/(site)/(app)/trips')}>{m.nav_trips()}</a>
		</nav>
		<div class="guides-header__locales">
			<LocaleSwitcher keepSearch={false} compact />
		</div>
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

	/* Styled like the site header (chapter 23) minus what needs JavaScript: no sheet, no theme toggle. */
	.guides-header {
		min-height: var(--header-h);
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--line);
		background: var(--paper);
	}

	.guides-header__row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			'brand locales'
			'nav nav';
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding-block: var(--space-2);
	}

	.guides-nav {
		grid-area: nav;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.guides-header__locales {
		grid-area: locales;
	}

	@media (min-width: 48em) {
		.guides-header__row {
			grid-template-columns: auto minmax(0, 1fr) auto;
			grid-template-areas: 'brand nav locales';
			column-gap: var(--space-5);
		}

		.guides-nav {
			justify-content: flex-end;
		}
	}

	.brand {
		grid-area: brand;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 600;
		letter-spacing: -0.01em;
		text-decoration: none;
		color: var(--ink);
	}

	.brand :global(svg) {
		color: var(--sea);
	}

	.guides-nav a {
		display: inline-flex;
		align-items: center;
		min-height: var(--control-sm);
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--ink-2);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.guides-nav a:hover {
		color: var(--ink);
		background-color: var(--paper-3);
	}

	/* A painted 2px underline, like the app header's: an inset shadow would curl up into the rounded corners. */
	.guides-nav a[aria-current='page'] {
		color: var(--ink);
		background-image: linear-gradient(var(--sea), var(--sea));
		background-repeat: no-repeat;
		background-position: bottom;
		background-size: 100% 2px;
	}

	.main {
		flex: 1 0 auto;
	}
</style>
