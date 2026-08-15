<script lang="ts">
	import type { Snippet } from 'svelte';
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
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	/**
	 * The sections of the dashboard.
	 *
	 * `ownerOnly` drives what a member sees. Hiding a link is a courtesy, not a
	 * control — `requireOwner` on the server is the control. Both exist because
	 * showing somebody a door they cannot open is its own kind of rude.
	 */
	const SECTIONS = [
		{ path: '', label: 'Diary', icon: CalendarDotsIcon, ownerOnly: false },
		{ path: '/services', label: 'Services', icon: ScissorsIcon, ownerOnly: true },
		{ path: '/hours', label: 'Hours', icon: ClockIcon, ownerOnly: false },
		{ path: '/team', label: 'Team', icon: UsersThreeIcon, ownerOnly: true },
		{ path: '/settings', label: 'Settings', icon: GearIcon, ownerOnly: true }
	] as const;

	const visible = $derived(
		SECTIONS.filter((section) => !section.ownerOnly || data.viewer.role === 'owner')
	);

	const base = $derived(resolve('/manage/[slug]', { slug: data.slug }));

	/**
	 * Longest-match wins, so `/hours` does not light up while you are on the
	 * diary. Comparing with `startsWith` alone would mark the diary tab active on
	 * every page, because its path is a prefix of all the others.
	 */
	const current = $derived(page.url.pathname);
	const activePath = $derived.by(() => {
		const suffix = current.startsWith(base) ? current.slice(base.length) : '';
		const match = visible
			.filter((section) => section.path !== '' && suffix.startsWith(section.path))
			.sort((a, b) => b.path.length - a.path.length)[0];
		return match?.path ?? '';
	});
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
			<Button variant="ghost" size="sm" onclick={() => void signOut()}>Sign out</Button>
		</div>
	</header>

	<!--
		A horizontal scroller on a phone rather than a hamburger. Five short labels
		fit in a swipe; a menu behind a button costs a tap on every navigation and
		hides the shape of the app from somebody who has never seen it before.
	-->
	<nav class="tabs" aria-label="Dashboard sections">
		<div class="tabs-inner container">
			{#each visible as section (section.path)}
				{@const Icon = section.icon}
				{@const active = activePath === section.path}
				<a
					class="tab"
					class:active
					href="{base}{section.path}"
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
