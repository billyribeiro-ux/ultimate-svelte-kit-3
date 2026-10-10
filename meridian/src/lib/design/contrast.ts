/**
 * CONTRAST, FROM THE TOKENS
 * =========================
 *
 * Every colour in the interface is a token in `tokens.css`, and most tokens
 * are a `light-dark()` pair. So whether text is readable is a question that
 * can be answered from that one file, without a browser: parse it, resolve
 * both sides of every pair (and the `var()` aliases between tokens), and
 * compute the WCAG 2.x contrast ratio of each pair the design puts on top of
 * each other. `scripts/contrast.ts` runs that table in `pnpm run lint`, and
 * `scripts/screens.ts` prints it with the screenshots.
 *
 * The maths is the standard's: each sRGB channel is linearised, the three
 * are weighted by how bright the eye finds them (green most, blue least) into
 * a relative luminance between 0 and 1, and the ratio of two luminances,
 * each plus 0.05 for the glare of a real screen, runs from 1:1 (the same
 * colour) to 21:1 (black on white). 4.5 is the floor for text, 3 for
 * anything that is not text but must be seen — a focus ring, the edge of a
 * chosen segment. `contrast.spec.ts` checks the maths against the figures
 * everybody quotes — `#767676` on white is 4.54:1, the lightest grey that
 * passes, and `#777777` is 4.48:1, the first that fails.
 *
 * A pure module — no DOM, no file system — so the browser, a script and a
 * unit test can all import it.
 */

export type Rgb = readonly [number, number, number];
export type Scheme = 'light' | 'dark';

export function parseHex(hex: string): Rgb {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** WCAG 2.x relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: Rgb): number {
	const linear = (channel: number) => {
		const c = channel / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The contrast ratio of two colours, 1 to 21, whichever is lighter. */
export function ratio(a: Rgb, b: Rgb): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (light + 0.05) / (dark + 0.05);
}

/**
 * Every `--name: light-dark(#a, #b)` in a stylesheet, both sides resolved, plus
 * the tokens that are one hex in both themes (the globe's night frame) and
 * the ones that are another token by name (`--kind-place: var(--sea)`).
 * Tokens that are not colours, or not hex — a shadow, an `rgb()` with alpha —
 * are left out: their contrast depends on what is under them.
 */
export function parseTokens(css: string): Record<Scheme, Map<string, Rgb>> {
	const light = new Map<string, Rgb>();
	const dark = new Map<string, Rgb>();
	const aliases: [string, string][] = [];
	for (const match of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) {
		const name = match[1]!;
		const value = match[2]!.trim();
		const pair = value.match(/^light-dark\(\s*(#[0-9a-f]{3,6})\s*,\s*(#[0-9a-f]{3,6})\s*\)$/i);
		if (pair) {
			light.set(name, parseHex(pair[1]!));
			dark.set(name, parseHex(pair[2]!));
			continue;
		}
		const plain = value.match(/^#[0-9a-f]{3,6}$/i);
		if (plain) {
			light.set(name, parseHex(plain[0]));
			dark.set(name, parseHex(plain[0]));
			continue;
		}
		const alias = value.match(/^var\(--([a-z0-9-]+)\)$/i);
		if (alias) aliases.push([name, alias[1]!]);
	}
	// An alias may point at another alias; resolve until nothing changes.
	for (let pass = 0; pass < aliases.length; pass += 1) {
		let changed = false;
		for (const [name, target] of aliases) {
			const l = light.get(target);
			const d = dark.get(target);
			if (l && d && !light.has(name)) {
				light.set(name, l);
				dark.set(name, d);
				changed = true;
			}
		}
		if (!changed) break;
	}
	return { light, dark };
}

export interface Pair {
	readonly fg: string;
	readonly bg: string;
	readonly min: number;
	readonly note: string;
}

const TEXT = ['ink', 'ink-2', 'ink-3'] as const;
const TIERS = ['paper', 'paper-2', 'paper-3', 'paper-4'] as const;
const KINDS = ['place', 'lodging', 'food', 'transport', 'activity', 'idea'] as const;

/**
 * The table the design promises: every text ink on every surface tier,
 * the ink on every saturated fill, the focus ring on every paper, a chosen
 * segment's edge on its track and on itself, the globe's hint on the night
 * frame, and the hairline floor for a control's border — plus the accent
 * and state colours where they are used as text.
 */
export const PAIRS: readonly Pair[] = [
	...TEXT.flatMap((fg) =>
		TIERS.map((bg) => ({ fg, bg, min: 4.5, note: `${fg} text on surface tier ${bg}` }))
	),
	...KINDS.map((kind) => ({
		fg: 'on-fill',
		bg: `kind-${kind}`,
		min: 4.5,
		note: `a pin's number on the ${kind} colour`
	})),
	...TIERS.map((bg) => ({ fg: 'focus', bg, min: 3, note: `the focus ring on ${bg}` })),
	{ fg: 'segment-edge', bg: 'paper-3', min: 3, note: 'a chosen segment’s edge on its track' },
	{ fg: 'segment-edge', bg: 'paper-4', min: 3, note: 'a chosen segment’s edge on the segment' },
	{ fg: 'night-ink', bg: 'night', min: 4.5, note: 'the globe’s hints on the night frame' },
	{ fg: 'line-2', bg: 'paper-2', min: 1.5, note: 'a control’s border (hairline floor)' },
	{ fg: 'sea', bg: 'paper', min: 4.5, note: 'links' },
	{ fg: 'sea', bg: 'paper-2', min: 4.5, note: 'links on a card' },
	{ fg: 'sea-strong', bg: 'paper', min: 4.5, note: 'hovered links' },
	{ fg: 'sea', bg: 'sea-soft', min: 4.5, note: '.chip--sea, the Live chip' },
	{ fg: 'sun', bg: 'paper', min: 4.5, note: 'warning text' },
	{ fg: 'sun', bg: 'sun-soft', min: 4.5, note: 'sun text on its soft fill' },
	{ fg: 'coral', bg: 'paper', min: 4.5, note: '.issue' },
	{ fg: 'coral', bg: 'paper-4', min: 4.5, note: '.issue in a dialog' },
	{ fg: 'coral', bg: 'coral-soft', min: 4.5, note: '.chip--coral' },
	{ fg: 'on-sea', bg: 'sea', min: 4.5, note: 'the primary button' },
	{ fg: 'on-fill', bg: 'coral', min: 4.5, note: '.btn--danger' },
	{ fg: 'paper', bg: 'ink', min: 4.5, note: 'the update banner, the skip link' }
];

export interface Result extends Pair {
	readonly scheme: Scheme;
	/** `null` when a token in the pair does not exist (or is not a plain colour). */
	readonly ratio: number | null;
	readonly ok: boolean;
}

/** Every pair in both schemes, worked out from the stylesheet's text. */
export function check(css: string, pairs: readonly Pair[] = PAIRS): Result[] {
	const tokens = parseTokens(css);
	return (['light', 'dark'] as const).flatMap((scheme) =>
		pairs.map((pair) => {
			const fg = tokens[scheme].get(pair.fg);
			const bg = tokens[scheme].get(pair.bg);
			const value = fg && bg ? ratio(fg, bg) : null;
			return { ...pair, scheme, ratio: value, ok: value !== null && value >= pair.min };
		})
	);
}

/** The table as lines of text, the way the two scripts print it. */
export function report(results: readonly Result[]): string[] {
	const lines: string[] = [];
	let scheme: Scheme | null = null;
	for (const r of results) {
		if (r.scheme !== scheme) {
			scheme = r.scheme;
			lines.push('', scheme.toUpperCase());
		}
		const value = r.ratio === null ? '    ?' : r.ratio.toFixed(2).padStart(5);
		lines.push(
			`  ${r.ok ? 'ok  ' : 'FAIL'} ${value}  --${r.fg} on --${r.bg} (≥ ${r.min}) — ${r.note}`
		);
	}
	return lines;
}
