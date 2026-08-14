import * as v from 'valibot';
import { and, asc, eq } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import { form, getRequestEvent, query } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { business, service, staff, staffService } from '#lib/server/db/schema.ts';
import { BookingError, createBooking, loadAvailability } from '#lib/server/scheduling.ts';
import { watchDiary } from '#lib/server/diary-events.ts';
import { addDays, isValidTimeZone, type Slot } from '#lib/time/index.ts';

/**
 * The public booking API.
 *
 * A `.remote.ts` file is the SvelteKit 3 replacement for `+page.server.ts` load
 * functions and form actions. What is exported here runs on the server; what
 * imports it in a component gets a typed, awaitable function that happens to
 * cross the network. There is no endpoint to name, no `fetch` to write, and no
 * way for the two sides to disagree about the shape of the data, because there
 * is only one declaration of it.
 *
 * The security model is worth stating plainly, because it is the opposite of a
 * load function's. A load function runs for one URL and can trust `params`. A
 * remote function is a public HTTP endpoint that anybody can call with anything.
 * So every argument is validated by a schema, and — critically — the server
 * never uses `event.params` or `event.url` to decide what to return. SvelteKit
 * enforces that by making those properties *throw* inside a query. Everything
 * the server needs must arrive as a validated argument.
 */

/* -------------------------------------------------------------------------- */
/* Schemas                                                                     */
/* -------------------------------------------------------------------------- */

/*
 * Written once, reused everywhere. A schema is not paperwork — it is the only
 * thing standing between `serviceId` and somebody sending an object where a
 * string was expected to see what happens.
 */

const slugSchema = v.pipe(
	v.string(),
	v.trim(),
	v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Not a valid business address'),
	v.maxLength(64)
);

const idSchema = v.pipe(v.string(), v.uuid('Not a valid id'));

const isoDateSchema = v.pipe(v.string(), v.isoDate('Expected a YYYY-MM-DD date'));

const timeZoneSchema = v.pipe(
	v.string(),
	v.maxLength(64),
	v.check(isValidTimeZone, 'Not a time zone this server recognises')
);

/* -------------------------------------------------------------------------- */
/* The booking page                                                            */
/* -------------------------------------------------------------------------- */

export interface BookingPageData {
	business: {
		id: string;
		slug: string;
		name: string;
		tagline: string | null;
		description: string | null;
		timeZone: string;
		city: string | null;
		currency: string;
		cancellationNoticeHours: number;
	};
	services: Array<{
		id: string;
		slug: string;
		name: string;
		description: string | null;
		durationMinutes: number;
		priceCents: number;
		staffIds: string[];
	}>;
	team: Array<{ id: string; displayName: string; bio: string | null; colourHue: number }>;
}

/**
 * Everything the booking page needs before a customer has chosen anything.
 *
 * A plain `query`, not a live one: services and staff change when an owner edits
 * them, which is roughly never during one customer's visit. Reserve the live
 * machinery for the thing that genuinely moves underneath people.
 */
export const getBookingPage = query(slugSchema, async (slug): Promise<BookingPageData> => {
	const found = await db.query.business.findFirst({ where: eq(business.slug, slug) });
	if (!found) error(404, 'We could not find that business.');

	const services = await db.query.service.findMany({
		where: and(eq(service.businessId, found.id), eq(service.isActive, true)),
		orderBy: [asc(service.sortOrder), asc(service.name)]
	});

	const team = await db.query.staff.findMany({
		where: and(eq(staff.businessId, found.id), eq(staff.isActive, true)),
		orderBy: [asc(staff.sortOrder), asc(staff.displayName)]
	});

	// One query for every staff/service pairing, then grouped in memory. The
	// alternative — a query per service — is the N+1 problem, and it is the
	// difference between one round trip and a dozen.
	const pairings = await db
		.select({ serviceId: staffService.serviceId, staffId: staffService.staffId })
		.from(staffService)
		.innerJoin(staff, eq(staff.id, staffService.staffId))
		.where(and(eq(staff.businessId, found.id), eq(staff.isActive, true)));

	const byService = new Map<string, string[]>();
	for (const pair of pairings) {
		const list = byService.get(pair.serviceId);
		if (list) list.push(pair.staffId);
		else byService.set(pair.serviceId, [pair.staffId]);
	}

	return {
		business: {
			id: found.id,
			slug: found.slug,
			name: found.name,
			tagline: found.tagline,
			description: found.description,
			timeZone: found.timeZone,
			city: found.city,
			currency: found.currency,
			cancellationNoticeHours: found.cancellationNoticeHours
		},
		services: services.map((row) => ({
			id: row.id,
			slug: row.slug,
			name: row.name,
			description: row.description,
			durationMinutes: row.durationMinutes,
			priceCents: row.priceCents,
			staffIds: byService.get(row.id) ?? []
		})),
		team: team.map((row) => ({
			id: row.id,
			displayName: row.displayName,
			bio: row.bio,
			colourHue: row.colourHue
		}))
	};
});

/* -------------------------------------------------------------------------- */
/* Live availability                                                           */
/* -------------------------------------------------------------------------- */

const availabilityArgs = v.object({
	slug: slugSchema,
	serviceId: idSchema,
	staffId: v.optional(idSchema),
	from: isoDateSchema,
	days: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(31))
});

export interface AvailabilityResult {
	timeZone: string;
	service: {
		id: string;
		name: string;
		durationMinutes: number;
		priceCents: number;
		currency: string;
	};
	staff: Array<{
		id: string;
		displayName: string;
		colourHue: number;
		slots: Slot[];
	}>;
	/** When this snapshot was taken, so the UI can say "updated just now". */
	generatedAt: number;
}

/**
 * Which times are free, updated the moment they stop being free.
 *
 * `query.live` takes an async generator. Everything it yields is streamed to
 * every browser subscribed to this exact set of arguments. The shape is always
 * the same three steps:
 *
 *   1. yield the current answer straight away, so the page has something to draw
 *   2. wait for a reason to look again
 *   3. yield the new answer, and go back to 2
 *
 * Step 2 is the interesting one. It is not a poll — `watchDiary` blocks until
 * somebody actually books, cancels, or a minute of clock time passes. A page
 * left open on a quiet Tuesday afternoon costs one open connection and nothing
 * else. The minute tick exists because time passing is itself a change: a slot
 * two hours out disappears when the salon's notice period reaches it, and no
 * database write announces that.
 *
 * `request.signal` is what makes this safe to leave running. When the customer
 * closes the tab, the signal aborts, the generator's `finally` runs, and the
 * listener is removed. Without it, every abandoned booking page would leave a
 * subscriber behind forever.
 */
export const getAvailability = query.live(availabilityArgs, async function* (args) {
	const { request } = getRequestEvent();

	const found = await db.query.business.findFirst({ where: eq(business.slug, args.slug) });
	if (!found) error(404, 'We could not find that business.');

	const read = async (): Promise<AvailabilityResult> => {
		const result = await loadAvailability({
			businessSlug: args.slug,
			serviceId: args.serviceId,
			staffId: args.staffId,
			from: args.from,
			to: addDays(args.from, args.days - 1)
		});

		return {
			timeZone: result.business.timeZone,
			service: {
				id: result.service.id,
				name: result.service.name,
				durationMinutes: result.service.durationMinutes,
				priceCents: result.service.priceCents,
				currency: result.business.currency
			},
			staff: result.availability.map((entry) => ({
				id: entry.staff.id,
				displayName: entry.staff.displayName,
				colourHue: entry.staff.colourHue,
				slots: [...entry.slots]
			})),
			generatedAt: Date.now()
		};
	};

	yield await read();

	for await (const _ of watchDiary(found.id, { signal: request.signal, intervalMs: 60_000 })) {
		void _;
		yield await read();
	}
});

/* -------------------------------------------------------------------------- */
/* Making a booking                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The submitted form.
 *
 * Note `start`. A form sends strings, always — so the schema takes a string and
 * transforms it into the number the rest of the code wants. Doing the conversion
 * *inside* the schema rather than in the handler means the handler receives a
 * validated `number` and cannot be reached with `NaN`.
 *
 * `viewerTimeZone` is the customer's own zone, sent from the browser, and it is
 * used only to phrase the confirmation. It is deliberately not trusted for
 * anything that matters: the appointment is stored as an instant, and the
 * business's zone comes from the database.
 */
const bookSchema = v.object({
	slug: slugSchema,
	serviceId: idSchema,
	staffId: idSchema,

	start: v.pipe(
		v.string(),
		v.transform(Number),
		v.number('Please choose a time'),
		v.integer(),
		v.minValue(1, 'Please choose a time')
	),

	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(2, 'Please tell us your name'),
		v.maxLength(80, 'That name is too long')
	),

	email: v.pipe(
		v.string(),
		v.trim(),
		v.email('That does not look like an email address'),
		v.maxLength(200)
	),

	// `v.optional` with a default turns an absent field into an empty string
	// rather than `undefined`, which keeps the handler free of `?? ''`.
	phone: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(40)), ''),
	note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ''),
	viewerTimeZone: v.optional(timeZoneSchema, 'UTC')
});

/**
 * Take the slot.
 *
 * A `form`, not a `command`, and that choice is the accessibility story of the
 * whole app. A `form` renders as a real `<form method="POST">` with a real
 * action, so a customer with a flaky connection, an old browser, or JavaScript
 * blocked can still book an appointment — the browser posts the form the way
 * browsers have since 1995. When JavaScript is available, SvelteKit intercepts
 * the submission and everything happens without a page load. Same code, two
 * behaviours, and the degraded one still works.
 *
 * On success this redirects to the management page for the new booking. A
 * redirect after a POST is not a formality: without it, a refresh re-submits and
 * the customer books twice.
 */
export const book = form(bookSchema, async (data) => {
	try {
		const created = await createBooking({
			businessSlug: data.slug,
			serviceId: data.serviceId,
			staffId: data.staffId,
			start: data.start,
			customerName: data.name,
			customerEmail: data.email,
			customerPhone: data.phone || undefined,
			note: data.note || undefined
		});

		// The token, not the id: this URL goes in an email, and it has to be the
		// thing that proves the holder may cancel.
		redirect(303, `/booking/${created.manageToken}?new=1`);
	} catch (thrown) {
		if (thrown instanceof BookingError) {
			/*
			 * These are not server errors, they are answers. Turning them into a
			 * 4xx with a readable message means the page can say "that time went a
			 * few seconds ago, here are the nearest ones" instead of showing a
			 * stack trace or a generic apology.
			 *
			 * 409 Conflict is exactly right for `slot_taken`: the request was
			 * well-formed and would have worked a moment earlier.
			 */
			const status = thrown.code === 'slot_taken' ? 409 : 400;
			error(status, thrown.message);
		}
		throw thrown;
	}
});
