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
	import { GeoJSON, LineLayer, MapLibre, Marker } from 'svelte-maplibre';
	import { CrosshairIcon, FrameCornersIcon } from 'phosphor-svelte';
	import { arc, bounds, pad } from '@meridian/waypoint/geo';
	import { m } from '#lib/paraglide/messages.js';
	import type { StopKind } from '#lib/domain/schemas.ts';
	import { theme } from '#lib/ui/theme.svelte.ts';
	import { Geolocation } from './geolocation.svelte.ts';
	import { worldStyle } from './style.ts';

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
	 * down and rebuild it when somebody flips to dark.
	 */
	const style = $derived(worldStyle(theme.resolved));

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

	function fitRoute() {
		if (map && fit) map.fitBounds(fit, { padding: 40, maxZoom: 11, duration: 600 });
	}
</script>

<div class="map">
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
		onclick={(e) => {
			if (editable) onadd?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
		}}
	>
		<GeoJSON id="route" data={route}>
			<LineLayer
				paint={{
					'line-color': theme.resolved === 'dark' ? '#5eead4' : '#0f766e',
					'line-width': 2.5,
					'line-dasharray': [2, 1.5]
				}}
				layout={{ 'line-join': 'round', 'line-cap': 'round' }}
			/>
		</GeoJSON>

		{#each stops as stop, i (stop.id)}
			<Marker
				lngLat={[stop.lng, stop.lat]}
				draggable={editable}
				asButton
				onclick={() => onselect?.(stop.id)}
				ondragend={(e) => onmove?.(stop.id, { lng: e.lngLat[0], lat: e.lngLat[1] })}
			>
				<span
					class="pin"
					class:pin--selected={stop.id === selected}
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

	{#if showMe}
		<p class="map__status" role="status">
			{#if geo.error}
				{m.map_no_location()}
			{:else if !geo.fix}
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
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid var(--line);
		background: var(--paper-3);
	}

	.map :global(.map__canvas) {
		position: absolute;
		inset: 0;
	}

	.map__tools {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.map__status,
	.map__hint {
		position: absolute;
		left: var(--space-3);
		bottom: var(--space-3);
		margin: 0;
		padding: 0.25rem 0.6rem;
		border-radius: var(--radius-pill);
		background: color-mix(in oklab, var(--paper-2) 85%, transparent);
		font-size: var(--text-xs);
		color: var(--ink-2);
		pointer-events: none;
	}

	.map__status:empty {
		display: none;
	}

	.pin {
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: var(--kind, var(--sea));
		color: #fff;
		font-size: var(--text-xs);
		font-weight: 700;
		border: 2px solid var(--paper-2);
		box-shadow: var(--shadow-2);
		cursor: pointer;
		transition: transform var(--dur-fast) var(--ease-out);
	}

	.pin--selected {
		transform: scale(1.25);
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
		border: 2px solid #fff;
		box-shadow: 0 0 0 6px color-mix(in oklab, var(--focus) 25%, transparent);
	}
</style>
