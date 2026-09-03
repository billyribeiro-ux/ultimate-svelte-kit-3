import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { Route } from './route.svelte.js';
import { distance } from './geo/index.js';

const LONDON = { id: 'lon', name: 'London', lng: -0.1278, lat: 51.5074 };
const PARIS = { id: 'par', name: 'Paris', lng: 2.3522, lat: 48.8566 };
const ROME = { id: 'rom', name: 'Rome', lng: 12.4964, lat: 41.9028 };

describe('Route', () => {
	it('starts empty and derives nothing', () => {
		const route = new Route();
		expect(route.legs).toEqual([]);
		expect(route.total).toBe(0);
		expect(route.bounds).toBeNull();
		expect(route.longest).toBeNull();
	});

	it('derives legs, total and bounds from the waypoints', () => {
		const route = new Route([LONDON, PARIS, ROME]);
		expect(route.legs).toHaveLength(2);
		expect(route.total).toBeCloseTo(distance(LONDON, PARIS) + distance(PARIS, ROME), 6);
		expect(route.bounds?.west).toBe(LONDON.lng);
		expect(route.longest?.to.id).toBe('rom');
	});

	it('recomputes after add, move and remove', () => {
		const route = new Route([LONDON, ROME]);
		const direct = route.total;

		route.add(PARIS, 1);
		flushSync();
		expect(route.waypoints.map((w) => w.id)).toEqual(['lon', 'par', 'rom']);
		expect(route.total).toBeGreaterThan(direct);

		route.move(2, 0);
		flushSync();
		expect(route.waypoints.map((w) => w.id)).toEqual(['rom', 'lon', 'par']);
		expect(route.legs[0]?.from.id).toBe('rom');

		expect(route.remove('lon')).toBe(true);
		expect(route.remove('lon')).toBe(false);
		flushSync();
		expect(route.legs).toHaveLength(1);
		expect(route.total).toBeCloseTo(distance(ROME, PARIS), 6);
	});

	it('replace swaps the list wholesale and toJSON returns a plain copy', () => {
		const route = new Route([LONDON]);
		route.replace([PARIS, ROME]);
		flushSync();
		expect(route.indexOf('par')).toBe(0);
		expect(route.get('rom')?.name).toBe('Rome');

		const json = route.toJSON();
		expect(json).toEqual([PARIS, ROME]);
		json.push(LONDON);
		expect(route.waypoints).toHaveLength(2);
	});
});
