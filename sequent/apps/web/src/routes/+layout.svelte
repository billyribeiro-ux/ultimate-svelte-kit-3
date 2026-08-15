<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { signOut } from './sign-in/auth.remote.ts';
	import '#lib/styles/app.css';

	let {
		children,
		data
	}: { children: Snippet; data: { viewer: { firmId: string; role: string } | null } } = $props();

	/**
	 * The sections this viewer can reach.
	 *
	 * Built from the role rather than rendered-then-hidden with CSS. A link that
	 * is `display: none` is still in the DOM, still in the accessibility tree in
	 * some readers, and still tells anybody looking at the markup that an admin
	 * area exists — which is not a vulnerability on its own, and is free to avoid.
	 *
	 * The real enforcement is server-side in each route's `+page.server.ts`. This
	 * is navigation, not security: hiding a link the user may not follow is
	 * courtesy, and the load function is what actually refuses.
	 */
	const sections = $derived.by(() => {
		const role = data.viewer?.role;
		if (!role) return [];

		const all = [
			{
				href: '/terminal',
				label: 'Terminal',
				roles: ['trader', 'auditor', 'firm_admin', 'risk_manager', 'venue_operator']
			},
			{ href: '/risk', label: 'Risk', roles: ['risk_manager', 'firm_admin', 'auditor'] },
			{ href: '/admin', label: 'Admin', roles: ['firm_admin', 'venue_operator'] }
		];

		return all.filter((section) => section.roles.includes(role));
	});

	const current = $derived(page.url.pathname);
</script>

<svelte:head>
	<title>Sequent</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<a href="#main" class="skip">Skip to content</a>

<header class="chrome">
	<div class="container shell">
		<div class="top row">
			<strong class="brand">Sequent</strong>

			{#if data.viewer}
				<div class="who row small">
					<span class="badge">{data.viewer.role.replace('_', ' ')}</span>
					<span class="muted firm">{data.viewer.firmId}</span>
					<form {...signOut}>
						<button type="submit" class="link">Sign out</button>
					</form>
				</div>
			{/if}
		</div>

		{#if sections.length}
			<!--
				A second row on phones and the same row on desktop.

				The alternative — a hamburger — hides two links behind a tap and a
				300ms panel for no gain. A menu earns its place at about seven items;
				below that it is a button that exists to open a button.
			-->
			<nav aria-label="Sections" class="tabs">
				{#each sections as section (section.href)}
					<a
						href={resolve(section.href as '/terminal')}
						aria-current={current.startsWith(section.href) ? 'page' : undefined}
					>
						{section.label}
					</a>
				{/each}
			</nav>
		{/if}
	</div>
</header>

<main id="main">
	<!--
		No `pending` snippet on this boundary, deliberately.

		A pending snippet renders immediately during server rendering and does not
		wait for the awaits inside it, so every page would ship HTML whose entire
		body was "Loading…" — fine in a browser, empty to anything else.
	-->
	<svelte:boundary>
		{@render children()}

		{#snippet failed(error, reset)}
			<div class="container card failure" role="alert">
				<h1>Something went wrong</h1>
				<p class="muted">{error instanceof Error ? error.message : 'We could not load this.'}</p>
				<button type="button" onclick={reset}>Try again</button>
			</div>
		{/snippet}
	</svelte:boundary>
</main>

<style>
	.skip {
		position: absolute;
		inset-block-start: -4rem;
		inset-inline-start: var(--space-3);
		background: var(--surface-raised);
		border: 1px solid var(--accent);
		/* A control somebody reaches by keyboard when they are already lost. It is
		   the first focusable thing on the page and it gets the full 44px. */
		display: inline-flex;
		align-items: center;
		min-block-size: 2.75rem;
		padding-inline: var(--space-3);
		border-radius: var(--radius);
		z-index: 10;
	}

	.skip:focus {
		inset-block-start: var(--space-3);
	}

	.chrome {
		border-block-end: 1px solid var(--line);
		background: var(--surface);
		position: sticky;
		inset-block-start: 0;
		z-index: 5;
	}

	.shell {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-block: var(--space-3);
	}

	.top {
		justify-content: space-between;
	}

	.brand {
		letter-spacing: 0.02em;
	}

	/* The firm id is the first thing to go when there is no room for it. */
	.firm {
		display: none;
	}

	.tabs {
		display: flex;
		gap: var(--space-1);
		/* Scrolls rather than wraps, so adding a fifth section never pushes the
		   page content down by a whole row on a phone. */
		overflow-x: auto;
		overscroll-behavior-x: contain;
	}

	.tabs a {
		color: var(--ink-muted);
		text-decoration: none;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius);
		white-space: nowrap;
		/* 44px, the smallest comfortable tap target, without needing a min-height
		   that would fight the padding. */
		display: inline-flex;
		align-items: center;
		min-block-size: 2.75rem;
	}

	.tabs a[aria-current='page'] {
		color: var(--ink);
		background: var(--surface-raised);
	}

	@media (min-width: 48rem) {
		.shell {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
		.top {
			order: 2;
		}
		.tabs {
			order: 1;
		}
		.firm {
			display: inline;
		}
	}

	main {
		padding-block: var(--space-5);
	}

	.failure {
		margin-block-start: var(--space-6);
	}
	.failure button {
		margin-block-start: var(--space-3);
	}
</style>
