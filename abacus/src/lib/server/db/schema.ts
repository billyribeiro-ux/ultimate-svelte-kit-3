/**
 * THE SCHEMA
 * ==========
 *
 * Five tables. A sheet is one JSON document (see `sheet/document.ts`): it is
 * read and written whole, its cells are never queried by SQL, and a table
 * of cells would be a row per cell for no query anybody runs. `version` goes
 * up by one per write, so a browser can tell "changed" from "same" without
 * comparing two documents, and so a stale write can be refused.
 *
 * PASSKEYS, NOT PASSWORDS
 * -----------------------
 * There is no password column anywhere. A person registers a passkey — the
 * browser and the operating system hold a private key, the server holds the
 * public one in `credentials` — and signs in by proving they still have it.
 * `challenges` holds the one-time random values each ceremony is built on,
 * with an expiry, because a challenge that can be replayed is not a challenge.
 *
 * Timestamps are integers — milliseconds since the epoch — because SQLite
 * has no date type and a string date sorts wrong the first time somebody
 * changes the format.
 */

import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch('subsec') * 1000)`;

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	/** BCP 47, for number and date formats: `en-US`, `de-DE`. */
	locale: text('locale').notNull().default('en-US'),
	createdAt: integer('created_at').notNull().default(now)
});

export const credentials = sqliteTable(
	'credentials',
	{
		/** The credential id the authenticator chose, base64url. */
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** The COSE public key, base64url. */
		publicKey: text('public_key').notNull(),
		/** The signature counter, for detecting a cloned authenticator. */
		counter: integer('counter').notNull().default(0),
		/** `["internal"]`, `["usb"]`, … as JSON: hints the browser uses to find the key. */
		transports: text('transports').notNull().default('[]'),
		deviceType: text('device_type').notNull().default('singleDevice'),
		backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
		/** What the person called it: "MacBook", "Phone". */
		label: text('label').notNull().default('Passkey'),
		createdAt: integer('created_at').notNull().default(now),
		lastUsedAt: integer('last_used_at')
	},
	(table) => [index('credentials_user').on(table.userId)]
);

export const challenges = sqliteTable('challenges', {
	id: text('id').primaryKey(),
	/** Set for registration of an additional passkey; null for a sign-in or a first registration. */
	userId: text('user_id'),
	kind: text('kind', { enum: ['register', 'login'] }).notNull(),
	challenge: text('challenge').notNull(),
	/** For a first registration: the name the person chose, carried across the ceremony. */
	name: text('name'),
	expiresAt: integer('expires_at').notNull()
});

export const sheets = sqliteTable(
	'sheets',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		/**
		 * Who may open and edit it: the owner alone, or anybody signed in who has
		 * the link. There is no per-person invitation list; a link is the
		 * invitation, which is what every collaborative sheet ends up being.
		 */
		access: text('access', { enum: ['private', 'link'] })
			.notNull()
			.default('private'),
		/** The whole sheet, as `Document` JSON. */
		doc: text('doc').notNull(),
		version: integer('version').notNull().default(0),
		cellCount: integer('cell_count').notNull().default(0),
		/** A read-only copy anyone may open at /s/<id>, frozen at `publishedAt`. */
		published: text('published'),
		publishedAt: integer('published_at'),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(table) => [index('sheets_owner').on(table.ownerId), index('sheets_updated').on(table.updatedAt)]
);

/**
 * Cell operations applied to a sheet since it was created: the log the live
 * query replays to a browser that joins late, and the record of who changed
 * what. Trimmed by `compactOps` once the document has absorbed them.
 */
export const ops = sqliteTable(
	'ops',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sheetId: text('sheet_id')
			.notNull()
			.references(() => sheets.id, { onDelete: 'cascade' }),
		/** The sheet version this op produced. */
		version: integer('version').notNull(),
		userId: text('user_id'),
		/** `CellOp[]` as JSON. */
		payload: text('payload').notNull(),
		createdAt: integer('created_at').notNull().default(now)
	},
	(table) => [index('ops_sheet_version').on(table.sheetId, table.version)]
);

export const usersRelations = relations(users, ({ many }) => ({
	credentials: many(credentials),
	sheets: many(sheets)
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
	user: one(users, { fields: [credentials.userId], references: [users.id] })
}));

export const sheetsRelations = relations(sheets, ({ one, many }) => ({
	owner: one(users, { fields: [sheets.ownerId], references: [users.id] }),
	ops: many(ops)
}));

export const opsRelations = relations(ops, ({ one }) => ({
	sheet: one(sheets, { fields: [ops.sheetId], references: [sheets.id] })
}));

export type UserRow = typeof users.$inferSelect;
export type CredentialRow = typeof credentials.$inferSelect;
export type SheetRow = typeof sheets.$inferSelect;
