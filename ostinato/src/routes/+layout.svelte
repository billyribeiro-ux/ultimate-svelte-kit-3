<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import { navigating } from '$app/state';
	import { prefersReducedMotion } from 'svelte/motion';

	/**
	 * THE ROOT LAYOUT
	 * ===============
	 *
	 * Deliberately almost empty: the stylesheet, the view transitions, and a
	 * progress bar. The header and navigation live one level down, in
	 * `(app)/+layout.svelte`, so that a page which must have *no* chrome — the
	 * embed demo, which pretends to be somebody else's site — can reset to this
	 * layout with a `+page@.svelte` and get exactly what a host page would.
	 */
	let { children } = $props();

	/**
	 * VIEW TRANSITIONS
	 * ================
	 *
	 * `onNavigate` returns a promise SvelteKit awaits before completing the
	 * navigation, so wrapping it in `startViewTransition` gives the browser both
	 * states of the page and lets it cross-fade between them. The default
	 * cross-fade, the default duration, and nothing else: an instrument is used
	 * for hours, and a transition that is *noticeable* is annoying by lunchtime.
	 *
	 * Two guards. Browsers without the API simply navigate, which is the right
	 * fallback and needs no polyfill. Somebody who asked for reduced motion has
	 * asked for this too — `prefersReducedMotion` is that media query as a
	 * reactive value — and honouring it here means the transition is never
	 * started, which avoids the flash that `animation: none` on a running one
	 * produces.
	 */
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (prefersReducedMotion.current) return;
		if (document.visibilityState !== 'visible') return;

		return new Promise((resolve) => {
			/*
			 * A transition must never hold a navigation hostage. The navigation is
			 * released the moment the update callback runs, or when the transition
			 * reports it cannot start, or after a third of a second — whichever
			 * comes first. The transition is decoration; the navigation is the
			 * product. (While chasing a flaky back navigation this guard was the
			 * first suspect and turned out to be innocent — the cause was
			 * `forkPreloads`, see `vite.config.ts` — but a guard that costs nothing
			 * and rules out a whole class of hang is worth keeping.)
			 */
			const fallback = setTimeout(resolve, 300);
			let transition: ViewTransition;
			try {
				transition = document.startViewTransition(async () => {
					clearTimeout(fallback);
					resolve();
					await navigation.complete;
				});
			} catch {
				clearTimeout(fallback);
				resolve();
				return;
			}
			transition.ready.catch(() => {
				clearTimeout(fallback);
				resolve();
			});
		});
	});
</script>

<svelte:head>
	<!-- The colour the phone paints around the page — the address bar — which otherwise stays white above a dark app. -->
	<meta name="theme-color" content="#0b0b0f" media="(prefers-color-scheme: dark)" />
	<meta name="theme-color" content="#f4f2ee" media="(prefers-color-scheme: light)" />
</svelte:head>

<!--
	`navigating` from `$app/state` is `null` between navigations and an object
	— with `from`, `to` and `type` — during one. A two-pixel bar is all the
	feedback a navigation needs, and it is there for the ones that wait on a
	remote query.
-->
{#if navigating.to}
	<div class="progress" role="progressbar" aria-label="Loading {navigating.to.url.pathname}"></div>
{/if}

{@render children()}

<style>
	.progress {
		position: fixed;
		top: 0;
		left: 0;
		z-index: var(--z-toast);
		height: 2px;
		width: 100%;
		background: linear-gradient(90deg, transparent, var(--accent), transparent);
		background-size: 50% 100%;
		animation: sweep 1s linear infinite;
	}

	@keyframes sweep {
		from {
			background-position: -50% 0;
		}
		to {
			background-position: 150% 0;
		}
	}
</style>
