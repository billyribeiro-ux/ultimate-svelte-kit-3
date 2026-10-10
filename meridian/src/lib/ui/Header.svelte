<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { MediaQuery } from 'svelte/reactivity';
	import { scrollY } from 'svelte/reactivity/window';
	import { CompassRoseIcon, ListIcon, PlusIcon, XIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
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

	let nav = $state<HTMLElement>();
	let menuButton = $state<HTMLButtonElement>();

	/*
	 * THE SHEET BEHAVES LIKE A DIALOG
	 * -------------------------------
	 * On a phone the nav is a sheet over the page, so it owes the page the
	 * courtesies a dialog owes it: focus moves to the first link when it
	 * opens and back to the button when it closes; Escape closes it; the
	 * page behind it is `inert` while it is up, so a swipe or a tab cannot
	 * reach a control under the scrim. `inert` is set on `<main>` and the
	 * footer rather than on `<body>`, because the header itself — the button
	 * that closes the sheet — has to stay live.
	 *
	 * The sheet only exists below 48em. Widen the window past that with it
	 * open — an iPad turned from portrait to landscape — and the button that
	 * would close it is gone, so the sheet closes itself, and the page it
	 * made inert comes back. `open` is an assignable `$derived` for that: the
	 * menu button writes it, and crossing the 48em line, either way,
	 * derives it afresh — closed. No effect has to notice and write it back.
	 */
	const wide = new MediaQuery('(min-width: 48em)');

	let open = $derived.by(() => {
		void wide.current;
		return false;
	});

	$effect(() => {
		const behind = document.querySelectorAll<HTMLElement>('main, footer');
		const blocked = open && !wide.current;
		for (const element of behind) element.inert = blocked;
		return () => {
			for (const element of behind) element.inert = false;
		};
	});

	async function toggle() {
		open = !open;
		await tick();
		if (open) nav?.querySelector<HTMLElement>('a, button')?.focus();
		else menuButton?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') void toggle();
	}

	// A navigation closes the sheet whatever caused it: a link in it, the back button, the palette.
	afterNavigate(() => {
		open = false;
	});

	// The links are already localised (see `#lib/href.ts`), so this compares
	// pathnames as the browser sees them: `/de/trips` against `/de/trips/…`.
	const isCurrent = (target: string) =>
		page.url.pathname === target || page.url.pathname.startsWith(target + '/');

	/*
	 * The header does not offer what the page already is. On the trips list
	 * the page's own "New trip" is a hundred pixels below, and on the new
	 * trip form it is the page; on the sign-in and sign-up pages, "Sign in"
	 * is the form you are looking at. One accent, spent once.
	 */
	const onTrips = $derived(
		page.route.id === '/(site)/(app)/trips' || page.route.id === '/(site)/(app)/trips/new'
	);
	const onAuth = $derived(
		page.route.id === '/(site)/(auth)/signin' || page.route.id === '/(site)/(auth)/signup'
	);
</script>

<svelte:window {onkeydown} />

<!--
	`{const}` is a declaration tag: a value computed in the markup, scoped to
	the block it sits in, re-evaluated when its dependencies change. The links
	depend on whether somebody is signed in, and the header is the only place
	that needs the list — so the list lives here, not in the script.
-->
{const links = [
	...(user ? [{ href: href('/(site)/(app)/trips'), label: m.nav_trips() }] : []),
	{ href: href('/(site)/explore'), label: m.nav_explore() },
	{ href: href('/guides'), label: m.nav_guides() }
]}

<header class="header" class:header--scrolled={scrolled}>
	<div class="container header__row">
		<a class="brand" href={href('/(site)')}>
			<CompassRoseIcon size={22} weight="duotone" aria-hidden="true" />
			<span>{m.app_name()}</span>
		</a>

		<nav id="primary-nav" class="nav" class:nav--open={open} aria-label="Primary" bind:this={nav}>
			{#each links as link, i (link.href)}
				<!-- `--i` staggers the links' arrival on the phone sheet, 30ms apart. -->
				<a
					class="nav__link"
					style:--i={i}
					href={link.href}
					aria-current={isCurrent(link.href) ? 'page' : undefined}
				>
					{link.label}
				</a>
			{/each}

			<div class="nav__tools" style:--i={links.length}>
				<LocaleSwitcher compact />
				<ThemeToggle />
			</div>

			<div class="nav__account" style:--i={links.length + 1}>
				{#if user}
					{#if !onTrips}
						<a class="btn btn--primary" href={href('/(site)/(app)/trips/new')}>
							<PlusIcon size={16} aria-hidden="true" />
							{m.nav_new_trip()}
						</a>
					{/if}
					<!-- A form, so signing out works with JavaScript off too. -->
					<form {...signOut}>
						<button class="btn btn--ghost" type="submit" title={user.name}>
							{m.auth_sign_out()}
						</button>
					</form>
				{:else if !onAuth}
					<a class="btn" href={href('/(site)/(auth)/signin')}>{m.auth_sign_in()}</a>
				{/if}
			</div>
		</nav>

		<button
			class="btn btn--icon btn--ghost menu"
			type="button"
			aria-expanded={open}
			aria-controls="primary-nav"
			aria-label={m.nav_menu()}
			onclick={toggle}
			bind:this={menuButton}
		>
			{#if open}
				<XIcon size={20} aria-hidden="true" />
			{:else}
				<ListIcon size={20} aria-hidden="true" />
			{/if}
		</button>
	</div>
</header>

<!--
	The sheet's scrim. Outside the header on purpose: the header's
	`backdrop-filter` makes it the containing block of anything fixed inside
	it, so a scrim in there could not reach the bottom of the screen. It
	sits just under the header's layer and covers only what is below the
	header; a tap on it closes the sheet. Decorative to a screen reader —
	the page under it is `inert`, which is what a screen reader hears.
-->
<div class="nav-scrim" class:nav-scrim--open={open} aria-hidden="true" onclick={toggle}></div>

<style>
	/*
	 * The one translucent surface in the product. `view-transition-name`
	 * takes the header out of the page cross-fade (the root layout tells
	 * its group not to animate), so it is the fixed point every navigation
	 * happens around. The hairline appears when the page has scrolled, with
	 * no transition: a border that fades in is a border nobody saw arrive.
	 */
	.header {
		position: sticky;
		top: 0;
		z-index: var(--z-header);
		background: color-mix(in oklab, var(--paper) 86%, transparent);
		backdrop-filter: blur(14px) saturate(1.2);
		border-bottom: 1px solid transparent;
		view-transition-name: header;
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
		letter-spacing: -0.01em;
		text-decoration: none;
		color: var(--ink);
	}

	.brand :global(svg) {
		color: var(--sea);
	}

	/*
	 * Mobile first: the nav is a tier-3 sheet under the header. It is always
	 * in the DOM (so `aria-controls` points at something) and hidden with
	 * `visibility` plus a `clip-path` that reveals it from the top — an
	 * animation of a mask, not of layout. The links fade in 30ms apart.
	 */
	.nav {
		position: absolute;
		inset-inline: 0;
		top: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3) var(--gutter) var(--space-5);
		background: var(--paper-4);
		border-bottom: 1px solid var(--line);
		box-shadow: var(--shadow-3), var(--ring-hairline);
		z-index: var(--z-dialog);
		visibility: hidden;
		clip-path: inset(0 0 100% 0);
		transition:
			clip-path var(--dur-2) var(--ease-in),
			visibility 0s linear var(--dur-2);
	}

	.nav--open {
		visibility: visible;
		clip-path: inset(0);
		transition: clip-path var(--dur-3) var(--ease-out);
	}

	.nav > * {
		opacity: 0;
		transition: opacity var(--dur-2) var(--ease-out);
	}

	.nav--open > * {
		opacity: 1;
		transition-delay: calc(var(--i, 0) * 30ms);
	}

	.nav__link {
		display: flex;
		align-items: center;
		min-height: var(--control);
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--ink-2);
		font-weight: 500;
		font-size: var(--text-md);
	}

	/* `background-color`, not `background`: the shorthand would also wipe the current link's painted bar. */
	.nav__link:hover {
		color: var(--ink);
		background-color: var(--paper-3);
	}

	/*
	 * The current page is a mark, not a button: never a filled pill. In the
	 * sheet each link is a full-width row, and an underline across a whole
	 * row reads as a text field, so there it is a 2px bar on the leading
	 * edge; in the inline row from 48em it is the 2px underline. Both are
	 * painted as a background image rather than an inset shadow, which
	 * follows the rounded corners — the underline curled up at its ends
	 * and the bar drew a hairline along the row's top edge.
	 */
	.nav__link[aria-current='page'] {
		color: var(--ink);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		background-image: linear-gradient(var(--sea), var(--sea));
		background-repeat: no-repeat;
		background-position: left;
		background-size: 2px 100%;
	}

	.nav__tools,
	.nav__account {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding-block-start: var(--space-3);
	}

	/*
	 * The page under the sheet dims, as it does under every other tier-3
	 * overlay — without it the page stayed at full contrast below the
	 * sheet's edge, a heading cut in half, and the sheet read as part of
	 * the page. Under the header's layer, so the sheet (inside the header)
	 * is above it. Same timing as the sheet: in over 240ms, out over 160.
	 */
	.nav-scrim {
		position: fixed;
		inset: var(--header-h) 0 0;
		z-index: calc(var(--z-header) - 1);
		background: var(--scrim);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--dur-2) var(--ease-in),
			visibility 0s linear var(--dur-2);
	}

	.nav-scrim--open {
		opacity: 1;
		visibility: visible;
		transition: opacity var(--dur-3) var(--ease-out);
	}

	@media (min-width: 48em) {
		.nav {
			position: static;
			flex-direction: row;
			align-items: center;
			gap: var(--space-1);
			padding: 0;
			background: none;
			border: 0;
			box-shadow: none;
			visibility: visible;
			clip-path: none;
			transition: none;
		}

		.nav > * {
			opacity: 1;
			transition: none;
		}

		.nav__link {
			min-height: 0;
			font-size: var(--text-sm);
		}

		.nav__link[aria-current='page'] {
			border-radius: var(--radius-sm);
			background-position: bottom;
			background-size: 100% 2px;
		}

		.nav__tools,
		.nav__account {
			padding-block-start: 0;
			flex-wrap: nowrap;
		}

		.nav__tools {
			margin-inline-start: var(--space-3);
		}

		.nav__account {
			margin-inline-start: var(--space-2);
		}

		.menu,
		.nav-scrim {
			display: none;
		}
	}
</style>
