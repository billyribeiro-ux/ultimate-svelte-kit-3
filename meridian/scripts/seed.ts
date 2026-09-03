/**
 * SEED
 * ====
 *
 * Three people and a trip they are planning together, so that the app opens
 * onto something and the end-to-end suite has known rows to find.
 *
 * Runs outside SvelteKit — `node scripts/seed.ts` — so it cannot import
 * `$app/env/private` or `#lib/server/db/index.ts`, and builds its own client
 * from `process.env`. Everything else it needs it imports from the project:
 * the schema and the id helpers are plain TypeScript.
 *
 * Idempotent: every id is fixed, and the seeded rows are deleted before they
 * are written, so running it twice gives one trip rather than two.
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { inArray } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { createLocalAccountIssuer } from 'better-auth/db';
import * as v from 'valibot';
import { IdSchema } from '../src/lib/domain/schemas.ts';
import * as auth from '../src/lib/server/db/auth.schema.ts';
import * as app from '../src/lib/server/db/schema.ts';

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
const db = drizzle(client, { schema: { ...auth, ...app } });
await client.execute('pragma busy_timeout = 10000');

/** Every seeded person signs in with this. Twelve characters is the minimum. */
export const DEMO_PASSWORD = 'meridian-demo-2026';

/**
 * A fixed, recognisable id that is still a UUID. Built *through* the schema
 * the app validates with, so a malformed one throws here, at seed time. The
 * first version wrote these by hand and left the last group one character
 * short; every command that named a seeded row then failed validation on
 * the server, and the end-to-end suite was the first to notice.
 */
const seedId = (suffix: string): string =>
	v.parse(IdSchema, `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`);

/*
 * Fixed ids. Valid UUIDs, because the schemas insist on the format, and
 * recognisable, because a test that fails will print them.
 */
export const USERS = {
	ana: {
		id: seedId('0000000000a1'),
		name: 'Ana Ribeiro',
		email: 'ana@meridian.test'
	},
	ben: {
		id: seedId('0000000000b2'),
		name: 'Ben Okafor',
		email: 'ben@meridian.test'
	},
	cal: {
		id: seedId('0000000000c3'),
		name: 'Cal Nguyen',
		email: 'cal@meridian.test'
	}
} as const;

export const TRIPS = {
	iberia: { id: seedId('00000000d001'), slug: 'seediberia' },
	japan: { id: seedId('00000000d002'), slug: 'seedjapan2' }
} as const;

console.log('· clearing seeded rows');
await db.delete(app.trip).where(
	inArray(
		app.trip.id,
		Object.values(TRIPS).map((t) => t.id)
	)
);
await db.delete(auth.user).where(
	inArray(
		auth.user.id,
		Object.values(USERS).map((u) => u.id)
	)
);

console.log('· people');

/**
 * Create a Better Auth account the way Better Auth would: a `user` row for
 * the identity and an `account` row with `providerId: 'credential'` for the
 * password. `hashPassword` comes from Better Auth itself — the hash format is
 * its business, and a hand-rolled scrypt that is subtly different produces a
 * person who cannot log in and no error saying why.
 */
const password = await hashPassword(DEMO_PASSWORD);
for (const person of Object.values(USERS)) {
	await db.insert(auth.user).values({ ...person, emailVerified: true });
	await db.insert(auth.account).values({
		id: `${person.id}-account`,
		accountId: person.id,
		providerId: 'credential',
		issuer: createLocalAccountIssuer('credential'),
		userId: person.id,
		password
	});
}

console.log('· Iberia by rail');
const iberia = TRIPS.iberia;
await db.insert(app.trip).values({
	id: iberia.id,
	slug: iberia.slug,
	name: 'Iberia by rail',
	description: 'Lisbon to Barcelona in eight days, mostly on trains, with one detour for a palace.',
	ownerId: USERS.ana.id,
	startDate: '2026-05-10',
	endDate: '2026-05-17',
	currency: 'EUR',
	visibility: 'private',
	version: 1
});

await db.insert(app.member).values([
	{ tripId: iberia.id, userId: USERS.ana.id, role: 'owner' },
	{ tripId: iberia.id, userId: USERS.ben.id, role: 'editor' },
	{ tripId: iberia.id, userId: USERS.cal.id, role: 'viewer' }
]);

/** `[id suffix, name, kind, lng, lat, date, position, notes, placeId]` */
const STOPS = [
	[
		'a001',
		'Alfama',
		'place',
		-9.1308,
		38.7118,
		'2026-05-10',
		0,
		'Get lost on purpose. Tram 28 if the queue is short.',
		'lisbon'
	],
	[
		'a002',
		'Pastéis de Belém',
		'food',
		-9.2033,
		38.6975,
		'2026-05-10',
		1,
		'Two each. Cinnamon on top.',
		'lisbon'
	],
	['a003', 'Hotel Lisboa', 'lodging', -9.145, 38.7169, '2026-05-10', 2, '', 'lisbon'],
	[
		'a004',
		'Pena Palace',
		'activity',
		-9.3906,
		38.7876,
		'2026-05-11',
		0,
		'Book the 9:30 slot.',
		'sintra'
	],
	[
		'a005',
		'Train to Porto',
		'transport',
		-9.1463,
		38.7139,
		'2026-05-12',
		0,
		'Alfa Pendular from Santa Apolónia, 3h.',
		'lisbon'
	],
	['a006', 'Ribeira', 'place', -8.6134, 41.1408, '2026-05-12', 1, '', 'porto'],
	['a007', 'Livraria Lello', 'activity', -8.6149, 41.1469, '2026-05-13', 0, '', 'porto'],
	[
		'a008',
		'Train to Madrid',
		'transport',
		-8.5856,
		41.1489,
		'2026-05-14',
		0,
		'Overnight. Bring the good pillow.',
		'porto'
	],
	[
		'a009',
		'Museo del Prado',
		'activity',
		-3.6922,
		40.4138,
		'2026-05-15',
		0,
		'Free entry after 18:00.',
		'madrid'
	],
	[
		'a010',
		'Train to Barcelona',
		'transport',
		-3.6907,
		40.4065,
		'2026-05-16',
		0,
		'AVE from Atocha, 2h30.',
		'madrid'
	],
	['a011', 'Sagrada Família', 'activity', 2.1744, 41.4036, '2026-05-16', 1, '', 'barcelona'],
	['a012', 'Barceloneta', 'place', 2.1896, 41.3795, '2026-05-17', 0, 'Last swim.', 'barcelona'],
	[
		'a013',
		'Évora',
		'idea',
		-7.9097,
		38.5714,
		null,
		0,
		'If we can spare a day: the bone chapel and the aqueduct.',
		'evora'
	],
	[
		'a014',
		'Segovia',
		'idea',
		-4.1088,
		40.9429,
		null,
		1,
		'Day trip from Madrid for the aqueduct.',
		'segovia'
	]
] as const;

await db.insert(app.stop).values(
	STOPS.map(([suffix, name, kind, lng, lat, date, position, notes, placeId]) => ({
		id: seedId(suffix),
		tripId: iberia.id,
		name,
		kind,
		lng,
		lat,
		date,
		position,
		notes,
		placeId,
		createdBy: USERS.ana.id
	}))
);

/** `[id suffix, title, amount in cents, category, date, paidBy, participants]` */
const EXPENSES = [
	[
		'e001',
		'Hotel Lisboa, two nights',
		26400,
		'lodging',
		'2026-05-10',
		'ana',
		['ana', 'ben', 'cal']
	],
	['e002', 'Pastéis and coffee', 1350, 'food', '2026-05-10', 'ben', ['ana', 'ben', 'cal']],
	['e003', 'Pena Palace tickets', 4200, 'activity', '2026-05-11', 'cal', ['ana', 'ben', 'cal']],
	['e004', 'Train to Porto', 9600, 'transport', '2026-05-12', 'ana', ['ana', 'ben', 'cal']],
	['e005', 'Francesinhas', 4800, 'food', '2026-05-12', 'ben', ['ana', 'ben']],
	['e006', 'Night train to Madrid', 18900, 'transport', '2026-05-14', 'ana', ['ana', 'ben', 'cal']],
	['e007', 'Tapas crawl', 6100, 'food', '2026-05-15', 'cal', ['ana', 'ben', 'cal']],
	['e008', 'AVE to Barcelona', 11400, 'transport', '2026-05-16', 'ben', ['ana', 'ben', 'cal']]
] as const;

for (const [suffix, title, amountMinor, category, date, payer, participants] of EXPENSES) {
	const id = seedId(suffix);
	await db.insert(app.expense).values({
		id,
		tripId: iberia.id,
		title,
		amountMinor,
		currency: 'EUR',
		category,
		date,
		paidBy: USERS[payer].id
	});
	await db
		.insert(app.expenseShare)
		.values(participants.map((who) => ({ expenseId: id, userId: USERS[who].id, weight: 1 })));
}

await db.insert(app.note).values({
	tripId: iberia.id,
	updatedBy: USERS.ana.id,
	doc: {
		type: 'doc',
		content: [
			{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Before we go' }] },
			{
				type: 'bulletList',
				content: [
					{
						type: 'listItem',
						content: [
							{ type: 'paragraph', content: [{ type: 'text', text: 'Book the Pena Palace slot' }] }
						]
					},
					{
						type: 'listItem',
						content: [
							{
								type: 'paragraph',
								content: [{ type: 'text', text: 'Ben brings the rail passes' }]
							}
						]
					}
				]
			},
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'Rule of the trip: nobody says ' },
					{ type: 'text', marks: [{ type: 'italic' }], text: 'we should have' },
					{ type: 'text', text: ' until we are home.' }
				]
			}
		]
	}
});

console.log('· Japan in autumn (a link-visible trip that only Ben belongs to)');
const japan = TRIPS.japan;
await db.insert(app.trip).values({
	id: japan.id,
	slug: japan.slug,
	name: 'Japan in autumn',
	description: 'Tokyo, Kyoto and Hiroshima when the maples turn.',
	ownerId: USERS.ben.id,
	startDate: '2026-11-14',
	endDate: '2026-11-24',
	currency: 'JPY',
	visibility: 'link',
	version: 1
});
await db.insert(app.member).values({ tripId: japan.id, userId: USERS.ben.id, role: 'owner' });
await db.insert(app.stop).values([
	{
		id: seedId('00000000f101'),
		tripId: japan.id,
		name: 'Senso-ji',
		kind: 'place',
		lng: 139.7967,
		lat: 35.7148,
		date: '2026-11-14',
		position: 0,
		placeId: 'tokyo',
		createdBy: USERS.ben.id
	},
	{
		id: seedId('00000000f102'),
		tripId: japan.id,
		name: 'Shinkansen to Kyoto',
		kind: 'transport',
		lng: 139.7671,
		lat: 35.6812,
		date: '2026-11-17',
		position: 0,
		placeId: 'tokyo',
		createdBy: USERS.ben.id
	},
	{
		id: seedId('00000000f103'),
		tripId: japan.id,
		name: 'Fushimi Inari',
		kind: 'activity',
		lng: 135.7727,
		lat: 34.9671,
		date: '2026-11-18',
		position: 0,
		placeId: 'kyoto',
		createdBy: USERS.ben.id
	},
	{
		id: seedId('00000000f104'),
		tripId: japan.id,
		name: 'Peace Memorial',
		kind: 'place',
		lng: 132.4525,
		lat: 34.3955,
		date: '2026-11-22',
		position: 0,
		placeId: 'hiroshima',
		createdBy: USERS.ben.id
	}
]);

console.log(`
Seeded. Sign in as any of these with the password "${DEMO_PASSWORD}":

  ${USERS.ana.email}   owner of "Iberia by rail"        /t/${iberia.slug}
  ${USERS.ben.email}   editor of it, owner of "Japan in autumn"  /t/${japan.slug}
  ${USERS.cal.email}   viewer of "Iberia by rail"
`);

client.close();
