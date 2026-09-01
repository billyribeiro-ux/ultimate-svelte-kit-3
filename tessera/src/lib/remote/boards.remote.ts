/**
 * BOARDS
 * ======
 *
 * Opening a board deliberately does almost nothing.
 *
 * The server returns the stored snapshot and the sequence it is current to, and
 * stops. It does not replay operations, does not build a document, does not hold
 * a CRDT in memory. The client streams everything after that sequence from
 * `/api/boards/[board]/stream` and applies it itself — which it has to be able
 * to do anyway, because that is the same path every subsequent edit takes.
 *
 * The alternative is a server that materialises the current state on every open.
 * It looks tidier and it means the server now has an opinion about the document,
 * which has to agree with the client's opinion forever. When two authorities
 * disagree about a CRDT, the one with the database usually wins, and the user's
 * unsynced work is what loses.
 */

import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { and, desc, eq } from 'drizzle-orm';
import { command, query } from '$app/server';
import { emptySnapshot, parseSnapshot, LoadedBoard } from '#lib/board/index.ts';
import { db } from '#lib/server/db/index.ts';
import { board, membership, workspace } from '#lib/server/db/schema.ts';
import { requireAccess, AccessError } from '#lib/server/rbac.ts';
import { requireUser } from '#lib/server/session.ts';

const boardId = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
const title = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));

/** Translate the permission layer's errors into HTTP without leaking which is which. */
function rethrow(thrown: unknown): never {
	if (thrown instanceof AccessError) error(thrown.status, thrown.message);
	throw thrown;
}

/**
 * Every board this person can see, most recently touched first.
 *
 * A live query: creating a board in one tab makes it appear in another, and an
 * invitation accepted elsewhere adds the whole workspace without a reload. The
 * generator wakes on a poll rather than on a database notification because
 * libSQL has no `LISTEN`, and the list is cheap; the *operation* stream is where
 * push matters, and it has its own channel.
 */
export const myBoards = query.live(async function* () {
	const user = requireUser();

	const read = async () =>
		db
			.select({
				id: board.id,
				title: board.title,
				updatedAt: board.updatedAt,
				workspaceName: workspace.name,
				role: membership.role
			})
			.from(board)
			.innerJoin(workspace, eq(workspace.id, board.workspaceId))
			.innerJoin(membership, eq(membership.workspaceId, board.workspaceId))
			.where(eq(membership.userId, user.id))
			.orderBy(desc(board.updatedAt))
			.limit(200);

	yield await read();

	/*
	 * A five-second poll, and an honest one.
	 *
	 * `query.live` streams whatever the generator yields, so this could be driven
	 * by an event just as easily. It is not, because the board list is a page
	 * people leave open in a background tab: an event bus for it would be
	 * infrastructure serving a list that changes a few times an hour.
	 */
	while (true) {
		await new Promise((resolve) => setTimeout(resolve, 5_000));
		yield await read();
	}
});

/**
 * Open a board.
 *
 * Returns a `LoadedBoard`, which is a class registered with the `transport`
 * hook — so the browser gets an object that can `hydrate()` itself into a
 * reactive document rather than a bag of fields plus a convention.
 */
export const openBoard = query(boardId, async (id) => {
	const user = requireUser();

	const access = await requireAccess(id, user.id, 'viewer').catch(rethrow);

	const rows = await db
		.select({ title: board.title, snapshot: board.snapshot, snapshotSeq: board.snapshotSeq })
		.from(board)
		.where(eq(board.id, id))
		.limit(1);

	const found = rows[0];
	if (!found) error(404, 'No such board.');

	return new LoadedBoard(
		id,
		found.title,
		found.snapshot ? parseSnapshot(JSON.parse(found.snapshot)) : emptySnapshot(),
		found.snapshotSeq,
		access.role
	);
});

export const createBoard = command(
	v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)), title }),
	async ({ workspaceId, title: name }) => {
		const user = requireUser();

		const rows = await db
			.select({ role: membership.role })
			.from(membership)
			.where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, user.id)))
			.limit(1);

		const role = rows[0]?.role;
		if (!role) error(404, 'No such workspace.');
		if (role === 'viewer' || role === 'commenter') error(403, 'You cannot create boards here.');

		const id = crypto.randomUUID();
		await db.insert(board).values({ id, workspaceId, title: name });

		/*
		 * Refresh the list for this client only, in the same round trip.
		 *
		 * Everybody else finds out from their own live query on its next tick. That
		 * asymmetry is deliberate: the person who pressed the button should never
		 * see a delay, and everybody else can wait five seconds for a board that did
		 * not exist a moment ago.
		 */
		await myBoards().reconnect();

		return { id };
	}
);

export const renameBoard = command(
	v.object({ id: boardId, title }),
	async ({ id, title: name }) => {
		const user = requireUser();
		await requireAccess(id, user.id, 'editor').catch(rethrow);

		await db.update(board).set({ title: name }).where(eq(board.id, id));
		await myBoards().reconnect();
	}
);
