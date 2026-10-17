import * as v from 'valibot';
import { and, asc, eq } from 'drizzle-orm';
import { error, invalid, redirect } from '@sveltejs/kit';
import { form, getRequestEvent, query } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { business, service, staff, staffService } from '#lib/server/db/schema.ts';
import {
	BookingError,
	createBooking,
	loadAvailability,
	type BookingErrorCode
} from '#lib/server/scheduling.ts';
import { watchDiary } from '#lib/server/diary-events.ts';
import { addDays, isValidTimeZone, type Slot } from '#lib/time/index.ts';
import { getManagedBooking } from '../../booking/[token]/manage.remote.ts';

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
 * `slot` carries **both** the start time and the staff member, as one string:
 * `1786780800000.842b81fc-…`. That is not a shortcut, it is what makes the form
 * work with JavaScript switched off.
 *
 * The obvious design — a radio group of times plus a hidden `staffId` field —
 * needs JavaScript to keep the hidden field in step with the chosen radio.
 * Without it the hidden field stays at whatever the server rendered, which for
 * "anyone" is nothing at all, and the submission fails validation for a reason
 * the customer cannot see or fix. Fusing them means the browser posts a complete,
 * coherent choice using nothing but a radio button.
 *
 * The schema splits it back apart, so the handler receives a validated
 * `{ start: number, staffId: string }` and cannot be reached with `NaN` or a
 * half-filled selection.
 *
 * `viewerTimeZone` is the customer's own zone, sent from the browser. It is used
 * only to phrase the confirmation and is deliberately not trusted for anything
 * that matters: the appointment is stored as an instant, and the business's zone
 * comes from the database.
 */
const slotValueSchema = v.pipe(
	v.string('Please choose a time'),
	v.regex(
		/^\d{10,16}\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		'Please choose a time'
	),
	v.transform((raw) => {
		const separator = raw.indexOf('.');
		return {
			start: Number(raw.slice(0, separator)),
			staffId: raw.slice(separator + 1)
		};
	})
);

const bookSchema = v.object({
	slug: slugSchema,
	serviceId: idSchema,
	slot: slotValueSchema,

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
/**
 * The refusals that are answers about the chosen time. The customer puts each
 * of them right on this same form, by choosing another time.
 */
const REFUSED_TIME: ReadonlySet<BookingErrorCode> = new Set([
	'slot_taken',
	'slot_not_offered',
	'too_soon',
	'too_far_ahead',
	'staff_unavailable'
]);

export const book = form(bookSchema, async (data, issue) => {
	const created = await createBooking({
		businessSlug: data.slug,
		serviceId: data.serviceId,
		staffId: data.slot.staffId,
		start: data.slot.start,
		customerName: data.name,
		customerEmail: data.email,
		customerPhone: data.phone || undefined,
		note: data.note || undefined
	}).catch((thrown: unknown) => {
		if (!(thrown instanceof BookingError)) throw thrown;

		/*
		 * A refused time goes on the form, attached to the `slot` field with
		 * `invalid(issue.slot(…))`: the page stays, the name and email stay filled
		 * in, and the sentence appears beside the grid, where the remedy is.
		 *
		 * This used to be `error(409, …)`, which sends a form submission to
		 * `+error.svelte` — a failure screen whose only button is "Back to the
		 * start", and a customer typing everything in again. It is the mistake
		 * chapter 21 corrects on the sign-in form, made a second time.
		 *
		 * It is the rare case. The live grid normally drops a taken time, and the
		 * customer's choice of it, before the form is ever sent. When a race does
		 * reach the server, the loser is usually turned away by the re-check at
		 * the top of `createBooking`, because the write queue lets the winner
		 * commit first: "That time is no longer available." Two server processes
		 * racing each other meet the claim table instead, and the loser gets
		 * "Sorry — that time was booked moments ago."
		 */
		if (REFUSED_TIME.has(thrown.code)) invalid(issue.slot(thrown.message));

		/*
		 * Not about anything on the form: the studio or the service has gone.
		 * Nothing the customer can change here fixes that, so it is a failure
		 * screen, in the server's words.
		 */
		error(thrown.code === 'not_found' ? 404 : 400, thrown.message);
	});

	/*
	 * A single-flight redirect. Refreshing the confirmation page's own query
	 * here sends the new booking back in this same response, so the page the
	 * redirect lands on renders from it without asking the server again.
	 *
	 * It also does something less obvious. A `form` with no refresh of its own
	 * falls back to refreshing *every* query on the page it is leaving — and on
	 * the booking page that includes the live availability stream, which
	 * reconnected as the browser navigated away and stayed open on the
	 * confirmation page, a connection to a page nobody was looking at. Naming
	 * the one query that matters replaces that blanket refresh.
	 *
	 * Without JavaScript none of this applies: the browser follows the 303 and
	 * loads the confirmation page the ordinary way.
	 */
	void getManagedBooking(created.manageToken).refresh();

	// The token, not the id: this URL goes in an email, and it has to be the
	// thing that proves the holder may cancel.
	redirect(303, `/booking/${created.manageToken}?new=1`);
});
