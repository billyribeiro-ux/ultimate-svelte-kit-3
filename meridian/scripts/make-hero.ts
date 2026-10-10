/**
 * THE HERO IMAGE, FROM CODE
 * =========================
 *
 * A trip planner wants a photograph, and this repository does not ship
 * anybody's photograph. So the hero is drawn: the seeded trip's route
 * across a map of Iberia — the real coastline, from the same atlas the
 * product's map is built on — rendered by sharp from an SVG into a PNG that
 * `@sveltejs/enhanced-img` then turns into AVIF and WebP at several widths
 * at build time.
 *
 * Two prints, one drawing. The day print is in the light theme's map
 * colours and the night print in the dark theme's (`map/style.ts`), with
 * the route in each theme's `--sea`: the home page picks one with a
 * `<picture>`, so the dark page gets a print drawn for the dark, not the
 * day print run through a colour filter. (The filter was tried: a CSS
 * `hue-rotate` is a linear approximation, and it turned cream into a warm
 * olive with a black hole where the day print's highlight had been.)
 *
 * Two sizes, too, because one drawing cannot be right at both. Pins and
 * numbers are drawn in pixels of the image, and the image is shown 40rem
 * wide on a desktop and the full width of a 360px phone: the desktop
 * drawing's 26px pins came out at 15px on the phone, with numbers under
 * 5px tall. So there is a desktop print, 1600×1000 — twice the widest it
 * is shown — with pins about 26px across and 12px numbers at 640px, and a
 * phone print, 1200×750 and framed a little tighter on the route, drawn so
 * its pins are 21px and its numbers 11.5px at 360px. Every size below is
 * written in the pixels of the screen at the narrowest the print is shown,
 * and multiplied out per print. The home page picks the print by width
 * (`(site)/+page.svelte` says where the line is, and why).
 *
 * Nothing glows: the first version had a white bloom in the middle that
 * read as glare.
 *
 * It is deterministic — run it twice, get the same bytes — so the PNGs are
 * committed and this script is the record of how they were made:
 *
 *   node scripts/make-hero.ts
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { arc, type LngLat } from '../packages/waypoint/src/lib/geo/index.ts';

/** Lisbon → Porto → Madrid → Barcelona, the seeded trip. */
const STOPS: LngLat[] = [
	{ lng: -9.1393, lat: 38.7223 },
	{ lng: -8.6291, lat: 41.1579 },
	{ lng: -3.7038, lat: 40.4168 },
	{ lng: 2.1734, lat: 41.3851 }
];

/** An equirectangular window over Iberia, in degrees. */
interface View {
	readonly west: number;
	readonly east: number;
	readonly south: number;
	readonly north: number;
}

/**
 * One drawing: its size, the window it shows, and how many of its pixels
 * make one screen pixel at the narrowest it is shown — the number every
 * stroke, pin and letter is multiplied by.
 */
interface Frame {
	readonly width: number;
	readonly height: number;
	readonly view: View;
	readonly scale: number;
	/** The pins' diameter and the numbers' size, in screen pixels. */
	readonly pin: number;
	readonly digits: number;
	/** The compass rose in the top corner: the desktop's ornament, which on a phone sat on Barcelona. */
	readonly rose: boolean;
}

const DESKTOP: Frame = {
	width: 1600,
	height: 1000,
	view: { west: -12, east: 5, south: 35, north: 45 },
	scale: 1600 / 640,
	pin: 25.6,
	digits: 12,
	rose: true
};

const PHONE: Frame = {
	width: 1200,
	height: 750,
	view: { west: -11.2, east: 4.2, south: 35.2, north: 44.8 },
	scale: 1200 / 360,
	pin: 21,
	digits: 11.5,
	rose: false
};

function projector({ width, height, view }: Frame) {
	return ([lng = 0, lat = 0]: readonly number[]): [number, number] => [
		((lng - view.west) / (view.east - view.west)) * width,
		((view.north - lat) / (view.north - view.south)) * height
	];
}

/** A seeded pseudo-random, so the contour lines are the same every run. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

/* ------------------------------------------------------------------ */
/* The land                                                            */
/* ------------------------------------------------------------------ */

const topology = JSON.parse(
	readFileSync('node_modules/world-atlas/land-50m.json', 'utf8')
) as Topology<{ land: GeometryCollection }>;
const land = feature(topology, topology.objects.land) as FeatureCollection<Polygon | MultiPolygon>;

/** A path through projected points: `M` to the first, `L` to each after. */
function path(points: readonly (readonly number[])[], project: ReturnType<typeof projector>) {
	return points
		.map((position, i) => {
			const [x, y] = project(position);
			return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
		})
		.join('');
}

/* ------------------------------------------------------------------ */
/* Land, contours, graticule and route, for one frame                  */
/* ------------------------------------------------------------------ */

function geometry(frame: Frame) {
	const { width: W, height: H, view } = frame;
	const project = projector(frame);
	/* Sizes are the desktop print's, in its own pixels, times this: 1 for the desktop, more for a print shown smaller. */
	const k = frame.scale / DESKTOP.scale;

	/* Rings that come within two degrees of the window; the rest of the world is not drawn. */
	const near = (ring: Position[]) =>
		ring.some(
			([lng = 0, lat = 0]) =>
				lng > view.west - 2 && lng < view.east + 2 && lat > view.south - 2 && lat < view.north + 2
		);
	const rings: Position[][] = [];
	for (const { geometry } of land.features) {
		const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
		for (const polygon of polygons) for (const ring of polygon) if (near(ring)) rings.push(ring);
	}
	const landPath = rings.map((ring) => path(ring, project) + 'Z').join('');

	const random = rng(20260510);
	const contours: string[] = [];
	for (let i = 0; i < 11; i += 1) {
		const y0 = 120 + (i / 11) * (H / k - 160) + random() * 24;
		let d = `M0 ${(y0 * k).toFixed(1)}`;
		for (let x = 0; x <= W / k; x += 80) {
			const y = y0 + Math.sin(x / 210 + i) * 26 + Math.sin(x / 73 + i * 3) * 9 + random() * 5;
			d += ` L${Math.round(x * k)} ${(y * k).toFixed(1)}`;
		}
		contours.push(d);
	}

	const graticule = [
		...Array.from({ length: Math.ceil(view.east - view.west) }, (_, i) => {
			const [x] = project([Math.floor(view.west) + i + 1, 0]);
			return `M${x.toFixed(1)} 0V${H}`;
		}),
		...Array.from({ length: Math.ceil(view.north - view.south) - 1 }, (_, i) => {
			const [, y] = project([0, Math.floor(view.south) + i + 1]);
			return `M0 ${y.toFixed(1)}H${W}`;
		})
	].join('');

	const route = STOPS.slice(1)
		.map((to, i) => path(arc(STOPS[i]!, to, 48), project))
		.join('');

	const pins = STOPS.map((stop) => project([stop.lng, stop.lat]));

	return { W, H, k, landPath, contours, graticule, route, pins };
}

interface Palette {
	readonly water: string;
	readonly land: string;
	readonly coast: string;
	readonly contour: string;
	readonly graticule: string;
	readonly halo: string;
	readonly route: string;
	readonly pin: string;
	readonly ink: string;
}

/* The map's colours (`src/lib/map/style.ts`) and the theme's `--sea` and `--ink-3`, by hand: a PNG cannot read a token. */
const DAY: Palette = {
	water: '#dbe7ee',
	land: '#f6f1e6',
	coast: '#c4baa6',
	contour: '#d9cfbd',
	graticule: '#b6ad9b',
	halo: '#ffffff',
	route: '#0f766e',
	pin: '#ffffff',
	ink: '#5f6574'
};

const NIGHT: Palette = {
	water: '#0c1117',
	land: '#1c232d',
	coast: '#33404f',
	contour: '#28313d',
	graticule: '#3a4350',
	halo: '#101318',
	route: '#2dd4bf',
	pin: '#171b22',
	ink: '#8b95a5'
};

function rose(W: number, p: Palette): string {
	return `<g transform="translate(${W - 130} 130)" fill="none" stroke="${p.ink}" stroke-width="3">
		<circle r="52"/>
		<path d="M0 -44 L12 0 L0 -8 L-12 0 Z" fill="${p.route}" stroke="none"/>
		<text y="-64" text-anchor="middle" font-family="Inter, sans-serif" font-size="22" font-weight="600" fill="${p.ink}" stroke="none">N</text>
	</g>`;
}

function svg(frame: Frame, p: Palette): string {
	const { W, H, k, landPath, contours, graticule, route, pins } = geometry(frame);
	/* Two decimals: 2.8 × 2.5 is 7.000000000000001 to a float, and the SVG is the record. */
	const n = (value: number) => Number(value.toFixed(2));
	const r = n((frame.pin * frame.scale) / 2);
	const digits = n(frame.digits * frame.scale);
	const ring = n(2.8 * frame.scale);

	const markers = pins
		.map(
			([x, y], i) => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
			<circle r="${r}" fill="${p.pin}" stroke="${p.route}" stroke-width="${ring}"/>
			<text y="${n((digits * 11) / 30)}" text-anchor="middle" font-family="Inter, sans-serif" font-size="${digits}" font-weight="700" fill="${p.route}">${i + 1}</text>
		</g>`
		)
		.join('');

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
	<defs><clipPath id="land"><path d="${landPath}" clip-rule="evenodd"/></clipPath></defs>
	<rect width="${W}" height="${H}" fill="${p.water}"/>
	<path d="${graticule}" fill="none" stroke="${p.graticule}" stroke-opacity="0.35" stroke-width="${n(1.5 * k)}"/>
	<path d="${landPath}" fill="${p.land}" fill-rule="evenodd"/>
	<g clip-path="url(#land)">
		${contours.map((d) => `<path d="${d}" fill="none" stroke="${p.contour}" stroke-width="${n(2.4 * k)}"/>`).join('')}
	</g>
	<path d="${landPath}" fill="none" stroke="${p.coast}" stroke-width="${n(2 * k)}"/>
	<path d="${route}" fill="none" stroke="${p.halo}" stroke-opacity="0.9" stroke-width="${n(16 * k)}" stroke-linecap="round" stroke-linejoin="round"/>
	<path d="${route}" fill="none" stroke="${p.route}" stroke-width="${n(7 * k)}" stroke-linecap="round" stroke-dasharray="${n(20 * k)} ${n(14 * k)}"/>
	${markers}
	${frame.rose ? rose(W, p) : ''}
</svg>`;
}

/*
 * `compressionLevel: 9` and `palette: true` keep the PNGs small; they are
 * flat illustrations, not photographs, and 256 colours are plenty.
 */
for (const [file, frame, palette] of [
	['src/lib/assets/hero.png', DESKTOP, DAY],
	['src/lib/assets/hero-night.png', DESKTOP, NIGHT],
	['src/lib/assets/hero-phone.png', PHONE, DAY],
	['src/lib/assets/hero-phone-night.png', PHONE, NIGHT]
] as const) {
	const png = await sharp(Buffer.from(svg(frame, palette)))
		.png({ compressionLevel: 9, palette: true })
		.toBuffer();
	writeFileSync(file, png);
	console.log(`${file} ${Math.round(png.byteLength / 1024)} KB, ${frame.width}×${frame.height}`);
}
