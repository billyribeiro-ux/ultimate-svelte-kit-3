import * as v from 'valibot';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { availabilityRule, business, service, staff, staffService } from '#lib/server/db/schema.ts';
import { assertCanManageDiaryOf, requireOwner, requireStaff } from '#lib/server/guards.ts';
import { publishDiaryChange } from '#lib/server/diary-events.ts';
import { SLOT_MINUTES, isValidTimeZone, isWholeSlots } from '#lib/time/index.ts';

/**
 * Everything the studio's owner can change: services, hours, the team and the
 * booking rules.
 *
 * The authorisation split is deliberate and worth stating once:
 *
 *   `requireStaff` — you work here. Enough to read the team list and to change
 *                    *your own* working hours.
 *   `requireOwner` — you run the place. Needed to change prices, services, other
 *                    people's hours, and the rules everybody books under.
 *
 * Every exported function opens with one of them. None of them infers permission
 * from the fact that the page rendered — a remote function is a public endpoint
 * and the page it was called from is not evidence of anything.
 */

const slugSchema = v.pipe(v.string(), v.trim(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));
const idSchema = v.pipe(v.string(), v.uuid());

/**
 * A duration that fits the five-minute occupancy grid.
 *
 * Rejected at the edge rather than rounded, because a 47-minute service is not
 * *slightly* wrong — its block would end mid-cell, and that cell would either be
 * sold twice or wasted. See `#lib/time/grid.ts`.
 */
const gridMinutes = (label: string, min: number, max: number) =>
	v.pipe(
		v.number(),
		v.integer(),
		v.minValue(min, `${label} must be at least ${min} minutes`),
		v.maxValue(max, `${label} cannot be more than ${max} minutes`),
		v.check(isWholeSlots, `${label} must be a multiple of ${SLOT_MINUTES} minutes`)
	);

/* -------------------------------------------------------------------------- */
/* Services                                                                    */
/* -------------------------------------------------------------------------- */

export interface ServiceRow {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	durationMinutes: number;
	bufferBeforeMinutes: number;
	bufferAfterMinutes: number;
	slotIntervalMinutes: number;
	priceCents: number;
	isActive: boolean;
	staffIds: string[];
}

export const getServices = query(slugSchema, async (slug): Promise<ServiceRow[]> => {
	const context = await requireStaff(slug);

	const rows = await db.query.service.findMany({
		where: eq(service.businessId, context.business.id),
		orderBy: [asc(service.sortOrder), asc(service.name)]
	});

	// One query for every pairing, grouped in memory — rather than one query per
	// service, which is the N+1 problem wearing a different hat.
	const pairings = await db
		.select({ serviceId: staffService.serviceId, staffId: staffService.staffId })
		.from(staffService)
		.innerJoin(staff, eq(staff.id, staffService.staffId))
		.where(eq(staff.businessId, context.business.id));

	const byService = new Map<string, string[]>();
	for (const pair of pairings) {
		const list = byService.get(pair.serviceId);
		if (list) list.push(pair.staffId);
		else byService.set(pair.serviceId, [pair.staffId]);
	}

	return rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		durationMinutes: row.durationMinutes,
		bufferBeforeMinutes: row.bufferBeforeMinutes,
		bufferAfterMinutes: row.bufferAfterMinutes,
		slotIntervalMinutes: row.slotIntervalMinutes,
		priceCents: row.priceCents,
		isActive: row.isActive,
		staffIds: byService.get(row.id) ?? []
	}));
});

const serviceSchema = v.object({
	slug: slugSchema,
	serviceId: idSchema,
	name: v.pipe(v.string(), v.trim(), v.minLength(2, 'Give it a name'), v.maxLength(80)),
	description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300)), ''),
	durationMinutes: gridMinutes('Duration', 5, 480),
	bufferAfterMinutes: gridMinutes('Tidy-up time', 0, 120),
	/*
	 * Money arrives as pounds and is stored as pence.
	 *
	 * The conversion happens in the schema, so the handler only ever sees an
	 * integer. `Math.round` rather than a cast because 48.15 × 100 is
	 * 4814.999999999999 in binary floating point, and truncating that would
	 * charge every customer a penny less than the owner typed.
	 */
	price: v.pipe(
		v.number('Enter a price'),
		v.minValue(0, 'A price cannot be negative'),
		v.maxValue(100_000),
		v.transform((pounds) => Math.round(pounds * 100))
	),
	isActive: v.optional(v.boolean(), false)
});

/**
 * Edit a service.
 *
 * A `form` rather than a `command`: it is a page of text and number fields, and
 * a form gives per-field validation messages, a pending count and a working
 * submission without JavaScript, none of which have to be written.
 */
export const saveService = form(serviceSchema, async (data) => {
	const context = await requireOwner(data.slug);

	const existing = await db.query.service.findFirst({
		where: and(eq(service.id, data.serviceId), eq(service.businessId, context.business.id))
	});
	if (!existing) error(404, 'No such service.');

	await db
		.update(service)
		.set({
			name: data.name,
			description: data.description || null,
			durationMinutes: data.durationMinutes,
			bufferAfterMinutes: data.bufferAfterMinutes,
			priceCents: data.price,
			isActive: data.isActive
		})
		.where(eq(service.id, existing.id));

	/*
	 * Changing a duration changes which start times are on offer, so every open
	 * booking page needs to hear about it. `getServices` is refreshed in the same
	 * flight; the availability streams pick it up from the notice board.
	 */
	void getServices(data.slug).refresh();
	publishDiaryChange(context.business.id);

	return { saved: true };
});

/** Take a service off the booking page without deleting its history. */
export const setServiceActive = command(
	v.object({ slug: slugSchema, serviceId: idSchema, isActive: v.boolean() }),
	async ({ slug, serviceId, isActive }) => {
		const context = await requireOwner(slug);

		const existing = await db.query.service.findFirst({
			where: and(eq(service.id, serviceId), eq(service.businessId, context.business.id))
		});
		if (!existing) error(404, 'No such service.');

		await db.update(service).set({ isActive }).where(eq(service.id, existing.id));

		// Single-flight: the refreshed list rides back with this response.
		void getServices(slug).refresh();
		publishDiaryChange(context.business.id);

		return { isActive };
	}
);

/* -------------------------------------------------------------------------- */
/* Team                                                                        */
/* -------------------------------------------------------------------------- */

export interface TeamMember {
	id: string;
	displayName: string;
	bio: string | null;
	role: 'owner' | 'member';
	colourHue: number;
	isActive: boolean;
	serviceIds: string[];
}

export const getTeam = query(slugSchema, async (slug): Promise<TeamMember[]> => {
	const context = await requireStaff(slug);

	const rows = await db.query.staff.findMany({
		where: eq(staff.businessId, context.business.id),
		orderBy: [asc(staff.sortOrder), asc(staff.displayName)]
	});

	const pairings = await db
		.select({ serviceId: staffService.serviceId, staffId: staffService.staffId })
		.from(staffService)
		.innerJoin(staff, eq(staff.id, staffService.staffId))
		.where(eq(staff.businessId, context.business.id));

	const byStaff = new Map<string, string[]>();
	for (const pair of pairings) {
		const list = byStaff.get(pair.staffId);
		if (list) list.push(pair.serviceId);
		else byStaff.set(pair.staffId, [pair.serviceId]);
	}

	return rows.map((row) => ({
		id: row.id,
		displayName: row.displayName,
		bio: row.bio,
		role: row.role,
		colourHue: row.colourHue,
		isActive: row.isActive,
		serviceIds: byStaff.get(row.id) ?? []
	}));
});

/** Whether a staff member offers a service. The junction table, as a toggle. */
export const setStaffService = command(
	v.object({
		slug: slugSchema,
		staffId: idSchema,
		serviceId: idSchema,
		offers: v.boolean()
	}),
	async ({ slug, staffId, serviceId, offers }) => {
		const context = await requireOwner(slug);

		// Both sides must belong to this business, or an owner of one studio could
		// wire their staff to another studio's services by id.
		const member = await db.query.staff.findFirst({
			where: and(eq(staff.id, staffId), eq(staff.businessId, context.business.id))
		});
		const target = await db.query.service.findFirst({
			where: and(eq(service.id, serviceId), eq(service.businessId, context.business.id))
		});
		if (!member || !target) error(404, 'No such staff member or service.');

		if (offers) {
			/*
			 * `onConflictDoNothing` makes this idempotent. Two quick clicks would
			 * otherwise race and the second would fail on the composite primary key —
			 * a red error for an action that already succeeded.
			 */
			await db.insert(staffService).values({ staffId, serviceId }).onConflictDoNothing();
		} else {
			await db
				.delete(staffService)
				.where(and(eq(staffService.staffId, staffId), eq(staffService.serviceId, serviceId)));
		}

		void getTeam(slug).refresh();
		void getServices(slug).refresh();
		publishDiaryChange(context.business.id);

		return { offers };
	}
);

/* -------------------------------------------------------------------------- */
/* Working hours                                                               */
/* -------------------------------------------------------------------------- */

export interface HoursRow {
	id: string;
	staffId: string;
	weekday: number;
	startMinute: number;
	endMinute: number;
}

export const getHours = query(
	v.object({ slug: slugSchema, staffId: v.optional(idSchema) }),
	async ({ slug, staffId }): Promise<{ rules: HoursRow[]; canEdit: string[] }> => {
		const context = await requireStaff(slug);

		const team = await db.query.staff.findMany({
			where: eq(staff.businessId, context.business.id)
		});
		const teamIds = team.map((row) => row.id);

		/*
		 * Scoped to this business's staff in the query, not filtered afterwards.
		 *
		 * The difference matters: `inArray` means a rule belonging to another
		 * studio never leaves the database. Fetching everything and filtering in
		 * JavaScript would work today and leak the day somebody forgets the filter.
		 */
		const rules = teamIds.length
			? await db.query.availabilityRule.findMany({
					where: staffId
						? // A specific person — but still only if they work here.
							and(inArray(availabilityRule.staffId, teamIds), eq(availabilityRule.staffId, staffId))
						: inArray(availabilityRule.staffId, teamIds),
					orderBy: [asc(availabilityRule.weekday), asc(availabilityRule.startMinute)]
				})
			: [];

		return {
			rules: rules.map((row) => ({
				id: row.id,
				staffId: row.staffId,
				weekday: row.weekday,
				startMinute: row.startMinute,
				endMinute: row.endMinute
			})),
			// An owner may edit anyone's hours; a member only their own.
			canEdit: context.staff.role === 'owner' ? teamIds : [context.staff.id]
		};
	}
);

const hoursSchema = v.object({
	slug: slugSchema,
	staffId: idSchema,
	weekday: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
	/*
	 * Minutes past local midnight. `endMinute` may exceed 1440 for a window that
	 * runs past midnight — a bar open until 2am closes at minute 1560 of the day
	 * it opened, which keeps "Friday night" one row instead of two.
	 */
	startMinute: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1440)),
	endMinute: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2880))
});

/** Add a working window. */
export const addHours = command(hoursSchema, async (data) => {
	const context = await requireStaff(data.slug);
	assertCanManageDiaryOf(context, data.staffId);

	const member = await db.query.staff.findFirst({
		where: and(eq(staff.id, data.staffId), eq(staff.businessId, context.business.id))
	});
	if (!member) error(404, 'No such staff member.');

	if (data.endMinute <= data.startMinute) {
		error(400, 'A shift has to end after it starts.');
	}

	await db.insert(availabilityRule).values({
		staffId: data.staffId,
		weekday: data.weekday,
		startMinute: data.startMinute,
		endMinute: data.endMinute
	});

	void getHours({ slug: data.slug }).refresh();
	publishDiaryChange(context.business.id);

	return { added: true };
});

/** Remove a working window. Existing bookings are untouched. */
export const removeHours = command(
	v.object({ slug: slugSchema, ruleId: idSchema }),
	async ({ slug, ruleId }) => {
		const context = await requireStaff(slug);

		const rule = await db.query.availabilityRule.findFirst({
			where: eq(availabilityRule.id, ruleId)
		});
		if (!rule) error(404, 'No such shift.');

		// The rule belongs to a staff member; the staff member must belong to this
		// business, and the viewer must be allowed to manage them.
		const member = await db.query.staff.findFirst({
			where: and(eq(staff.id, rule.staffId), eq(staff.businessId, context.business.id))
		});
		if (!member) error(404, 'No such shift.');
		assertCanManageDiaryOf(context, member.id);

		await db.delete(availabilityRule).where(eq(availabilityRule.id, rule.id));

		void getHours({ slug }).refresh();
		publishDiaryChange(context.business.id);

		return { removed: true };
	}
);

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export interface StudioSettings {
	name: string;
	tagline: string | null;
	description: string | null;
	timeZone: string;
	email: string;
	phone: string | null;
	addressLine: string | null;
	city: string | null;
	postcode: string | null;
	minNoticeMinutes: number;
	maxAdvanceDays: number;
	cancellationNoticeHours: number;
}

export const getSettings = query(slugSchema, async (slug): Promise<StudioSettings> => {
	const context = await requireStaff(slug);
	const row = context.business;

	return {
		name: row.name,
		tagline: row.tagline,
		description: row.description,
		timeZone: row.timeZone,
		email: row.email,
		phone: row.phone,
		addressLine: row.addressLine,
		city: row.city,
		postcode: row.postcode,
		minNoticeMinutes: row.minNoticeMinutes,
		maxAdvanceDays: row.maxAdvanceDays,
		cancellationNoticeHours: row.cancellationNoticeHours
	};
});

const settingsSchema = v.object({
	slug: slugSchema,
	name: v.pipe(v.string(), v.trim(), v.minLength(2, 'Give the studio a name'), v.maxLength(80)),
	tagline: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)), ''),
	description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(600)), ''),

	/*
	 * Validated against the runtime's own tz database rather than a regex.
	 * `Intl.DateTimeFormat` throws `RangeError` for anything it does not know —
	 * which is exactly the lookup every formatted time will perform later, so if
	 * it passes here it cannot fail there.
	 */
	timeZone: v.pipe(
		v.string(),
		v.check(isValidTimeZone, 'That is not a time zone this server recognises')
	),

	email: v.pipe(v.string(), v.trim(), v.email('That does not look like an email address')),
	phone: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(40)), ''),
	addressLine: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)), ''),
	city: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), ''),
	postcode: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(16)), ''),

	minNoticeMinutes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20_160)),
	maxAdvanceDays: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)),
	cancellationNoticeHours: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(720))
});

export const saveSettings = form(settingsSchema, async (data) => {
	const context = await requireOwner(data.slug);

	await db
		.update(business)
		.set({
			name: data.name,
			tagline: data.tagline || null,
			description: data.description || null,
			timeZone: data.timeZone,
			email: data.email,
			phone: data.phone || null,
			addressLine: data.addressLine || null,
			city: data.city || null,
			postcode: data.postcode || null,
			minNoticeMinutes: data.minNoticeMinutes,
			maxAdvanceDays: data.maxAdvanceDays,
			cancellationNoticeHours: data.cancellationNoticeHours
		})
		.where(eq(business.id, context.business.id));

	/*
	 * Moving the studio to another time zone re-interprets every opening hour,
	 * because those are stored as wall-clock minutes. Existing bookings are
	 * unaffected — they are instants, and they carry a snapshot of the zone they
	 * were made in — but every availability stream needs to recompute.
	 */
	void getSettings(data.slug).refresh();
	publishDiaryChange(context.business.id);

	return { saved: true };
});
