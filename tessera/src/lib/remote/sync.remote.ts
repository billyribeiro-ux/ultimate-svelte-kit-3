/**
 * SYNC
 * ====
 *
 * The client's two outbound calls. Everything inbound arrives on the SSE stream
 * in `routes/api/boards/[board]/stream/+server.ts`.
 *
 * Both are `command()` rather than `form()` or a hand-written endpoint, which
 * buys three things without any code: the payload is validated by the same
 * valibot schema the client imports, the CSRF origin check runs, and the call is
 * typed end to end so a change to `PushSchema` breaks the caller at build time.
 */

import { error } from '@sveltejs/kit';
import { command } from '$app/server';
import { PresenceSchema, PushSchema } from '#lib/sync/protocol.ts';
import { IngestError, ingest } from '#lib/server/ingest.ts';
import { publish } from '#lib/server/hub.ts';
import { announce } from '#lib/server/presence.ts';
import { AccessError, requireAccess } from '#lib/server/rbac.ts';
import { requireUser } from '#lib/server/session.ts';

/**
 * Push a batch of operations.
 *
 * Returns the board's watermark, which is the *only* thing the client advances
 * its cursor to. Advancing per operation is how a gap gets skipped — see the
 * note in `crdt/version.ts`, which cost an afternoon.
 */
export const pushOps = command(PushSchema, async ({ boardId, actor, ops }) => {
	const user = requireUser();

	const access = await requireAccess(boardId, user.id, 'editor').catch((thrown: unknown) => {
		if (thrown instanceof AccessError) error(thrown.status, thrown.message);
		throw thrown;
	});

	try {
		return await ingest({ boardId, userId: user.id, role: access.role, actor, ops });
	} catch (thrown) {
		/*
		 * A refusal is data, not a crash.
		 *
		 * The client has already applied these operations locally — that is what
		 * local-first means — so it needs a status it can act on: 403 means "stop
		 * and reload", 422 means "your clock is wrong and this will keep happening".
		 * A 500 would tell it to retry forever.
		 */
		if (thrown instanceof IngestError) error(thrown.status, thrown.message);
		throw thrown;
	}
});

/**
 * Say where this replica's cursor, selection and viewport are.
 *
 * Writes nothing. The roster lives in memory in `server/presence.ts`, and the
 * result is broadcast to everybody watching the board and then forgotten. A
 * dropped presence packet is not an error, it is the next one arriving.
 *
 * `viewer` is enough. Somebody with read-only access is still *present*, and
 * hiding their cursor from the people they are talking to on a call is a worse
 * outcome than showing it.
 */
export const announcePresence = command(PresenceSchema, async (update) => {
	const user = requireUser();

	await requireAccess(update.boardId, user.id, 'viewer').catch((thrown: unknown) => {
		if (thrown instanceof AccessError) error(thrown.status, thrown.message);
		throw thrown;
	});

	const peers = announce(update, { userId: user.id, name: user.name });
	publish(update.boardId, { type: 'presence', peers });
});
