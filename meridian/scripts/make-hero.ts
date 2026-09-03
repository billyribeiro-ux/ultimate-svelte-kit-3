/**
 * THE HERO IMAGE, FROM CODE
 * =========================
 *
 * A trip planner wants a photograph, and this repository does not ship
 * anybody's photograph. So the hero is drawn: a paper-coloured map with a
 * great-circle route across it, rendered by sharp from an SVG into a PNG
 * that `@sveltejs/enhanced-img` then turns into AVIF and WebP at several
 * widths at build time.
 *
 * It is deterministic — run it twice, get the same bytes — so the PNG is
 * committed and this script is the record of how it was made:
 *
 *   node scripts/make-hero.ts
 */

import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { arc, type LngLat } from '../packages/waypoint/src/lib/geo/index.ts';

const W = 1600;
const H = 1000;

/** Lisbon → Porto → Madrid → Barcelona, the seeded trip. */
const STOPS: LngLat[] = [
	{ lng: -9.1393, lat: 38.7223 },
	{ lng: -8.6291, lat: 41.1579 },
	{ lng: -3.7038, lat: 40.4168 },
	{ lng: 2.1734, lat: 41.3851 }
];

/** An equirectangular window over Iberia, in degrees. */
const VIEW = { west: -12, east: 5, south: 35, north: 45 };

function project({ lng, lat }: LngLat): [number, number] {
	const x = ((lng - VIEW.west) / (VIEW.east - VIEW.west)) * W;
	const y = ((VIEW.north - lat) / (VIEW.north - VIEW.south)) * H;
	return [x, y];
}

/** A seeded pseudo-random, so the "contour lines" are the same every run. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

const random = rng(20260510);

const contours: string[] = [];
for (let i = 0; i < 26; i += 1) {
	const y0 = (i / 26) * H + random() * 30;
	let d = `M0 ${y0.toFixed(1)}`;
	for (let x = 0; x <= W; x += 100) {
		const y = y0 + Math.sin(x / 190 + i) * 22 + Math.sin(x / 61 + i * 3) * 8 + random() * 6;
		d += ` L${x} ${y.toFixed(1)}`;
	}
	contours.push(
		`<path d="${d}" fill="none" stroke="#c9c0ae" stroke-opacity="0.55" stroke-width="1.2"/>`
	);
}

const route: string[] = [];
for (let i = 1; i < STOPS.length; i += 1) {
	const points = arc(STOPS[i - 1]!, STOPS[i]!, 48).map(([lng, lat]) => project({ lng, lat }));
	route.push(
		`<polyline points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="#0f766e" stroke-width="5" stroke-linecap="round" stroke-dasharray="14 12"/>`
	);
}

const pins = STOPS.map((stop, i) => {
	const [x, y] = project(stop);
	return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="#f8f5ee" stroke="#0f766e" stroke-width="6"/><text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="#0f766e">${i + 1}</text>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
	<defs>
		<radialGradient id="glow" cx="62%" cy="42%" r="70%">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
			<stop offset="1" stop-color="#f1ebdf" stop-opacity="1"/>
		</radialGradient>
	</defs>
	<rect width="${W}" height="${H}" fill="url(#glow)"/>
	${contours.join('\n')}
	<g opacity="0.35">
		${Array.from({ length: 9 }, (_, i) => `<line x1="${(i * W) / 8}" y1="0" x2="${(i * W) / 8}" y2="${H}" stroke="#b6ad9b" stroke-width="1"/>`).join('')}
		${Array.from({ length: 6 }, (_, i) => `<line x1="0" y1="${(i * H) / 5}" x2="${W}" y2="${(i * H) / 5}" stroke="#b6ad9b" stroke-width="1"/>`).join('')}
	</g>
	${route.join('\n')}
	${pins}
	<g transform="translate(${W - 150} 110)" fill="none" stroke="#7a8191" stroke-width="3">
		<circle r="48"/><path d="M0 -40 L10 0 L0 -6 L-10 0 Z" fill="#0f766e" stroke="none"/>
		<text y="-56" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#7a8191" stroke="none">N</text>
	</g>
</svg>`;

/*
 * `compressionLevel: 9` and `palette: true` keep the PNG small; it is a
 * flat illustration, not a photograph, and 256 colours are plenty.
 */
const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
writeFileSync('src/lib/assets/hero.png', png);
console.log(`src/lib/assets/hero.png ${Math.round(png.byteLength / 1024)} KB, ${W}×${H}`);
