<script module lang="ts">
	/*
	 * MapLibre parses tiles and geometry in a Web Worker. Vite has to be told
	 * to emit that worker as a file, which `?worker&url` does; the resulting
	 * URL is handed to MapLibre once, before the first map is made. A module
	 * script runs once per module, not once per instance, which is exactly
	 * the right place.
	 */
	import * as maplibregl from 'maplibre-gl';
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

	maplibregl.setWorkerUrl(maplibreWorkerUrl);
</script>

<script lang="ts">
	import type { FeatureCollection, LineString } from 'geojson';
	import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
	import { fade } from 'svelte/transition';
	import { GeoJSON, LineLayer, MapLibre, Marker } from 'svelte-maplibre';
	import { CrosshairIcon, FrameCornersIcon } from 'phosphor-svelte';
	import { arc, bounds, pad } from '@meridian/waypoint/geo';
	import { m } from '#lib/paraglide/messages.js';
	import type { StopKind } from '#lib/domain/schemas.ts';
	import { reducedMotion } from '#lib/motion/prefers.svelte.ts';
	import { theme } from '#lib/ui/theme.svelte.ts';
	import { Geolocation } from './geolocation.svelte.ts';
	import { mapPalette, worldStyle } from './style.ts';

	export interface MapStop {
		readonly id: string;
		readonly name: string;
		readonly kind: StopKind;
		readonly lng: number;
		readonly lat: number;
	}

	interface Props {
		/** Scheduled stops, in itinerary order. The route joins them. */
		stops: readonly MapStop[];
		selected?: string | null;
		editable?: boolean;
		/** A click on empty map, when editable. */
		onadd?: (point: { lng: number; lat: number }) => void;
		onselect?: (id: string | null) => void;
		/** A marker dropped somewhere new, when editable. */
		onmove?: (id: string, point: { lng: number; lat: number }) => void;
	}

	let { stops, selected = null, editable = false, onadd, onselect, onmove }: Props = $props();

	/*
	 * The style follows the theme. `diffStyleUpdates` makes MapLibre patch
	 * the running style — three paint properties — rather than tear the map
	 * down and rebuild it when somebody flips to dark. The route's two
	 * colours come from the same palette as the style, so the canvas and the
	 * tokens agree about what the sea is.
	 */
	const style = $derived(worldStyle(theme.resolved));
	const palette = $derived(mapPalette(theme.resolved));

	/** One great-circle line per leg, as GeoJSON for a line layer. */
	const route: FeatureCollection<LineString> = $derived.by(() => ({
		type: 'FeatureCollection',
		features: stops.slice(1).map((to, i) => ({
			type: 'Feature',
			properties: {},
			geometry: { type: 'LineString', coordinates: arc(stops[i]!, to, 48).map((p) => [...p]) }
		}))
	}));

	const fit: LngLatBoundsLike | undefined = $derived.by(() => {
		const box = bounds(stops);
		if (!box) return undefined;
		const padded = pad(box);
		return [
			[padded.west, padded.south],
			[padded.east, padded.north]
		];
	});

	let map: MapLibreMap | undefined = $state();
	let showMe = $state(false);
	const geo = new Geolocation();

	/*
	 * The canvas is invisible until MapLibre says `load`, then fades in over
	 * 240ms — the tiles-popping-in look is gone, and under reduced motion the
	 * fade is 0ms. `ready` is set once and never unset: a style swap does
	 * not fire `load` again, and the map should not blink when it happens.
	 */
	let ready = $state(false);

	/*
	 * FIT WHAT CAN BE SEEN
	 * --------------------
	 * The side-by-side map is as tall as the viewport under the sticky tabs,
	 * so at the top of the page its lower part is below the fold, and a
	 * route fitted to the whole canvas lands half off screen. The padding
	 * counts the hidden strip as padding, so the route is fitted into the
	 * part that is on screen — and when the map is all on screen, it is the
	 * plain 40px on every side.
	 */
	let frame = $state<HTMLElement>();

	function padding() {
		const box = frame?.getBoundingClientRect();
		const hidden = box
			? Math.max(0, Math.min(box.bottom - window.innerHeight, box.height - 240))
			: 0;
		return { top: 40, right: 40, left: 40, bottom: 40 + hidden };
	}

	/* 600ms of camera, or a cut. */
	function fitRoute() {
		if (map && fit) {
			map.fitBounds(fit, {
				padding: padding(),
				maxZoom: 11,
				duration: reducedMotion.current ? 0 : 600
			});
		}
	}

	/* The first fit, once the map is up, uses the same padding — a cut, since it is the first frame anyone sees. */
	function onload() {
		ready = true;
		if (map && fit && padding().bottom > 40) {
			map.fitBounds(fit, { padding: padding(), maxZoom: 11, duration: 0 });
		}
	}
</script>

<div class="map" data-ready={ready ? '' : undefined} bind:this={frame}>
	<MapLibre
		bind:map
		{style}
		diffStyleUpdates
		bounds={fit}
		fitBoundsOptions={{ padding: 40, maxZoom: 11 }}
		center={[0, 20]}
		zoom={1.4}
		attributionControl={false}
		cooperativeGestures
		class="map__canvas"
		{onload}
		onclick={(e) => {
			if (editable) onadd?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
		}}
	>
		<!-- Two layers for one line: a wide halo in the paper colour, then the dashed route on top, so the dashes read where they cross a border. -->
		<GeoJSON id="route" data={route}>
			<LineLayer
				paint={{ 'line-color': palette.routeHalo, 'line-width': 5 }}
				layout={{ 'line-join': 'round', 'line-cap': 'round' }}
			/>
			<LineLayer
				paint={{
					'line-color': palette.route,
					'line-width': 2.5,
					'line-dasharray': [2, 1.5]
				}}
				layout={{ 'line-join': 'round', 'line-cap': 'round' }}
			/>
		</GeoJSON>

		<!--
			The selected pin is drawn above its neighbours. Each marker is its
			own positioned element with a transform, so a z-index on the pin
			inside it cannot climb out; the marker itself carries it. Without
			this, pins that share a city paint in list order, and the ring
			around "1" showed a "5".
		-->
		{#each stops as stop, i (stop.id)}
			<Marker
				lngLat={[stop.lng, stop.lat]}
				zIndex={stop.id === selected ? 10 : 1}
				draggable={editable}
				asButton
				onclick={() => onselect?.(stop.id)}
				ondragend={(e) => onmove?.(stop.id, { lng: e.lngLat[0], lat: e.lngLat[1] })}
			>
				<span
					class="pin"
					class:pin--selected={stop.id === selected}
					class:pin--draggable={editable}
					data-kind={stop.kind}
					title={stop.name}
				>
					{i + 1}
				</span>
			</Marker>
		{/each}

		<!-- Reading `geo.fix` is what starts the position watch; not reading it stops it. -->
		{#if showMe && geo.fix}
			<Marker lngLat={[geo.fix.lng, geo.fix.lat]}>
				<span class="me" title={m.map_locate()}></span>
			</Marker>
		{/if}
	</MapLibre>

	<div class="map__tools no-print">
		<button
			class="btn btn--sm btn--icon"
			type="button"
			title={m.map_fit()}
			aria-label={m.map_fit()}
			onclick={fitRoute}
		>
			<FrameCornersIcon size={16} aria-hidden="true" />
		</button>
		<button
			class="btn btn--sm btn--icon"
			class:btn--primary={showMe}
			type="button"
			title={m.map_locate()}
			aria-label={m.map_locate()}
			aria-pressed={showMe}
			onclick={() => (showMe = !showMe)}
		>
			<CrosshairIcon size={16} aria-hidden="true" />
		</button>
	</div>

	<!-- The status pill fades in and out: the one Svelte transition on the map, and it is observable. -->
	{#if showMe && (geo.error || !geo.fix)}
		<p
			class="map__status"
			role="status"
			transition:fade={{ duration: reducedMotion.current ? 0 : 160 }}
		>
			{#if geo.error}
				{m.map_no_location()}
			{:else}
				{m.map_locating()}
			{/if}
		</p>
	{/if}

	{#if editable}
		<p class="map__hint no-print">{m.map_click_hint()}</p>
	{/if}
</div>

<style>
	.map {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 20rem;
		border-radius: inherit;
		overflow: hidden;
		border: 1px solid var(--line);
		background: var(--paper-3);
	}

	.map :global(.map__canvas) {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity var(--dur-3) var(--ease-out);
	}

	.map[data-ready] :global(.map__canvas) {
		opacity: 1;
	}

	.map__tools {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/*
	 * Tier-3 over the canvas: the tools float on paper, with the hairline
	 * ring. These rules are more specific than the global `.btn:hover`, so
	 * each state is restated here — or the hover would never show.
	 */
	.map__tools .btn {
		background: var(--paper-4);
		box-shadow: var(--shadow-2), var(--ring-hairline);
	}

	.map__tools .btn:hover {
		background: var(--paper-3);
	}

	.map__tools .btn--primary {
		background: var(--sea);
	}

	.map__tools .btn--primary:hover {
		background: var(--sea-strong);
	}

	.map__status,
	.map__hint {
		position: absolute;
		left: var(--space-3);
		bottom: var(--space-3);
		margin: 0;
		padding: 0.3rem 0.7rem;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--paper-4) 88%, transparent);
		backdrop-filter: blur(6px);
		font-size: var(--text-xs);
		color: var(--ink-2);
		pointer-events: none;
	}

	.map__status {
		bottom: calc(var(--space-3) + 2rem);
	}

	/*
	 * A pin is the kind colour with `--on-fill` ink — white in light, near-
	 * black in dark, where the pastel kinds would not carry white — on a 2px
	 * paper ring. Selected: a quarter larger, with a second ring in the kind.
	 */
	.pin {
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: var(--kind, var(--sea));
		color: var(--on-fill);
		font-size: var(--text-xs);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		border: 2px solid var(--paper-2);
		box-shadow: var(--shadow-2);
		cursor: pointer;
		transition:
			scale var(--dur-2) var(--ease-out),
			box-shadow var(--dur-2) var(--ease-out);
	}

	.pin--draggable {
		cursor: grab;
	}

	@media (hover: hover) {
		.pin:hover {
			scale: 1.1;
		}
	}

	.pin--selected,
	.pin--selected:hover {
		scale: 1.25;
		box-shadow:
			0 0 0 3px var(--paper-2),
			0 0 0 5px var(--kind, var(--sea));
	}

	.me {
		display: block;
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		background: var(--focus);
		border: 2px solid var(--paper-2);
		box-shadow: 0 0 0 6px color-mix(in oklab, var(--focus) 25%, transparent);
	}
</style>
