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
	 * progress bar. The header lives one level down, in `(app)/+layout.svelte`,
	 * so that a page which must have *no* chrome — the embed, which lives in
	 * somebody else's iframe — can reset to this layout with a `+page@.svelte`.
	 */
	let { children } = $props();

	/**
	 * `onNavigate` returns a promise SvelteKit awaits before completing the
	 * navigation; wrapping it in `startViewTransition` gives the browser both
	 * states of the page and lets it cross-fade. A transition must never hold
	 * a navigation hostage, so it is released the moment the update callback
	 * runs, or after a third of a second, whichever is first.
	 */
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (prefersReducedMotion.current) return;
		if (document.visibilityState !== 'visible') return;

		return new Promise((resolve) => {
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
	<meta name="theme-color" content="#f7f7f5" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#111214" media="(prefers-color-scheme: dark)" />
</svelte:head>

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
