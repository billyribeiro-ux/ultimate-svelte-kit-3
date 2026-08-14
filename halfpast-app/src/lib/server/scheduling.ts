import { and, eq, gte, inArray, lt, lte, or } from 'drizzle-orm';
import {
	availableSlots,
	occupiedCellsFrom,
	slotsIn,
	startOfDayInstant,
	endOfDayInstant,
	addDays,
	type IsoDate,
	type Slot,
	type Weekday
} from '#lib/time/index.ts';
import { db, type Database } from './db/index.ts';
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
	type Booking,
	type Business,
	type Service,
	type Staff
} from './db/schema.ts';
import { newBookingReference, newManageToken } from './db/ids.ts';
import { writeQueue } from './write-queue.ts';

/**
 * Scheduling: reading the diary, and writing to it safely.
 *
 * The read path and the write path share one idea — the five-minute grid from
 * `#lib/time/grid.ts`. Reading asks "which cells are taken"; writing says "these
 * cells are mine now" and lets the database arbitrate. Because both speak the
 * same units, there is no translation layer between them that could drift.
 */

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Codes the UI can branch on.
 *
 * `slot_taken` is the one that matters. It is not an error in the sense of
 * "something went wrong" — it is the normal, expected outcome of two people
 * wanting the same eleven o'clock, and the interface should treat it as a fact
 * to report rather than a failure to apologise for.
 */
export type BookingErrorCode =
	| 'slot_taken'
	| 'slot_not_offered'
	| 'service_unavailable'
	| 'staff_unavailable'
	| 'too_soon'
	| 'too_far_ahead'
	| 'not_found'
	| 'already_cancelled'
	| 'too_late_to_cancel';

export class BookingError extends Error {
	readonly code: BookingErrorCode;

	constructor(code: BookingErrorCode, message: string) {
		super(message);
		this.name = 'BookingError';
		this.code = code;
	}
}

/**
 * Whether a database error is a uniqueness violation.
 *
 * Two things make this fiddlier than it looks, and both are worth knowing.
 *
 * First, the **cause chain**. Drizzle wraps driver errors in its own
 * `Failed query: …` error and puts the real one on `.cause`; libSQL in turn
 * wraps the native SQLite error the same way. The interesting text is two or
 * three links down, so this walks the chain rather than reading one `message`.
 * Getting that wrong is silent and expensive: the claim below would still be
 * refused by the database — the booking stays safe — but the customer would see
 * a 500 instead of "sorry, just taken".
 *
 * Second, the **spelling**. SQLite reports the same failure as
 * `SQLITE_CONSTRAINT_PRIMARYKEY` for a composite primary key and
 * `SQLITE_CONSTRAINT_UNIQUE` for a unique index, and older builds only say
 * `UNIQUE constraint failed`. All three mean "somebody got there first".
 *
 * Matching on message text is uncomfortable, and the alternative — checking
 * first and inserting after — is the exact race this code exists to prevent. So
 * the knowledge has to live somewhere, and it lives here, tested.
 */
export function isUniqueViolation(error: unknown): boolean {
	// Bounded so a self-referencing cause cannot spin forever.
	for (let current = error, depth = 0; current instanceof Error && depth < 8; depth += 1) {
		const code = 'code' in current ? String(current.code) : '';
		const text = `${current.message} ${code}`;

		if (
			text.includes('SQLITE_CONSTRAINT_PRIMARYKEY') ||
			text.includes('SQLITE_CONSTRAINT_UNIQUE') ||
			text.includes('UNIQUE constraint failed')
		) {
			return true;
		}

		current = current.cause;
	}

	return false;
}

/* -------------------------------------------------------------------------- */
/* Reading the diary                                                           */
/* -------------------------------------------------------------------------- */

/** Anything that can run a query: the root connection or a transaction. */
type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Which grid cells a staff member has lost, between two instants.
 *
 * Two sources, one output. Existing bookings already live on the grid, so they
 * come back as a range scan on `slot_claim`'s primary key — which is as cheap as
 * a database read gets. Time off is written by a human and is not grid-aligned,
 * so it is widened outwards onto the grid before joining the same set.
 */
async function occupiedCells(
	tx: Executor,
	staffId: string,
	from: number,
	to: number
): Promise<Set<number>> {
	/*
	 * Deliberately sequential, not `Promise.all`.
	 *
	 * When `tx` is a transaction, the local SQLite driver is synchronous under
	 * its promise wrapper and has one statement handle. Firing two queries at it
	 * concurrently interleaves their execution and the transaction fails to
	 * commit with "SQL statements in progress". Both of these are indexed lookups
	 * over a handful of rows, so the parallelism was buying nothing anyway.
	 */
	const claims = await tx
		.select({ slotStart: slotClaim.slotStart })
		.from(slotClaim)
		.where(
			and(
				eq(slotClaim.staffId, staffId),
				gte(slotClaim.slotStart, new Date(from)),
				lt(slotClaim.slotStart, new Date(to))
			)
		);

	// A holiday that started last week and ends next week still blocks today, so
	// the overlap test is "starts before our window ends AND ends after our window
	// starts" — not "starts inside our window".
	const breaks = await tx
		.select({ startsAt: timeOff.startsAt, endsAt: timeOff.endsAt })
		.from(timeOff)
		.where(
			and(
				eq(timeOff.staffId, staffId),
				lt(timeOff.startsAt, new Date(to)),
				gte(timeOff.endsAt, new Date(from))
			)
		);

	const cells = occupiedCellsFrom(
		breaks.map((row) => ({ start: row.startsAt.getTime(), end: row.endsAt.getTime() }))
	);

	for (const claim of claims) cells.add(claim.slotStart.getTime());

	return cells;
}

export interface StaffAvailability {
	readonly staff: Staff;
	readonly slots: readonly Slot[];
}

/**
 * Every bookable start time for a service, across the staff who can perform it.
 *
 * The date range is widened by a day at each end before querying. A customer in
 * Auckland looking at a London salon sees London's Monday evening filed under
 * their Tuesday, so the days either side of the range they asked for can
 * contribute slots to it.
 */
export async function loadAvailability(input: {
	businessSlug: string;
	serviceId: string;
	staffId?: string | undefined;
	from: IsoDate;
	to: IsoDate;
	now?: number;
}): Promise<{
	business: Business;
	service: Service;
	availability: StaffAvailability[];
}> {
	const now = input.now ?? Date.now();

	const found = await db.query.business.findFirst({
		where: eq(business.slug, input.businessSlug)
	});
	if (!found) throw new BookingError('not_found', 'No such business.');

	const chosen = await db.query.service.findFirst({
		where: and(eq(service.id, input.serviceId), eq(service.businessId, found.id))
	});
	if (!chosen || !chosen.isActive) {
		throw new BookingError('service_unavailable', 'That service is not currently bookable.');
	}

	// Who can do it: staff joined through the junction table, still active, and
	// narrowed to one person if the customer picked one.
	const eligible = await db
		.select({ staff })
		.from(staffService)
		.innerJoin(staff, eq(staff.id, staffService.staffId))
		.where(
			and(
				eq(staffService.serviceId, chosen.id),
				eq(staff.isActive, true),
				...(input.staffId ? [eq(staff.id, input.staffId)] : [])
			)
		);

	if (eligible.length === 0) {
		return { business: found, service: chosen, availability: [] };
	}

	const padFrom = addDays(input.from, -1);
	const padTo = addDays(input.to, 1);
	const windowStart = startOfDayInstant(padFrom, found.timeZone);
	const windowEnd = endOfDayInstant(padTo, found.timeZone);

	const staffIds = eligible.map((row) => row.staff.id);

	const rules = await db
		.select()
		.from(availabilityRule)
		.where(inArray(availabilityRule.staffId, staffIds));

	const availability = await Promise.all(
		eligible.map(async ({ staff: person }) => {
			const occupied = await occupiedCells(db, person.id, windowStart, windowEnd);

			return {
				staff: person,
				slots: availableSlots({
					timeZone: found.timeZone,
					from: padFrom,
					to: padTo,
					rules: rules
						.filter((rule) => rule.staffId === person.id)
						.map((rule) => ({
							weekday: rule.weekday as Weekday,
							startMinute: rule.startMinute,
							endMinute: rule.endMinute,
							effectiveFrom: rule.effectiveFrom,
							effectiveTo: rule.effectiveTo
						})),
					service: chosen,
					occupied,
					now,
					minNoticeMinutes: found.minNoticeMinutes,
					maxAdvanceDays: found.maxAdvanceDays
				})
			};
		})
	);

	return { business: found, service: chosen, availability };
}

/* -------------------------------------------------------------------------- */
/* Writing to the diary                                                        */
/* -------------------------------------------------------------------------- */

export interface CreateBookingInput {
	readonly businessSlug: string;
	readonly serviceId: string;
	readonly staffId: string;
	/** The appointment start, as an instant. */
	readonly start: number;
	readonly customerName: string;
	readonly customerEmail: string;
	readonly customerPhone?: string | undefined;
	readonly note?: string | undefined;
	/** Injectable for tests. */
	readonly now?: number;
}

/**
 * Take a slot, or fail because somebody else already did.
 *
 * The order of operations inside the transaction is the whole design:
 *
 *   1. Re-derive availability **on the server**. The client sent us an instant;
 *      it may be stale, it may be a slot that was never offered, it may be
 *      hand-crafted by someone poking at the network tab. What the browser
 *      believes is a hint, never an authority.
 *   2. Insert the booking row.
 *   3. Insert one `slot_claim` per five-minute cell, in a single statement.
 *
 * Step 3 is where concurrency is decided. Two requests that reach it at the same
 * instant both try to insert the same `(staff_id, slot_start)` pairs, and the
 * database — not our code — refuses the second. The loser's transaction rolls
 * back entirely, taking its booking row with it, and the customer is told the
 * truth: it went in the last few seconds.
 *
 * There is deliberately no "check then insert". Checking is what step 1 does,
 * and step 1 is a *courtesy*: it produces a good error message for the common
 * case. The correctness lives in step 3, which cannot be raced because the check
 * and the claim are the same operation.
 *
 * The whole thing runs through `writeQueue` so that two simultaneous requests in
 * this process take turns rather than colliding on SQLite's single write lock.
 * That is a politeness, not a guarantee — read the note in `write-queue.ts`.
 */
export async function createBooking(input: CreateBookingInput): Promise<Booking> {
	return writeQueue.run(() => createBookingNow(input));
}

async function createBookingNow(input: CreateBookingInput): Promise<Booking> {
	const now = input.now ?? Date.now();

	return db.transaction(async (tx) => {
		const foundBusiness = await tx.query.business.findFirst({
			where: eq(business.slug, input.businessSlug)
		});
		if (!foundBusiness) throw new BookingError('not_found', 'No such business.');

		const chosenService = await tx.query.service.findFirst({
			where: and(eq(service.id, input.serviceId), eq(service.businessId, foundBusiness.id))
		});
		if (!chosenService || !chosenService.isActive) {
			throw new BookingError('service_unavailable', 'That service is not currently bookable.');
		}

		const chosenStaff = await tx.query.staff.findFirst({
			where: and(eq(staff.id, input.staffId), eq(staff.businessId, foundBusiness.id))
		});
		if (!chosenStaff || !chosenStaff.isActive) {
			throw new BookingError('staff_unavailable', 'That team member is not taking bookings.');
		}

		const canPerform = await tx.query.staffService.findFirst({
			where: and(
				eq(staffService.staffId, chosenStaff.id),
				eq(staffService.serviceId, chosenService.id)
			)
		});
		if (!canPerform) {
			throw new BookingError('staff_unavailable', 'That team member does not offer this service.');
		}

		/* --- 1. Re-derive what was actually on offer ------------------------- */

		const durationMs = chosenService.durationMinutes * 60_000;
		const blockStart = input.start - chosenService.bufferBeforeMinutes * 60_000;
		const blockEnd = input.start + durationMs + chosenService.bufferAfterMinutes * 60_000;

		const rules = await tx
			.select()
			.from(availabilityRule)
			.where(eq(availabilityRule.staffId, chosenStaff.id));

		// One day either side of the appointment is enough context for the engine
		// to reconstruct the window this slot came from, including an overnight one.
		const dayOfBooking = new Date(input.start).toISOString().slice(0, 10);
		const from = addDays(dayOfBooking, -1);
		const to = addDays(dayOfBooking, 1);

		const occupied = await occupiedCells(
			tx,
			chosenStaff.id,
			startOfDayInstant(from, foundBusiness.timeZone),
			endOfDayInstant(to, foundBusiness.timeZone)
		);

		const offered = availableSlots({
			timeZone: foundBusiness.timeZone,
			from,
			to,
			rules: rules.map((rule) => ({
				weekday: rule.weekday as Weekday,
				startMinute: rule.startMinute,
				endMinute: rule.endMinute,
				effectiveFrom: rule.effectiveFrom,
				effectiveTo: rule.effectiveTo
			})),
			service: chosenService,
			occupied,
			now,
			minNoticeMinutes: foundBusiness.minNoticeMinutes,
			maxAdvanceDays: foundBusiness.maxAdvanceDays
		});

		if (!offered.some((slot) => slot.start === input.start)) {
			// Distinguish the two reasons a slot might not be on offer, because the
			// remedies are different: one is "pick another time", the other is
			// "you cannot book this far out at all".
			if (input.start < now + foundBusiness.minNoticeMinutes * 60_000) {
				throw new BookingError('too_soon', 'That time is too close to now to book online.');
			}
			if (input.start > now + foundBusiness.maxAdvanceDays * 86_400_000) {
				throw new BookingError('too_far_ahead', 'The diary is not open that far ahead yet.');
			}
			throw new BookingError('slot_not_offered', 'That time is no longer available.');
		}

		/* --- 2. The customer ------------------------------------------------- */

		const email = input.customerEmail.trim().toLowerCase();

		const existing = await tx.query.customer.findFirst({
			where: and(eq(customer.businessId, foundBusiness.id), eq(customer.email, email))
		});

		const customerId =
			existing?.id ??
			(
				await tx
					.insert(customer)
					.values({
						businessId: foundBusiness.id,
						name: input.customerName.trim(),
						email,
						phone: input.customerPhone?.trim() || null
					})
					.returning({ id: customer.id })
			)[0]!.id;

		/* --- 3. The booking row ---------------------------------------------- */

		const [created] = await tx
			.insert(booking)
			.values({
				reference: newBookingReference(),
				manageToken: newManageToken(),
				businessId: foundBusiness.id,
				staffId: chosenStaff.id,
				serviceId: chosenService.id,
				customerId,
				status: 'confirmed',
				startsAt: new Date(input.start),
				endsAt: new Date(input.start + durationMs),
				blockStartsAt: new Date(blockStart),
				blockEndsAt: new Date(blockEnd),
				timeZone: foundBusiness.timeZone,
				serviceName: chosenService.name,
				durationMinutes: chosenService.durationMinutes,
				priceCents: chosenService.priceCents,
				currency: foundBusiness.currency,
				customerNote: input.note?.trim() || null
			})
			.returning();

		if (!created) throw new BookingError('slot_taken', 'That time was just taken.');

		/* --- 4. The claim. This is the part that cannot be raced. ------------- */

		const cells = slotsIn({ start: blockStart, end: blockEnd });

		try {
			await tx.insert(slotClaim).values(
				cells.map((cell) => ({
					staffId: chosenStaff.id,
					slotStart: new Date(cell),
					bookingId: created.id
				}))
			);
		} catch (error) {
			if (isUniqueViolation(error)) {
				// The whole transaction is about to roll back, so the booking row we
				// inserted a moment ago will vanish with it. Nothing to clean up.
				throw new BookingError('slot_taken', 'Sorry — that time was booked moments ago.');
			}
			throw error;
		}

		return created;
	});
}

/* -------------------------------------------------------------------------- */
/* Cancelling                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Give a slot back.
 *
 * The `slot_claim` rows are deleted; the `booking` row is kept and marked
 * cancelled. That asymmetry is the point of having two tables: one is the live
 * diary and must forget, the other is the record and must not.
 */
export async function cancelBooking(input: {
	bookingId: string;
	by: 'customer' | 'staff';
	reason?: string | undefined;
	/** Set for a staff cancellation, which is allowed at any notice. */
	ignoreNotice?: boolean;
	now?: number;
}): Promise<Booking> {
	return writeQueue.run(() => cancelBookingNow(input));
}

async function cancelBookingNow(input: {
	bookingId: string;
	by: 'customer' | 'staff';
	reason?: string | undefined;
	ignoreNotice?: boolean;
	now?: number;
}): Promise<Booking> {
	const now = input.now ?? Date.now();

	return db.transaction(async (tx) => {
		const found = await tx.query.booking.findFirst({ where: eq(booking.id, input.bookingId) });
		if (!found) throw new BookingError('not_found', 'No such booking.');

		if (found.status === 'cancelled') {
			throw new BookingError('already_cancelled', 'That booking is already cancelled.');
		}

		if (!input.ignoreNotice) {
			const foundBusiness = await tx.query.business.findFirst({
				where: eq(business.id, found.businessId)
			});
			const noticeMs = (foundBusiness?.cancellationNoticeHours ?? 24) * 3_600_000;

			if (found.startsAt.getTime() - now < noticeMs) {
				throw new BookingError(
					'too_late_to_cancel',
					'It is too late to cancel online — please call us.'
				);
			}
		}

		await tx.delete(slotClaim).where(eq(slotClaim.bookingId, found.id));

		const [updated] = await tx
			.update(booking)
			.set({
				status: 'cancelled',
				cancelledAt: new Date(now),
				cancelledBy: input.by,
				cancelReason: input.reason?.trim() || null
			})
			.where(eq(booking.id, found.id))
			.returning();

		return updated!;
	});
}

/* -------------------------------------------------------------------------- */
/* Diary reads for the owner                                                   */
/* -------------------------------------------------------------------------- */

/** Everything in a business's diary between two instants, newest detail joined. */
export async function loadDiary(input: {
	businessId: string;
	from: number;
	to: number;
	staffId?: string | undefined;
}) {
	return db.query.booking.findMany({
		where: and(
			eq(booking.businessId, input.businessId),
			// Anything overlapping the window, not merely starting inside it — an
			// appointment that began before the window is still on screen.
			lt(booking.startsAt, new Date(input.to)),
			gte(booking.endsAt, new Date(input.from)),
			or(eq(booking.status, 'confirmed'), eq(booking.status, 'completed')),
			...(input.staffId ? [eq(booking.staffId, input.staffId)] : [])
		),
		with: { customer: true, staff: true, service: true },
		orderBy: (row, { asc }) => [asc(row.startsAt)]
	});
}

/** A single booking by its public reference, for the "manage" page. */
export async function loadBookingByToken(token: string) {
	return db.query.booking.findFirst({
		where: eq(booking.manageToken, token),
		with: { business: true, staff: true, service: true, customer: true }
	});
}

/** Past and upcoming appointments for one customer at one business. */
export async function loadCustomerBookings(customerId: string, now = Date.now()) {
	const rows = await db.query.booking.findMany({
		where: eq(booking.customerId, customerId),
		with: { staff: true, service: true },
		orderBy: (row, { desc }) => [desc(row.startsAt)]
	});

	return {
		upcoming: rows.filter((row) => row.startsAt.getTime() >= now && row.status === 'confirmed'),
		past: rows.filter((row) => row.startsAt.getTime() < now || row.status !== 'confirmed')
	};
}

/** Marks appointments that have finished as completed. Idempotent. */
export async function markCompleted(businessId: string, now = Date.now()) {
	return db
		.update(booking)
		.set({ status: 'completed' })
		.where(
			and(
				eq(booking.businessId, businessId),
				eq(booking.status, 'confirmed'),
				lte(booking.endsAt, new Date(now))
			)
		);
}
