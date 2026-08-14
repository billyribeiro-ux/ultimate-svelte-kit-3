import { migrate } from 'drizzle-orm/libsql/migrator';
import { sql } from 'drizzle-orm';
import { db } from './db/index.ts';
import {
	availabilityRule,
	booking,
	business,
	customer,
	service,
	slotClaim,
	staff,
	staffService,
	timeOff,
	user
} from './db/schema.ts';
import { newId } from './db/ids.ts';
import type { Weekday } from '#lib/time/index.ts';

/**
 * Fixtures for tests that need a real database.
 *
 * Most of the interesting logic in this app is pure and tested without one — see
 * `#lib/time`. What is left is precisely the part a fake cannot check: whether
 * the database really does refuse the second person to claim a slot. A mock that
 * "simulates a unique constraint" would only be testing that we can write a mock.
 */

let migrated = false;

/** Bring the test database up to the current schema. Runs once per process. */
export async function ensureSchema(): Promise<void> {
	if (migrated) return;
	await migrate(db, { migrationsFolder: './drizzle' });
	migrated = true;
}

/**
 * Empty every table, in an order that respects foreign keys.
 *
 * Children first, parents last. Deleting a business before its bookings would
 * work — the cascades would handle it — but relying on cascades to clean up a
 * test makes the test quietly dependent on cascade rules it is not about.
 */
export async function resetDatabase(): Promise<void> {
	await ensureSchema();

	await db.delete(slotClaim);
	await db.delete(booking);
	await db.delete(timeOff);
	await db.delete(availabilityRule);
	await db.delete(staffService);
	await db.delete(customer);
	await db.delete(service);
	await db.delete(staff);
	await db.delete(business);
	await db.delete(user);

	// SQLite reuses pages rather than shrinking. Harmless, but a test file that
	// runs thousands of inserts leaves a surprisingly large artefact behind.
	await db.run(sql`PRAGMA optimize`);
}

export interface Fixture {
	businessId: string;
	businessSlug: string;
	staffId: string;
	otherStaffId: string;
	serviceId: string;
	longServiceId: string;
	timeZone: string;
}

/**
 * A small salon: two people, two services, Monday to Friday nine to five.
 *
 * Deliberately not random. Every test in the suite reasons about the same
 * imaginary shop, so a failure message like "expected 09:15" means something
 * without having to go and read what the fixture generated this time.
 */
export async function seedFixture(
	overrides: {
		timeZone?: string;
		minNoticeMinutes?: number;
		maxAdvanceDays?: number;
		cancellationNoticeHours?: number;
	} = {}
): Promise<Fixture> {
	const timeZone = overrides.timeZone ?? 'Europe/London';

	const [created] = await db
		.insert(business)
		.values({
			slug: 'willow-lane',
			name: 'Willow Lane Studio',
			tagline: 'Cuts, colour and quiet',
			timeZone,
			email: 'hello@willowlane.test',
			currency: 'GBP',
			minNoticeMinutes: overrides.minNoticeMinutes ?? 120,
			maxAdvanceDays: overrides.maxAdvanceDays ?? 60,
			cancellationNoticeHours: overrides.cancellationNoticeHours ?? 24
		})
		.returning();

	const businessId = created!.id;

	// Better Auth owns the `user` table, so tests insert the minimum it needs
	// rather than going through a sign-up flow that is not what they are testing.
	const ownerUserId = newId();
	const memberUserId = newId();
	await db.insert(user).values([
		{ id: ownerUserId, name: 'Ada Willow', email: 'ada@willowlane.test', emailVerified: true },
		{ id: memberUserId, name: 'Ben Reed', email: 'ben@willowlane.test', emailVerified: true }
	]);

	const [owner] = await db
		.insert(staff)
		.values({
			businessId,
			userId: ownerUserId,
			role: 'owner',
			displayName: 'Ada',
			colourHue: 268,
			sortOrder: 0
		})
		.returning();

	const [member] = await db
		.insert(staff)
		.values({
			businessId,
			userId: memberUserId,
			role: 'member',
			displayName: 'Ben',
			colourHue: 172,
			sortOrder: 1
		})
		.returning();

	const [cut] = await db
		.insert(service)
		.values({
			businessId,
			slug: 'cut-and-finish',
			name: 'Cut and finish',
			description: 'A consultation, a cut, and a proper blow dry.',
			durationMinutes: 45,
			bufferBeforeMinutes: 0,
			bufferAfterMinutes: 15,
			slotIntervalMinutes: 15,
			priceCents: 4800,
			sortOrder: 0
		})
		.returning();

	const [colour] = await db
		.insert(service)
		.values({
			businessId,
			slug: 'full-colour',
			name: 'Full colour',
			description: 'Full head colour, including the wait.',
			durationMinutes: 120,
			bufferBeforeMinutes: 15,
			bufferAfterMinutes: 15,
			slotIntervalMinutes: 30,
			priceCents: 12500,
			sortOrder: 1
		})
		.returning();

	await db.insert(staffService).values([
		{ staffId: owner!.id, serviceId: cut!.id },
		{ staffId: owner!.id, serviceId: colour!.id },
		{ staffId: member!.id, serviceId: cut!.id }
	]);

	const weekdays: Weekday[] = [1, 2, 3, 4, 5];
	await db.insert(availabilityRule).values(
		[owner!.id, member!.id].flatMap((staffId) =>
			weekdays.map((weekday) => ({
				staffId,
				weekday,
				startMinute: 9 * 60,
				endMinute: 17 * 60
			}))
		)
	);

	return {
		businessId,
		businessSlug: 'willow-lane',
		staffId: owner!.id,
		otherStaffId: member!.id,
		serviceId: cut!.id,
		longServiceId: colour!.id,
		timeZone
	};
}
