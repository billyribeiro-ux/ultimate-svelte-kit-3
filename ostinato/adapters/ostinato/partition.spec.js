import { describe, expect, it } from 'vitest';
import { isApi, partition, pick, stripInternal } from './partition.js';

/**
 * These are the same shapes SvelteKit hands an adapter in `builder.routes` —
 * an `id` and a `pattern` — so the test doubles are honest.
 */
/** @type {import('./partition.js').RouteLike[]} */
const routes = [
	{ id: '/', pattern: /^\/$/, prerender: true },
	{ id: '/gallery', pattern: /^\/gallery\/?$/, prerender: true },
	{ id: '/studio', pattern: /^\/studio\/?$/, prerender: false },
	{ id: '/p/[id]', pattern: /^\/p\/([^/]+?)\/?$/, prerender: 'auto' },
	{ id: '/api/patterns', pattern: /^\/api\/patterns\/?$/, prerender: false },
	{ id: '/api/resolve', pattern: /^\/api\/resolve\/?$/, prerender: false }
];

describe('partition', () => {
	it('sends /api to the api function and pages to the pages function', () => {
		const split = partition(routes);

		expect(split.api.map((r) => r.id)).toEqual(['/api/patterns', '/api/resolve']);
		expect(split.pages.map((r) => r.id)).toEqual(['/studio', '/p/[id]']);
	});

	it('leaves fully prerendered routes to be served as files', () => {
		const split = partition(routes);

		expect(split.prerendered.map((r) => r.id)).toEqual(['/', '/gallery']);
		// `'auto'` is not `true`: those routes stay dynamic because they may be
		// asked for with parameters nobody prerendered.
		expect(split.pages.some((r) => r.id === '/p/[id]')).toBe(true);
	});

	it('does not mistake /apiary for /api', () => {
		expect(isApi({ id: '/apiary', pattern: /x/, prerender: false })).toBe(false);
		expect(isApi({ id: '/api', pattern: /x/, prerender: false })).toBe(true);
	});
});

describe('pick', () => {
	const split = partition(routes);
	const patterns = {
		pages: split.pages.map((r) => r.pattern),
		api: split.api.map((r) => r.pattern)
	};

	it('routes documents, data requests and route resolution to the same function', () => {
		expect(pick('/p/abc', patterns)).toBe('pages');
		expect(pick('/p/abc/__data.json', patterns)).toBe('pages');
		expect(pick('/p/abc/__route.js', patterns)).toBe('pages');
		expect(pick('/studio', patterns)).toBe('pages');
	});

	it('routes /api and remote functions to the api function', () => {
		expect(pick('/api/patterns', patterns)).toBe('api');
		expect(pick('/_app/remote/abc123/getPattern', patterns)).toBe('api');
	});

	it('sends everything else to the catch-all', () => {
		expect(pick('/@someone/a-groove', patterns)).toBe('router');
		expect(pick('/_app/env.js', patterns)).toBe('router');
		expect(pick('/no-such-page', patterns)).toBe('router');
	});

	it('strips only the internal suffixes', () => {
		expect(stripInternal('/__data.json')).toBe('/');
		expect(stripInternal('/p/x/__data.json')).toBe('/p/x');
		expect(stripInternal('/data.json')).toBe('/data.json');
	});
});
