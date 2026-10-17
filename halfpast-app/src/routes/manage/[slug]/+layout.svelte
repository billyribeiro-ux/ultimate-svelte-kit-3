<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		CalendarDotsIcon,
		ClockIcon,
		GearIcon,
		ScissorsIcon,
		UsersThreeIcon
	} from 'phosphor-svelte';
	import Button from '#lib/components/Button.svelte';
	import { signOut } from '../../sign-in/auth.remote.ts';
	import type { LayoutProps } from './$types';

	/*
	 * `LayoutProps` comes from the generated `./$types`, so `data` is exactly what
	 * this directory's `+layout.server.ts` returns and `params.slug` is the typed
	 * route parameter. Rename a key in the load and this file stops compiling.
	 */
	let { children, data, params }: LayoutProps = $props();

	/**
	 * The sections of the dashboard, by route ID.
	 *
	 * A route ID — `/manage/[slug]/hours` — rather than a path suffix glued onto
	 * a base URL. `resolve()` turns it into a link with `slug` filled in and
	 * type-checked, so renaming the `hours` folder fails svelte-check here
	 * instead of shipping a tab that 404s. And `page.route.id` says which
	 * section is open by the same name, so the active tab is one comparison,
	 * not a longest-prefix search over pathnames.
	 *
	 * `ownerOnly` drives what a member sees. Hiding a link is a courtesy, not a
	 * control — `requireOwner` on the server is the control. Both exist because
	 * showing somebody a door they cannot open is its own kind of rude.
	 */
	const SECTIONS = [
		{ route: '/manage/[slug]', label: 'Diary', icon: CalendarDotsIcon, ownerOnly: false },
		{ route: '/manage/[slug]/services', label: 'Services', icon: ScissorsIcon, ownerOnly: true },
		{ route: '/manage/[slug]/hours', label: 'Hours', icon: ClockIcon, ownerOnly: false },
		{ route: '/manage/[slug]/team', label: 'Team', icon: UsersThreeIcon, ownerOnly: true },
		{ route: '/manage/[slug]/settings', label: 'Settings', icon: GearIcon, ownerOnly: true }
	] as const;

	const visible = $derived(
		SECTIONS.filter((section) => !section.ownerOnly || data.viewer.role === 'owner')
	);
</script>

<div class="dash">
	<header class="dash-head container">
		<div class="identity">
			<p class="eyebrow">Managing</p>
			<h1>{data.business.name}</h1>
		</div>

		<div class="who">
			<span class="name">{data.viewer.displayName}</span>
			<span class="role">{data.viewer.role === 'owner' ? 'Owner' : 'Staff'}</span>
			<!--
				A form, so signing out is a POST that works with or without
				JavaScript and ends in a redirect the browser follows.
			-->
			<form {...signOut}>
				<Button type="submit" variant="ghost" size="sm" loading={signOut.pending > 0}>
					Sign out
				</Button>
			</form>
		</div>
	</header>

	<!--
		A horizontal scroller on a phone rather than a hamburger. Five short labels
		fit in a swipe; a menu behind a button costs a tap on every navigation and
		hides the shape of the app from somebody who has never seen it before.
	-->
	<nav class="tabs" aria-label="Dashboard sections">
		<div class="tabs-inner container">
			{#each visible as section (section.route)}
				{const Icon = $derived(section.icon)}
				{const active = $derived(page.route.id === section.route)}
				<a
					class={['tab', { active }]}
					href={resolve(section.route, { slug: params.slug })}
					aria-current={active ? 'page' : undefined}
				>
					<Icon weight={active ? 'fill' : 'regular'} aria-hidden="true" />
					{section.label}
				</a>
			{/each}
		</div>
	</nav>

	<div class="dash-body">
		{@render children()}
	</div>
</div>

<style>
	.dash {
		display: flex;
		flex-direction: column;
	}

	.dash-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		padding-block: var(--space-5) var(--space-4);
	}

	h1 {
		font-size: var(--text-lg);
		margin-block-start: var(--space-1);
	}

	.who {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: var(--text-sm);
	}

	.name {
		font-weight: var(--weight-medium);
	}

	.role {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--ink-muted);
		padding: 2px var(--space-2);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-pill);
	}

	.tabs {
		border-block-end: var(--border) solid var(--line);
		position: sticky;
		inset-block-start: 4rem;
		z-index: var(--z-sticky);
		background: color-mix(in oklab, var(--paper) 92%, transparent);
		backdrop-filter: blur(10px);
	}

	.tabs-inner {
		display: flex;
		gap: var(--space-1);
		overflow-x: auto;
		/* Hide the scrollbar but keep the scrolling. */
		scrollbar-width: none;
	}

	.tabs-inner::-webkit-scrollbar {
		display: none;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-3);
		white-space: nowrap;

		color: var(--ink-muted);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);

		border-block-end: var(--border-thick) solid transparent;
		transition:
			color var(--dur-fast) var(--ease-standard),
			border-color var(--dur-fast) var(--ease-standard);
	}

	.tab:hover {
		color: var(--ink);
	}

	.active {
		color: var(--accent);
		border-block-end-color: var(--accent);
	}

	.dash-body {
		padding-block: var(--space-5) var(--space-8);
	}
</style>
