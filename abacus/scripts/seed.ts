/**
 * SEED
 * ====
 *
 * A workspace with nothing in it teaches nothing, so this creates a house
 * account and one sheet per template, and publishes each of them — so that
 * `/s/<id>` and `/embed/<id>` have something to show, and the end-to-end
 * suite has known pages to open.
 *
 * Runs outside SvelteKit — `node scripts/seed.ts` — so it cannot use
 * `$app/env/private` and reads `.env` itself. Everything else it needs, it
 * imports from the project: the templates, the schema.
 *
 * Idempotent: ids are fixed, and a row that already exists is left alone. Run
 * it twice and you get the same database, not two of everything.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { TEMPLATE_SLUGS, templateDocument } from '../src/lib/sheet/templates.ts';
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

/** The house account owns the seeded sheets. It has no passkey: nobody signs in as it. */
const HOUSE = { id: 'abacushouse00001', name: 'Abacus', locale: 'en-US' };

await db.insert(schema.users).values(HOUSE).onConflictDoNothing();

/** Fixed ids, so the seed is idempotent and the tests can link to them. */
const IDS: Record<string, string> = {
	budget: 'seedbudget',
	loan: 'seedloan00',
	grades: 'seedgrades'
};

/** One moment for every seeded row, so "published on" reads the same on every machine. */
const PUBLISHED_AT = Date.UTC(2026, 8, 1, 9, 0, 0);

let created = 0;
for (const slug of TEMPLATE_SLUGS) {
	const id = IDS[slug];
	if (!id) throw new Error(`No seed id for template "${slug}"`);
	const existing = await db.query.sheets.findFirst({ where: eq(schema.sheets.id, id) });
	if (existing) continue;

	const doc = templateDocument(slug);
	const json = JSON.stringify(doc);
	await db.insert(schema.sheets).values({
		id,
		ownerId: HOUSE.id,
		title: doc.title,
		access: 'link',
		doc: json,
		cellCount: doc.cells.length,
		published: json,
		publishedAt: PUBLISHED_AT,
		createdAt: PUBLISHED_AT,
		updatedAt: PUBLISHED_AT
	});
	created += 1;
}

console.info(`Seeded ${created} sheet${created === 1 ? '' : 's'} for ${HOUSE.name}.`);
client.close();
