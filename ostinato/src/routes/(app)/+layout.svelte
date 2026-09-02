<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { fly } from 'svelte/transition';
	import Logo from '#lib/components/Logo.svelte';
	import { whoAmI } from '#lib/remote/artist.remote.ts';

	/**
	 * THE APP LAYOUT
	 * ==============
	 *
	 * Everything inside the `(app)` group gets this header. The parentheses
	 * make it a *layout group*: a folder that adds a layout without adding a
	 * segment to the URL, so `/studio` is still `/studio`. The one page that
	 * escapes it is `embed/demo/+page@.svelte`, whose `@` says "render me in
	 * the root layout instead".
	 */

	let { children } = $props();

	const links = [
		{ href: '/studio', label: 'Studio' },
		{ href: '/gallery', label: 'Gallery' },
		{ href: '/jam/lobby', label: 'Jam' },
		{ href: '/embed', label: 'Embed' }
	] as const;

	/**
	 * THE CURRENT PATH, EAGERLY
	 * =========================
	 *
	 * With async Svelte, a navigation's state changes are held back until the
	 * new page's `await`s resolve, so that the interface never shows half of an
	 * update. That is right for content and wrong for the thing somebody just
	 * clicked: a nav link that stays un-highlighted for the four hundred
	 * milliseconds a remote query takes feels broken. `$state.eager` reads the
	 * *incoming* value immediately, for this one attribute, and nothing else.
	 */
	const pathname = $derived(page.url.pathname);

	/**
	 * A NEW VERSION WAS DEPLOYED
	 * ==========================
	 *
	 * `version.pollInterval` in `vite.config.ts` makes SvelteKit check for a new
	 * build every minute and set `updated.current` when it finds one. Client-side
	 * navigation would then ask for JavaScript files that no longer exist, so
	 * the next navigation becomes a full page load instead. The banner below
	 * gives the person the choice to do that now; this makes sure it happens
	 * anyway.
	 */
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) {
			location.href = to.url.href;
		}
	});
</script>

<!--
	The skip link, first in the DOM and invisible until focused. The header has
	a logo, four links and a name; a keyboard user should not have to Tab past
	all of it on every page.
-->
<a class="skip visually-hidden-focusable" href="#main">Skip to content</a>

{#if updated.current}
	<div class="updated" role="status" transition:fly={{ y: -16, duration: 240 }}>
		<span>A new version of Ostinato is ready.</span>
		<a class="btn btn--sm btn--primary" href={page.url.href} data-sveltekit-reload>Reload</a>
	</div>
{/if}

<header class="topbar">
	<a class="brand" href="/" aria-label="Ostinato home">
		<Logo />
		<span class="brand__name">Ostinato</span>
	</a>

	<nav aria-label="Primary">
		<ul class="nav">
			{#each links as link (link.href)}
				<li>
					<a
						href={link.href}
						class={[
							'nav__link',
							{ 'nav__link--current': $state.eager(pathname).startsWith(link.href) }
						]}
						aria-current={$state.eager(pathname).startsWith(link.href) ? 'page' : undefined}
					>
						{link.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="topbar__end">
		<!--
			Who this browser is, as a remote query rather than layout data. The
			forms that change the answer — choosing a handle, forgetting it — call
			`whoAmI().refresh()` in their handlers, and the new value comes back in
			the same response as the submission. A layout `load` would have needed
			a second round trip to notice.
		-->
		<svelte:boundary>
			{const me = $derived(await whoAmI())}
			{#if me}
				<a class="chip chip--on" href="/gallery#yours">@{me.handle}</a>
			{:else}
				<span class="chip" title="Choose a handle when you publish">not signed in</span>
			{/if}
			{#snippet pending()}
				<span class="chip">…</span>
			{/snippet}
		</svelte:boundary>
	</div>
</header>

<main id="main">
	{@render children()}
</main>

<style>
	.skip {
		position: absolute;
		z-index: var(--z-toast);
		margin: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--accent);
		color: var(--on-accent);
		border-radius: var(--radius-md);
	}

	.updated {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--gutter);
		background: var(--accent-soft);
		color: var(--text);
		font-size: var(--fs-sm);
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--gutter);
		border-bottom: 1px solid var(--border);
		background: color-mix(in oklab, var(--bg) 85%, transparent);
		backdrop-filter: blur(12px);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text);
		text-decoration: none;
		font-weight: var(--weight-semibold);
	}

	/* The word is redundant next to the mark on a phone, and the space is not. */
	.brand__name {
		display: none;
	}

	.nav {
		display: flex;
		gap: var(--space-1);
		list-style: none;
		padding: 0;
		/* Scrolls sideways on a narrow screen rather than wrapping under the logo. */
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}

	.nav__link {
		display: block;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		text-decoration: none;
		font-size: var(--fs-sm);
		font-weight: var(--weight-medium);
		white-space: nowrap;
	}

	.nav__link:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.nav__link--current {
		background: var(--surface-active);
		color: var(--text);
	}

	.topbar__end {
		margin-inline-start: auto;
	}

	main {
		min-height: calc(100dvh - 3.5rem);
	}

	@media (min-width: 40rem) {
		.brand__name {
			display: inline;
		}
	}
</style>
