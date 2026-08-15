import * as v from 'valibot';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { command, form, getRequestEvent, query } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { booking, staff } from '#lib/server/db/schema.ts';
import { assertCanManageDiaryOf, requireStaff } from '#lib/server/guards.ts';
import { BookingError, cancelBooking, loadDiary } from '#lib/server/scheduling.ts';
import { publishDiaryChange, watchDiary } from '#lib/server/diary-events.ts';
import { endOfDayInstant, startOfDayInstant } from '#lib/time/index.ts';

/**
 * The staff-facing diary.
 *
 * Every function here begins with `requireStaff(args.slug)`, and that repetition
 * is deliberate rather than lazy. A remote function is a public HTTP endpoint;
 * it does not inherit protection from the page that happens to call it. Guarding
 * the page and not the function is the commonest way an app that *looks* locked
 * down turns out to serve another business's customer list to anybody who reads
 * the network tab.
 */

const slugSchema = v.pipe(v.string(), v.trim(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));
const idSchema = v.pipe(v.string(), v.uuid());
const isoDateSchema = v.pipe(v.string(), v.isoDate());

const diaryArgs = v.object({
	slug: slugSchema,
	/** A local calendar day in the *business's* zone — that is the diary's day. */
	day: isoDateSchema,
	/** Narrow to one person's column. */
	staffId: v.optional(idSchema)
});

export interface DiaryEntry {
	id: string;
	reference: string;
	staffId: string;
	staffName: string;
	colourHue: number;
	serviceName: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string | null;
	customerNote: string | null;
	startsAt: number;
	endsAt: number;
	blockStartsAt: number;
	blockEndsAt: number;
	priceCents: number;
	currency: string;
	status: string;
}

export interface DiaryResult {
	timeZone: string;
	day: string;
	entries: DiaryEntry[];
	team: Array<{ id: string; displayName: string; colourHue: number }>;
	/** What the signed-in person may do here. Sent so the UI need not guess. */
	viewer: { staffId: string; role: 'owner' | 'member' };
	takingsCents: number;
}

/**
 * One day of appointments, updated as they happen.
 *
 * This is the feature that justifies a live query rather than a refresh button.
 * A receptionist has this open all day; when a booking arrives from the website
 * it should appear on their screen, not the next time they think to reload.
 *
 * Instants are sent as plain numbers rather than `Date` objects. Devalue can
 * serialise a `Date` perfectly well, but a number is unambiguous at the boundary
 * — nobody is tempted to call `.getHours()` on it — and the time layer is the
 * only thing that turns one into a clock reading.
 */
export const getDiary = query.live(diaryArgs, async function* (args) {
	const { request } = getRequestEvent();
	const context = await requireStaff(args.slug);

	// A member may look at their own column, or at the whole day read-only; they
	// simply cannot act on somebody else's. The filter below is a convenience,
	// not the security boundary — `cancelAppointment` re-checks.
	const read = async (): Promise<DiaryResult> => {
		const from = startOfDayInstant(args.day, context.business.timeZone);
		const to = endOfDayInstant(args.day, context.business.timeZone);

		const rows = await loadDiary({
			businessId: context.business.id,
			from,
			to,
			staffId: args.staffId
		});

		const team = await db.query.staff.findMany({
			where: and(eq(staff.businessId, context.business.id), eq(staff.isActive, true)),
			orderBy: (row, { asc }) => [asc(row.sortOrder), asc(row.displayName)]
		});

		return {
			timeZone: context.business.timeZone,
			day: args.day,
			entries: rows.map((row) => ({
				id: row.id,
				reference: row.reference,
				staffId: row.staffId,
				staffName: row.staff.displayName,
				colourHue: row.staff.colourHue,
				serviceName: row.serviceName,
				customerName: row.customer.name,
				customerEmail: row.customer.email,
				customerPhone: row.customer.phone,
				customerNote: row.customerNote,
				startsAt: row.startsAt.getTime(),
				endsAt: row.endsAt.getTime(),
				blockStartsAt: row.blockStartsAt.getTime(),
				blockEndsAt: row.blockEndsAt.getTime(),
				priceCents: row.priceCents,
				currency: row.currency,
				status: row.status
			})),
			team: team.map((row) => ({
				id: row.id,
				displayName: row.displayName,
				colourHue: row.colourHue
			})),
			viewer: { staffId: context.staff.id, role: context.staff.role },
			takingsCents: rows.reduce((total, row) => total + row.priceCents, 0)
		};
	};

	yield await read();

	for await (const _ of watchDiary(context.business.id, {
		signal: request.signal,
		intervalMs: 60_000
	})) {
		void _;
		yield await read();
	}
});

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

const cancelArgs = v.object({
	slug: slugSchema,
	bookingId: idSchema,
	reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), '')
});

/**
 * Cancel an appointment on the customer's behalf.
 *
 * A `command`, not a `form`: there is no data to fill in, and a staff member is
 * pressing a button in an app they have signed into, so the progressive
 * enhancement argument that makes the customer-facing booking a `form` does not
 * apply here.
 *
 * `ignoreNotice: true` because the studio's own cancellation window is a rule
 * for customers. When the salon rings to say the boiler has failed, "you are
 * inside the 24-hour window" would be an absurd thing for their own software to
 * tell them.
 */
export const cancelAppointment = command(cancelArgs, async (args) => {
	const context = await requireStaff(args.slug);

	const found = await db.query.booking.findFirst({
		where: and(eq(booking.id, args.bookingId), eq(booking.businessId, context.business.id))
	});

	// Scoped to this business, so a valid booking id from another studio is a
	// 404 here rather than a cancellation there.
	if (!found) error(404, 'No such booking.');

	// A member can cancel their own appointments; an owner can cancel anyone's.
	assertCanManageDiaryOf(context, found.staffId);

	try {
		await cancelBooking({
			bookingId: found.id,
			by: 'staff',
			reason: args.reason || undefined,
			ignoreNotice: true
		});
	} catch (thrown) {
		if (thrown instanceof BookingError) error(400, thrown.message);
		throw thrown;
	}

	return { cancelled: found.reference };
});

const noteArgs = v.object({
	slug: slugSchema,
	bookingId: idSchema,
	note: v.pipe(v.string(), v.trim(), v.maxLength(500))
});

/**
 * Edit the note attached to an appointment.
 *
 * A `form` rather than a command because it has a text field, and a form gets
 * field-level validation messages, a pending count, and a working submission
 * without JavaScript, all for free.
 */
export const saveNote = form(noteArgs, async (args) => {
	const context = await requireStaff(args.slug);

	const found = await db.query.booking.findFirst({
		where: and(eq(booking.id, args.bookingId), eq(booking.businessId, context.business.id))
	});
	if (!found) error(404, 'No such booking.');
	assertCanManageDiaryOf(context, found.staffId);

	await db
		.update(booking)
		.set({ customerNote: args.note || null })
		.where(eq(booking.id, found.id));

	// The diary is live, so telling the notice board is what makes every open
	// screen show the new note — including the one belonging to whoever is on
	// the front desk.
	publishDiaryChange(context.business.id);

	return { saved: true };
});
