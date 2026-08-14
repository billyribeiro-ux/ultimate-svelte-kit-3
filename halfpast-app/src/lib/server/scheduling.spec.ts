import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db/index.ts';
import { booking, slotClaim } from './db/schema.ts';
import {
	BookingError,
	cancelBooking,
	createBooking,
	isUniqueViolation,
	loadAvailability,
	loadBookingByToken,
	loadDiary
} from './scheduling.ts';
import { resetDatabase, seedFixture, type Fixture } from './test-support.ts';
import { formatTime, wallClockToInstant } from '#lib/time/index.ts';

const LONDON = 'Europe/London';

/** Monday 17 August 2026. A quiet week with no clock changes in it. */
const MONDAY = '2026-08-17';

/** A fixed "now", a week before the fixture week, so notice rules never bite. */
const NOW = new Date('2026-08-10T09:00:00Z').getTime();

const at = (minute: number, day = MONDAY, zone = LONDON) => wallClockToInstant(day, minute, zone);

let fixture: Fixture;

beforeEach(async () => {
	await resetDatabase();
	fixture = await seedFixture();
});

/** The standard booking, with only the interesting bits spelled out per test. */
function bookingInput(overrides: Partial<Parameters<typeof createBooking>[0]> = {}) {
	return {
		businessSlug: fixture.businessSlug,
		serviceId: fixture.serviceId,
		staffId: fixture.staffId,
		start: at(11 * 60),
		customerName: 'Sam Okafor',
		customerEmail: 'sam@example.test',
		now: NOW,
		...overrides
	};
}

describe('loadAvailability', () => {
	it('offers both staff members for a service they can both do', async () => {
		const result = await loadAvailability({
			businessSlug: fixture.businessSlug,
			serviceId: fixture.serviceId,
			from: MONDAY,
			to: MONDAY,
			now: NOW
		});

		expect(result.availability).toHaveLength(2);
		expect(result.availability.every((entry) => entry.slots.length > 0)).toBe(true);
	});

	it('offers only the staff who can do a specialised service', async () => {
		const result = await loadAvailability({
			businessSlug: fixture.businessSlug,
			serviceId: fixture.longServiceId,
			from: MONDAY,
			to: MONDAY,
			now: NOW
		});

		expect(result.availability).toHaveLength(1);
		expect(result.availability[0]!.staff.displayName).toBe('Ada');
	});

	it('narrows to one person when the customer picks one', async () => {
		const result = await loadAvailability({
			businessSlug: fixture.businessSlug,
			serviceId: fixture.serviceId,
			staffId: fixture.otherStaffId,
			from: MONDAY,
			to: MONDAY,
			now: NOW
		});

		expect(result.availability).toHaveLength(1);
		expect(result.availability[0]!.staff.id).toBe(fixture.otherStaffId);
	});

	it('removes a slot from one person s list once they are booked, not the other s', async () => {
		await createBooking(bookingInput());

		const result = await loadAvailability({
			businessSlug: fixture.businessSlug,
			serviceId: fixture.serviceId,
			from: MONDAY,
			to: MONDAY,
			now: NOW
		});

		// Compare instants, not clock readings. The query pads a day either side,
		// so "11:00" is still on offer — on Tuesday.
		const startsFor = (staffId: string) =>
			result.availability.find((entry) => entry.staff.id === staffId)!.slots.map((s) => s.start);

		expect(startsFor(fixture.staffId)).not.toContain(at(11 * 60));
		expect(startsFor(fixture.otherStaffId)).toContain(at(11 * 60));
	});

	it('pads the range by a day so a viewer in another zone sees whole days', async () => {
		const result = await loadAvailability({
			businessSlug: fixture.businessSlug,
			serviceId: fixture.serviceId,
			staffId: fixture.staffId,
			from: MONDAY,
			to: MONDAY,
			now: NOW
		});

		const days = new Set(
			result.availability[0]!.slots.map((slot) => new Date(slot.start).toISOString().slice(0, 10))
		);

		// Sunday the 16th is closed, so the padding shows up as Tuesday the 18th.
		expect([...days].sort()).toEqual(['2026-08-17', '2026-08-18']);
	});

	it('refuses a service that does not belong to the business', async () => {
		await expect(
			loadAvailability({
				businessSlug: fixture.businessSlug,
				serviceId: 'not-a-real-id',
				from: MONDAY,
				to: MONDAY,
				now: NOW
			})
		).rejects.toThrow(BookingError);
	});
});

describe('createBooking', () => {
	it('writes a booking, a customer and one claim per five-minute cell', async () => {
		const created = await createBooking(bookingInput());

		expect(created.reference).toMatch(/^HP-[0-9A-Z]{8}$/);
		expect(created.status).toBe('confirmed');

		// 45 minutes of appointment plus 15 of tidy-up is 60 minutes: twelve cells.
		const claims = await db.select().from(slotClaim).where(eq(slotClaim.bookingId, created.id));
		expect(claims).toHaveLength(12);
	});

	it('snapshots the price and name so later edits are not retroactive', async () => {
		const created = await createBooking(bookingInput());
		expect(created.serviceName).toBe('Cut and finish');
		expect(created.priceCents).toBe(4800);
		expect(created.currency).toBe('GBP');
		expect(created.timeZone).toBe(LONDON);
	});

	it('reuses an existing customer rather than duplicating them', async () => {
		const first = await createBooking(bookingInput({ start: at(10 * 60) }));
		const second = await createBooking(
			bookingInput({ start: at(14 * 60), customerEmail: 'SAM@EXAMPLE.TEST' })
		);

		// Same person, differently capitalised. One customer row, two bookings.
		expect(second.customerId).toBe(first.customerId);
	});

	it('rejects a start time that was never on offer', async () => {
		// 11:07 is not on the fifteen-minute grid, and the server does not care
		// what the client believes.
		await expect(createBooking(bookingInput({ start: at(11 * 60 + 7) }))).rejects.toMatchObject({
			code: 'slot_not_offered'
		});
	});

	it('rejects a start time outside opening hours', async () => {
		await expect(createBooking(bookingInput({ start: at(3 * 60) }))).rejects.toMatchObject({
			code: 'slot_not_offered'
		});
	});

	it('rejects a booking inside the notice period', async () => {
		await expect(
			createBooking(bookingInput({ now: at(10 * 60), start: at(11 * 60) }))
		).rejects.toMatchObject({ code: 'too_soon' });
	});

	it('rejects a booking beyond the advance limit', async () => {
		await resetDatabase();
		fixture = await seedFixture({ maxAdvanceDays: 3 });

		await expect(createBooking(bookingInput())).rejects.toMatchObject({
			code: 'too_far_ahead'
		});
	});

	it('rejects a staff member who does not offer the service', async () => {
		await expect(
			createBooking(
				bookingInput({ serviceId: fixture.longServiceId, staffId: fixture.otherStaffId })
			)
		).rejects.toMatchObject({ code: 'staff_unavailable' });
	});

	it('blocks an overlapping booking even when the start times differ', async () => {
		await createBooking(bookingInput({ start: at(11 * 60) }));

		// 11:00 runs to 12:00 with its buffer. 11:30 would collide.
		await expect(
			createBooking(bookingInput({ start: at(11 * 60 + 30), customerEmail: 'other@example.test' }))
		).rejects.toMatchObject({ code: 'slot_not_offered' });
	});

	it('allows a booking that begins exactly as the previous block ends', async () => {
		await createBooking(bookingInput({ start: at(11 * 60) }));

		const next = await createBooking(
			bookingInput({ start: at(12 * 60), customerEmail: 'other@example.test' })
		);
		expect(next.status).toBe('confirmed');
	});

	it('leaves no booking row behind when the claim fails', async () => {
		await createBooking(bookingInput({ start: at(11 * 60) }));

		await expect(
			createBooking(bookingInput({ start: at(11 * 60), customerEmail: 'other@example.test' }))
		).rejects.toThrow(BookingError);

		// The whole transaction rolled back — including the row inserted before the
		// claim was attempted. Exactly one booking exists.
		const rows = await db.select().from(booking);
		expect(rows).toHaveLength(1);
	});
});

/*
 * The tests this whole schema exists for.
 *
 * `Promise.all` over N calls to `createBooking` is not a simulation of a race —
 * it is a race. Each call opens its own transaction against the same file, and
 * the only thing standing between them and a double-booked chair is the
 * composite primary key on `slot_claim`.
 */
describe('createBooking under concurrency', () => {
	it('lets exactly one of ten simultaneous requests win the same slot', async () => {
		const attempts = Array.from({ length: 10 }, (_, index) =>
			createBooking(
				bookingInput({
					start: at(11 * 60),
					customerName: `Customer ${index}`,
					customerEmail: `customer${index}@example.test`
				})
			)
		);

		const results = await Promise.allSettled(attempts);

		const won = results.filter((result) => result.status === 'fulfilled');
		const lost = results.filter((result) => result.status === 'rejected');

		expect(won).toHaveLength(1);
		expect(lost).toHaveLength(9);

		// And the diary agrees: one booking, twelve claims, no orphans.
		expect(await db.select().from(booking)).toHaveLength(1);
		expect(await db.select().from(slotClaim)).toHaveLength(12);
	});

	it('tells the losers the truth rather than a generic failure', async () => {
		const results = await Promise.allSettled(
			Array.from({ length: 5 }, (_, index) =>
				createBooking(
					bookingInput({ start: at(14 * 60), customerEmail: `rush${index}@example.test` })
				)
			)
		);

		const reasons = results
			.filter((result) => result.status === 'rejected')
			.map((result) => (result.reason as BookingError).code);

		// Either the pre-flight check caught it (the slot was already gone by the
		// time this request read the diary) or the claim did. Both are honest
		// answers; what matters is that neither is a 500.
		expect(reasons).toHaveLength(4);
		for (const code of reasons) {
			expect(['slot_taken', 'slot_not_offered']).toContain(code);
		}
	});

	it('lets two people book overlapping times with different staff', async () => {
		const [first, second] = await Promise.all([
			createBooking(bookingInput({ start: at(11 * 60), staffId: fixture.staffId })),
			createBooking(
				bookingInput({
					start: at(11 * 60),
					staffId: fixture.otherStaffId,
					customerEmail: 'other@example.test'
				})
			)
		]);

		expect(first.staffId).not.toBe(second.staffId);
		expect(await db.select().from(slotClaim)).toHaveLength(24);
	});

	it('lets consecutive non-overlapping bookings all succeed at once', async () => {
		const starts = [9 * 60, 10 * 60, 12 * 60, 13 * 60, 14 * 60];

		const results = await Promise.allSettled(
			starts.map((minute, index) =>
				createBooking(
					bookingInput({ start: at(minute), customerEmail: `queue${index}@example.test` })
				)
			)
		);

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(starts.length);
	});
});

/*
 * The invariant, tested at the level it actually lives.
 *
 * `createBooking` has two guards: a pre-flight availability check that produces
 * a good error message, and the slot claim that produces the guarantee. The
 * concurrency tests above prove the invariant holds end to end — exactly one
 * booking survives — without caring which guard fired. These prove the second
 * guard on its own, because it is the one that still works when the first is
 * wrong, absent, or racing.
 */
describe('the slot_claim constraint itself', () => {
	it('refuses two claims on the same cell for the same person', async () => {
		const created = await createBooking(bookingInput());
		const [claim] = await db.select().from(slotClaim).where(eq(slotClaim.bookingId, created.id));

		const duplicate = db.insert(slotClaim).values({
			staffId: claim!.staffId,
			slotStart: claim!.slotStart,
			bookingId: created.id
		});

		await expect(duplicate).rejects.toSatisfy(isUniqueViolation);
	});

	it('allows the same cell for two different people', async () => {
		const created = await createBooking(bookingInput());
		const [claim] = await db.select().from(slotClaim).where(eq(slotClaim.bookingId, created.id));

		// Same instant, different staff — a salon has more than one chair.
		await expect(
			db.insert(slotClaim).values({
				staffId: fixture.otherStaffId,
				slotStart: claim!.slotStart,
				bookingId: created.id
			})
		).resolves.toBeDefined();
	});

	it('rejects a whole multi-cell claim if any single cell is taken', async () => {
		const created = await createBooking(bookingInput());
		const claims = await db.select().from(slotClaim).where(eq(slotClaim.bookingId, created.id));

		// Twelve rows where the seventh already exists. SQLite applies the whole
		// statement or none of it, so the eleven innocent rows do not sneak in.
		const before = await db.select().from(slotClaim);

		await expect(
			db.insert(slotClaim).values(
				claims.map((claim, index) => ({
					staffId: claim.staffId,
					slotStart:
						index === 6 ? claim.slotStart : new Date(claim.slotStart.getTime() + 86_400_000),
					bookingId: created.id
				}))
			)
		).rejects.toSatisfy(isUniqueViolation);

		expect(await db.select().from(slotClaim)).toHaveLength(before.length);
	});
});

describe('cancelBooking', () => {
	it('frees the slot and keeps the record', async () => {
		const created = await createBooking(bookingInput());

		const cancelled = await cancelBooking({
			bookingId: created.id,
			by: 'customer',
			reason: 'Something came up',
			now: NOW
		});

		expect(cancelled.status).toBe('cancelled');
		expect(cancelled.cancelledBy).toBe('customer');

		// The claims are gone…
		expect(await db.select().from(slotClaim)).toHaveLength(0);
		// …but the booking is not.
		expect(await db.select().from(booking)).toHaveLength(1);
	});

	it('puts the freed slot back on offer', async () => {
		const created = await createBooking(bookingInput());
		await cancelBooking({ bookingId: created.id, by: 'customer', now: NOW });

		const result = await loadAvailability({
			businessSlug: fixture.businessSlug,
			serviceId: fixture.serviceId,
			staffId: fixture.staffId,
			from: MONDAY,
			to: MONDAY,
			now: NOW
		});

		expect(result.availability[0]!.slots.map((slot) => formatTime(slot.start, LONDON))).toContain(
			'11:00'
		);
	});

	it('lets somebody else book the freed slot', async () => {
		const created = await createBooking(bookingInput());
		await cancelBooking({ bookingId: created.id, by: 'customer', now: NOW });

		const replacement = await createBooking(bookingInput({ customerEmail: 'lucky@example.test' }));
		expect(replacement.status).toBe('confirmed');
	});

	it('refuses a late customer cancellation but allows a staff one', async () => {
		const created = await createBooking(bookingInput());

		// Two hours before the appointment, against a 24-hour policy.
		const tooLate = at(9 * 60);

		await expect(
			cancelBooking({ bookingId: created.id, by: 'customer', now: tooLate })
		).rejects.toMatchObject({ code: 'too_late_to_cancel' });

		const byStaff = await cancelBooking({
			bookingId: created.id,
			by: 'staff',
			ignoreNotice: true,
			now: tooLate
		});
		expect(byStaff.status).toBe('cancelled');
	});

	it('refuses to cancel the same booking twice', async () => {
		const created = await createBooking(bookingInput());
		await cancelBooking({ bookingId: created.id, by: 'customer', now: NOW });

		await expect(
			cancelBooking({ bookingId: created.id, by: 'customer', now: NOW })
		).rejects.toMatchObject({ code: 'already_cancelled' });
	});
});

describe('diary reads', () => {
	it('returns bookings that overlap the window, not only those starting in it', async () => {
		const created = await createBooking(bookingInput({ start: at(11 * 60) }));

		// A window that begins halfway through the appointment.
		const rows = await loadDiary({
			businessId: fixture.businessId,
			from: at(11 * 60 + 30),
			to: at(13 * 60)
		});

		expect(rows.map((row) => row.id)).toContain(created.id);
	});

	it('excludes cancelled bookings from the diary', async () => {
		const created = await createBooking(bookingInput());
		await cancelBooking({ bookingId: created.id, by: 'staff', ignoreNotice: true, now: NOW });

		const rows = await loadDiary({
			businessId: fixture.businessId,
			from: at(0),
			to: at(24 * 60)
		});
		expect(rows).toHaveLength(0);
	});

	it('finds a booking by its manage token and not by its reference', async () => {
		const created = await createBooking(bookingInput());

		expect(await loadBookingByToken(created.manageToken)).toMatchObject({ id: created.id });
		expect(await loadBookingByToken(created.reference)).toBeUndefined();
	});
});
