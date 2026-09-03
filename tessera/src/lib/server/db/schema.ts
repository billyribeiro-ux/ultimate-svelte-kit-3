/**
 * THE DATABASE
 * ============
 *
 * A board is its operations. Everything else in here is either a cache of them
 * (`board.snapshot`), a label pointing into them (`checkpoint`), or something
 * that was never part of the document in the first place (workspaces, members,
 * comments).
 *
 * That ordering is deliberate and it is what makes the server simple: ingestion
 * appends, reads replay, and there is no code anywhere that mutates a board's
 * shape in place. The most dangerous thing a collaborative backend can do is
 * hold an opinion about the document, because then two authorities have to agree
 * and eventually they will not.
 */

import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Role } from '../roles.ts';
import { user } from './auth.schema.ts';

/*
 * The extension is required.
 *
 * Vite resolves an extensionless import; the plain Node loader that runs
 * `scripts/seed.ts` does not, and the failure is `ERR_MODULE_NOT_FOUND` pointing
 * at a path with no suffix. Note that `auth.schema.ts` is *generated* by
 * `pnpm run auth:schema`, so its own internal imports are whatever the Better
 * Auth CLI writes — this line is ours and stays correct.
 */
export * from './auth.schema.ts';

/** `(cast(unixepoch('subsecond') * 1000 as integer))`, matching Better Auth's own columns. */
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

const createdAt = integer('created_at', { mode: 'timestamp_ms' }).default(now).notNull();

/* ------------------------------------------------------------------ */
/* Tenancy                                                             */
/* ------------------------------------------------------------------ */

export const workspace = sqliteTable('workspace', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	/** The URL segment. Unique, lowercase, and never reused after deletion. */
	slug: text('slug').notNull().unique(),
	createdAt
});

/*
 * The four roles live in `../roles.ts` so the browser can import the type
 * without dragging Drizzle and a native SQLite binding into the client bundle.
 *
 * Stored as text rather than an integer. A number would compare more cheaply and
 * would make every migration that inserts a role a puzzle, and every row in the
 * database unreadable without a lookup table in somebody's head.
 */
export { ROLES, type Role } from '../roles.ts';

export const membership = sqliteTable(
	'membership',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').$type<Role>().notNull(),
		createdAt
	},
	(table) => [
		// One membership per person per workspace. Without this, an invitation
		// accepted twice gives somebody two roles and the permission check answers
		// whichever the query happened to return first.
		uniqueIndex('membership_workspace_user_uidx').on(table.workspaceId, table.userId),
		index('membership_user_idx').on(table.userId)
	]
);

/* ------------------------------------------------------------------ */
/* Boards                                                              */
/* ------------------------------------------------------------------ */

export const board = sqliteTable(
	'board',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),

		/**
		 * A cache of the document at `snapshotSeq`, as JSON.
		 *
		 * Null until the first compaction. Opening a board means loading this and
		 * replaying operations with a greater `seq` — so a board with a million
		 * operations opens in the time it takes to parse one blob plus whatever has
		 * happened since the last compaction ran.
		 *
		 * Deleting this column's contents costs nothing but time: the log is
		 * authoritative, and the snapshot can always be rebuilt from it.
		 */
		snapshot: text('snapshot'),
		snapshotSeq: integer('snapshot_seq').default(0).notNull(),

		/** Bumped on every accepted batch, so the board list can sort by activity. */
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(now).notNull(),
		createdAt
	},
	(table) => [index('board_workspace_idx').on(table.workspaceId, table.updatedAt)]
);

/**
 * The log.
 *
 * `seq` is an INTEGER PRIMARY KEY, which in SQLite is the rowid: monotonic,
 * assigned inside the insert, and never reused while the row exists. It is the
 * server's total order over a board's history, and it is what a client resumes
 * from — not a timestamp, which two operations can share, and not the stamp,
 * which is only totally ordered *within* an actor as far as the server is
 * concerned.
 */
export const operation = sqliteTable(
	'operation',
	{
		seq: integer('seq').primaryKey({ autoIncrement: true }),
		boardId: text('board_id')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),

		/** The CRDT stamp. Identity, timestamp and author, in 26 characters. */
		stamp: text('stamp').notNull(),
		/** Denormalised out of the stamp so the per-actor cursor query can use an index. */
		actor: text('actor').notNull(),

		/**
		 * The signed-in person who sent it.
		 *
		 * Not the same as `actor`: one person with two tabs open is two actors, and
		 * an actor id is minted in the browser and therefore cannot be trusted for
		 * anything that matters. Attribution, rate limiting and "who deleted this?"
		 * all use this column.
		 */
		authorId: text('author_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),

		kind: text('kind').notNull(),
		/** The operation itself, as JSON. Validated on the way in; trusted on the way out. */
		payload: text('payload').notNull(),
		createdAt
	},
	(table) => [
		/*
		 * Idempotent ingestion.
		 *
		 * A client that loses its connection mid-request does not know whether the
		 * batch landed, so it sends it again. With this index that costs one
		 * conflict per operation and changes nothing; without it the board grows a
		 * duplicate of every operation sent during a flaky minute. The CRDT would
		 * survive that — applying an operation twice is a no-op — but the log would
		 * be wrong, and the log is the thing history is rebuilt from.
		 */
		uniqueIndex('operation_board_stamp_uidx').on(table.boardId, table.stamp),
		index('operation_board_seq_idx').on(table.boardId, table.seq),
		index('operation_board_actor_stamp_idx').on(table.boardId, table.actor, table.stamp)
	]
);

/**
 * A named point in a board's history.
 *
 * Just a label on a `seq`. Restoring a checkpoint does not rewind the log — it
 * replays the board as it was at that sequence and writes the difference as
 * *new* operations. History is append-only, including the history of undoing
 * things, which is the only way a restore can itself be undone.
 */
export const checkpoint = sqliteTable(
	'checkpoint',
	{
		id: text('id').primaryKey(),
		boardId: text('board_id')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		seq: integer('seq').notNull(),
		authorId: text('author_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt
	},
	(table) => [index('checkpoint_board_idx').on(table.boardId, table.seq)]
);

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

/**
 * Threads anchored to an element.
 *
 * Not part of the CRDT, on purpose. A comment is an event with an author and a
 * time, not a value two people can edit into a merged state — "we both replied
 * at once" wants both replies, which is a table with two rows, not a register.
 * Putting them in the document would also mean a viewer with no comment rights
 * could not be sent the board at all.
 */
export const comment = sqliteTable(
	'comment',
	{
		id: text('id').primaryKey(),
		boardId: text('board_id')
			.notNull()
			.references(() => board.id, { onDelete: 'cascade' }),

		/** The node or edge this is about, or null for a comment on the board itself. */
		anchor: text('anchor'),
		/** Set on replies. A thread is one root and its children; there is no deeper nesting. */
		parentId: text('parent_id'),

		authorId: text('author_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		body: text('body').notNull(),

		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
		resolvedBy: text('resolved_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt
	},
	(table) => [
		index('comment_board_idx').on(table.boardId, table.createdAt),
		index('comment_thread_idx').on(table.parentId)
	]
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const workspaceRelations = relations(workspace, ({ many }) => ({
	members: many(membership),
	boards: many(board)
}));

export const membershipRelations = relations(membership, ({ one }) => ({
	workspace: one(workspace, { fields: [membership.workspaceId], references: [workspace.id] }),
	user: one(user, { fields: [membership.userId], references: [user.id] })
}));

export const boardRelations = relations(board, ({ one, many }) => ({
	workspace: one(workspace, { fields: [board.workspaceId], references: [workspace.id] }),
	operations: many(operation),
	comments: many(comment),
	checkpoints: many(checkpoint)
}));

export const operationRelations = relations(operation, ({ one }) => ({
	board: one(board, { fields: [operation.boardId], references: [board.id] }),
	author: one(user, { fields: [operation.authorId], references: [user.id] })
}));

export const commentRelations = relations(comment, ({ one }) => ({
	board: one(board, { fields: [comment.boardId], references: [board.id] }),
	author: one(user, { fields: [comment.authorId], references: [user.id] })
}));
