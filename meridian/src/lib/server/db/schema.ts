/**
 * THE MERIDIAN SCHEMA
 * ===================
 *
 * Seven tables around one idea: a *trip* that several people plan together.
 *
 *   trip           the plan: a name, a date range, a currency, a share link
 *   member         who may see or change it, with a role
 *   invite         a link that turns a stranger into a member, once, for a while
 *   stop           a place on a day (or an idea with no day yet), in order
 *   expense        who paid what, when, for what
 *   expense_share  who that expense is split between, by weight
 *   note           one rich-text document per trip
 *
 * Three conventions run through the file:
 *
 *   1. Dates are `YYYY-MM-DD` strings (see `domain/dates.ts`). A trip starts
 *      on a date, not at an instant, and a string compares and sorts the way
 *      a date should. Instants — created, updated, expires — are integer
 *      milliseconds since 1970 UTC, which Drizzle hands back as a `Date`.
 *   2. Money is an integer of minor units plus a currency code
 *      (see `domain/money.ts`).
 *   3. `trip.version` goes up by one on every change to anything under the
 *      trip. The live query watches that one number.
 */

import { relations, sql } from 'drizzle-orm';
import type { Currency } from '#lib/domain/money.ts';
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema.ts';
import { newId } from '#lib/domain/ids.ts';
import type { ExpenseCategory, NoteDoc, Role, StopKind, Visibility } from '#lib/domain/schemas.ts';

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

const tripRef = () =>
	text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' });

/* -------------------------------------------------------------------------- */
/* Trips and who belongs to them                                              */
/* -------------------------------------------------------------------------- */

export const trip = sqliteTable(
	'trip',
	{
		id: id(),
		/** The public address: `/t/kx7m4p2q9w`. Ten characters from `newSlug()`. */
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		startDate: text('start_date').notNull(),
		endDate: text('end_date').notNull(),
		/** ISO 4217. Every expense is entered in it. */
		currency: text('currency').$type<Currency>().notNull(),
		/** `private`: members only. `link`: anybody with the slug may read. */
		visibility: text('visibility').$type<Visibility>().notNull().default('private'),
		/**
		 * Bumped on every change to the trip or anything under it. The live
		 * query compares this number, not the rows, to decide whether to send.
		 */
		version: integer('version').notNull().default(1),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		uniqueIndex('trip_slug_idx').on(table.slug),
		index('trip_owner_idx').on(table.ownerId)
	]
);

export const member = sqliteTable(
	'member',
	{
		tripId: tripRef(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').$type<Role>().notNull(),
		joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull().default(nowMs)
	},
	(table) => [
		// One row per person per trip: the pair is the key.
		primaryKey({ columns: [table.tripId, table.userId] }),
		index('member_user_idx').on(table.userId)
	]
);

export const invite = sqliteTable(
	'invite',
	{
		/** The secret in the link. Unguessable, single-use, and it expires. */
		token: text('token').primaryKey(),
		tripId: tripRef(),
		role: text('role').$type<'editor' | 'viewer'>().notNull(),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
		usedAt: integer('used_at', { mode: 'timestamp_ms' }),
		createdAt: createdAt()
	},
	(table) => [index('invite_trip_idx').on(table.tripId)]
);

/* -------------------------------------------------------------------------- */
/* The itinerary                                                              */
/* -------------------------------------------------------------------------- */

export const stop = sqliteTable(
	'stop',
	{
		id: id(),
		tripId: tripRef(),
		name: text('name').notNull(),
		kind: text('kind').$type<StopKind>().notNull().default('place'),
		lng: real('lng').notNull(),
		lat: real('lat').notNull(),
		/** `null` is an idea: a stop that has not been given a day. */
		date: text('date'),
		/** Order within the day, from zero. See `domain/itinerary.ts`. */
		position: integer('position').notNull().default(0),
		notes: text('notes').notNull().default(''),
		/** The gazetteer entry it came from, if it came from one. */
		placeId: text('place_id'),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	// The itinerary page reads one trip's stops in day-then-position order.
	(table) => [index('stop_trip_day_idx').on(table.tripId, table.date, table.position)]
);

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

export const expense = sqliteTable(
	'expense',
	{
		id: id(),
		tripId: tripRef(),
		title: text('title').notNull(),
		/** Minor units — cents. Never a float. */
		amountMinor: integer('amount_minor').notNull(),
		currency: text('currency').$type<Currency>().notNull(),
		category: text('category').$type<ExpenseCategory>().notNull().default('other'),
		date: text('date').notNull(),
		paidBy: text('paid_by')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [index('expense_trip_date_idx').on(table.tripId, table.date)]
);

export const expenseShare = sqliteTable(
	'expense_share',
	{
		expenseId: text('expense_id')
			.notNull()
			.references(() => expense.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Relative weight; 1 for an even split. */
		weight: integer('weight').notNull().default(1)
	},
	(table) => [primaryKey({ columns: [table.expenseId, table.userId] })]
);

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

export const note = sqliteTable('note', {
	/** One note per trip, so the trip id is the key. */
	tripId: text('trip_id')
		.primaryKey()
		.references(() => trip.id, { onDelete: 'cascade' }),
	/** A Tiptap document, as JSON. */
	doc: text('doc', { mode: 'json' }).$type<NoteDoc>().notNull(),
	updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
	updatedAt: updatedAt()
});

/* -------------------------------------------------------------------------- */
/* Relations, for `db.query.trip.findFirst({ with: { stops: true } })`         */
/* -------------------------------------------------------------------------- */

export const tripRelations = relations(trip, ({ one, many }) => ({
	owner: one(user, { fields: [trip.ownerId], references: [user.id] }),
	members: many(member),
	stops: many(stop),
	expenses: many(expense),
	note: one(note, { fields: [trip.id], references: [note.tripId] })
}));

export const memberRelations = relations(member, ({ one }) => ({
	trip: one(trip, { fields: [member.tripId], references: [trip.id] }),
	user: one(user, { fields: [member.userId], references: [user.id] })
}));

export const inviteRelations = relations(invite, ({ one }) => ({
	trip: one(trip, { fields: [invite.tripId], references: [trip.id] }),
	inviter: one(user, { fields: [invite.createdBy], references: [user.id] })
}));

export const stopRelations = relations(stop, ({ one }) => ({
	trip: one(trip, { fields: [stop.tripId], references: [trip.id] })
}));

export const expenseRelations = relations(expense, ({ one, many }) => ({
	trip: one(trip, { fields: [expense.tripId], references: [trip.id] }),
	payer: one(user, { fields: [expense.paidBy], references: [user.id] }),
	shares: many(expenseShare)
}));

export const expenseShareRelations = relations(expenseShare, ({ one }) => ({
	expense: one(expense, { fields: [expenseShare.expenseId], references: [expense.id] }),
	user: one(user, { fields: [expenseShare.userId], references: [user.id] })
}));

export type Trip = typeof trip.$inferSelect;
export type Member = typeof member.$inferSelect;
export type Invite = typeof invite.$inferSelect;
export type Stop = typeof stop.$inferSelect;
export type Expense = typeof expense.$inferSelect;
export type ExpenseShare = typeof expenseShare.$inferSelect;
export type Note = typeof note.$inferSelect;
