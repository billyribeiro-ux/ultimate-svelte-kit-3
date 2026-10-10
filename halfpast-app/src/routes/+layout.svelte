<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
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

				<!--
					Every link goes through `resolve()`, and always with a *route ID* — the
					spelling with the leading slash. SvelteKit 3 also accepts a bare pathname
					(`resolve('manage')`), and `sv migrate` rewrites parameterless links to
					that form. Both spellings are type-checked against the generated
					`$app/types`, and both fail svelte-check the moment `/manage` is renamed,
					so that is not the reason to prefer one. We keep the route ID everywhere
					because it is the one spelling that stays strict for every link: a
					parameterised link is `resolve('/manage/[slug]', { slug })`, with `slug`
					a required, typed param, whereas the pathname form only types it as
					"manage/" followed by any string, and would accept a hand-built path with
					the parameter missing. One spelling for all links, and the strictest one.
				-->
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
			NO BOUNDARY HERE, AND THAT IS DELIBERATE
			========================================

			With Svelte's async mode, `await` inside a `$derived` — which is how
			every page in this app reads its data — suspends the nearest
			`<svelte:boundary>` above it, and a rejection lands in that boundary's
			failed state. The nearest one is never in this file. SvelteKit 3 wraps
			every layout and page in a boundary of its own, armed with the nearest
			`+error.svelte`, so a boundary written around `children` here would sit
			outside the page's and never see a single error. This project had one,
			and its friendly failure card never once rendered. The app's failure
			screen is `src/routes/+error.svelte`.

			NO `pending` SNIPPET ABOVE A PAGE, EITHER, and this is the part worth
			knowing.

			A `pending` snippet is rendered *immediately* on the server and the
			awaits inside are not waited for. Put one on a boundary around the page
			and every page ships HTML whose entire body is the word "Loading…", with
			the real content arriving only after hydration. For a public booking page
			that is the difference between a search engine seeing a salon's services
			and seeing nothing, and between a slow phone showing prices at first
			paint or a second later.

			Without one, SvelteKit waits for the awaits to settle and sends complete
			HTML. On subsequent client-side navigations Svelte keeps the current page
			on screen until the next one is ready — which is better than a spinner
			anyway. Where a page needs a local "working…" state, it uses
			`$effect.pending()` or a form's own `pending` count instead.
		-->
		{@render children()}
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
