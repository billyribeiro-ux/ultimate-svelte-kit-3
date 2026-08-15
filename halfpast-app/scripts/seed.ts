/**
 * Seed the database with a believable demo business.
 *
 * Run with `pnpm run db:seed`. Safe to run repeatedly — it clears the tables it
 * owns first, so you always land in a known state rather than accumulating
 * seventeen Willow Lanes.
 *
 * This script runs OUTSIDE Vite, so `$app/env/private` does not exist here and
 * `#lib/server/db/index.ts` cannot be imported. It builds its own client from
 * `process.env` instead. Everything else — the schema, the id generators, the
 * time layer — is plain TypeScript with no framework dependency, which is
 * exactly why it can be reused here without ceremony.
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { hashPassword } from 'better-auth/crypto';
import {
	account,
	availabilityRule,
	booking,
	business,
	customer,
	service,
	session,
	slotClaim,
	staff,
	staffService,
	timeOff,
	user
} from '#lib/server/db/schema.ts';
import { newBookingReference, newId, newManageToken } from '#lib/server/db/ids.ts';
import { addDays, slotsIn, todayIn, wallClockToInstant, type Weekday } from '#lib/time/index.ts';

/*
 * Node 22 can read a `.env` file without a dependency.
 *
 * Only when nothing has been set already, though: the end-to-end harness runs
 * this with `DATABASE_URL` pointing at a throwaway database, and loading `.env`
 * unconditionally would quietly redirect the seed into the development one and
 * wipe it.
 */
if (!process.env.DATABASE_URL) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set — copy .env.example to .env');

const client = createClient({
	url,
	...(process.env.DATABASE_AUTH_TOKEN ? { authToken: process.env.DATABASE_AUTH_TOKEN } : {})
});
const db = drizzle(client);

/*
 * A generous busy timeout, which is safe *here* and would not be in the server.
 *
 * SQLite lets one process write at a time. `busy_timeout` makes a blocked writer
 * wait rather than fail immediately — and it waits by blocking the thread. In
 * the server that is a deadlock risk (see `write-queue.ts`); in a short-lived
 * script whose entire job is this one task, blocking is exactly right. It lets
 * the seeder wait politely for a running server to finish a booking instead of
 * dying with `SQLITE_BUSY`.
 */
await client.execute('PRAGMA busy_timeout = 10000');

const TIME_ZONE = 'Europe/London';
const DEMO_PASSWORD = 'halfpast-demo-2026';

/* -------------------------------------------------------------------------- */

console.log('· clearing');

// Children first. Relying on cascades here would work but would make the script
// depend on rules it is not about.
await db.delete(slotClaim);
await db.delete(booking);
await db.delete(timeOff);
await db.delete(availabilityRule);
await db.delete(staffService);
await db.delete(customer);
await db.delete(service);
await db.delete(staff);
await db.delete(business);
await db.delete(session);
await db.delete(account);
await db.delete(user);

/* -------------------------------------------------------------------------- */

console.log('· business');

const [studio] = await db
	.insert(business)
	.values({
		slug: 'willow-lane',
		name: 'Willow Lane Studio',
		tagline: 'Cuts, colour and quiet',
		description:
			'A two-chair studio off Gloucester Road. We take one appointment at a time, so the room stays calm and you get the whole hour.',
		timeZone: TIME_ZONE,
		email: 'hello@willowlane.test',
		phone: '0117 496 0142',
		addressLine: '48a Willow Lane',
		city: 'Bristol',
		postcode: 'BS7 8QT',
		country: 'GB',
		currency: 'GBP',
		minNoticeMinutes: 120,
		maxAdvanceDays: 60,
		cancellationNoticeHours: 24
	})
	.returning();

const businessId = studio!.id;

/* -------------------------------------------------------------------------- */

console.log('· staff accounts');

/**
 * Create a Better Auth account the way Better Auth would.
 *
 * A row in `user` for the identity, a row in `account` with `providerId:
 * 'credential'` for the password. `hashPassword` is imported from Better Auth
 * itself rather than reimplemented — the hash format is its business, and a
 * hand-rolled scrypt call that is subtly different produces a user who cannot
 * log in and no error message explaining why.
 */
async function createStaffUser(name: string, email: string) {
	const userId = newId();

	await db.insert(user).values({ id: userId, name, email, emailVerified: true });

	await db.insert(account).values({
		id: newId(),
		accountId: userId,
		providerId: 'credential',
		userId,
		password: await hashPassword(DEMO_PASSWORD)
	});

	return userId;
}

const adaUserId = await createStaffUser('Ada Willow', 'ada@willowlane.test');
const benUserId = await createStaffUser('Ben Reed', 'ben@willowlane.test');

const [ada] = await db
	.insert(staff)
	.values({
		businessId,
		userId: adaUserId,
		role: 'owner',
		displayName: 'Ada',
		bio: 'Opened Willow Lane in 2019. Precision cutting, and the person to see about a fringe.',
		colourHue: 268,
		sortOrder: 0
	})
	.returning();

const [ben] = await db
	.insert(staff)
	.values({
		businessId,
		userId: benUserId,
		role: 'member',
		displayName: 'Ben',
		bio: 'Colour specialist. Balayage, gloss, and talking you out of going platinum in January.',
		colourHue: 172,
		sortOrder: 1
	})
	.returning();

/* -------------------------------------------------------------------------- */

console.log('· services');

const serviceRows = await db
	.insert(service)
	.values([
		{
			businessId,
			slug: 'cut-and-finish',
			name: 'Cut and finish',
			description: 'A proper consultation, a cut, and a blow dry you can actually recreate.',
			durationMinutes: 45,
			bufferBeforeMinutes: 0,
			bufferAfterMinutes: 15,
			slotIntervalMinutes: 15,
			priceCents: 4800,
			sortOrder: 0
		},
		{
			businessId,
			slug: 'restyle',
			name: 'Restyle',
			description: 'For a real change of direction. Longer consultation, no rushing.',
			durationMinutes: 75,
			bufferBeforeMinutes: 0,
			bufferAfterMinutes: 15,
			slotIntervalMinutes: 15,
			priceCents: 7500,
			sortOrder: 1
		},
		{
			businessId,
			slug: 'full-colour',
			name: 'Full colour',
			description: 'Full head colour including the development time and a finish.',
			durationMinutes: 120,
			bufferBeforeMinutes: 15,
			bufferAfterMinutes: 15,
			slotIntervalMinutes: 30,
			priceCents: 12500,
			sortOrder: 2
		},
		{
			businessId,
			slug: 'fringe-trim',
			name: 'Fringe trim',
			description: 'Free between appointments if you had your last cut with us.',
			durationMinutes: 15,
			bufferBeforeMinutes: 0,
			bufferAfterMinutes: 5,
			slotIntervalMinutes: 15,
			priceCents: 0,
			sortOrder: 3
		}
	])
	.returning();

const byServiceSlug = new Map(serviceRows.map((row) => [row.slug, row]));
const serviceId = (slug: string) => byServiceSlug.get(slug)!.id;

await db.insert(staffService).values([
	// Ada does everything.
	{ staffId: ada!.id, serviceId: serviceId('cut-and-finish') },
	{ staffId: ada!.id, serviceId: serviceId('restyle') },
	{ staffId: ada!.id, serviceId: serviceId('full-colour') },
	{ staffId: ada!.id, serviceId: serviceId('fringe-trim') },
	// Ben is colour, and cuts but not restyles.
	{ staffId: ben!.id, serviceId: serviceId('cut-and-finish') },
	{ staffId: ben!.id, serviceId: serviceId('full-colour') },
	{ staffId: ben!.id, serviceId: serviceId('fringe-trim') }
]);

/* -------------------------------------------------------------------------- */

console.log('· opening hours');

const MON: Weekday = 1;
const TUE: Weekday = 2;
const WED: Weekday = 3;
const THU: Weekday = 4;
const FRI: Weekday = 5;
const SAT: Weekday = 6;

/**
 * Deliberately not identical for the two of them, and deliberately including a
 * lunch break — two rows for one day is how a gap in the middle is expressed.
 */
await db.insert(availabilityRule).values([
	// Ada: Tuesday to Saturday, with an hour for lunch.
	...[TUE, WED, THU, FRI].flatMap((weekday) => [
		{ staffId: ada!.id, weekday, startMinute: 9 * 60, endMinute: 13 * 60 },
		{ staffId: ada!.id, weekday, startMinute: 14 * 60, endMinute: 18 * 60 }
	]),
	{ staffId: ada!.id, weekday: SAT, startMinute: 9 * 60, endMinute: 16 * 60 },

	// Ben: Monday to Friday, later start, no break.
	...[MON, TUE, WED, THU, FRI].map((weekday) => ({
		staffId: ben!.id,
		weekday,
		startMinute: 10 * 60,
		endMinute: 19 * 60
	}))
]);

/* -------------------------------------------------------------------------- */

console.log('· a few appointments already in the diary');

const today = todayIn(TIME_ZONE);

const customerRows = await db
	.insert(customer)
	.values([
		{ businessId, name: 'Priya Raman', email: 'priya@example.test', phone: '07700 900118' },
		{ businessId, name: 'Tom Vasquez', email: 'tom@example.test' },
		{ businessId, name: 'Nora Ellis', email: 'nora@example.test', notes: 'Prefers the back chair.' }
	])
	.returning();

/** Book a slot the way the app does: a booking row plus its grid claims. */
async function seedBooking(input: {
	staffId: string;
	serviceSlug: string;
	customerIndex: number;
	dayOffset: number;
	startMinute: number;
	note?: string;
}) {
	const chosen = byServiceSlug.get(input.serviceSlug)!;
	const day = addDays(today, input.dayOffset);
	const start = wallClockToInstant(day, input.startMinute, TIME_ZONE);
	const end = start + chosen.durationMinutes * 60_000;
	const blockStart = start - chosen.bufferBeforeMinutes * 60_000;
	const blockEnd = end + chosen.bufferAfterMinutes * 60_000;

	const [created] = await db
		.insert(booking)
		.values({
			reference: newBookingReference(),
			manageToken: newManageToken(),
			businessId,
			staffId: input.staffId,
			serviceId: chosen.id,
			customerId: customerRows[input.customerIndex]!.id,
			status: 'confirmed',
			startsAt: new Date(start),
			endsAt: new Date(end),
			blockStartsAt: new Date(blockStart),
			blockEndsAt: new Date(blockEnd),
			timeZone: TIME_ZONE,
			serviceName: chosen.name,
			durationMinutes: chosen.durationMinutes,
			priceCents: chosen.priceCents,
			currency: 'GBP',
			customerNote: input.note ?? null
		})
		.returning();

	await db.insert(slotClaim).values(
		slotsIn({ start: blockStart, end: blockEnd }).map((cell) => ({
			staffId: input.staffId,
			slotStart: new Date(cell),
			bookingId: created!.id
		}))
	);

	return created!;
}

/*
 * Spread across the next few days so the diary looks lived-in on first run,
 * and so the availability grid has visible gaps to demonstrate. Some of these
 * may land on a closed day depending on which weekday you seed on — that is
 * fine and is itself realistic: the diary shows what is booked, and the
 * availability engine independently decides what is bookable.
 */
const seeded = [
	await seedBooking({
		staffId: ada!.id,
		serviceSlug: 'cut-and-finish',
		customerIndex: 0,
		dayOffset: 1,
		startMinute: 10 * 60,
		note: 'Growing out a bob — please keep the length.'
	}),
	await seedBooking({
		staffId: ada!.id,
		serviceSlug: 'restyle',
		customerIndex: 2,
		dayOffset: 1,
		startMinute: 14 * 60 + 30
	}),
	await seedBooking({
		staffId: ben!.id,
		serviceSlug: 'full-colour',
		customerIndex: 1,
		dayOffset: 2,
		startMinute: 11 * 60
	}),
	await seedBooking({
		staffId: ben!.id,
		serviceSlug: 'cut-and-finish',
		customerIndex: 0,
		dayOffset: 3,
		startMinute: 16 * 60
	})
];

/* -------------------------------------------------------------------------- */

console.log('· a day off');

// Ada is away a week on Thursday. Stored as instants, because "away from Friday
// evening to Monday morning" is a continuous stretch of real time.
await db.insert(timeOff).values({
	staffId: ada!.id,
	startsAt: new Date(wallClockToInstant(addDays(today, 9), 0, TIME_ZONE)),
	endsAt: new Date(wallClockToInstant(addDays(today, 10), 0, TIME_ZONE)),
	reason: 'Training day'
});

/* -------------------------------------------------------------------------- */

console.log('');
console.log('  Seeded Willow Lane Studio.');
console.log('');
console.log(`  Booking page   /book/willow-lane`);
console.log(`  Owner sign-in  ada@willowlane.test  ${DEMO_PASSWORD}`);
console.log(`  Staff sign-in  ben@willowlane.test  ${DEMO_PASSWORD}`);
console.log('');
console.log(`  Manage a booking as the customer would:`);
console.log(`    /booking/${seeded[0]!.manageToken}`);
console.log('');

client.close();
