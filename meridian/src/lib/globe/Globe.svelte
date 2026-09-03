<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { MediaQuery } from 'svelte/reactivity';
	import type { FeatureCollection, Geometry } from 'geojson';
	import { PauseIcon, PlayIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
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
	 * `MediaQuery` from `svelte/reactivity`: a media query as a reactive
	 * value. When the operating system setting changes, `current` changes,
	 * and the scene stops animating without a reload.
	 */
	const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

	let flying = $state(false);

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
			<p class="globe__status muted">{m.globe_loading()}</p>
		{/snippet}
		{#snippet failed(error, reset)}
			<p class="globe__status issue">
				{error instanceof Error ? error.message : m.error_title()}
				<button class="btn btn--sm" type="button" onclick={reset}>{m.live_reconnect()}</button>
			</p>
		{/snippet}

		{const world = await loadWorld()}

		<div class="globe__canvas">
			<Canvas>
				<Scene
					{stops}
					{selected}
					{world}
					{flying}
					reduced={reducedMotion.current}
					{onselect}
					onlanded={() => (flying = false)}
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
	.globe {
		display: grid;
		grid-template-rows: 1fr auto;
		height: 100%;
		min-height: 24rem;
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: #050b14;
		color: #dfe8f0;
	}

	.globe__canvas {
		min-height: 0;
	}

	.globe__status {
		display: grid;
		place-items: center;
		gap: var(--space-2);
		padding: var(--space-6);
	}

	.globe__controls {
		padding: var(--space-3) var(--space-4);
		background: rgb(255 255 255 / 0.06);
	}

	.globe__controls .hint {
		color: #9fb3c4;
	}
</style>
