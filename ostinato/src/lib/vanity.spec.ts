import { describe, expect, it } from 'vitest';
import { parseVanity, slugify, vanityPath } from './vanity.ts';

describe('vanity addresses', () => {
	it('parses the addresses it prints', () => {
		const vanity = { handle: 'drum_machine', slug: 'four-on-the-floor' };
		expect(parseVanity(vanityPath(vanity))).toEqual(vanity);
		expect(parseVanity('/@drum_machine/four-on-the-floor/')).toEqual(vanity);
	});

	it('is not fooled by routes that merely start with a slash', () => {
		expect(parseVanity('/p/abc')).toBeNull();
		expect(parseVanity('/@ab/too-short-handle')).toBeNull();
		expect(parseVanity('/@handle')).toBeNull();
		expect(parseVanity('/@handle/-leading-hyphen')).toBeNull();
		expect(parseVanity('/@handle/slug/extra')).toBeNull();
	});
});

describe('slugify', () => {
	it('turns a title into a URL segment', () => {
		expect(slugify('Four on the floor')).toBe('four-on-the-floor');
		expect(slugify('  Boom  Bap!! ')).toBe('boom-bap');
		expect(slugify('Café groove — take 2')).toBe('cafe-groove-take-2');
	});

	it('never returns something a URL cannot hold', () => {
		expect(slugify('🎛️🎛️')).toBe('untitled');
		expect(slugify('')).toBe('untitled');
		expect(slugify('a'.repeat(100))).toHaveLength(60);
		expect(parseVanity(`/@someone/${slugify('x'.repeat(70) + ' y')}`)).not.toBeNull();
	});
});
