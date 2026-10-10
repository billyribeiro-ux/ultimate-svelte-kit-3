<script lang="ts">
	import { Canvas } from '@threlte/core';
	import type { FeatureCollection, Geometry } from 'geojson';
	import { PauseIcon, PlayIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { reducedMotion } from '#lib/motion/prefers.svelte.ts';
	import Scene, { type GlobeStop } from './Scene.svelte';

	/**
	 * THE GLOBE
	 * =========
	 *
	 * The frame around the scene: it loads the coastlines, holds the two
	 * bits of state the scene does not own — is the camera flying, does this
	 * person prefer reduced motion — and draws the buttons.
	 *
	 * This component is imported with a dynamic `import()` from the trip
	 * page, in the browser only. Three.js is the largest dependency in the
	 * project by a distance, and a person who never opens the globe tab
	 * never downloads it.
	 */
	interface Props {
		stops: readonly GlobeStop[];
		selected: string | null;
		onselect: (id: string) => void;
	}

	let { stops, selected, onselect }: Props = $props();

	/*
	 * `reducedMotion` is the app's one `MediaQuery` for the setting (see
	 * `src/lib/motion/prefers.svelte.ts`): a reactive value, so when the
	 * operating system setting changes, `current` changes, and the scene
	 * stops animating without a reload.
	 */
	let flying = $state(false);

	/* The canvas fades in over 700ms once the scene has drawn its first frame; before that the frame is already night. */
	let ready = $state(false);

	/* The coastlines: the same prerendered file the map reads. */
	async function loadWorld(): Promise<FeatureCollection<Geometry>> {
		const response = await fetch('/api/world.json');
		if (!response.ok) throw new Error(`world.json answered ${response.status}`);
		return (await response.json()) as FeatureCollection<Geometry>;
	}
</script>

<div class="globe">
	<svelte:boundary>
		{#snippet pending()}
			<p class="globe__status">{m.globe_loading()}</p>
		{/snippet}
		{#snippet failed(error, reset)}
			<p class="globe__status issue">
				{error instanceof Error ? error.message : m.error_title()}
				<button class="btn btn--sm" type="button" onclick={reset}>{m.live_reconnect()}</button>
			</p>
		{/snippet}

		{const world = await loadWorld()}

		<div class="globe__canvas" data-ready={ready ? '' : undefined}>
			<Canvas>
				<Scene
					{stops}
					{selected}
					{world}
					{flying}
					reduced={reducedMotion.current}
					{onselect}
					onlanded={() => (flying = false)}
					onfirstframe={() => (ready = true)}
				/>
			</Canvas>
		</div>
	</svelte:boundary>

	<div class="globe__controls cluster cluster--between no-print">
		{#if reducedMotion.current}
			<p class="hint">{m.globe_static()}</p>
		{:else if stops.length > 1}
			<button
				class="btn btn--primary btn--sm"
				type="button"
				aria-pressed={flying}
				onclick={() => (flying = !flying)}
			>
				{#if flying}
					<PauseIcon size={16} aria-hidden="true" />
					{m.globe_stop()}
				{:else}
					<PlayIcon size={16} aria-hidden="true" />
					{m.globe_fly()}
				{/if}
			</button>
		{:else}
			<p class="hint">{m.route_none()}</p>
		{/if}
		<p class="hint">{m.globe_hint()}</p>
	</div>
</div>

<style>
	/*
	 * Always night. The globe is the one place the product allows itself a
	 * dark frame on a cream page, and the frame is the same colour in both
	 * themes — the `--night` tokens, which the trip page paints before this
	 * chunk arrives, so the tab never flashes. The hairline that sits the
	 * night box on paper like a framed print is on that frame, not here, so
	 * there is exactly one. The controls have a row of their own under the
	 * canvas, so the globe is centred in what is visible, never behind them.
	 */
	.globe {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		height: 100%;
		min-height: 20rem;
		border-radius: inherit;
		overflow: hidden;
		background: var(--night);
		color: var(--night-ink);
	}

	.globe__canvas {
		min-height: 0;
		opacity: 0;
		transition: opacity var(--dur-5) var(--ease-out);
	}

	.globe__canvas[data-ready] {
		opacity: 1;
	}

	.globe__status {
		display: grid;
		place-items: center;
		gap: var(--space-2);
		padding: var(--space-6);
		color: var(--night-ink);
		font-size: var(--text-sm);
	}

	.globe__controls {
		padding: var(--space-3) var(--space-4);
		background: var(--night-raised);
	}

	/* 10.4:1 on the night frame. */
	.globe__controls .hint {
		color: var(--night-ink);
	}
</style>
