/**
 * A MAP STYLE WITH NO TILE SERVER
 * ===============================
 *
 * A MapLibre style is JSON: sources, and layers that draw them. This one
 * has a single source — the prerendered `/api/world.json` — and three
 * layers: the sea (a background colour), the land (a fill) and the borders
 * (a line). No raster tiles, no vector tiles, no API key, no sprite, no
 * glyphs, because no layer draws text.
 *
 * What it costs: no streets. At the scale a trip is planned — a country, a
 * coastline, a city as a dot — that is the right trade for a demo that has
 * to work in CI, on a train, and under `connect-src 'self'`. The chapter on
 * the map says exactly what to change to put OpenFreeMap tiles under it.
 *
 * Colours are literal rather than CSS variables: MapLibre paints a canvas
 * and does not read the cascade. The function takes the resolved scheme
 * and the component rebuilds the style when the theme flips.
 */

import type { StyleSpecification } from 'maplibre-gl';

export interface MapPalette {
	readonly water: string;
	readonly land: string;
	readonly border: string;
	/** The route line: `--sea` from `tokens.css`, by hand. */
	readonly route: string;
	/** A wider line under the route in the land colour's family, so the dashes read over borders. */
	readonly routeHalo: string;
}

/**
 * The five colours the canvas needs, per scheme. `route` is `--sea` and
 * `routeHalo` is the paper, copied from `tokens.css` because a canvas
 * cannot read the cascade. It is one of four such copies, each where a
 * custom property cannot reach and each saying so: this canvas, the
 * globe's WebGL materials (`Scene.svelte`), the custom element's shadow
 * root (`MeridianRoute.svelte`) and the `theme-color` meta tags in
 * `app.html`. The header of `tokens.css` lists them.
 */
export function mapPalette(scheme: 'light' | 'dark'): MapPalette {
	return scheme === 'dark'
		? {
				water: '#0c1117',
				land: '#1c232d',
				border: '#33404f',
				route: '#2dd4bf',
				routeHalo: 'rgba(16, 19, 24, 0.9)'
			}
		: {
				water: '#dbe7ee',
				land: '#f6f1e6',
				border: '#c4baa6',
				route: '#0f766e',
				routeHalo: 'rgba(255, 255, 255, 0.9)'
			};
}

export function worldStyle(
	scheme: 'light' | 'dark',
	worldUrl = '/api/world.json'
): StyleSpecification {
	const colours = mapPalette(scheme);

	return {
		version: 8,
		sources: {
			world: { type: 'geojson', data: worldUrl }
		},
		layers: [
			{ id: 'water', type: 'background', paint: { 'background-color': colours.water } },
			{ id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': colours.land } },
			{
				id: 'borders',
				type: 'line',
				source: 'world',
				paint: { 'line-color': colours.border, 'line-width': 0.8 }
			}
		]
	};
}
