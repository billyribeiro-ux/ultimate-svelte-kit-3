import { relations, sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema.ts';
import { newId } from './ids.ts';

/**
 * The Halfpast schema.
 *
 * Two conventions run through the whole file, and understanding them makes the
 * rest read easily.
 *
 * 1. **Instants are stored as `timestamp_ms`.** That is a plain 64-bit integer of
 *    milliseconds since 1970 UTC, which Drizzle hands back as a JavaScript `Date`.
 *    A `Date` is an *instant* — a single point on the world's timeline. It is not
 *    a calendar date and it has no time zone. Calling `.getHours()` on one is
 *    always a bug in this codebase; the time layer in `#lib/time` is the only
 *    place allowed to turn an instant into a wall-clock reading.
 *
 * 2. **Wall-clock times are stored as minutes past local midnight.** A salon's
 *    opening hours are "nine in the morning" — a statement about a clock on a
 *    wall, not about a moment in history. Storing that as an instant would be a
 *    category error, and would break twice a year.
 *
 * Everything hard about this app is downstream of keeping those two apart.
 */

/** Every table gets the same primary key shape, so define it once. */
const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => newId());

/** SQLite has no `now()` that Drizzle can default to, so spell it out once. */
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs);

const updatedAt = () =>
	integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(nowMs)
		.$onUpdate(() => new Date());

/* -------------------------------------------------------------------------- */
/* Business                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A studio, clinic or salon. The root of everything else — a booking belongs to
 * a business, and so does the time zone the whole diary is reasoned about in.
 */
export const business = sqliteTable(
	'business',
	{
		id: id(),

		/** The public URL segment: `/book/willow-lane`. Lowercase, hyphenated. */
		slug: text('slug').notNull(),

		name: text('name').notNull(),
		tagline: text('tagline'),
		description: text('description'),

		/**
		 * The IANA time zone the business physically operates in, e.g. `Europe/London`.
		 *
		 * This is the single most important column in the schema. Opening hours are
		 * interpreted in it, the owner's diary is drawn in it, and a customer in
		 * another zone sees times converted from it. Storing `+01:00` here instead
		 * of a zone name would be wrong: an offset is a fact about one moment, a
		 * zone is a set of rules about all of them.
		 */
		timeZone: text('time_zone').notNull(),

		email: text('email').notNull(),
		phone: text('phone'),

		addressLine: text('address_line'),
		city: text('city'),
		postcode: text('postcode'),
		country: text('country').notNull().default('GB'),

		/** ISO 4217. Snapshotted onto each booking so a price change is not retroactive. */
		currency: text('currency').notNull().default('GBP'),

		/**
		 * How soon before an appointment a customer may still book it. Stops someone
		 * booking a haircut for four minutes from now while the barber is mid-fade.
		 */
		minNoticeMinutes: integer('min_notice_minutes').notNull().default(120),

		/** How far into the future the calendar is open. Keeps the diary finite. */
		maxAdvanceDays: integer('max_advance_days').notNull().default(60),

		/** How late a customer may cancel without phoning. */
		cancellationNoticeHours: integer('cancellation_notice_hours').notNull().default(24),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [unique('business_slug_unique').on(t.slug)]
);

/* -------------------------------------------------------------------------- */
/* Staff                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Roles, most privileged first.
 *
 * `owner` can change the business, its services and everyone's hours.
 * `member` can see and manage their own diary and nothing else.
 *
 * Declaring the enum in the column gives us a TypeScript union — assigning
 * `'admin'` somewhere is a compile error rather than a row nobody can log in as.
 */
export const STAFF_ROLES = ['owner', 'member'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * A person who provides services at a business, joined to the account they log
 * in with. The same human can be staff at two businesses; that is two rows.
 */
export const staff = sqliteTable(
	'staff',
	{
		id: id(),

		businessId: text('business_id')
			.notNull()
			.references(() => business.id, { onDelete: 'cascade' }),

		/**
		 * The login this staff member uses. `user` comes from Better Auth, which owns
		 * the credential side; this table owns everything about them *as staff*.
		 */
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),

		role: text('role', { enum: STAFF_ROLES }).notNull().default('member'),

		/** What customers see. Often a first name where the account is a full one. */
		displayName: text('display_name').notNull(),
		bio: text('bio'),

		/** A hue (0–360) for this person's blocks in the diary. */
		colourHue: integer('colour_hue').notNull().default(210),

		/**
		 * Inactive staff keep their history and disappear from the booking page.
		 * Deleting them would take their customers' past appointments with them.
		 */
		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

		sortOrder: integer('sort_order').notNull().default(0),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		// One staff row per person per business. Without this, an owner clicking
		// "invite" twice quietly gives someone two diaries.
		unique('staff_business_user_unique').on(t.businessId, t.userId),
		index('staff_business_idx').on(t.businessId),
		index('staff_user_idx').on(t.userId)
	]
);

/* -------------------------------------------------------------------------- */
/* Service                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Something a customer can book: "Cut and finish, 45 minutes, £48".
 */
export const service = sqliteTable(
	'service',
	{
		id: id(),

		businessId: text('business_id')
			.notNull()
			.references(() => business.id, { onDelete: 'cascade' }),

		slug: text('slug').notNull(),
		name: text('name').notNull(),
		description: text('description'),

		/** Chair time the customer is actually in. Must be a multiple of 5. */
		durationMinutes: integer('duration_minutes').notNull(),

		/**
		 * Padding either side that blocks the diary but is not sold to the customer:
		 * setting up a room, sterilising tools, writing notes.
		 *
		 * Keeping these separate from `durationMinutes` is what lets the confirmation
		 * email say "45 minutes" while the diary correctly reserves 60.
		 */
		bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
		bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),

		/**
		 * How often a start time is *offered*: every 15 minutes, say, even for a
		 * 45-minute service. This is a merchandising decision, not a physical one,
		 * and it is deliberately not the same number as the occupancy grid in
		 * `slotClaim`. Offering fewer, rounder start times fills a day more tidily.
		 */
		slotIntervalMinutes: integer('slot_interval_minutes').notNull().default(15),

		/** Money in the smallest unit. Never a float — `0.1 + 0.2 !== 0.3`. */
		priceCents: integer('price_cents').notNull(),

		isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
		sortOrder: integer('sort_order').notNull().default(0),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		unique('service_business_slug_unique').on(t.businessId, t.slug),
		index('service_business_idx').on(t.businessId)
	]
);

/**
 * Which staff can perform which service. A junction table with no id of its own —
 * the pair *is* the identity, so the pair is the primary key.
 */
export const staffService = sqliteTable(
	'staff_service',
	{
		staffId: text('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'cascade' }),
		serviceId: text('service_id')
			.notNull()
			.references(() => service.id, { onDelete: 'cascade' })
	},
	(t) => [
		primaryKey({ columns: [t.staffId, t.serviceId] }),
		index('staff_service_service_idx').on(t.serviceId)
	]
);

/* -------------------------------------------------------------------------- */
/* Availability                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A recurring weekly working window, in **wall-clock minutes past local midnight**.
 *
 * "Tuesdays, 09:00 to 17:00" is `weekday: 2, startMinute: 540, endMinute: 1020`.
 * Two rows for the same weekday model a lunch break: 540–780 and 840–1020.
 *
 * `weekday` is 0 = Sunday through 6 = Saturday. That choice is arbitrary but it
 * has to be written down somewhere, and this is the somewhere.
 */
export const availabilityRule = sqliteTable(
	'availability_rule',
	{
		id: id(),

		staffId: text('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'cascade' }),

		weekday: integer('weekday').notNull(),
		startMinute: integer('start_minute').notNull(),
		endMinute: integer('end_minute').notNull(),

		/**
		 * Optional validity window, as `YYYY-MM-DD` in the business's own zone.
		 *
		 * Stored as text, not as an instant, and that is deliberate: "from the 1st of
		 * March" is a calendar fact. An instant would need a time of day attached to
		 * it, and whichever one you picked would be wrong for somebody.
		 */
		effectiveFrom: text('effective_from'),
		effectiveTo: text('effective_to'),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [index('availability_rule_staff_weekday_idx').on(t.staffId, t.weekday)]
);

/**
 * A one-off hole in the diary: holiday, a dentist appointment of their own, or
 * the shop closing for a wedding.
 *
 * Unlike `availabilityRule` these ARE instants, because "I'm away from Friday
 * evening until Monday morning" is a continuous stretch of real time.
 */
export const timeOff = sqliteTable(
	'time_off',
	{
		id: id(),

		staffId: text('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'cascade' }),

		startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
		endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),

		reason: text('reason'),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [index('time_off_staff_idx').on(t.staffId, t.startsAt)]
);

/* -------------------------------------------------------------------------- */
/* Customer                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Someone who books. Deliberately not a `user` — the whole point of this app is
 * that a customer never makes an account. Identity is "this email, at this
 * business", which is also how we show them their history.
 */
export const customer = sqliteTable(
	'customer',
	{
		id: id(),

		businessId: text('business_id')
			.notNull()
			.references(() => business.id, { onDelete: 'cascade' }),

		name: text('name').notNull(),
		/** Stored lowercased. `Sam@x.com` and `sam@x.com` are one person. */
		email: text('email').notNull(),
		phone: text('phone'),

		/** Owner-only notes. "Allergic to the blue dye." */
		notes: text('notes'),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		unique('customer_business_email_unique').on(t.businessId, t.email),
		index('customer_business_idx').on(t.businessId)
	]
);

/* -------------------------------------------------------------------------- */
/* Booking                                                                     */
/* -------------------------------------------------------------------------- */

export const BOOKING_STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * The appointment itself, and the permanent record of it.
 *
 * A lot of this table is denormalised on purpose. `serviceName`, `priceCents`
 * and `durationMinutes` are copied from `service` at the moment of booking and
 * never updated. That is not laziness — it is the difference between a diary and
 * a ledger. When the salon raises its prices in April, the receipt for a haircut
 * in March must still say what the customer actually paid.
 */
export const booking = sqliteTable(
	'booking',
	{
		id: id(),

		/** The short code a customer reads over the phone: `HP-7K3QD9`. */
		reference: text('reference').notNull(),

		/**
		 * The secret in the "manage your booking" link. Whoever holds it may cancel,
		 * so it is a bearer credential and is never rendered anywhere except that
		 * one email.
		 */
		manageToken: text('manage_token').notNull(),

		businessId: text('business_id')
			.notNull()
			.references(() => business.id, { onDelete: 'cascade' }),
		staffId: text('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'cascade' }),
		serviceId: text('service_id')
			.notNull()
			.references(() => service.id, { onDelete: 'restrict' }),
		customerId: text('customer_id')
			.notNull()
			.references(() => customer.id, { onDelete: 'cascade' }),

		status: text('status', { enum: BOOKING_STATUSES }).notNull().default('confirmed'),

		/** What the customer was told: the appointment itself. */
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
		endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),

		/**
		 * What the diary actually loses: the appointment plus its buffers. Every
		 * clash check works on this pair, never on `startsAt`/`endsAt`.
		 */
		blockStartsAt: integer('block_starts_at', { mode: 'timestamp_ms' }).notNull(),
		blockEndsAt: integer('block_ends_at', { mode: 'timestamp_ms' }).notNull(),

		/**
		 * The business's zone as it was when this was booked. Snapshotted because a
		 * business can move, and "your appointment was at 2pm" should not silently
		 * become 3pm in the confirmation you look at a year later.
		 */
		timeZone: text('time_zone').notNull(),

		/* --- snapshots, frozen at booking time --- */
		serviceName: text('service_name').notNull(),
		durationMinutes: integer('duration_minutes').notNull(),
		priceCents: integer('price_cents').notNull(),
		currency: text('currency').notNull(),

		customerNote: text('customer_note'),

		cancelledAt: integer('cancelled_at', { mode: 'timestamp_ms' }),
		cancelReason: text('cancel_reason'),
		/** Who pressed cancel — the customer's link, or someone on staff. */
		cancelledBy: text('cancelled_by', { enum: ['customer', 'staff'] }),

		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		unique('booking_reference_unique').on(t.reference),
		unique('booking_manage_token_unique').on(t.manageToken),
		// The diary view: "everything for this business between these two instants".
		index('booking_business_starts_idx').on(t.businessId, t.startsAt),
		index('booking_staff_starts_idx').on(t.staffId, t.startsAt),
		index('booking_customer_idx').on(t.customerId)
	]
);

/* -------------------------------------------------------------------------- */
/* Slot claims — the double-booking guard                                      */
/* -------------------------------------------------------------------------- */

/**
 * **This table is why two customers cannot book the same chair.**
 *
 * The obvious implementation of "is this slot free" is:
 *
 *     SELECT ... WHERE overlaps(...)      -- looks empty
 *     INSERT INTO booking ...             -- so take it
 *
 * and it is wrong. Two requests can both run the SELECT before either runs the
 * INSERT, both see an empty diary, and both succeed. The window is milliseconds
 * wide, which means it never happens in testing and happens constantly on the
 * morning a salon posts its Instagram promo.
 *
 * Wrapping it in a transaction does not fix it either. A transaction gives you
 * atomicity, not exclusion: unless the database is running in a serialisable
 * isolation mode you have explicitly asked for, both transactions still read the
 * same empty result and both still commit.
 *
 * Postgres can express this directly with an exclusion constraint over a range
 * type. SQLite cannot — so we make the constraint expressible by changing the
 * shape of the data.
 *
 * A booking does not store "09:00 to 09:45". It stores nine rows here, one per
 * five-minute cell it occupies, with `(staffId, slotStart)` as the primary key.
 * "Is it free" stops being a question we ask and becomes a question the database
 * answers, atomically, by refusing the second INSERT. The loser's whole
 * transaction rolls back and the customer sees "just taken, here are the nearest
 * times". There is no window, because there is no gap between checking and
 * claiming — they are the same operation.
 *
 * Cancelling a booking DELETEs its claims and leaves the `booking` row alone.
 * This table is the live diary; `booking` is the history.
 */
export const slotClaim = sqliteTable(
	'slot_claim',
	{
		staffId: text('staff_id')
			.notNull()
			.references(() => staff.id, { onDelete: 'cascade' }),

		/** The instant this five-minute cell begins. Always a multiple of `SLOT_MS`. */
		slotStart: integer('slot_start', { mode: 'timestamp_ms' }).notNull(),

		bookingId: text('booking_id')
			.notNull()
			.references(() => booking.id, { onDelete: 'cascade' })
	},
	(t) => [
		// The entire concurrency story, in one line.
		primaryKey({ columns: [t.staffId, t.slotStart] }),
		index('slot_claim_booking_idx').on(t.bookingId)
	]
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                   */
/* -------------------------------------------------------------------------- */

/*
 * These do not create anything in the database. They teach Drizzle's relational
 * query builder how the tables connect, so that
 *
 *     db.query.booking.findMany({ with: { service: true, customer: true } })
 *
 * type-checks and produces one query instead of an N+1 storm.
 */

export const businessRelations = relations(business, ({ many }) => ({
	staff: many(staff),
	services: many(service),
	customers: many(customer),
	bookings: many(booking)
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
	business: one(business, { fields: [staff.businessId], references: [business.id] }),
	services: many(staffService),
	availability: many(availabilityRule),
	timeOff: many(timeOff),
	bookings: many(booking)
}));

export const serviceRelations = relations(service, ({ one, many }) => ({
	business: one(business, { fields: [service.businessId], references: [business.id] }),
	staff: many(staffService),
	bookings: many(booking)
}));

export const staffServiceRelations = relations(staffService, ({ one }) => ({
	staff: one(staff, { fields: [staffService.staffId], references: [staff.id] }),
	service: one(service, { fields: [staffService.serviceId], references: [service.id] })
}));

export const availabilityRuleRelations = relations(availabilityRule, ({ one }) => ({
	staff: one(staff, { fields: [availabilityRule.staffId], references: [staff.id] })
}));

export const timeOffRelations = relations(timeOff, ({ one }) => ({
	staff: one(staff, { fields: [timeOff.staffId], references: [staff.id] })
}));

export const customerRelations = relations(customer, ({ one, many }) => ({
	business: one(business, { fields: [customer.businessId], references: [business.id] }),
	bookings: many(booking)
}));

export const bookingRelations = relations(booking, ({ one, many }) => ({
	business: one(business, { fields: [booking.businessId], references: [business.id] }),
	staff: one(staff, { fields: [booking.staffId], references: [staff.id] }),
	service: one(service, { fields: [booking.serviceId], references: [service.id] }),
	customer: one(customer, { fields: [booking.customerId], references: [customer.id] }),
	claims: many(slotClaim)
}));

export const slotClaimRelations = relations(slotClaim, ({ one }) => ({
	booking: one(booking, { fields: [slotClaim.bookingId], references: [booking.id] }),
	staff: one(staff, { fields: [slotClaim.staffId], references: [staff.id] })
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                              */
/* -------------------------------------------------------------------------- */

/*
 * `$inferSelect` is the shape a row comes back as; `$inferInsert` is the shape
 * you may pass to `.insert()` (columns with defaults become optional). Deriving
 * both from the table means the types can never drift from the schema — change a
 * column and every consumer fails to compile immediately.
 */
export type Business = typeof business.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Service = typeof service.$inferSelect;
export type AvailabilityRule = typeof availabilityRule.$inferSelect;
export type TimeOff = typeof timeOff.$inferSelect;
export type Customer = typeof customer.$inferSelect;
export type Booking = typeof booking.$inferSelect;
export type SlotClaim = typeof slotClaim.$inferSelect;

export type NewBusiness = typeof business.$inferInsert;
export type NewStaff = typeof staff.$inferInsert;
export type NewService = typeof service.$inferInsert;
export type NewAvailabilityRule = typeof availabilityRule.$inferInsert;
export type NewTimeOff = typeof timeOff.$inferInsert;
export type NewCustomer = typeof customer.$inferInsert;
export type NewBooking = typeof booking.$inferInsert;

export * from './auth.schema.ts';
