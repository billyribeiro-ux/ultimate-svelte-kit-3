<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { messageFrom } from '#lib/errors.ts';
	import Logo from '#lib/components/Logo.svelte';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import '#lib/styles/app.css';

	let { children, data }: { children: Snippet; data: { user?: { name: string } | undefined } } =
		$props();

	/*
	 * `page` from `$app/state` is a rune-powered object, not a store — no `$page`,
	 * no subscription, no `get()`. Reading `page.url` inside a `$derived` makes
	 * this recompute on navigation and never again.
	 *
	 * `page.url` is a `ReadonlyURL` in SvelteKit 3: mutating it throws rather than
	 * silently doing nothing, which is a much better way to find out you meant to
	 * make a copy.
	 */
	const onManage = $derived(page.url.pathname.startsWith('/manage'));
</script>

<a class="skip-link" href="#main">Skip to content</a>

<div class="shell">
	<header class="header">
		<div class="header-inner container">
			<a class="brand" href={resolve('/')}>
				<Logo />
				<span class="brand-name">Halfpast</span>
			</a>

			<nav class="nav" aria-label="Main">
				<ThemeToggle />

				{#if data.user}
					<a
						class="nav-link"
						href={resolve('/manage')}
						aria-current={onManage ? 'page' : undefined}
					>
						{data.user.name}
					</a>
				{:else}
					<a class="nav-link" href={resolve('/sign-in')}>Sign in</a>
				{/if}
			</nav>
		</div>
	</header>

	<main id="main" class="main">
		<!--
			ONE BOUNDARY FOR THE WHOLE APP
			==============================

			With Svelte's async mode, `await` inside a `$derived` — which is how
			every page in this app reads its data — suspends the nearest
			`<svelte:boundary>` *above* it. A boundary cannot catch its own
			component's script-level awaits, so it lives here, in the layout,
			wrapping the page. Every page then gets the same error handling without
			having to remember to provide it.

			DELIBERATELY NO `pending` SNIPPET, and this is the part worth knowing.

			A `pending` snippet is rendered *immediately* on the server and the
			awaits inside are not waited for. Add one here and every page ships HTML
			whose entire body is the word "Loading…", with the real content arriving
			only after hydration. For a public booking page that is the difference
			between a search engine seeing a salon's services and seeing nothing,
			and between a slow phone showing prices at first paint or a second later.

			Without it, SvelteKit waits for the awaits to settle and sends complete
			HTML. On subsequent client-side navigations Svelte keeps the current page
			on screen until the next one is ready — which is better than a spinner
			anyway. Where a page needs a local "working…" state, it uses
			`$effect.pending()` or a form's own `pending` count instead.
		-->
		<svelte:boundary>
			{@render children()}

			{#snippet failed(error, reset)}
				<div class="container-narrow section">
					<div class="failure" role="alert">
						<h1>Something went wrong</h1>
						<p>
							{messageFrom(error, 'We could not load this page.')}
						</p>
						<button type="button" onclick={reset}>Try again</button>
					</div>
				</div>
			{/snippet}
		</svelte:boundary>
	</main>

	<footer class="footer">
		<div class="container footer-inner">
			<p class="footer-note">
				Halfpast — appointment booking for people who would rather be cutting hair.
			</p>
			<p class="footer-note text-faint">
				Built with SvelteKit 3 as a teaching project. Times shown in your own time zone.
			</p>
		</div>
	</footer>
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.header {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--z-header);

		background: color-mix(in oklab, var(--paper) 85%, transparent);
		border-block-end: var(--border) solid var(--line);

		/*
		 * The blur is applied only where it is supported AND cheap. On a browser
		 * without `backdrop-filter` the 85% background is already legible, so
		 * nothing is lost — this is progressive enhancement in three lines.
		 */
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}

	.header-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		min-height: 4rem;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--ink);
		text-decoration: none;
		font-family: var(--font-display);
		font-weight: var(--weight-bold);
		font-size: var(--text-md);
		letter-spacing: var(--tracking-tight);
	}

	.brand:hover {
		color: var(--accent);
	}

	.nav {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.nav-link {
		color: var(--ink-muted);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		max-width: 12ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nav-link:hover,
	.nav-link[aria-current='page'] {
		color: var(--ink);
		background: var(--surface-sunken);
	}

	.main {
		flex: 1;
	}

	.failure {
		padding: var(--space-6);
		background: var(--danger-soft);
		border: var(--border) solid var(--danger-line);
		border-radius: var(--radius-lg);
	}

	.failure h1 {
		font-size: var(--text-lg);
		margin-block-end: var(--space-2);
	}

	.failure button {
		margin-block-start: var(--space-4);
		padding: var(--space-2) var(--space-4);
		min-height: 2.75rem;
		background: var(--surface);
		border: var(--border) solid var(--line-strong);
		border-radius: var(--radius-md);
		font-weight: var(--weight-medium);
	}

	.footer {
		margin-block-start: var(--space-8);
		border-block-start: var(--border) solid var(--line);
		padding-block: var(--space-6);
	}

	.footer-inner {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.footer-note {
		font-size: var(--text-sm);
		color: var(--ink-muted);
		max-width: none;
	}

	/* The brand word is the first thing to go when space is tight; the mark
	 * carries the identity on its own. */
	@media (max-width: 22rem) {
		.brand-name {
			display: none;
		}
	}
</style>
