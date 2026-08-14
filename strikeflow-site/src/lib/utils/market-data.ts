/**
 * SYNTHETIC MARKET DATA
 *
 * The marketing site is not connected to a live feed, so the hero chart needs
 * plausible-looking data. Two constraints shape how it's generated.
 *
 * 1. IT MUST BE DETERMINISTIC.
 *    `Math.random()` would produce different numbers on the server than on the
 *    client, so the server-rendered HTML wouldn't match what hydration expects.
 *    Svelte would warn, and in the worst case you get a visible flash as the DOM is
 *    patched. A seeded pseudo-random generator gives the same sequence every time,
 *    everywhere — which also means screenshots in the course guide match what you see.
 *
 * 2. IT MUST LOOK LIKE A MARKET, NOT LIKE NOISE.
 *    Uniform random walk looks obviously fake: no trends, no volatility clustering.
 *    We use a small drift term plus mean reversion, which produces the sort of
 *    shape a real intraday chart has.
 *
 * NOTE: this is illustrative sample data and the UI labels it as such. Dressing
 * simulated data up as a live feed on a financial marketing site would be a
 * misrepresentation, and it's the kind of thing regulators take an interest in.
 */

/**
 * Mulberry32 — a tiny, fast, seeded PRNG.
 *
 * Not cryptographically secure and not trying to be. It's about 8 lines, has a
 * period of 2^32, and passes enough statistical tests to look convincingly random
 * to a human eye. Perfect for this; useless for security.
 */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return function next(): number {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/*
 * A TYPE-ONLY import.
 *
 * `UTCTimestamp` is a *branded* type: it's `number & { [species]: 'UTCTimestamp' }`.
 * The brand exists so you can't accidentally hand the library a millisecond
 * timestamp where it wants seconds — the two are both `number`, and mixing them is
 * the single most common Lightweight Charts bug (your chart renders in 1970).
 *
 * `import type` is erased entirely at build time, so this costs nothing at runtime
 * and does NOT pull the 48kB chart library into this module. We get the library's
 * type safety without its bytes.
 */
import type { UTCTimestamp } from 'lightweight-charts';

/** A point on the price line. `time` is a UNIX timestamp in SECONDS, not milliseconds. */
export interface PricePoint {
	time: UTCTimestamp;
	value: number;
}

/** A bar on the premium histogram. */
export interface VolumePoint {
	time: UTCTimestamp;
	value: number;
	color: string;
}

export interface GeneratedSeries {
	readonly price: readonly PricePoint[];
	readonly volume: readonly VolumePoint[];
	/** Convenience readouts for the stat strip beside the chart. */
	readonly last: number;
	readonly changeAbs: number;
	readonly changePct: number;
}

interface GenerateOptions {
	/** Number of data points. */
	bars?: number;
	/** Starting price. */
	start?: number;
	/** Seconds between bars. 300 = 5-minute bars. */
	interval?: number;
	/** Change the seed to get a different-but-still-deterministic shape. */
	seed?: number;
	/** UNIX seconds for the most recent bar. Pass a fixed value to keep output stable. */
	endTime?: number;
	bullColor?: string;
	bearColor?: string;
}

/**
 * Build a price series and matching premium histogram.
 *
 * `endTime` defaults to a FIXED timestamp rather than `Date.now()`, for the same
 * reason we don't use `Math.random()`: a clock reading differs between the server
 * render and the client hydration.
 */
export function generateSeries(options: GenerateOptions = {}): GeneratedSeries {
	const {
		bars = 120,
		start = 428.5,
		interval = 300,
		seed = 20260814,
		// 2026-08-14T20:00:00Z. Deliberately hardcoded — see the note above.
		endTime = 1786867200,
		bullColor = 'rgba(22, 199, 132, 0.5)',
		bearColor = 'rgba(234, 57, 67, 0.5)'
	} = options;

	const random = mulberry32(seed);

	const price: PricePoint[] = [];
	const volume: VolumePoint[] = [];

	let value = start;
	// The level the price is pulled back toward — this is what stops the random
	// walk from wandering off to zero or to the moon over a long series.
	let anchor = start;

	for (let i = 0; i < bars; i += 1) {
		// The one place we apply the brand. Everything downstream is then type-checked
		// as "seconds", so a stray `Date.now()` (milliseconds) becomes a compile error.
		const time = (endTime - (bars - 1 - i) * interval) as UTCTimestamp;

		// Three components, which together read as "a market":
		//   shock     — the random tick
		//   reversion — a pull back toward the anchor
		//   drift     — a gentle overall trend, so the chart has a direction
		const shock = (random() - 0.5) * 1.6;
		const reversion = (anchor - value) * 0.045;
		const drift = 0.028;

		value = Math.max(1, value + shock + reversion + drift);

		// The anchor drifts slowly too, so the series can trend rather than
		// oscillate around one fixed number forever.
		anchor += drift * 0.85;

		price.push({ time, value: Number(value.toFixed(2)) });

		const previous = price[i - 1]?.value ?? value;
		const rising = value >= previous;

		// Volume correlates with the size of the move, which is what real
		// markets do — big moves happen on big volume.
		const magnitude = Math.abs(value - previous);
		const base = 180 + random() * 420;
		volume.push({
			time,
			value: Number((base + magnitude * 340).toFixed(0)),
			color: rising ? bullColor : bearColor
		});
	}

	const last = price[price.length - 1]?.value ?? start;
	const first = price[0]?.value ?? start;
	const changeAbs = Number((last - first).toFixed(2));
	const changePct = Number(((changeAbs / first) * 100).toFixed(2));

	return { price, volume, last, changeAbs, changePct };
}

/**
 * Produce the next bar in a live-updating series.
 *
 * Called on a timer to make the hero chart tick. Takes the previous point and the
 * generator's own random function so the sequence stays reproducible from a seed.
 */
export function nextPoint(previous: PricePoint, random: () => number, interval = 300): PricePoint {
	const shock = (random() - 0.5) * 1.5;
	return {
		time: (previous.time + interval) as UTCTimestamp,
		value: Number(Math.max(1, previous.value + shock + 0.03).toFixed(2))
	};
}

/** Format a number as US dollars. `Intl` is built into every browser we support. */
export function formatUsd(value: number, fractionDigits = 2): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits
	}).format(value);
}

/** Compact notation for large premium figures: 1_240_000 → "$1.24M". */
export function formatCompactUsd(value: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		notation: 'compact',
		maximumFractionDigits: 2
	}).format(value);
}
