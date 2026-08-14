<!--
	SITE HEADER
	===========

	Sticky header with a desktop nav and, below 64em, a slide-in drawer.

	THE IMPORTANT DECISION HERE: the drawer is a native <dialog> opened with
	`showModal()`, not a <div> with a z-index.

	Hand-rolling a drawer means hand-rolling all of this:
	  - trapping Tab inside it so focus can't wander behind the overlay
	  - closing on Escape
	  - making the rest of the page inert to screen readers
	  - restoring focus to the trigger button on close
	  - a backdrop that isn't in the normal stacking context

	Every one of those is a bug people ship. `showModal()` gives you all six from the
	browser, correctly, in about four lines. The only thing we add is closing on
	navigation, because the browser has no way to know a client-side route changed.
-->

<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { scrollY } from 'svelte/reactivity/window';
	import { ListIcon, XIcon, ArrowRightIcon } from 'phosphor-svelte';

	import { primaryNav, type StaticRoute } from '#lib/data/nav.ts';
	import Logo from '#lib/components/ui/Logo.svelte';
	import Button from '#lib/components/ui/Button.svelte';

	/**
	 * `$state` on a DOM node lets `bind:this` write to it reactively. Starts null
	 * because the element doesn't exist until after the first render — on the server
	 * it stays null forever, which is why every use below is optional-chained.
	 */
	let drawer = $state<HTMLDialogElement | null>(null);
	let isOpen = $state(false);

	/**
	 * `scrollY` from `svelte/reactivity/window` is a reactive wrapper around
	 * `window.scrollY`. It attaches its listener lazily — only while something is
	 * actually reading `.current` — and cleans up on its own. Better than an
	 * `$effect` with addEventListener, and it's SSR-safe: `.current` is `undefined`
	 * on the server rather than throwing.
	 */
	const isScrolled = $derived((scrollY.current ?? 0) > 8);

	function openDrawer() {
		drawer?.showModal();
		isOpen = true;
	}

	function closeDrawer() {
		drawer?.close();
	}

	/**
	 * The dialog fires `close` however it was closed — our button, the Escape key,
	 * or a backdrop click. Syncing state here rather than in `closeDrawer` means we
	 * can't get out of sync when the browser closes it behind our back.
	 */
	function handleClose() {
		isOpen = false;
	}

	/**
	 * Close on navigation.
	 *
	 * Without this, tapping a link in the drawer changes the page underneath while
	 * the drawer stays open on top of it — a classic SPA bug.
	 */
	afterNavigate(() => {
		if (drawer?.open) drawer.close();
	});

	/**
	 * Is this link the page we're on?
	 *
	 * The `startsWith` branch handles section highlighting: /blog stays marked as
	 * current while you're reading /blog/some-post.
	 *
	 * `resolve()` rather than the raw string, because it applies the configured base
	 * path. Hardcoding "/features" breaks the moment the site is deployed under a
	 * subdirectory.
	 */
	function isCurrent(href: StaticRoute): boolean {
		const target = resolve(href);
		const here = page.url.pathname;
		if (target === resolve('/')) return here === target;
		return here === target || here.startsWith(`${target}/`);
	}
</script>

<header class="header" class:header--scrolled={isScrolled}>
	<div class="header__inner container container--wide">
		<a class="header__brand" href={resolve('/')} aria-label="StrikeFlow — home">
			<Logo size={1.5} />
		</a>

		<!--
			Desktop navigation. Hidden below 64em via CSS rather than removed from the
			DOM, so there's exactly one nav in the markup for a crawler to follow.
		-->
		<nav class="header__nav" aria-label="Main">
			<ul class="header__nav-list" role="list">
				{#each primaryNav as link (link.href)}
					<li>
						<a
							class="header__nav-link"
							class:is-current={isCurrent(link.href)}
							href={resolve(link.href)}
							aria-current={isCurrent(link.href) ? 'page' : undefined}
						>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="header__actions">
			<div class="header__cta">
				<Button href={resolve('/guide')} variant="primary" size="sm">
					Free guide
					{#snippet iconTrailing()}<ArrowRightIcon />{/snippet}
				</Button>
			</div>

			<button
				class="header__toggle"
				type="button"
				onclick={openDrawer}
				aria-expanded={isOpen}
				aria-haspopup="dialog"
				aria-label="Open navigation menu"
			>
				<ListIcon size={24} aria-hidden="true" />
			</button>
		</div>
	</div>
</header>

<!--
	THE DRAWER.

	It lives outside <header> because a modal dialog is conceptually top-level, not
	part of the header's document structure.
-->
<dialog bind:this={drawer} class="drawer" onclose={handleClose} aria-label="Navigation menu">
	<div class="drawer__panel">
		<div class="drawer__head">
			<Logo size={1.375} />
			<button
				class="drawer__close"
				type="button"
				onclick={closeDrawer}
				aria-label="Close navigation menu"
			>
				<XIcon size={22} aria-hidden="true" />
			</button>
		</div>

		<nav aria-label="Mobile">
			<ul class="drawer__list" role="list">
				{#each primaryNav as link (link.href)}
					<li>
						<a
							class="drawer__link"
							href={resolve(link.href)}
							aria-current={isCurrent(link.href) ? 'page' : undefined}
						>
							<span class="drawer__link-label">{link.label}</span>
							{#if link.description}
								<span class="drawer__link-desc">{link.description}</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="drawer__foot">
			<Button href={resolve('/guide')} variant="primary" size="lg" fullWidth>
				Get the free guide
				{#snippet iconTrailing()}<ArrowRightIcon />{/snippet}
			</Button>
			<Button href={resolve('/pricing')} variant="secondary" size="lg" fullWidth>
				See pricing
			</Button>
		</div>
	</div>
</dialog>

<style>
	/* ---------------------------------------------------------------
	 * HEADER
	 * --------------------------------------------------------------- */
	.header {
		position: sticky;
		top: 0;
		z-index: var(--z-header);
		/* Transparent at the top of the page, solid once scrolled — so the hero
		   reads as full-bleed but text never collides with the nav. */
		background-color: transparent;
		border-bottom: 1px solid transparent;
		transition:
			background-color var(--dur-base) var(--ease-out),
			border-color var(--dur-base) var(--ease-out);
	}

	.header--scrolled {
		background-color: color-mix(in srgb, var(--bg-root) 82%, transparent);
		border-bottom-color: var(--border);
		/* Guarded: backdrop-filter is expensive on low-end devices and unsupported
		   in a few engines. @supports means those get a solid bar instead of nothing. */
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}

	@supports not (backdrop-filter: blur(12px)) {
		.header--scrolled {
			background-color: var(--bg-root);
		}
	}

	.header__inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		height: var(--header-height);
	}

	.header__brand {
		text-decoration: none;
		flex-shrink: 0;
	}

	/* Mobile-first: the desktop nav is hidden by default and revealed at 64em. */
	.header__nav {
		display: none;
	}

	.header__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* The header CTA is hidden on the smallest screens — the drawer carries it,
	   and a cramped header with two competing tap targets converts worse. */
	.header__cta {
		display: none;
	}

	.header__toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* 44px minimum touch target — WCAG 2.5.8. */
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-md);
		color: var(--text-primary);
		border: 1px solid var(--border);
		background-color: var(--surface);
	}

	@media (min-width: 30em) {
		.header__cta {
			display: block;
		}
	}

	@media (min-width: 64em) {
		.header__nav {
			display: block;
		}

		.header__toggle {
			display: none;
		}

		.header__nav-list {
			display: flex;
			align-items: center;
			gap: var(--space-2);
		}

		.header__nav-link {
			display: inline-block;
			padding: var(--space-2) var(--space-3);
			border-radius: var(--radius-md);
			font-family: var(--font-heading);
			font-size: var(--fs-sm);
			font-weight: var(--weight-medium);
			color: var(--text-secondary);
			text-decoration: none;
			transition: color var(--dur-fast) var(--ease-out);
		}

		.header__nav-link:hover {
			color: var(--text-primary);
		}

		.header__nav-link.is-current {
			color: var(--text-primary);
			background-color: var(--surface-raised);
		}
	}

	/* ---------------------------------------------------------------
	 * DRAWER
	 * --------------------------------------------------------------- */

	/*
	 * A <dialog> opened with showModal() lives in the browser's "top layer" — above
	 * every z-index on the page, regardless of stacking contexts. That's why there's
	 * no z-index here and why it can't be trapped behind a transformed ancestor,
	 * which is the bug that eventually kills every hand-rolled modal.
	 */
	.drawer {
		margin: 0 0 0 auto; /* pin to the right edge */
		padding: 0;
		border: none;
		width: min(22rem, 88vw);
		max-width: none;
		height: 100%;
		max-height: 100%;
		background-color: var(--surface);
		border-left: 1px solid var(--border);
		color: var(--text-secondary);
		overflow: hidden;
	}

	.drawer::backdrop {
		background-color: rgb(0 0 0 / 0.65);
		backdrop-filter: blur(2px);
	}

	/* `[open]` is set by the browser, so we get the animation without tracking state. */
	.drawer[open] {
		animation: slide-in var(--dur-slow) var(--ease-out);
	}

	.drawer[open]::backdrop {
		animation: fade-in var(--dur-base) var(--ease-out);
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.drawer__panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		/* Respects the iOS home indicator and notch. */
		padding: var(--space-4) var(--space-5) max(var(--space-5), env(safe-area-inset-bottom));
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.drawer__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding-block-end: var(--space-5);
		border-bottom: 1px solid var(--border);
	}

	.drawer__close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		margin-inline-end: calc(var(--space-2) * -1);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
	}

	.drawer__list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding-block: var(--space-4);
	}

	.drawer__link {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		text-decoration: none;
		min-height: 2.75rem;
		justify-content: center;
	}

	.drawer__link[aria-current='page'] {
		background-color: var(--surface-raised);
	}

	.drawer__link-label {
		font-family: var(--font-heading);
		font-size: var(--fs-md);
		font-weight: var(--weight-semibold);
		color: var(--text-primary);
	}

	.drawer__link-desc {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: var(--lh-normal);
	}

	.drawer__foot {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		/* Pushes the CTAs to the bottom of the panel regardless of link count. */
		margin-block-start: auto;
		padding-block-start: var(--space-5);
		border-top: 1px solid var(--border);
	}
</style>
