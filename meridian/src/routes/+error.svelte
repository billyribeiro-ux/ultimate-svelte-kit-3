<script lang="ts">
	import { CompassRoseIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import ErrorView from '#lib/ui/ErrorView.svelte';

	/*
	 * The root error page: a URL that matches nothing at all lands here, in
	 * the root layout, which has no header. So this one brings a small one
	 * of its own — the name, and a way home.
	 */
</script>

<header class="bare container">
	<a class="bare__brand" href={href('/(site)')}>
		<CompassRoseIcon size={22} weight="duotone" aria-hidden="true" />
		{m.app_name()}
	</a>
</header>

<main class="main">
	<ErrorView />
</main>

<style>
	/* The same brand mark as the site header, on a bare page: the name, in the display face, and the sea compass. */
	.bare {
		display: flex;
		align-items: center;
		min-height: var(--header-h);
	}

	.bare__brand {
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

	.bare__brand :global(svg) {
		color: var(--sea);
	}

	.main {
		flex: 1 0 auto;
	}
</style>
