<script lang="ts">
	/*
	 * Fonts come from fontsource: each import is a stylesheet of `@font-face`
	 * rules with `unicode-range`, so a browser downloads the latin subset and
	 * nothing else. `standard.css` is Fraunces with both its weight and its
	 * optical-size axes; `hooks.server.ts` preloads exactly these two files.
	 */
	import '@fontsource-variable/fraunces/standard.css';
	import '@fontsource-variable/inter/index.css';
	import '#lib/styles/index.css';

	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { beforeNavigate, onNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { Toaster } from 'svelte-sonner';
	import { CheckCircleIcon, WarningCircleIcon } from 'phosphor-svelte';
	import { reducedMotion } from '#lib/motion/prefers.svelte.ts';
	import UpdateBanner from '#lib/ui/UpdateBanner.svelte';
	import { theme } from '#lib/ui/theme.svelte.ts';

	/*
	 * THE ROOT LAYOUT KNOWS NOBODY
	 * ============================
	 *
	 * No header here, and no `load`. The header shows who is signed in, and
	 * a layout that loads the signed-in person cannot sit above a prerendered
	 * page: the page is rendered once, at build time, with nobody signed in,
	 * and that answer is baked into its data. So the application pages live
	 * in the `(site)` group, which has the `load` and the header, and the
	 * guides — prerendered, shipped without JavaScript — live outside it with
	 * a chrome of their own that does not claim to know who you are.
	 *
	 * What is left here is what every page shares: fonts, the stylesheet, the
	 * theme, the toaster, view transitions, and the deploy banner.
	 */
	let { children } = $props();

	/*
	 * VIEW TRANSITIONS
	 * ----------------
	 * `onNavigate` runs before every client-side navigation. Wrapping the
	 * completion in `document.startViewTransition` lets the browser cross-fade
	 * the old page into the new one — and lets any element with a
	 * `view-transition-name` (a trip card becoming a trip header) morph.
	 * Browsers without the API get an ordinary navigation, and so do people
	 * who prefer reduced motion: for them no transition is started at all.
	 * Gating only the CSS is not enough — the browser's own default for a
	 * view transition is a 250ms cross-fade and a position-and-size morph
	 * of every named element, and those run unless something says
	 * otherwise. Not starting the transition is the only "otherwise" that
	 * covers all of them.
	 *
	 * SvelteKit 3 runs the navigation hooks for shallow routing too — a
	 * `goto(url, { shallow: true })` that only pushes `page.state` — and a
	 * cross-fade over a page that did not change is a flicker, so those are
	 * let through untouched. `navigation.shallow` is the flag Kit sets for
	 * exactly this check.
	 */
	onNavigate((navigation) => {
		if (navigation.shallow && navigation.type === 'goto') return;
		if (!document.startViewTransition || reducedMotion.current) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	/*
	 * A new version was deployed while this tab was open. Client-side
	 * navigation would ask for chunks that no longer exist, so the next
	 * navigation becomes a full page load. `version.pollInterval` in
	 * `vite.config.ts` is what makes `updated.current` flip.
	 *
	 * Not for a shallow `goto`, though: that asks for no chunk at all, and
	 * turning "open a dialog" into a reload because a deploy happened would
	 * lose whatever the person was typing. The next real navigation reloads.
	 */
	beforeNavigate(({ willUnload, to, shallow, type }) => {
		if (shallow && type === 'goto') return;
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});

	/*
	 * One attribute that says "the JavaScript is running". `onMount` in the
	 * root layout fires once the whole tree has hydrated, so anything that
	 * must wait for that — a stylesheet hiding a JavaScript-only control, or
	 * the end-to-end test that proves typing before hydration is safe — has
	 * something honest to wait for.
	 */
	onMount(() => {
		document.documentElement.dataset.hydrated = '';
	});

	/*
	 * WHERE A TOAST GOES
	 * ------------------
	 * On a phone, the bottom of the screen is where the stop sheet opens and
	 * closes, so a toast there ("Stop added") appeared under the sheet that
	 * was leaving. Toasts sit under the header instead, and move down by the
	 * banner's height when a deploy banner is up — the banner lives there too.
	 * On a wide screen the bottom-right corner is free, and that is where
	 * they go. svelte-sonner reads `mobileOffset`, not `offset`, below 600px,
	 * so the same value goes to both — or a phone's toast sat 16px from the
	 * top, over the brand and the menu button — and it names the top alone:
	 * a single value would push the sides in by a header's height too.
	 *
	 * The toaster is `unstyled`: the classes below are ours, in `base.css`,
	 * so a toast is a tier-3 surface like every other overlay. A success
	 * (`toast.success`) wears a check in `--ok`, an error a warning circle in
	 * `--coral`, both Phosphor like every other icon in the product. The
	 * list sits on `--z-toast`, above dialogs and below the skip link.
	 */
	const wide = new MediaQuery('(min-width: 48em)');
	/* Under the header on a narrow screen — top only; the sides keep the 16px gutter. */
	const offset = $derived(
		wide.current
			? 'var(--space-5)'
			: {
					top: updated.current
						? 'calc(var(--header-h) + 5.5rem)'
						: 'calc(var(--header-h) + var(--space-2))',
					right: 'var(--gutter)',
					left: 'var(--gutter)'
				}
	);
</script>

{@render children()}

<Toaster
	position={wide.current ? 'bottom-right' : 'top-center'}
	theme={theme.resolved}
	{offset}
	mobileOffset={offset}
	style="z-index: var(--z-toast)"
	duration={3200}
	visibleToasts={3}
	expand={false}
	closeButton={wide.current}
	toastOptions={{
		unstyled: true,
		classes: {
			toast: 'toast',
			title: 'toast__title',
			description: 'toast__desc',
			closeButton: 'toast__close',
			success: 'toast--ok',
			error: 'toast--error'
		}
	}}
>
	{#snippet successIcon()}<CheckCircleIcon size={18} weight="fill" aria-hidden="true" />{/snippet}
	{#snippet errorIcon()}<WarningCircleIcon size={18} weight="fill" aria-hidden="true" />{/snippet}
</Toaster>

{#if updated.current}
	<UpdateBanner />
{/if}

<style>
	:global(body) {
		display: flex;
		flex-direction: column;
	}

	/*
	 * The page cross-fades: the old one leaves fast (120ms, easing in), the
	 * new one arrives a little slower (200ms, easing out). The header is
	 * excluded: it has its own `view-transition-name`, and its group is told
	 * not to animate — the one element that should feel fixed stays fixed.
	 * Under reduced motion `onNavigate` above starts no transition, so none
	 * of this runs and the navigation is a cut; the media query is the
	 * second lock on the same door.
	 */
	@media (prefers-reduced-motion: no-preference) {
		:global(::view-transition-old(root)) {
			animation: 120ms var(--ease-in) both fade-out;
		}
		:global(::view-transition-new(root)) {
			animation: 200ms var(--ease-out) both fade-in;
		}
		:global(::view-transition-group(header)) {
			animation: none;
		}
		:global(::view-transition-group(trip-title)) {
			animation-duration: var(--dur-4);
		}
		/* The trip's panel: the old tab fades out, the new one rises 4px into place. */
		:global(::view-transition-old(trip-panel)) {
			animation: 120ms var(--ease-in) both fade-out;
		}
		:global(::view-transition-new(trip-panel)) {
			animation: 200ms var(--ease-out) both rise-in;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
	@keyframes fade-out {
		to {
			opacity: 0;
		}
	}
	@keyframes rise-in {
		from {
			opacity: 0;
			translate: 0 4px;
		}
	}
</style>
