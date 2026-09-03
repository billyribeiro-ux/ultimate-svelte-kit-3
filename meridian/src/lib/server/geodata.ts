/**
 * THE WORLD, FROM A FILE
 * ======================
 *
 * The map has no tile server. It draws every country from `world-atlas`, a
 * 108 KB TopoJSON of the world at 1:110m — the same data Natural Earth
 * publishes — turned into GeoJSON here, once, at build time.
 *
 * TopoJSON stores shared borders once and quantises coordinates, which is
 * why it is a fifth of the size of the GeoJSON it unpacks to. MapLibre wants
 * the GeoJSON, so `feature()` from `topojson-client` does the unpacking on
 * the server, and the client fetches the result as a static asset.
 *
 * Pure: a topology in, a feature collection out. The remote function that
 * calls it is the one that knows about files.
 */

import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';

export interface CountryProperties {
	name: string;
}

export type World = FeatureCollection<Geometry, CountryProperties>;

export function countriesFromTopology(topology: Topology): World {
	const countries = topology.objects.countries;
	if (!countries || countries.type !== 'GeometryCollection') {
		throw new Error('expected a `countries` GeometryCollection in the topology');
	}
	return feature(topology, countries as GeometryCollection<CountryProperties>);
}
