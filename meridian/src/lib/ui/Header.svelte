<script lang="ts">
	import { page } from '$app/state';
	import { scrollY } from 'svelte/reactivity/window';
	import { CompassRoseIcon, ListIcon, PlusIcon, XIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import { signOut } from '#lib/remote/auth.remote.ts';
	import LocaleSwitcher from './LocaleSwitcher.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

	interface Props {
		user: { id: string; name: string } | null;
	}

	let { user }: Props = $props();

	/*
	 * `svelte/reactivity/window` exposes the window's scroll position as a
	 * reactive value with the listener managed for us — no `onMount`, no
	 * `removeEventListener`, and `undefined` on the server, where there is
	 * no window to ask.
	 */
	const scrolled = $derived((scrollY.current ?? 0) > 8);

	let open = $state(false);

	const isCurrent = (href: string) =>
		page.url.pathname === localizeHref(href) ||
		page.url.pathname.startsWith(localizeHref(href) + '/');
</script>

<!--
	`{const}` is a declaration tag: a value computed in the markup, scoped to
	the block it sits in, re-evaluated when its dependencies change. The links
	depend on whether somebody is signed in, and the header is the only place
	that needs the list — so the list lives here, not in the script.
-->
{const links = [
	...(user ? [{ href: '/trips', label: m.nav_trips() }] : []),
	{ href: '/explore', label: m.nav_explore() },
	{ href: '/guides', label: m.nav_guides() }
]}

<header class="header" class:header--scrolled={scrolled}>
	<div class="container header__row">
		<a class="brand" href={localizeHref('/')}>
			<CompassRoseIcon size={22} weight="duotone" aria-hidden="true" />
			<span>{m.app_name()}</span>
		</a>

		<nav id="primary-nav" class="nav" class:nav--open={open} aria-label="Primary">
			{#each links as link (link.href)}
				<a
					class="nav__link"
					href={localizeHref(link.href)}
					aria-current={isCurrent(link.href) ? 'page' : undefined}
					onclick={() => (open = false)}
				>
					{link.label}
				</a>
			{/each}

			<div class="nav__tools">
				<LocaleSwitcher />
				<ThemeToggle />
			</div>

			<div class="nav__account">
				{#if user}
					<a class="btn btn--primary btn--sm" href={localizeHref('/trips/new')}>
						<PlusIcon size={14} aria-hidden="true" />
						{m.nav_new_trip()}
					</a>
					<!-- A form, so signing out works with JavaScript off too. -->
					<form {...signOut}>
						<button class="btn btn--ghost btn--sm" type="submit" title={user.name}>
							{m.auth_sign_out()}
						</button>
					</form>
				{:else}
					<a class="btn btn--sm" href={localizeHref('/signin')}>{m.auth_sign_in()}</a>
				{/if}
			</div>
		</nav>

		<button
			class="btn btn--icon btn--ghost menu"
			type="button"
			aria-expanded={open}
			aria-controls="primary-nav"
			aria-label={m.nav_menu()}
			onclick={() => (open = !open)}
		>
			{#if open}
				<XIcon size={20} aria-hidden="true" />
			{:else}
				<ListIcon size={20} aria-hidden="true" />
			{/if}
		</button>
	</div>
</header>

<style>
	.header {
		position: sticky;
		top: 0;
		z-index: 30;
		background: color-mix(in oklab, var(--paper) 88%, transparent);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid transparent;
		transition: border-color var(--dur) var(--ease-out);
	}

	.header--scrolled {
		border-bottom-color: var(--line);
	}

	.header__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		min-height: var(--header-h);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 600;
		text-decoration: none;
		color: var(--ink);
	}

	.brand :global(svg) {
		color: var(--sea);
	}

	/* Mobile first: the nav is a sheet under the header, opened by the button. */
	.nav {
		display: none;
		position: absolute;
		inset-inline: 0;
		top: 100%;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--paper-2);
		border-bottom: 1px solid var(--line);
		box-shadow: var(--shadow-2);
	}

	.nav--open {
		display: flex;
	}

	.nav__link {
		text-decoration: none;
		color: var(--ink-2);
		font-weight: 500;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius-sm);
	}

	.nav__link:hover {
		color: var(--ink);
		background: var(--paper-3);
	}

	.nav__link[aria-current='page'] {
		color: var(--ink);
		background: var(--sea-soft);
	}

	.nav__tools,
	.nav__account {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	@media (min-width: 52em) {
		.nav {
			display: flex;
			position: static;
			flex-direction: row;
			align-items: center;
			gap: var(--space-2);
			padding: 0;
			background: none;
			border: 0;
			box-shadow: none;
		}

		.nav__tools {
			margin-inline-start: var(--space-3);
		}

		.nav__account {
			margin-inline-start: var(--space-2);
		}

		.menu {
			display: none;
		}
	}
</style>
