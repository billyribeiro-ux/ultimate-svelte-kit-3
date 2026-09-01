/**
 * Deterministic helpers shared by the CRDT specs.
 *
 * Exported from a real module rather than copied into each spec file, because a
 * property test that cannot be replayed is not a test — it is a rumour. Every
 * random choice in these suites comes from a seeded generator, so a failure
 * prints a seed and that seed reproduces it exactly, on any machine, in a year.
 *
 * This file ships in the bundle only if something imports it, and nothing does
 * outside `*.spec.ts`. It lives here rather than in a `test/` folder so that it
 * is type-checked with the code it describes.
 */

import { type ActorId, type Stamp, Clock, encode } from './clock.ts';

/**
 * mulberry32 — 32 bits of state, uniform enough for choosing array indices, and
 * short enough to read.
 *
 * `Math.random()` cannot be seeded, so a shrinking failure ("it breaks about one
 * run in three") stays unreproducible forever. That is the whole reason this
 * exists.
 */
export function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A readable eight-character actor id: `actor('a')` is `aaaaaaaa`. */
export function actor(letter: string): ActorId {
	return letter.repeat(8).slice(0, 8) as ActorId;
}

/** A stamp with the fields spelled out, for tests that care about ordering. */
export function stamp(wall: number, counter: number, who: string): Stamp {
	return encode({ wall, counter, actor: actor(who) });
}

/**
 * A clock whose "physical time" is a counter you control.
 *
 * Real time in a test means a suite that passes on a fast machine and fails on a
 * slow one, and a drift test that cannot be written at all.
 */
export function fakeClock(who: string, start = 1_000_000_000_000) {
	let now = start;
	const clock = new Clock(actor(who), () => now);
	return {
		clock,
		advance(ms: number) {
			now += ms;
		},
		set(ms: number) {
			now = ms;
		},
		get now() {
			return now;
		}
	};
}

/** Pick a random element. Throws on an empty array rather than returning undefined. */
export function pick<T>(random: () => number, items: readonly T[]): T {
	if (items.length === 0) throw new RangeError('pick from an empty array');
	return items[Math.floor(random() * items.length)]!;
}

/** A random integer in `[min, max]`. */
export function int(random: () => number, min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1));
}

/** A Fisher-Yates shuffle driven by a seeded generator. */
export function shuffle<T>(random: () => number, items: readonly T[]): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
}
