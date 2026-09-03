/**
 * SEED
 * ====
 *
 * A gallery with nothing in it teaches nothing, so this publishes the three
 * presets and a few variations under a house artist, marks the presets as
 * featured, and makes sure the lobby exists.
 *
 * Runs outside SvelteKit — `node scripts/seed.ts` — so it cannot use
 * `$app/env/private` and reads `.env` itself. Everything else it needs, it
 * imports from the project: the presets, the DTO codec, the schema.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { toDto } from '../src/lib/pattern/dto.ts';
import { PRESETS } from '../src/lib/pattern/presets.ts';
import { slugify } from '../src/lib/vanity.ts';
import * as schema from '../src/lib/server/db/schema.ts';

if (!process.env.DATABASE_URL) {
	try {
		process.loadEnvFile('.env');
	} catch {
		// no .env: the variables must already be in the environment
	}
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = createClient({ url, intMode: 'number' });
const db = drizzle(client, { schema });

const HOUSE = { id: 'ostinatohouse001', handle: 'ostinato' };

await db.insert(schema.artists).values(HOUSE).onConflictDoNothing();

/** Deterministic ids, so the seed is idempotent and the e2e tests can link to them. */
const ids: Record<string, string> = {
	'four-on-the-floor': 'seedfour',
	'boom-bap': 'seedboom',
	'two-step': 'seedstep'
};

let n = 0;
for (const [name, build] of Object.entries(PRESETS)) {
	const pattern = build();
	const id = ids[name]!;
	const existing = await db.query.patterns.findFirst({ where: eq(schema.patterns.id, id) });
	if (existing) continue;

	await db.insert(schema.patterns).values({
		id,
		artistId: HOUSE.id,
		slug: slugify(pattern.title),
		title: pattern.title,
		bpm: pattern.bpm,
		data: JSON.stringify(toDto(pattern)),
		featured: true,
		plays: 40 - n * 7,
		likes: 12 - n * 3,
		createdAt: Date.now() - (n + 1) * 86_400_000
	});
	n += 1;
}

// Two unfeatured variations, so the gallery has something the landing page does not.
const variations = [
	{ id: 'seedslow', from: 'boom-bap', title: 'Boom bap, slower', bpm: 84 },
	{ id: 'seedfast', from: 'two-step', title: 'Two-step, faster', bpm: 140 }
];

for (const variation of variations) {
	const existing = await db.query.patterns.findFirst({
		where: eq(schema.patterns.id, variation.id)
	});
	if (existing) continue;
	const pattern = PRESETS[variation.from]!();
	pattern.title = variation.title;
	pattern.bpm = variation.bpm;
	await db.insert(schema.patterns).values({
		id: variation.id,
		artistId: HOUSE.id,
		slug: slugify(pattern.title),
		title: pattern.title,
		bpm: pattern.bpm,
		data: JSON.stringify(toDto(pattern)),
		remixOf: ids[variation.from] ?? null,
		createdAt: Date.now() - 3_600_000
	});
}

const lobby = await db.query.rooms.findFirst({ where: eq(schema.rooms.id, 'lobby') });
if (!lobby) {
	await db.insert(schema.rooms).values({
		id: 'lobby',
		name: 'The lobby',
		data: JSON.stringify(toDto(PRESETS['four-on-the-floor']!()))
	});
}

console.info(
	`Seeded. House artist @${HOUSE.handle}; patterns: ${[...Object.values(ids), ...variations.map((v) => v.id)].join(', ')}`
);
console.info('Open /p/seedfour, /@ostinato/four-on-the-floor, or /jam/lobby');
