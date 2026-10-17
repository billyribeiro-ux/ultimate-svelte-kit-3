import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check, luminance, parseHex, parseTokens, ratio } from './contrast.ts';

describe('the colour maths', () => {
	it('reads hex, short and long', () => {
		expect(parseHex('#fff')).toEqual([255, 255, 255]);
		expect(parseHex('#0f766e')).toEqual([15, 118, 110]);
		expect(() => parseHex('#ggg')).toThrow();
	});

	it('puts black at 0 and white at 1', () => {
		expect(luminance([0, 0, 0])).toBe(0);
		expect(luminance([255, 255, 255])).toBeCloseTo(1, 10);
	});

	it('runs from 1:1 to 21:1, whichever colour comes first', () => {
		expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 10);
		expect(ratio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 10);
		expect(ratio([120, 60, 30], [120, 60, 30])).toBe(1);
	});

	it('agrees with the figures everybody quotes', () => {
		// #767676 is the lightest grey that passes AA on white: 4.54:1.
		expect(ratio(parseHex('#767676'), parseHex('#ffffff'))).toBeCloseTo(4.54, 2);
		// #777777 is the first that fails: 4.48:1.
		expect(ratio(parseHex('#777777'), parseHex('#ffffff'))).toBeCloseTo(4.48, 2);
	});
});

describe('reading the tokens', () => {
	const css = `
		:root {
			--paper: light-dark(#ffffff, #000000);
			--ink: light-dark(#000000, #ffffff);
			--sea: light-dark(#0f766e, #2dd4bf);
			--kind-place: var(--sea);
			--chained: var(--kind-place);
			--night: #0a1220;
			--shadow: 0 1px 2px rgb(0 0 0 / 0.1);
		}`;

	it('resolves both sides of a pair, a plain hex, and aliases of aliases', () => {
		const tokens = parseTokens(css);
		expect(tokens.light.get('paper')).toEqual([255, 255, 255]);
		expect(tokens.dark.get('paper')).toEqual([0, 0, 0]);
		expect(tokens.dark.get('chained')).toEqual(parseHex('#2dd4bf'));
		expect(tokens.light.get('night')).toEqual(tokens.dark.get('night'));
		expect(tokens.light.has('shadow')).toBe(false);
	});

	it('fails a pair under its floor, and a pair with a missing token', () => {
		const results = check(css, [
			{ fg: 'ink', bg: 'paper', min: 4.5, note: 'text' },
			{ fg: 'sea', bg: 'paper', min: 7, note: 'too strict for a teal' },
			{ fg: 'nowhere', bg: 'paper', min: 3, note: 'missing' }
		]);
		expect(results.filter((r) => r.scheme === 'light').map((r) => r.ok)).toEqual([
			true,
			false,
			false
		]);
		expect(results.find((r) => r.fg === 'nowhere')?.ratio).toBeNull();
	});
});

describe('the real tokens', () => {
	it('pass every pair the design promises, in both themes', () => {
		const css = readFileSync('src/lib/styles/tokens.css', 'utf8');
		const failures = check(css).filter((r) => !r.ok);
		expect(failures).toEqual([]);
	});
});
