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
	import { untrack } from 'svelte';
	import type { FeatureCollection, LineString } from 'geojson';
	import type { LngLatBoundsLike, MapMouseEvent, Map as MapLibreMap } from 'maplibre-gl';
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
	/* The zoom the camera settled at; MapLibre writes it back after every move. */
	let zoom = $state(1.4);
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

	/*
	 * THE CAMERA MOVES WHEN SOMEBODY ASKS
	 * -----------------------------------
	 * The route is framed once: when the map has loaded and there is a route
	 * to frame — at once for a trip with stops, or when the first stop of a
	 * new trip arrives. It is a cut, since it is the first frame anyone sees.
	 * After that the camera belongs to the person: it moves for "Fit the
	 * route", for a bubble pressed and for a stop chosen, and for nothing
	 * else.
	 *
	 * It used to be `bounds={fit}` on `<MapLibre>`, which re-fits whenever
	 * `bounds` changes — and `fit` is derived from the stops, which the live
	 * query hands over as a new array every time anybody's heartbeat wakes
	 * the room. Choosing a stop sends a heartbeat, so the route was re-fitted
	 * under the flight to the stop, a few frames after it took off.
	 *
	 * `framed` is a plain variable, not state: once it is true the effect
	 * returns before it reads anything reactive, so it never runs again.
	 */
	let framed = false;

	$effect(() => {
		if (framed || !map || !ready) return;
		const box = fit;
		if (!box) return;
		framed = true;
		map.fitBounds(box, { padding: padding(), maxZoom: 11, duration: 0 });
	});

	/*
	 * A FRAME THAT CHANGES SIZE
	 * -------------------------
	 * MapLibre watches its own container and redraws the canvas when it
	 * changes size. The markers do not always follow: when the frame changed
	 * height while the map was starting up, the canvas was redrawn for the
	 * new height and the pins stayed where the old one had put them — on a
	 * phone, 25px below the route, until something moved the camera. It
	 * happened in five loads out of six, and not once when the frame changed
	 * later, with the map running, at rest or in the middle of a flight.
	 *
	 * So the frame is watched here too, and when it changes size this asks
	 * MapLibre to resize again — at once if the camera is still, or when its
	 * move ends. `resize()` at rest redraws the canvas and moves every marker
	 * to match, which is all the cure needs to know about the cause. The
	 * first report is the frame's starting size, not a change, and is let go.
	 */
	$effect(() => {
		if (!map || !frame) return;
		const instance = map;
		let size = '';
		let waiting = false;
		const settle = () => {
			waiting = false;
			instance.resize();
		};
		const observer = new ResizeObserver(([entry]) => {
			const next = `${entry?.contentRect.width}×${entry?.contentRect.height}`;
			if (next === size) return;
			const first = size === '';
			size = next;
			if (first) return;
			if (!instance.isMoving()) instance.resize();
			else if (!waiting) {
				waiting = true;
				instance.once('moveend', settle);
			}
		});
		observer.observe(frame);
		return () => {
			observer.disconnect();
			instance.off('moveend', settle);
		};
	});

	/*
	 * PINS THAT SHARE A CITY
	 * ----------------------
	 * At the zoom that fits Lisbon to Barcelona, the five Lisbon stops are
	 * one blob of pins with only the top one readable. So markers that would
	 * share a press — whose 44px press areas would touch — are drawn as one
	 * bubble with the numbers they hold ("1–5"), and pressing the bubble
	 * fits the camera to what it holds. Stops that are closer still — two in
	 * the same street — may be a smaller bubble at that zoom, and pressing
	 * it goes further in. 44px is the same number the phone's target check
	 * presses with: two pins closer than that are two targets a finger
	 * cannot tell apart, whatever they look like.
	 *
	 * A press area is 44px tall and 44px wide, or as wide as the marker when
	 * the marker is wider — a bubble that says "10–12" is. Its width is
	 * worked out from its label, generously (a bold digit at the 13px the
	 * label is at its largest is under 9px, plus the padding and the ring),
	 * because the grouping has to be decided before anything is drawn to
	 * measure.
	 *
	 * Positions are MapLibre's world pixels: a point's Web Mercator
	 * coordinate (0 to 1 across the world) times 512 × 2^zoom. They depend
	 * on the zoom alone, not on where the map is panned, so the grouping is
	 * a `$derived` of the stops, the zoom and the selection — recomputed when
	 * a move ends, never per frame. Any two markers that touch are merged,
	 * and the bubble sits at the middle of what it holds, until no two touch.
	 * The selected stop is never folded into a bubble: the one thing the
	 * person asked to see is always a pin. Above zoom 16 nothing is grouped;
	 * two stops that close are on the same street.
	 */
	const PRESS = 44;

	const pressWidth = (label: string) => Math.max(PRESS, label.length * 9 + 20);

	interface Member {
		readonly stop: MapStop;
		readonly number: number;
		/** Web Mercator, 0 to 1. */
		readonly x: number;
		readonly y: number;
	}

	interface Group {
		readonly key: string;
		readonly members: readonly Member[];
		readonly label: string;
		readonly lngLat: [number, number];
	}

	/*
	 * A bubble says which stops it holds, in the itinerary's numbers: "1–5"
	 * for a run of the route, "3, 5" or "1–5, 12" when a city is visited at
	 * two points of it. A bare count was the first answer, and it lied: a
	 * bubble holding stops 3 and 5 said "2", beside the pin that *is* stop 2.
	 * Past two runs the list would be longer than the bubble is useful, and
	 * the count comes back — in the bubble's shape and colour, never a pin's.
	 */
	function labelOf(members: readonly Member[]): string {
		const runs: [number, number][] = [];
		for (const { number } of members) {
			const run = runs.at(-1);
			if (run && number === run[1] + 1) run[1] = number;
			else runs.push([number, number]);
		}
		if (runs.length > 2) return String(members.length);
		return runs.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join(', ');
	}

	const mercator = (stop: MapStop) =>
		maplibregl.MercatorCoordinate.fromLngLat([stop.lng, stop.lat]);

	const groups: Group[] = $derived.by(() => {
		const world = 512 * 2 ** zoom;
		const drafts = stops.map((stop, index) => {
			const { x, y } = mercator(stop);
			const members = [{ stop, number: index + 1, x, y }];
			return { members, x, y, label: labelOf(members), pinned: stop.id === selected };
		});

		const touch = (a: (typeof drafts)[number], b: (typeof drafts)[number]) =>
			Math.abs(a.x - b.x) * world < (pressWidth(a.label) + pressWidth(b.label)) / 2 &&
			Math.abs(a.y - b.y) * world < PRESS;

		let merged = zoom < 16;
		while (merged) {
			merged = false;
			search: for (let i = 0; i < drafts.length; i += 1) {
				for (let j = i + 1; j < drafts.length; j += 1) {
					const a = drafts[i]!;
					const b = drafts[j]!;
					if (a.pinned || b.pinned || !touch(a, b)) continue;
					a.members = [...a.members, ...b.members].sort((one, other) => one.number - other.number);
					a.x = a.members.reduce((sum, member) => sum + member.x, 0) / a.members.length;
					a.y = a.members.reduce((sum, member) => sum + member.y, 0) / a.members.length;
					a.label = labelOf(a.members);
					drafts.splice(j, 1);
					merged = true;
					break search;
				}
			}
		}

		return drafts.map(({ members, x, y, label }) => {
			const { lng, lat } = new maplibregl.MercatorCoordinate(x, y).toLngLat();
			return {
				key: members.map((member) => member.stop.id).join(' '),
				members,
				label,
				lngLat: members.length === 1 ? [members[0]!.stop.lng, members[0]!.stop.lat] : [lng, lat]
			};
		});
	});

	function zoomInto(group: Group) {
		const box = bounds(group.members.map((member) => member.stop));
		if (!map || !box) return;
		map.fitBounds(
			[
				[box.west, box.south],
				[box.east, box.north]
			],
			{ padding: 80, maxZoom: 16, duration: reducedMotion.current ? 0 : 600 }
		);
	}

	/*
	 * A STOP CHOSEN IS A STOP SHOWN
	 * -----------------------------
	 * Selecting a stop — in the list, the palette or on the map — flies the
	 * camera to it, so the pin is in the middle of what can be seen and out
	 * of any bubble. Under reduced motion it is a cut.
	 *
	 * How close is a judgement about this atlas, which has coastlines and
	 * borders and nothing under them. A fixed street-level zoom (12) put
	 * Alfama in an empty beige field; a fixed country-level one (10) still
	 * showed no coast at Lisbon, and hid the hotel a kilometre away under
	 * the chosen pin. What tells a person where a stop is, at the scale of a
	 * city, is the trip's other stops around it. So the camera goes as close
	 * as it takes for the chosen pin to stand clear of every other stop —
	 * its press area, a quarter larger while it is chosen, touching none of
	 * theirs — and no closer: zoom 9, sixty kilometres across, if that is
	 * enough, and never past 16. It never zooms out from where the map
	 * already is.
	 *
	 * The last stop flown to is remembered in a plain variable, not state:
	 * the effect must not re-run because it wrote down where it went.
	 */
	let flownTo: string | null = null;

	function closeEnough(stop: MapStop): number {
		const own = mercator(stop);
		const clear = PRESS * 1.25;
		// The scale (512 × 2^zoom) at which every other stop is clear of this one across or down.
		let scale = 0;
		for (const other of stops) {
			if (other.id === stop.id) continue;
			const { x, y } = mercator(other);
			const dx = Math.abs(x - own.x);
			const dy = Math.abs(y - own.y);
			scale = Math.max(scale, Math.min(clear / dx, clear / dy));
		}
		// Alone, anywhere is clear; on the very spot of another stop, nowhere is, and 16 is as close as it goes.
		if (scale === 0) return 9;
		return Number.isFinite(scale) ? Math.min(16, Math.max(9, Math.log2(scale / 512))) : 16;
	}

	$effect(() => {
		const id = selected;
		if (!id) {
			flownTo = null;
			return;
		}
		if (!map || !ready || id === flownTo) return;
		const stop = untrack(() => stops.find((candidate) => candidate.id === id));
		if (!stop) return;
		flownTo = id;
		const target = {
			center: [stop.lng, stop.lat] as [number, number],
			zoom: Math.max(
				untrack(() => zoom),
				untrack(() => closeEnough(stop))
			),
			padding: padding()
		};
		if (reducedMotion.current) map.jumpTo(target);
		else map.flyTo({ ...target, duration: 800 });
	});

	/* Five decimal places is a metre: the map's click and a dragged pin give fifteen, which nobody typed and no field shows. */
	const round = (value: number) => Math.round(value * 1e5) / 1e5;

	function onload() {
		ready = true;
	}

	/*
	 * A CLICK ON THE MAP, NOT ON A MARKER
	 * -----------------------------------
	 * An editor's click on empty map starts a new stop there. A click on a
	 * pin or a bubble is a click on the map too: MapLibre listens on the
	 * element the markers live in, and the marker's own `stopPropagation()`
	 * comes too late to stop it — Svelte delegates `onclick` to the root of
	 * the app, so by the time the marker's handler runs, the event has
	 * already passed MapLibre on its way up. Pressing a bubble opened the
	 * "New stop" dialog over the zoom it asked for. So the map asks where the
	 * click began.
	 */
	function onclick(e: MapMouseEvent) {
		if (!editable) return;
		const target = e.originalEvent.target;
		if (target instanceof Element && target.closest('.maplibregl-marker')) return;
		onadd?.({ lng: round(e.lngLat.lng), lat: round(e.lngLat.lat) });
	}
</script>

<div class="map" data-ready={ready ? '' : undefined} bind:this={frame}>
	<MapLibre
		bind:map
		{style}
		diffStyleUpdates
		center={[0, 20]}
		bind:zoom
		attributionControl={false}
		cooperativeGestures
		class="map__canvas"
		{onload}
		{onclick}
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
			inside it cannot climb out; the marker itself carries it. A bubble
			sits between the two.
		-->
		{#each groups as group (group.key)}
			{#if group.members.length === 1}
				{const { stop, number } = $derived(group.members[0]!)}
				<Marker
					lngLat={group.lngLat}
					zIndex={stop.id === selected ? 10 : 1}
					draggable={editable}
					asButton
					onclick={() => onselect?.(stop.id)}
					ondragend={(e) => onmove?.(stop.id, { lng: round(e.lngLat[0]), lat: round(e.lngLat[1]) })}
				>
					<!--
						A pin is named by its number, the number the itinerary gives the
						stop; the stop's name is the title a pointer shows. The bubble
						below keeps its stops' names in its title for the same reason:
						its first draft spelled them out in its hidden text, which made a
						second button called "Alfama" beside the itinerary's own.
					-->
					<span
						class="pin"
						class:pin--selected={stop.id === selected}
						class:pin--draggable={editable}
						data-kind={stop.kind}
						title={stop.name}
					>
						{number}
					</span>
				</Marker>
			{:else}
				{const names = $derived(group.members.map((member) => member.stop.name).join(', '))}
				<Marker lngLat={group.lngLat} zIndex={5} asButton onclick={() => zoomInto(group)}>
					<span class="pin pin--cluster tabular" title={names}>
						{group.label}<span class="visually-hidden"
							>: {m.map_cluster({ count: group.members.length })}</span
						>
					</span>
				</Marker>
			{/if}
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

	/* 12px apart, so the two buttons' 44px hit areas do not meet. */
	.map__tools {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
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

	/*
	 * 26px drawn, 44px to press: the pin's own box is the look, the
	 * pseudo-element is the target. It is placed from the pin's *padding*
	 * edge, inside the 2px ring, so the reach is half of what is missing
	 * plus the ring — `inset: -9px` from the outside edge's arithmetic made
	 * a 40px target. A percentage inset is a share of the padding box (its
	 * width for the sides, its height for the top and bottom), which makes
	 * one rule right for both shapes: a round pin reaches out to 44px each
	 * way, and a bubble already wider than 44px reaches only to its ring
	 * sideways, so it does not grow into its neighbours.
	 */
	.pin {
		position: relative;
	}

	.pin::after {
		content: '';
		position: absolute;
		inset: min(-2px, calc(50% - var(--control) / 2));
		border-radius: var(--radius-pill);
	}

	.pin--draggable {
		cursor: grab;
	}

	/*
	 * A bubble of several stops: a pill as wide as its numbers, in the sea
	 * with the paper ring every pin has — the route's colour, because it is
	 * a stretch of the route — so it reads as "more than one" next to the
	 * round kind-coloured pins.
	 */
	.pin--cluster {
		width: auto;
		min-width: 1.6rem;
		padding-inline: 0.45rem;
		border-radius: var(--radius-pill);
		background: var(--sea);
		color: var(--on-sea);
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
