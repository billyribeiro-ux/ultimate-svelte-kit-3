<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
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

	/**
	 * EVERY INTERNAL LINK GOES THROUGH `resolve()`
	 * ============================================
	 *
	 * `resolve('/(app)/sheets')` takes a *route id* — the folder under
	 * `src/routes`, layout group included — and is checked against the routes
	 * that exist: rename a folder and every link to it is a type error, not a
	 * 404 found by a reader. It also applies the base path, which this app
	 * does not have and a reused component should not assume. (A pathname is
	 * accepted too, and since SvelteKit 3 it has no leading slash —
	 * `resolve('sheets')` — which is why only route ids appear in this app.)
	 * eslint-plugin-svelte's `no-navigation-without-resolve` holds every
	 * `href` and `goto()` to it, and the rule stays on — a link is the one
	 * place a typo ships silently.
	 */
	const links = [
		{ href: resolve('/(app)/sheets'), label: 'Sheets' },
		{ href: resolve('/(app)/templates'), label: 'Templates' },
		{ href: resolve('/(app)/lesson'), label: 'The lesson' }
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
	 *
	 * SvelteKit 3 runs this hook for shallow navigations too. There are none
	 * in this app — `page.state` is never written — so there is nothing to
	 * filter out; a project that adds one checks `navigation.shallow` here.
	 */
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});
</script>

<a class="skip visually-hidden-focusable" href="#main">Skip to content</a>

{#if updated.current}
	<div class="updated no-print" role="status" transition:fly={{ y: -16, duration: 240 }}>
		<span>A new version of Abacus is ready.</span>
		<!--
			A button, not a link to the current address. The banner only exists
			once JavaScript has polled for the version, so there is no no-script
			case to serve; a reload is a reload, and `location.reload()` says so
			without a `data-sveltekit-reload` link that the linter cannot resolve.
		-->
		<button type="button" class="btn btn--sm btn--primary" onclick={() => location.reload()}>
			Reload
		</button>
	</div>
{/if}

<header class="topbar no-print">
	<a class="brand" href={resolve('/(app)')} aria-label="Abacus home">
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

			`failed` keeps a failure here, in the corner of the header. Without it
			the error would climb to `+error.svelte` and replace the page somebody
			is working in because the chip could not say their name. Every page
			that needs a person asks again, and says so itself.
		-->
		<svelte:boundary>
			{const me = $derived(await whoAmI())}
			{#if me}
				<a class="chip chip--on" href={resolve('/(app)/settings')}>{me.name}</a>
			{:else}
				<a class="chip" href={resolve('/(app)/signin')}>Sign in</a>
			{/if}
			{#snippet pending()}
				<span class="chip">…</span>
			{/snippet}
			{#snippet failed()}
				<a class="chip" href={resolve('/(app)/signin')}>Sign in</a>
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
