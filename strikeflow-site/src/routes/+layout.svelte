<!--
	ROOT LAYOUT

	Wraps every page. Three jobs:
	  1. Import the one global stylesheet
	  2. Render the skip link, header, main landmark and footer
	  3. Nothing else — layouts that accumulate logic become the hardest file
	     in the codebase to reason about
-->

<script lang="ts">
	import '#lib/styles/app.css';
	import { onNavigate } from '$app/navigation';

	import favicon from '#lib/assets/favicon.svg';
	import SiteHeader from '#lib/components/layout/SiteHeader.svelte';
	import SiteFooter from '#lib/components/layout/SiteFooter.svelte';
	import { prefersReducedMotion } from '#lib/motion/index.ts';

	let { children } = $props();

	/**
	 * CROSS-PAGE TRANSITIONS
	 *
	 * The View Transitions API lets the browser itself animate between two DOM
	 * states. It snapshots the outgoing page, swaps in the new one, and cross-fades
	 * between them — work that would otherwise require keeping both pages mounted
	 * and manually orchestrating their exit and entrance.
	 *
	 * The promise dance below looks odd and is exactly what the API requires:
	 * `startViewTransition` takes a callback that performs the DOM update, and we
	 * need to tell SvelteKit "hold the navigation until I say so". Resolving
	 * `resolve()` inside the callback is what releases it.
	 *
	 * The actual animation is defined in CSS, in `motion.css`, under
	 * `::view-transition-old` and `::view-transition-new`. Keeping it there rather
	 * than in JavaScript means it costs nothing when unsupported.
	 */
	onNavigate((navigation) => {
		// Not supported in every browser, and correctly skipped for reduced motion.
		// Returning nothing lets SvelteKit navigate normally.
		if (!document.startViewTransition || prefersReducedMotion()) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!--
	SKIP LINK — the first focusable element on the page.

	A keyboard or screen-reader user landing here would otherwise have to tab through
	the entire header on every single page before reaching content. This lets them
	jump straight there. It's invisible until focused (see `.skip-link` in
	utilities.css) and it is WCAG 2.4.1 Level A — not optional.
-->
<a class="skip-link" href="#main">Skip to content</a>

<div class="app-shell">
	<SiteHeader />

	<!--
		`<main>` is a landmark. Exactly one per page, and it must contain the unique
		content — not the header or footer. Screen readers let users jump directly to
		it, and it's the target of the skip link above.

		`tabindex="-1"` makes it programmatically focusable so the skip link actually
		moves focus rather than just scrolling. Without it, some browsers scroll the
		page but leave focus stranded in the header.
	-->
	<main id="main" tabindex="-1">
		{@render children()}
	</main>

	<SiteFooter />
</div>

<style>
	/*
	 * A flex column with the main area growing pushes the footer to the bottom of the
	 * viewport on short pages, without `position: fixed` or a magic min-height.
	 *
	 * `100svh` — small viewport height — rather than `100vh`. On mobile, `vh` is
	 * measured against the viewport with browser chrome *hidden*, so a `100vh`
	 * element is taller than what you can actually see and the page scrolls by the
	 * height of the address bar. `svh` measures the visible area. This one unit
	 * fixes the single most common mobile layout bug.
	 */
	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100svh;
	}

	main {
		flex: 1;
	}

	/* The programmatic focus from the skip link shouldn't paint a ring around the
	   whole page — the scroll position is feedback enough. */
	main:focus {
		outline: none;
	}
</style>
