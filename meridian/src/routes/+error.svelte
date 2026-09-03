<script lang="ts">
	import { CompassRoseIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import ErrorView from '#lib/ui/ErrorView.svelte';

	/*
	 * The root error page: a URL that matches nothing at all lands here, in
	 * the root layout, which has no header. So this one brings a small one
	 * of its own — the name, and a way home.
	 */
</script>

<header class="bare container">
	<a class="bare__brand" href={localizeHref('/')}>
		<CompassRoseIcon size={22} weight="duotone" aria-hidden="true" />
		{m.app_name()}
	</a>
</header>

<main class="main">
	<ErrorView />
</main>

<style>
	.bare {
		padding-block: var(--space-4);
	}

	.bare__brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-display);
		font-weight: 600;
		text-decoration: none;
	}

	.main {
		flex: 1 0 auto;
	}
</style>
