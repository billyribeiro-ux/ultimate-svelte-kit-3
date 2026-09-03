/**
 * THE SCHEMA
 * ==========
 *
 * Four tables, and the smallest schema of the six projects on purpose. A
 * pattern is one JSON column: it is read and written whole, never queried by
 * its insides, and a table of steps would be a hundred and twenty-eight rows
 * per pattern for no query that anybody runs.
 *
 * Timestamps are integers — milliseconds since the epoch — because SQLite has
 * no date type and a string date sorts wrong the first time somebody changes
 * the format.
 */

import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch('subsec') * 1000)`;

/**
 * An artist is a browser that has chosen a name. There is no password: the id
 * lives in a signed cookie, and losing the cookie is losing the account. That
 * is the right amount of identity for "who made this groove" and the wrong
 * amount for anything with money in it, which is why nothing here has money
 * in it.
 */
export const artists = sqliteTable('artists', {
	id: text('id').primaryKey(),
	handle: text('handle').notNull().unique(),
	createdAt: integer('created_at').notNull().default(now)
});

export const patterns = sqliteTable(
	'patterns',
	{
		id: text('id').primaryKey(),
		artistId: text('artist_id')
			.notNull()
			.references(() => artists.id, { onDelete: 'cascade' }),
		/** URL-safe, unique per artist: `/@handle/slug` is the vanity address. */
		slug: text('slug').notNull(),
		title: text('title').notNull(),
		bpm: integer('bpm').notNull(),
		/** The whole pattern, as `PatternDto` JSON. */
		data: text('data').notNull(),
		/** The pattern this was remixed from, if any. Kept when the original is deleted. */
		remixOf: text('remix_of').references((): ReturnType<typeof text> => patterns.id, {
			onDelete: 'set null'
		}),
		plays: integer('plays').notNull().default(0),
		likes: integer('likes').notNull().default(0),
		featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at').notNull().default(now),
		updatedAt: integer('updated_at').notNull().default(now)
	},
	(table) => [
		uniqueIndex('patterns_artist_slug').on(table.artistId, table.slug),
		// The gallery sorts by recency and the featured strip by likes.
		index('patterns_created').on(table.createdAt),
		index('patterns_likes').on(table.likes)
	]
);

/**
 * A jam room: one pattern several browsers edit at once. The row is the truth;
 * the live query in `rooms.remote.ts` is how everybody hears about a change.
 * `version` goes up by one per write, so a browser can tell "changed" from
 * "same as before" without comparing two kilobytes of JSON.
 */
export const rooms = sqliteTable('rooms', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	data: text('data').notNull(),
	version: integer('version').notNull().default(0),
	updatedAt: integer('updated_at').notNull().default(now)
});

/**
 * Relations, for drizzle's relational query builder. A `with: { artist }` in
 * `db.query.patterns.findMany` is only meaningful once drizzle has been told
 * how a pattern finds its artist — the foreign key above is a database fact,
 * and this is the same fact stated for the query builder.
 */
export const artistsRelations = relations(artists, ({ many }) => ({
	patterns: many(patterns)
}));

export const patternsRelations = relations(patterns, ({ one }) => ({
	artist: one(artists, { fields: [patterns.artistId], references: [artists.id] }),
	original: one(patterns, {
		fields: [patterns.remixOf],
		references: [patterns.id],
		relationName: 'remix'
	})
}));

export type ArtistRow = typeof artists.$inferSelect;
export type PatternRow = typeof patterns.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;
