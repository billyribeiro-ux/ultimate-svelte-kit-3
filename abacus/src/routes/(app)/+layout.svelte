<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { fly } from 'svelte/transition';
	import Logo from '#lib/components/Logo.svelte';
	import { whoAmI } from '#lib/remote/auth.remote.ts';

	/**
	 * THE APP LAYOUT
	 * ==============
	 *
	 * Everything inside the `(app)` group gets this header. The parentheses
	 * make it a *layout group*: a folder that adds a layout without adding a
	 * segment to the URL. The embed page escapes it with `+page@.svelte`.
	 */
	let { children } = $props();

	const links = [
		{ href: '/sheets', label: 'Sheets' },
		{ href: '/templates', label: 'Templates' },
		{ href: '/lesson', label: 'The lesson' }
	] as const;

	/**
	 * With async Svelte a navigation's state changes wait for the new page's
	 * `await`s, so the interface never shows half an update. Right for
	 * content, wrong for the link somebody just clicked: `$state.eager` reads
	 * the *incoming* pathname now, for this one attribute.
	 */
	const pathname = $derived(page.url.pathname);

	/**
	 * `version.pollInterval` makes SvelteKit check for a new build every
	 * minute; when there is one, the next navigation becomes a full load so
	 * it never asks for JavaScript that no longer exists.
	 */
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});
</script>

<a class="skip visually-hidden-focusable" href="#main">Skip to content</a>

{#if updated.current}
	<div class="updated no-print" role="status" transition:fly={{ y: -16, duration: 240 }}>
		<span>A new version of Abacus is ready.</span>
		<a class="btn btn--sm btn--primary" href={page.url.href} data-sveltekit-reload>Reload</a>
	</div>
{/if}

<header class="topbar no-print">
	<a class="brand" href="/" aria-label="Abacus home">
		<Logo />
		<span class="brand__name">Abacus</span>
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
			Who this browser is, as a remote query rather than layout data: the
			passkey commands and the sign-out form call `whoAmI().refresh()`, and
			the new answer arrives in the same response.
		-->
		<svelte:boundary>
			{const me = $derived(await whoAmI())}
			{#if me}
				<a class="chip chip--on" href="/settings">{me.name}</a>
			{:else}
				<a class="chip" href="/signin">Sign in</a>
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
		height: var(--topbar);
		padding: 0 var(--gutter);
		border-bottom: 1px solid var(--border);
		background: color-mix(in oklab, var(--bg) 88%, transparent);
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

	.brand__name {
		display: none;
	}

	.nav {
		display: flex;
		gap: var(--space-1);
		list-style: none;
		padding: 0;
		overflow-x: auto;
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
		min-height: calc(100dvh - var(--topbar));
	}

	@media (min-width: 40rem) {
		.brand__name {
			display: inline;
		}
	}
</style>
