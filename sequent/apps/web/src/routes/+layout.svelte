<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { signOut } from './sign-in/auth.remote.ts';
	import '#lib/styles/app.css';

	let { children, data }: { children: Snippet; data: { viewer: { firmId: string; role: string } | null } } =
		$props();

	const onTerminal = $derived(page.url.pathname.startsWith('/terminal'));
	const onRisk = $derived(page.url.pathname.startsWith('/risk'));
</script>

<svelte:head>
	<title>Sequent</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<a href="#main" class="skip">Skip to content</a>

<header class="chrome">
	<div class="container row">
		<strong class="brand">Sequent</strong>

		{#if data.viewer}
			<nav aria-label="Sections" class="row">
				<a href={resolve('/terminal')} aria-current={onTerminal ? 'page' : undefined}>Terminal</a>
				<a href={resolve('/risk')} aria-current={onRisk ? 'page' : undefined}>Risk</a>
			</nav>

			<div class="who row small">
				<span class="badge">{data.viewer.role.replace('_', ' ')}</span>
				<span class="muted">{data.viewer.firmId}</span>
				<form {...signOut}>
					<button type="submit" class="link">Sign out</button>
				</form>
			</div>
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
		inset-block-start: -3rem;
		inset-inline-start: var(--space-3);
		background: var(--surface-raised);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius);
		z-index: 10;
	}

	.skip:focus { inset-block-start: var(--space-3); }

	.chrome {
		border-block-end: 1px solid var(--line);
		background: var(--surface);
		position: sticky;
		inset-block-start: 0;
		z-index: 5;
	}

	.chrome .row {
		justify-content: space-between;
		padding-block: var(--space-3);
	}

	.brand { letter-spacing: 0.02em; }

	nav a {
		color: var(--ink-muted);
		text-decoration: none;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius);
	}

	nav a[aria-current='page'] {
		color: var(--ink);
		background: var(--surface-raised);
	}

	.link {
		background: none;
		border: none;
		padding: 0;
		min-block-size: auto;
		color: var(--accent);
		text-decoration: underline;
	}

	main { padding-block: var(--space-5); }

	.failure { margin-block-start: var(--space-6); }
	.failure button { margin-block-start: var(--space-3); }
</style>
