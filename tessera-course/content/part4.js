/**
 * PART 4 — The server tier: a log, four roles, and a fan-out that is allowed
 * to fail (chapters 17–20)
 *
 * The server does three things and refuses to do a fourth. It stores operations,
 * decides who may write, and tells everybody else. What it never does is hold an
 * opinion about what the document looks like — because then two authorities have
 * to agree, and eventually they will not.
 */

export const part4 = [
	{
		slug: 'the-log',
		title: 'A database that stores operations',
		summary:
			'Tenancy, boards, and an append-only log whose primary key is the server’s total order — plus the unique index that makes a retry free.',
		goal: 'Model a collaborative document as rows nobody ever updates.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
/**
 * THE DATABASE
 * ============
 *
 * A board is its operations. Everything else in here is either a cache of them
 * (\`board.snapshot\`), a label pointing into them (\`checkpoint\`), or something
 * that was never part of the document in the first place (workspaces, members,
 * comments).
 *
 * That ordering is deliberate and it is what makes the server simple: ingestion
 * appends, reads replay, and there is no code anywhere that mutates a board's
 * shape in place. The most dangerous thing a collaborative backend can do is
 * hold an opinion about the document, because then two authorities have to agree
 * and eventually they will not.
 */`
			},
			{
				type: 'p',
				text: 'Read the last sentence twice, because it is the design rule for the whole tier. **The most dangerous thing a collaborative backend can do is hold an opinion about the document.** Once it does, there are two authorities — the server’s idea of the board and the clients’ — and they have to be reconciled, forever, in code nobody wants to own.'
			},

			{ type: 'h3', id: 'tenancy', text: 'Tenancy' },
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
export const workspace = sqliteTable('workspace', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	/** The URL segment. Unique, lowercase, and never reused after deletion. */
	slug: text('slug').notNull().unique(),
	createdAt
});

/*
 * The four roles live in \`../roles.ts\` so the browser can import the type
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
);`
			},
			{
				type: 'p',
				text: 'One membership per person per workspace, enforced by a unique index. Without it, an invitation accepted twice gives somebody two roles, and the permission check answers whichever the query happened to return first. That is a security bug that presents as flakiness.'
			},
			{
				type: 'note',
				text: 'Roles are stored as text, not an integer. A number compares more cheaply and makes every migration that inserts a role a puzzle, and every row in the database unreadable without a lookup table in somebody’s head. The comparison cost is nothing; the readability is worth a lot at 2am.'
			},

			{ type: 'h3', id: 'the-board', text: 'A board is a cache and a pointer' },
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
export const board = sqliteTable(
	'board',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),

		/**
		 * A cache of the document at \`snapshotSeq\`, as JSON.
		 *
		 * Null until the first compaction. Opening a board means loading this and
		 * replaying operations with a greater \`seq\` — so a board with a million
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
);`
			},
			{
				type: 'p',
				text: '`snapshot` is a *cache*, and the comment says so explicitly: deleting its contents costs nothing but time, because the log is authoritative and the snapshot can always be rebuilt. Any column you can truncate without losing data is a column you can reason about.'
			},

			{ type: 'h3', id: 'the-operation-table', text: 'The log' },
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
/**
 * The log.
 *
 * \`seq\` is an INTEGER PRIMARY KEY, which in SQLite is the rowid: monotonic,
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
		 * Not the same as \`actor\`: one person with two tabs open is two actors, and
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
);`
			},
			{
				type: 'why',
				title: 'Why `seq` and not the stamp',
				text: '`seq` is an `INTEGER PRIMARY KEY`, which in SQLite *is* the rowid: monotonic, assigned inside the insert, never reused. It is the **server’s** total order over a board’s history, and it is what a client resumes from. Not a timestamp, which two operations can share. And not the stamp — a stamp is totally ordered globally, but the server has no way to know it has *received* everything below a given stamp, which is exactly what "resume from here" needs.'
			},
			{
				type: 'warn',
				text: '`actor` and `authorId` are different columns and confusing them gives you an audit log a client can write whatever it likes into. `actor` is minted in the browser: it is fine for ordering and for the per-actor cursor query, and it cannot be trusted. `authorId` comes from the session. Attribution, rate limiting and "who deleted this?" all use the second one.'
			},
			{
				type: 'p',
				text: 'And the unique index on `(board, stamp)` is what makes a retry free. A client whose connection dropped mid-request does not know whether the batch landed, so it sends it again. With the index that costs one conflict per operation and changes nothing. Without it, the board grows a duplicate of everything sent during a flaky minute — which the CRDT survives, since applying an operation twice is a no-op, but the **log** would be wrong, and the log is what history replays from.'
			},

			{ type: 'h3', id: 'checkpoints', text: 'Checkpoints are labels, not saves' },
			{
				type: 'code',
				file: 'src/lib/server/db/schema.ts',
				lang: 'ts',
				code: `
/**
 * A named point in a board's history.
 *
 * Just a label on a \`seq\`. Restoring a checkpoint does not rewind the log — it
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
);`
			},
			{
				type: 'p',
				text: 'Restoring does not rewind the log. It replays the board as it was at that sequence and writes the difference as *new* operations. History is append-only, including the history of undoing things — which is the only way a restore can itself be undone, and the only way it can be collaborative. Chapter 39 builds it.'
			},

			{
				type: 'checkpoint',
				items: [
					'Nothing in this schema updates a board’s shape in place.',
					'You can explain why the resume cursor is `seq` and not a stamp or a timestamp.',
					'You can name the two identity columns on an operation and say what each is for.'
				]
			}
		]
	},

	{
		slug: 'permissions',
		title: 'Four roles, checked per operation',
		summary:
			'Why a single check at connection time is a suggestion rather than a permission system, and the 404 that stops a board id being an oracle.',
		goal: 'Make "no" mean something, in the one place a client cannot go around.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/server/rbac.ts',
				lang: 'ts',
				code: `
/**
 * PERMISSIONS
 * ===========
 *
 * Four roles, and one rule that matters more than the roles: **every operation
 * is checked on the server, individually.**
 *
 * It is tempting to check once — "this person is a viewer, so do not open the
 * socket" — and let the UI hide the toolbar. That is not a permission system, it
 * is a suggestion. A collaborative editor ships the entire document model to the
 * browser along with the code that mutates it; a viewer who opens the console
 * has everything they need to emit a perfectly well-formed \`node.remove\`. The
 * only place a "no" means anything is the ingestion path, which is why
 * \`sync/ingest.ts\` calls \`mayApply\` for each operation rather than once per
 * batch.
 *
 * Per-operation rather than per-batch matters too. A batch is client-supplied;
 * checking the first operation and trusting the rest lets one legal edit carry
 * five hundred illegal ones.
 */`
			},
			{
				type: 'why',
				title: 'The thing that is specifically different about a collaborative editor',
				text: 'A normal application ships the *interface* to the browser and keeps the logic on the server. A collaborative editor ships the entire document model **and the code that mutates it**, because that is what makes it work offline. So a viewer who opens the console has everything they need to construct a perfectly well-formed `node.remove` and post it. Hiding the toolbar is a courtesy to honest users. The only place a "no" means anything is the ingestion path.'
			},
			{
				type: 'p',
				text: 'And per *operation*, not per batch: a batch is client-supplied, so checking the first one and trusting the rest lets one legal edit carry five hundred illegal ones.'
			},
			{
				type: 'code',
				file: 'src/lib/server/rbac.ts',
				lang: 'ts',
				code: `
/** What a role may do, from most to least. */
const RANK: Record<Role, number> = { owner: 3, editor: 2, commenter: 1, viewer: 0 };

export function atLeast(role: Role, minimum: Role): boolean {
	return RANK[role] >= RANK[minimum];
}

/**
 * May somebody with this role apply this operation?
 *
 * Written as a total function of (role, operation) with no database access, so
 * it is testable without fixtures and callable inside a hot loop over a batch.
 */
export function mayApply(role: Role, operation: Operation): boolean {
	/*
	 * Deliberately not a table of operation kinds.
	 *
	 * The first draft had one, and let commenters send \`node.set\` on the grounds
	 * that position is not content. It is: a diagram where somebody has
	 * rearranged the boxes is a different diagram, and "who moved this?" is
	 * exactly the question roles exist to make unnecessary.
	 *
	 * So the line is drawn at the document boundary. Editors and owners change the
	 * document; commenters and viewers do not, and comments live in their own
	 * table with their own checks. The \`operation\` argument stays in the signature
	 * because that boundary is the kind of thing that grows a special case — a
	 * \`text.insert\` on a sticky note, say — and when it does, this is where it
	 * goes rather than in four call sites.
	 */
	void operation;
	return atLeast(role, 'editor');
}`
			},
			{
				type: 'p',
				text: 'The comment inside `mayApply` is a design decision that reversed. The first draft had a table of operation kinds and let commenters send `node.set`, on the grounds that position is not content. It is: a diagram where somebody has rearranged the boxes is a different diagram, and "who moved this?" is exactly the question roles exist to make unnecessary.'
			},
			{
				type: 'note',
				text: 'The `operation` argument stays in the signature even though the body currently ignores it (`void operation;` keeps the linter quiet and documents the intent). That boundary is the kind of thing that grows a special case — a `text.insert` on a sticky note, say — and when it does, this is where it goes rather than in four call sites.'
			},

			{ type: 'h3', id: 'the-oracle', text: 'The 404 that is not a lie' },
			{
				type: 'code',
				file: 'src/lib/server/rbac.ts',
				lang: 'ts',
				code: `
/**
 * Look up somebody's role on a board, or \`null\` if they have none.
 *
 * One query with a join, not two. Fetching the board and then the membership
 * leaks the board's existence to somebody with no access — they get "forbidden"
 * for a real id and "not found" for an invented one, which is enough to
 * enumerate boards. Here, both cases return \`null\` and the caller answers 404
 * for each.
 */
export async function accessTo(boardId: string, userId: string): Promise<BoardAccess | null> {
	const rows = await db
		.select({
			boardId: board.id,
			workspaceId: board.workspaceId,
			role: membership.role
		})
		.from(board)
		.innerJoin(membership, eq(membership.workspaceId, board.workspaceId))
		.where(and(eq(board.id, boardId), eq(membership.userId, userId)))
		.limit(1);

	return rows[0] ?? null;
}`
			},
			{
				type: 'p',
				text: 'One query with a join, not two. Fetching the board and *then* the membership leaks the board’s existence: you get "forbidden" for a real id and "not found" for an invented one, which is enough to enumerate every board on the server. Here both cases return `null`.'
			},
			{
				type: 'code',
				file: 'src/lib/server/rbac.ts',
				lang: 'ts',
				code: `
/**
 * Require at least \`minimum\` on a board.
 *
 * Answers 404 rather than 403 when the person has no membership at all, so that
 * a board id is not an oracle. Once they *are* a member, 403 is the honest
 * answer and tells them something they can act on.
 */
export async function requireAccess(
	boardId: string,
	userId: string,
	minimum: Role
): Promise<BoardAccess> {
	const access = await accessTo(boardId, userId);
	if (!access) throw new AccessError(404, 'No such board.');
	if (!atLeast(access.role, minimum)) throw new AccessError(403, refusalFor(access.role));
	return access;
}`
			},
			{
				type: 'p',
				text: '404 when there is no membership at all, 403 once there is. The first stops a board id being an oracle; the second is the honest answer and tells somebody something they can act on — ask for access.'
			},

			{ type: 'h3', id: 'the-seam', text: 'A file whose only job is to be importable' },
			{
				type: 'code',
				file: 'src/lib/server/roles.ts',
				lang: 'ts',
				code: `
/**
 * The role type, on its own, importable from the browser.
 *
 * \`db/schema.ts\` also exports \`Role\`, and importing it from there would drag
 * Drizzle, the libSQL client and a native binding into the client bundle — which
 * fails the build, loudly, but only after you have written the import in four
 * components.
 *
 * A file whose only job is to be safe to import from both sides is not
 * ceremony. It is the seam between the two, made explicit.
 */
export const ROLES = ['owner', 'editor', 'commenter', 'viewer'] as const;

export type Role = (typeof ROLES)[number];`
			},
			{
				type: 'p',
				text: 'Fourteen lines, and it exists because importing `Role` from `db/schema.ts` drags Drizzle, the libSQL client and a native binding into the client bundle. That fails the build loudly — but only after you have written the import in four components. A file whose only job is to be safe to import from both sides is not ceremony; it is the seam between the two, made explicit.'
			},

			{ type: 'h3', id: 'auth', text: 'Sessions' },
			{
				type: 'code',
				file: 'src/lib/server/auth.ts',
				lang: 'ts',
				code: `
/**
 * Authentication.
 *
 * Better Auth with the Drizzle adapter, email and password, and nothing else.
 * Social providers are a configuration change rather than a design change, and
 * leaving them out keeps the seed data reproducible.
 */
import { BETTER_AUTH_SECRET } from '$app/env/private';
import { PUBLIC_ORIGIN } from '$app/env/public';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.ts';

export const auth = betterAuth({
	/*
	 * The same origin the CSRF check uses, from the same variable.
	 *
	 * Two sources of truth for "where is this app" is a bug waiting for a
	 * deployment: the cookie is issued for one origin and rejected by the check
	 * for another, and the symptom is a sign-in that appears to succeed and then
	 * lands back on the sign-in page with no error anywhere.
	 */
	baseURL: PUBLIC_ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),

	emailAndPassword: {
		enabled: true,
		// Eight is the usual default and is too short to be worth the reassurance
		// it gives. Twelve costs nothing to type and a great deal to guess.
		minPasswordLength: 12
	},

	session: {
		expiresIn: 60 * 60 * 24 * 30,
		// Slide the expiry when a session is used, so somebody who works on a board
		// every day is never signed out mid-drag.
		updateAge: 60 * 60 * 24
	},

	plugins: [
		/*
		 * MUST be last. The plugin wraps the response so that cookies set during a
		 * remote function call reach the browser; a plugin after it would see the
		 * response before that wrapping and its own cookies would be dropped.
		 */
		sveltekitCookies(getRequestEvent)
	]
});`
			},
			{
				type: 'warn',
				text: 'Two things in there will cost you an hour each if you get them wrong. `baseURL` must come from the same variable the CSRF check uses, or the cookie is issued for one origin and rejected by the check for another — and the symptom is a sign-in that appears to succeed and lands back on the sign-in page with no error anywhere. And `sveltekitCookies` must be **last** in the plugin list, because it wraps the response so cookies set during a remote function call reach the browser.'
			},

			{
				type: 'checkpoint',
				items: [
					'Every operation is checked individually, on the server.',
					'A board id you have no access to is indistinguishable from one that does not exist.',
					'You can explain why the role type lives in its own fourteen-line file.'
				]
			}
		]
	},

	{
		slug: 'ingestion',
		title: 'The only way in',
		summary:
			'Four gates in order, one transaction, and the broadcast slice that assumed duplicates arrive as a prefix.',
		goal: 'Accept a batch of operations idempotently, refuse the ones that should not be there, and tell everybody about the rest.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/server/ingest.ts',
				lang: 'ts',
				code: `
/**
 * INGESTION
 * =========
 *
 * The only way an operation enters a board. Everything a client sends arrives
 * here, and everything that leaves here is trustworthy — which is the property
 * the rest of the server relies on when it stops re-validating.
 *
 * Four gates, in this order:
 *
 *   1. shape      — \`parseBatch\`, which has already run by the time we are called
 *   2. permission — per operation, not per batch
 *   3. clock      — a stamp too far in the future is refused here, at the one
 *                   boundary where refusing it still keeps it out of the log
 *   4. identity   — the \`actor\` is recorded as claimed, the \`authorId\` is not
 *
 * Gate 4 is the one worth staring at. \`actor\` is minted in the browser and can
 * be anything; it is fine to store, because it is only used for ordering and for
 * ignoring one's own echo. \`authorId\` comes from the session and is what
 * attribution, rate limiting and "who deleted this" use. Confusing the two gives
 * you an audit log a client can write whatever it likes into.
 */`
			},
			{
				type: 'p',
				text: 'Everything a client sends arrives here, and everything that leaves here is trustworthy. That is the property the rest of the server relies on when it stops re-validating — a boundary worth naming out loud, because a codebase where *some* things are validated is a codebase where nobody knows which.'
			},
			{
				type: 'code',
				file: 'src/lib/server/ingest.ts',
				lang: 'ts',
				code: `
export async function ingest({
	boardId,
	userId,
	role,
	actor,
	ops,
	now = Date.now()
}: IngestInput): Promise<PushResult> {
	for (const candidate of ops) {
		if (!mayApply(role, candidate)) throw new IngestError(403, refusalFor(role));

		/*
		 * The clock guard, in the one place it does any good.
		 *
		 * A stamp two years in the future drags every replica's clock with it,
		 * permanently, and no correct local time pulls an HLC back. Rejecting it in
		 * the browser was the first design and protected nothing — by then the
		 * operation is already in the log. Here it never gets in.
		 */
		if (!isPlausible(candidate.stamp, now)) {
			throw new IngestError(
				422,
				'Your device clock is too far ahead of the server. Check the time and try again.'
			);
		}

		/*
		 * The stamp says who made it, and it must agree with who says they made it.
		 *
		 * Not a security boundary — \`actor\` is self-declared either way — but a
		 * consistency one: an operation filed under one actor whose stamp says
		 * another breaks the per-actor cursor query, and the client that "sent" it
		 * would never be told to skip its own echo.
		 */
		if (actorOf(candidate.stamp) !== actor) {
			throw new IngestError(422, 'Operation stamp does not match the sending replica.');
		}
	}`
			},
			{
				type: 'p',
				text: 'This is where the drift guard from chapter 06 finally lives, and the comment says exactly why it is here and not in the browser: **here it never gets in.** A stamp two years in the future drags every replica’s clock with it, permanently, and no amount of correct local time pulls an HLC back.'
			},
			{
				type: 'p',
				text: 'The third check — does the stamp’s actor match the sending replica? — is explicitly *not* a security boundary, and the comment says so. `actor` is self-declared either way. It is a **consistency** check: an operation filed under one actor whose stamp says another breaks the per-actor cursor query.'
			},

			{ type: 'h3', id: 'the-write', text: 'The write' },
			{
				type: 'code',
				file: 'src/lib/server/ingest.ts',
				lang: 'ts',
				code: `
const rows = ops.map((candidate) => ({
	boardId,
	stamp: candidate.stamp,
	actor,
	authorId: userId,
	kind: candidate.kind,
	payload: JSON.stringify(candidate)
}));

const inserted = await db.transaction(async (tx) => {
	/*
	 * \`onConflictDoNothing\` against the (board, stamp) unique index makes the
	 * whole request idempotent. A client whose connection dropped mid-flight
	 * does not know whether the batch landed, so it sends it again; without
	 * this, the log grows a duplicate of everything sent during a flaky minute.
	 *
	 * The CRDT would survive that — applying an operation twice is a no-op — but
	 * the *log* would be wrong, and the log is what history replays from.
	 */
	const written = await tx
		.insert(operation)
		.values(rows)
		.onConflictDoNothing()
		// The stamp comes back as well as the sequence, because the broadcast below
		// needs to know *which* operations were new, not just how many.
		.returning({ seq: operation.seq, stamp: operation.stamp });

	if (written.length > 0) {
		await tx
			.update(board)
			.set({ updatedAt: new Date(now) })
			.where(eq(board.id, boardId));
	}

	return written;
});`
			},
			{
				type: 'p',
				text: '`onConflictDoNothing` against the unique index makes the whole request idempotent, and `.returning({ seq, stamp })` brings back **which** operations were new rather than just how many. That second field is there because of the next bug.'
			},

			{ type: 'h3', id: 'the-slice-bug', text: 'The broadcast that dropped operations' },
			{
				type: 'code',
				file: 'src/lib/server/ingest.ts',
				lang: 'ts',
				code: `
const watermark = await watermarkOf(boardId);

/*
 * Broadcast only what was actually new, selected by stamp.
 *
 * The first version took \`ops.slice(ops.length - inserted.length)\`, on the
 * assumption that any duplicates in a re-sent batch would be a prefix. Nothing
 * guarantees that — a client can legitimately resend a batch whose middle was
 * already accepted — and when it is wrong the broadcast silently drops a
 * genuinely new operation while echoing one everybody already had. The
 * receiving replicas then differ from the log until their next reconnect.
 *
 * Echoing a re-sent operation would be harmless, since every replica is
 * idempotent; dropping a new one is not. Filtering on the returned stamps
 * costs a \`Set\` and cannot be wrong.
 */
if (inserted.length > 0) {
	const accepted = new Set(inserted.map((row) => row.stamp));
	const fresh = ops.filter((candidate) => accepted.has(candidate.stamp));
	publish(boardId, { type: 'ops', ops: fresh, watermark });
}

return { accepted: ops.length, watermark };`
			},
			{
				type: 'warn',
				text: 'The first version was `ops.slice(ops.length - inserted.length)` — take the last N, on the assumption that duplicates in a re-sent batch are a prefix. Nothing guarantees that. A client can legitimately resend a batch whose *middle* was already accepted, and when that happens the broadcast silently drops a genuinely new operation while echoing one everybody already had. The receiving replicas then differ from the log until their next reconnect, which may be an hour.'
			},
			{
				type: 'why',
				title: 'The asymmetry that makes the fix obvious',
				text: 'Echoing an operation somebody already has is **harmless** — every replica is idempotent, that is the entire point of part 2. Dropping a new one is not. So when the two error directions have wildly different costs, pick the algorithm that can only ever fail in the cheap direction. Filtering on the returned stamps costs a `Set` and cannot be wrong.'
			},

			{ type: 'h3', id: 'reading', text: 'Reading it back' },
			{
				type: 'code',
				file: 'src/lib/server/ingest.ts',
				lang: 'ts',
				code: `
/** The board's current sequence: the greatest \`seq\` any of its operations has. */
export async function watermarkOf(boardId: string): Promise<number> {
	const rows = await db
		.select({ seq: operation.seq })
		.from(operation)
		.where(eq(operation.boardId, boardId))
		.orderBy(desc(operation.seq))
		.limit(1);

	return rows[0]?.seq ?? 0;
}

/**
 * Read a page of a board's history after \`since\`.
 *
 * Ordered by \`seq\`, which is the server's total order and the only order a
 * client should replay in. Ordering by stamp instead would interleave two
 * replicas' work by wall clock and hand a client an operation before the one it
 * depends on — which the CRDT survives and the reader would not enjoy watching.
 */
export async function since(
	boardId: string,
	seq: number,
	limit: number
): Promise<{
	ops: Operation[];
	watermark: number;
}> {
	const rows = await db
		.select({ seq: operation.seq, payload: operation.payload })
		.from(operation)
		.where(and(eq(operation.boardId, boardId), gt(operation.seq, seq)))
		.orderBy(operation.seq)
		.limit(limit);

	return {
		/*
		 * Re-parsed, not cast.
		 *
		 * These rows were validated on the way in, so this is belt and braces — but
		 * they are also the oldest data in the system, written by a version of this
		 * code that may no longer exist. A board from six months ago whose format
		 * has since changed should fail here, loudly, rather than reach the CRDT and
		 * converge on something nonsensical.
		 */
		ops: rows.map((row) => parseOperation(JSON.parse(row.payload))),
		watermark: rows.at(-1)?.seq ?? seq
	};
}`
			},
			{
				type: 'p',
				text: 'Ordered by `seq`, which is the server’s total order and the only order a client should replay in. Ordering by stamp would interleave two replicas’ work by wall clock and hand a client an operation before the one it depends on — which the CRDT survives and the reader would not enjoy watching.'
			},
			{
				type: 'note',
				text: 'Note that rows are **re-parsed, not cast**, on the way out. They were validated on the way in, so this is belt and braces — but they are also the oldest data in the system, written by a version of this code that may no longer exist. A board from six months ago whose format has since changed should fail here, loudly, rather than reach the CRDT and converge on something nonsensical.'
			},

			{
				type: 'checkpoint',
				items: [
					'Sending the same batch twice changes nothing and returns the same answer.',
					'You can name the four gates and say why each one is at this tier.',
					'You can explain the asymmetry argument for the broadcast filter.'
				]
			}
		]
	},

	{
		slug: 'fan-out',
		title: 'Telling everybody else',
		summary:
			'An in-memory hub that is explicitly not a delivery guarantee, and a server-sent event stream that subscribes before it reads.',
		goal: 'Push operations to other tabs in milliseconds, while remaining correct if every push is lost.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/server/hub.ts',
				lang: 'ts',
				code: `
/**
 * THE FAN-OUT HUB
 * ===============
 *
 * When a batch of operations is accepted, everybody else looking at that board
 * needs to hear about it. This is the in-memory registry of who is listening.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not durable, and it is not the delivery guarantee. A client that misses
 * a broadcast — its connection dropped, it was mid-reconnect, the process
 * restarted — recovers by asking for everything after its cursor, which is a
 * plain indexed read from the operation log. The hub only makes that recovery
 * rare enough that it is not the normal path.
 *
 * Building it the other way round is the classic mistake: a "reliable" pub/sub
 * with acknowledgements and retries, sitting in front of a database that already
 * has the data and can already answer "what did I miss". The queue then becomes
 * a second source of truth that can disagree with the first.
 *
 * ONE PROCESS
 * -----------
 * This is a \`Map\` in one Node process, which is exactly right for adapter-node
 * behind a single instance and exactly wrong for two. Running a second instance
 * means a client connected to A never hears about a write that landed on B —
 * until it reconnects and catches up, which it will, but seconds later rather
 * than milliseconds.
 *
 * The fix is to replace \`publish\` with something that goes through Redis, NATS
 * or Postgres \`LISTEN/NOTIFY\`, and nothing else changes: the interface below is
 * the seam. That is why it is an interface at all rather than a set inlined into
 * the SSE route.
 */`
			},
			{
				type: 'why',
				title: 'The classic mistake this avoids',
				text: 'Building a "reliable" pub/sub with acknowledgements and retries, sitting in front of a database that **already has the data** and can already answer "what did I miss". The queue then becomes a second source of truth that can disagree with the first, and now you are debugging two systems. Here the hub is explicitly a latency optimisation: it makes recovery rare, and recovery is a plain indexed read.'
			},
			{
				type: 'p',
				text: 'The honesty about scaling is worth copying too. A `Map` in one Node process is exactly right behind a single instance and exactly wrong behind two — a client connected to A never hears a write that landed on B, until it reconnects. The fix is to replace `publish` with Redis, NATS or Postgres `LISTEN/NOTIFY`, and nothing else changes. **That is why it is a module with an interface rather than a `Set` inlined into the route.**'
			},
			{
				type: 'code',
				file: 'src/lib/server/hub.ts',
				lang: 'ts',
				code: `
/**
 * Attach a listener. Returns the function that detaches it.
 *
 * Returning the unsubscribe rather than exposing \`unsubscribe(board, listener)\`
 * removes the possibility of detaching the wrong one, which in a fan-out is a
 * leak that only shows up as memory growth under load.
 */
export function subscribe(boardId: string, listener: Listener): () => void {
	const listeners = boards.get(boardId) ?? new Set<Listener>();
	listeners.add(listener);
	boards.set(boardId, listeners);

	return () => {
		listeners.delete(listener);
		// Drop the entry entirely when the last person leaves, so a server that has
		// been up for a month is not holding an empty Set for every board ever opened.
		if (listeners.size === 0) boards.delete(boardId);
	};
}

/**
 * Send an event to everybody watching a board.
 *
 * Each listener is called inside its own try/catch. One dead connection throwing
 * on write must not stop the others being told — and a listener that throws is
 * not hypothetical, it is what a closed stream does on the next enqueue.
 */
export function publish(boardId: string, event: ServerEvent): void {
	const listeners = boards.get(boardId);
	if (!listeners) return;

	for (const listener of listeners) {
		try {
			listener(event);
		} catch {
			// The listener's own cleanup will remove it; there is nothing useful to do
			// here, and logging every write to a closing stream is noise.
		}
	}
}

/** How many connections a board has. Used by the presence roster and by tests. */
export function watcherCount(boardId: string): number {
	return boards.get(boardId)?.size ?? 0;
}`
			},
			{
				type: 'p',
				text: 'Two details. `subscribe` returns the *unsubscribe* rather than exposing `unsubscribe(board, listener)`, which removes the possibility of detaching the wrong one — in a fan-out that is a leak that only appears as memory growth under load. And `publish` wraps each listener in its own try/catch, because a listener that throws is not hypothetical: it is what a closed stream does on the next enqueue.'
			},

			{ type: 'h3', id: 'sse', text: 'Server-sent events, and why not a WebSocket' },
			{
				type: 'code',
				file: 'src/routes/api/boards/[board]/stream/+server.ts',
				lang: 'ts',
				code: `
/**
 * THE OPERATION STREAM
 * ====================
 *
 * Server-sent events, one connection per open board, carrying both the
 * operations somebody else made and the presence roster.
 *
 * WHY NOT A WEBSOCKET
 * -------------------
 * Because nothing here needs one. The traffic is almost entirely
 * server-to-client; the client's two outbound messages are ordinary
 * \`command()\` calls that benefit from validation, CSRF protection and typing.
 * SSE is a \`GET\` that never ends, so it works through every proxy that
 * understands HTTP, reconnects on its own, and — the part that matters most —
 * resumes from a cursor, because the client tells us where it got to.
 *
 * A WebSocket would need its own authentication, its own reconnect logic, its
 * own framing, and adapter-specific support for the upgrade. It would earn all
 * of that if the client were also sending sixty messages a second. It is not.
 *
 * WHY NOT \`query.live\`
 * --------------------
 * \`query.live\` streams *query results*, and re-running a query is the wrong
 * shape for "here are the fourteen operations you missed". \`myBoards\` uses it,
 * because a board list genuinely is a query result. This is a log tail, and a
 * log tail wants a cursor.
 */`
			},
			{
				type: 'p',
				text: 'The traffic here is almost entirely server-to-client. The client’s two outbound messages are ordinary `command()` calls that benefit from validation, CSRF protection and typing. SSE is a `GET` that never ends, so it works through every proxy that understands HTTP, reconnects on its own, and — the part that matters most — **resumes from a cursor**, because the client tells us where it got to.'
			},
			{
				type: 'note',
				text: 'The other question worth answering out loud: why not `query.live`? Because `query.live` streams *query results*, and re-running a query is the wrong shape for "here are the fourteen operations you missed". The board *list* uses `query.live`, because a list genuinely is a query result. This is a log tail, and a log tail wants a cursor.'
			},
			{
				type: 'code',
				file: 'src/routes/api/boards/[board]/stream/+server.ts',
				lang: 'ts',
				code: `
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) error(401, 'Sign in to continue.');

	const boardId = params.board;
	await requireAccess(boardId, locals.user.id, 'viewer').catch((thrown: unknown) => {
		if (thrown instanceof AccessError) error(thrown.status, thrown.message);
		throw thrown;
	});

	/*
	 * Where to start.
	 *
	 * \`Number(...) || 0\` rather than \`parseInt\`: a missing parameter, an empty
	 * one and \`"abc"\` all become 0, which replays the board from the beginning.
	 * That is the safe direction to be wrong in — a client that sends nonsense
	 * gets a slow, correct answer instead of a fast, incomplete one.
	 */
	const cursor = Math.max(0, Math.floor(Number(url.searchParams.get('since')) || 0));
	const actor = url.searchParams.get('actor') ?? '';

	let unsubscribe: (() => void) | null = null;
	let ping: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			const send = (event: ServerEvent) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(frame(event)));
				} catch {
					// The client went away between the check and the write. Nothing to do;
					// \`cancel\` will run and clean up.
					closed = true;
				}
			};`
			},
			{
				type: 'p',
				text: '`Number(...) || 0` rather than `parseInt`: a missing parameter, an empty one and `"abc"` all become 0, which replays from the beginning. That is the safe direction to be wrong in — a client that sends nonsense gets a slow, correct answer instead of a fast, incomplete one.'
			},

			{ type: 'h3', id: 'the-hole', text: 'Subscribe before you read' },
			{
				type: 'code',
				file: 'src/routes/api/boards/[board]/stream/+server.ts',
				lang: 'ts',
				code: `
	/*
	 * Subscribe BEFORE the catch-up read.
	 *
	 * The other order has a hole exactly one query wide: an operation
	 * committed after the read and before the subscription reaches nobody,
	 * and the client never learns about it until its next reconnect. Doing it
	 * this way can deliver an operation twice instead, which every replica
	 * here is built to shrug off.
	 */
	unsubscribe = subscribe(boardId, send);

	send({ type: 'hello', watermark: await watermarkOf(boardId) });

	/*
	 * Catch up in pages.
	 *
	 * A client returning after a week may be tens of thousands of operations
	 * behind. One array means the server builds the whole string in memory and
	 * the browser parses it in a single blocking task — a spinner, then a
	 * frozen tab. Each page carries its own watermark, so an interrupted
	 * catch-up resumes rather than restarting.
	 */
	let seq = cursor;
	for (;;) {
		const page = await since(boardId, seq, CATCHUP_PAGE);
		if (page.ops.length === 0) break;

		send({ type: 'ops', ops: page.ops, watermark: page.watermark });
		seq = page.watermark;

		if (page.ops.length < CATCHUP_PAGE) break;
	}

	send({ type: 'presence', peers: roster(boardId) });

	/*
	 * Keep-alive.
	 *
	 * Proxies close an idle connection after thirty to sixty seconds, and to
	 * the browser that looks like a failure worth retrying — so a board nobody
	 * is touching reconnects every minute forever, replaying a catch-up query
	 * each time. A comment frame every twenty seconds ends the cycle for two
	 * bytes.
	 */
	ping = setInterval(() => send({ type: 'ping' }), STREAM_PING_MS);
},`
			},
			{
				type: 'warn',
				text: 'The order of those two lines is a correctness property, not a preference. Read first and then subscribe, and there is a hole exactly one query wide: an operation committed after the read and before the subscription reaches nobody, and the client never learns about it until its next reconnect. Doing it this way can deliver an operation **twice** instead — which every replica in this system is built to shrug off. Again: pick the failure direction that is already handled.'
			},
			{
				type: 'p',
				text: 'The catch-up is paged for the same reason the sync client batches: a client returning after a week may be tens of thousands of operations behind, and one array means the server builds the whole string in memory while the browser parses it in a single blocking task. A spinner, then a frozen tab.'
			},
			{
				type: 'code',
				file: 'src/routes/api/boards/[board]/stream/+server.ts',
				lang: 'ts',
				code: `
		cancel() {
			/*
			 * The tab closed, or the network dropped.
			 *
			 * Both the subscription and the presence entry go now rather than waiting
			 * for the timeout, so the remaining collaborators see the avatar disappear
			 * immediately instead of fifteen seconds later. The timeout still exists
			 * for the case this does not fire — a laptop that goes to sleep holds the
			 * connection nominally open for minutes.
			 */
			unsubscribe?.();
			if (ping) clearInterval(ping);
			if (actor) {
				depart(boardId, actor);
				publish(boardId, { type: 'presence', peers: roster(boardId) });
			}
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			// Without this, a reverse proxy will happily buffer the whole stream and
			// deliver it when the connection closes — which for an endless stream is
			// never. The symptom is a board that works locally and is dead behind nginx.
			'cache-control': 'no-store, no-transform',
			'x-accel-buffering': 'no',
			connection: 'keep-alive'
		}
	});
};`
			},
			{
				type: 'p',
				text: 'And two operational details that are pure scar tissue. The keep-alive exists because proxies close an idle connection after thirty to sixty seconds, which the browser reads as a failure worth retrying — so a board nobody is touching reconnects every minute forever, replaying a catch-up query each time. And `x-accel-buffering: no` exists because a reverse proxy will otherwise buffer the whole stream and deliver it when the connection closes, which for an endless stream is never. The symptom is a board that works locally and is dead behind nginx.'
			},

			{ type: 'h3', id: 'presence', text: 'Presence is soft state' },
			{
				type: 'code',
				file: 'src/lib/server/presence.ts',
				lang: 'ts',
				code: `
/**
 * WHO IS LOOKING AT THIS BOARD
 * ============================
 *
 * Deliberately not in the database.
 *
 * A cursor position is true for about thirty milliseconds. Writing it down means
 * sixty inserts a second per person, each one obsolete before the transaction
 * commits, plus a delete for every one of them — to store something whose
 * correct behaviour on a crash is to disappear. Presence *is* soft state, and
 * the honest representation of soft state is memory.
 *
 * The consequences are all good ones. A server restart drops the roster and
 * every client re-announces within a heartbeat. A process that runs out of
 * memory is holding one small object per open tab. And there is no cleanup job,
 * because expiry is a comparison rather than a delete.
 */

import { PRESENCE_TIMEOUT_MS, type Peer, type PresenceUpdate } from '#lib/sync/protocol.ts';

/** board id → actor → peer */
const boards = new Map<string, Map<string, Peer>>();

/**
 * A stable colour per person, derived rather than assigned.
 *
 * Assigning from a pool means the same colleague is amber today and cyan
 * tomorrow, and two people can swap between reloads — which makes "the green
 * cursor" useless as a way of referring to somebody mid-conversation. Hashing
 * the user id gives everybody one colour forever, at the cost of the occasional
 * collision, which is a much smaller problem than instability.
 */
export function hueFor(userId: string): number {
	let hash = 2166136261;
	for (let i = 0; i < userId.length; i += 1) {
		hash ^= userId.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 360;
}`
			},
			{
				type: 'p',
				text: 'A cursor position is true for about thirty milliseconds. Writing it down means sixty inserts a second per person, each obsolete before the transaction commits, to store something whose correct behaviour on a crash is *to disappear*. Presence is soft state, and the honest representation of soft state is memory.'
			},
			{
				type: 'p',
				text: 'The colour is derived from the user id rather than assigned from a pool, and that is a genuinely good small idea. Assigning means the same colleague is amber today and cyan tomorrow, and two people can swap between reloads — which makes "the green cursor" useless as a way of referring to somebody mid-conversation. Hashing gives everybody one colour forever at the cost of occasional collisions, which is a much smaller problem than instability.'
			},

			{
				type: 'checkpoint',
				items: [
					'Losing every broadcast leaves the system correct, only slower.',
					'You can explain the one-query-wide hole and which way you chose to be wrong.',
					'You can say why presence is not in the database.'
				]
			}
		]
	}
];
