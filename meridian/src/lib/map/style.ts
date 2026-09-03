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

export function worldStyle(
	scheme: 'light' | 'dark',
	worldUrl = '/api/world.json'
): StyleSpecification {
	const colours =
		scheme === 'dark'
			? { water: '#0c1117', land: '#1c232d', border: '#33404f' }
			: { water: '#dbe7ee', land: '#f6f1e6', border: '#c4baa6' };

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
