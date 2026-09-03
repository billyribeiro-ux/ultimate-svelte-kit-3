import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { countriesFromTopology } from './geodata.ts';

const require = createRequire(import.meta.url);
const topology = JSON.parse(
	readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8')
);

describe('countriesFromTopology', () => {
	it('unpacks every country as a GeoJSON feature with a name', () => {
		const world = countriesFromTopology(topology);
		expect(world.type).toBe('FeatureCollection');
		expect(world.features.length).toBeGreaterThan(170);
		expect(world.features.every((f) => typeof f.properties.name === 'string')).toBe(true);
		expect(world.features.some((f) => f.properties.name === 'Portugal')).toBe(true);
	});

	it('produces coordinates in degrees', () => {
		const world = countriesFromTopology(topology);
		const portugal = world.features.find((f) => f.properties.name === 'Portugal')!;
		const ring =
			portugal.geometry.type === 'Polygon'
				? portugal.geometry.coordinates[0]!
				: portugal.geometry.type === 'MultiPolygon'
					? portugal.geometry.coordinates[0]![0]!
					: [];
		expect(ring.length).toBeGreaterThan(3);
		for (const [lng, lat] of ring) {
			expect(Math.abs(lng!)).toBeLessThanOrEqual(180);
			expect(Math.abs(lat!)).toBeLessThanOrEqual(90);
		}
	});

	it('refuses a topology without countries', () => {
		expect(() => countriesFromTopology({ type: 'Topology', objects: {}, arcs: [] })).toThrow();
	});
});
