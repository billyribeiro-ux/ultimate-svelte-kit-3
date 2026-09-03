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
 * has everything they need to emit a perfectly well-formed `node.remove`. The
 * only place a "no" means anything is the ingestion path, which is why
 * `sync/ingest.ts` calls `mayApply` for each operation rather than once per
 * batch.
 *
 * Per-operation rather than per-batch matters too. A batch is client-supplied;
 * checking the first operation and trusting the rest lets one legal edit carry
 * five hundred illegal ones.
 */

import { and, eq } from 'drizzle-orm';
import type { Operation } from '#lib/board/index.ts';
import { db } from './db/index.ts';
import { board, membership, type Role } from './db/schema.ts';

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
	 * The first draft had one, and let commenters send `node.set` on the grounds
	 * that position is not content. It is: a diagram where somebody has
	 * rearranged the boxes is a different diagram, and "who moved this?" is
	 * exactly the question roles exist to make unnecessary.
	 *
	 * So the line is drawn at the document boundary. Editors and owners change the
	 * document; commenters and viewers do not, and comments live in their own
	 * table with their own checks. The `operation` argument stays in the signature
	 * because that boundary is the kind of thing that grows a special case — a
	 * `text.insert` on a sticky note, say — and when it does, this is where it
	 * goes rather than in four call sites.
	 */
	void operation;
	return atLeast(role, 'editor');
}

/** The reason an operation was refused, for the error the client gets back. */
export function refusalFor(role: Role): string {
	switch (role) {
		case 'viewer':
			return 'You have view-only access to this board.';
		case 'commenter':
			return 'You can comment on this board, but not edit it.';
		default:
			return 'You do not have permission to change this board.';
	}
}

export interface BoardAccess {
	readonly boardId: string;
	readonly workspaceId: string;
	readonly role: Role;
}

/**
 * Look up somebody's role on a board, or `null` if they have none.
 *
 * One query with a join, not two. Fetching the board and then the membership
 * leaks the board's existence to somebody with no access — they get "forbidden"
 * for a real id and "not found" for an invented one, which is enough to
 * enumerate boards. Here, both cases return `null` and the caller answers 404
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
}

/** Thrown by the guards below. `status` is what the route should answer with. */
export class AccessError extends Error {
	readonly status: 403 | 404;

	constructor(status: 403 | 404, message: string) {
		super(message);
		this.name = 'AccessError';
		this.status = status;
	}
}

/**
 * Require at least `minimum` on a board.
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
}
