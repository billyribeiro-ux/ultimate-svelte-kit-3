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
	import { beforeNavigate, onNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { Toaster } from 'svelte-sonner';
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
	 * Browsers without the API, and people who prefer reduced motion (the
	 * CSS turns the animation off), get an ordinary navigation.
	 */
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
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
	 */
	beforeNavigate(({ willUnload, to }) => {
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
</script>

{@render children()}

<Toaster position="bottom-center" theme={theme.resolved} richColors closeButton />

{#if updated.current}
	<UpdateBanner />
{/if}

<style>
	:global(body) {
		display: flex;
		flex-direction: column;
	}

	@media (prefers-reduced-motion: no-preference) {
		:global(::view-transition-old(root)) {
			animation: 160ms var(--ease-out) both fade-out;
		}
		:global(::view-transition-new(root)) {
			animation: 220ms var(--ease-out) both fade-in;
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
</style>
