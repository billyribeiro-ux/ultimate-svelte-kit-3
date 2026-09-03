<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types.js';

	let { data, children }: LayoutProps = $props();

	/**
	 * VIEW TRANSITIONS
	 * ================
	 *
	 * Six lines, and they are the whole of it. `onNavigate` returns a promise that
	 * SvelteKit awaits before completing the navigation, so wrapping the navigation
	 * in `startViewTransition` gives the browser both states of the page and lets
	 * it cross-fade between them.
	 *
	 * WHAT THIS IS FOR, AND WHAT IT IS NOT FOR
	 * ----------------------------------------
	 * It is for continuity: when a trace opens, the row you clicked should still be
	 * where you left it. A page that replaces its content instantly makes people
	 * re-find their place, and re-finding your place forty times an hour is a real
	 * cost even though no individual instance of it feels like one.
	 *
	 * It is not for decoration. There is no slide, no scale, no stagger — the
	 * default cross-fade, at the default duration, and nothing else. In a tool
	 * somebody uses for eight hours, a transition that is *noticeable* is a
	 * transition that is annoying by lunchtime.
	 *
	 * The two guards matter as much as the feature. `startViewTransition` does not
	 * exist in every browser, and there the navigation simply happens — which is
	 * the correct fallback and requires no polyfill. And somebody who has asked
	 * their system for reduced motion has asked for this too; honouring it here
	 * rather than only in CSS means the transition is never *started*, which is
	 * cheaper and avoids the flash that `animation: none` on a running transition
	 * produces.
	 */
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	const signedIn = $derived(data.user !== null);
</script>

<svelte:head>
	<!--
		`color-scheme` is set from the token file, and the theme itself is chosen by
		the inline script in `app.html` before first paint. This is only the meta
		tag that tells the browser what to paint *around* the page — the address bar
		on a phone — which otherwise stays white above a black application.
	-->
	<meta name="theme-color" content="#06070a" media="(prefers-color-scheme: dark)" />
	<meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)" />
</svelte:head>

<!--
	The skip link, first in the DOM and invisible until focused.

	This application's header has a workspace switcher, four navigation links and a
	theme toggle. Without a skip link, reaching the results with a keyboard costs
	seven presses of Tab, on every single navigation.
-->
<a class="skip visually-hidden-focusable" href="#main">Skip to content</a>

{#if signedIn}
	<header class="topbar">
		<a class="brand" href="/">
			<span class="brand__mark" aria-hidden="true">◈</span>
			<span class="brand__name">Sextant</span>
		</a>

		{#if page.params.tenant}
			<nav aria-label="Workspace">
				<ul class="nav">
					{#each [{ href: 'explore', label: 'Explore' }, { href: 'traces', label: 'Traces' }, { href: 'alerts', label: 'Alerts' }, { href: 'settings', label: 'Settings' }] as item (item.href)}
						{@const href = `/${page.params.tenant}/${item.href}`}
						<li>
							<a
								{href}
								class="nav__link"
								class:nav__link--current={page.url.pathname.startsWith(href)}
								aria-current={page.url.pathname.startsWith(href) ? 'page' : undefined}
							>
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}

		<div class="topbar__end">
			{#if data.tenants.length > 1}
				<!--
					A plain link list rather than a `<select>` that navigates on change.

					A select that navigates cannot be operated with a keyboard on Windows,
					where arrowing through the options fires `change` for each one — so
					moving from the first workspace to the third navigates to the second on
					the way. That bug is thirty years old and still ships regularly.
				-->
				<nav aria-label="Workspaces" class="tenants">
					{#each data.tenants as tenant (tenant.tenantId)}
						<a
							href="/{tenant.slug}/explore"
							class="chip"
							aria-current={page.params.tenant === tenant.slug ? 'true' : undefined}
						>
							{tenant.slug}
						</a>
					{/each}
				</nav>
			{/if}

			<form method="POST" action="/sign-in?/signOut">
				<button type="submit" class="btn btn--ghost btn--sm">Sign out</button>
			</form>
		</div>
	</header>
{/if}

<main id="main" class:main--full={signedIn}>
	{@render children()}
</main>

<style>
	:global(html, body) {
		height: 100%;
	}

	:global(body) {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.skip {
		position: absolute;
		z-index: var(--z-toast);
		margin: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--accent);
		color: var(--on-accent);
		border-radius: var(--radius-md);
	}

	.topbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--surface-raised);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text);
		text-decoration: none;
		font-weight: var(--weight-semibold);
	}

	.brand__mark {
		color: var(--accent);
	}

	/* The word is redundant next to the mark on a phone, and the space is not. */
	.brand__name {
		display: none;
	}

	.nav {
		display: flex;
		gap: var(--space-1);
		list-style: none;
		margin: 0;
		padding: 0;
		/* Scrolls sideways on a narrow screen rather than wrapping to a second row
		   that pushes the content down. */
		overflow-x: auto;
		overscroll-behavior-x: contain;
	}

	.nav__link {
		display: block;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		text-decoration: none;
		font-size: var(--fs-sm);
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
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-inline-start: auto;
	}

	.tenants {
		display: none;
		gap: var(--space-1);
	}

	.tenants .chip[aria-current] {
		border-color: var(--accent);
		color: var(--accent);
	}

	main {
		flex: 1;
		min-height: 0;
	}

	.main--full {
		display: flex;
		flex-direction: column;
	}

	@media (min-width: 40rem) {
		.brand__name {
			display: inline;
		}

		.tenants {
			display: flex;
		}
	}
</style>
