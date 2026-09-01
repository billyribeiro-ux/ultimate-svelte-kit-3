/**
 * THE CURRENT STATE OF A BOARD, AS ONE BLOB
 * =========================================
 *
 * The editor never asks for this: it takes the stored snapshot and replays the
 * operations itself, because it has to be able to do that anyway. The embed
 * cannot — it has no CRDT — so this endpoint does the replay on its behalf.
 *
 * That makes it the one place on the server that holds an opinion about a
 * document's contents, and it is confined to a read. It writes nothing back
 * except a compacted snapshot, which is a cache of what the log already says.
 */

import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { BoardDocument, emptySnapshot, parseSnapshot } from '#lib/board/index.ts';
import { newActorId } from '#lib/crdt/index.ts';
import { db } from '#lib/server/db/index.ts';
import { board } from '#lib/server/db/schema.ts';
import { since } from '#lib/server/ingest.ts';
import { AccessError, requireAccess } from '#lib/server/rbac.ts';

/**
 * Past this many operations, the rebuilt state is written back as the board's
 * snapshot so the next reader replays far fewer.
 *
 * Compaction happens here rather than in a scheduled job because this is the
 * only place that already pays for the replay — and a board nobody reads does
 * not need compacting.
 */
const COMPACT_AFTER = 1_000;

export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	if (!locals.user) error(401, 'Sign in to continue.');

	await requireAccess(params.board, locals.user.id, 'viewer').catch((thrown: unknown) => {
		if (thrown instanceof AccessError) error(thrown.status, thrown.message);
		throw thrown;
	});

	const rows = await db
		.select({ snapshot: board.snapshot, snapshotSeq: board.snapshotSeq })
		.from(board)
		.where(eq(board.id, params.board))
		.limit(1);

	const found = rows[0];
	if (!found) error(404, 'No such board.');

	/*
	 * A throwaway actor.
	 *
	 * The document is built only to be read, and never issues a stamp — but
	 * `BoardDocument` requires an identity, and giving it a fixed one like
	 * `'server00'` would be a lie waiting to become true the first time somebody
	 * adds a write here.
	 */
	const document = BoardDocument.fromSnapshot(
		newActorId(),
		found.snapshot ? parseSnapshot(JSON.parse(found.snapshot)) : emptySnapshot()
	);

	let cursor = found.snapshotSeq;
	let replayed = 0;

	for (;;) {
		const page = await since(params.board, cursor, 1_000);
		if (page.ops.length === 0) break;

		document.applyAll(page.ops);
		cursor = page.watermark;
		replayed += page.ops.length;

		if (page.ops.length < 1_000) break;
	}

	const snapshot = document.toSnapshot();

	if (replayed >= COMPACT_AFTER) {
		await db
			.update(board)
			.set({ snapshot: JSON.stringify(snapshot), snapshotSeq: cursor })
			.where(eq(board.id, params.board));
	}

	/*
	 * `private` and a short max-age.
	 *
	 * The response depends on who is asking — a viewer with no membership gets a
	 * 404 for the same URL — so a shared cache must never hold it. Ten seconds is
	 * enough to absorb a wiki page with several embeds of the same board and short
	 * enough that a change shows up while somebody is still looking.
	 */
	setHeaders({ 'cache-control': 'private, max-age=10' });

	return json(snapshot);
};
