/**
 * THE NOTE
 * ========
 *
 * One rich-text document per trip, written by Tiptap in the browser and
 * stored as the JSON Tiptap produces. Saving is a `command` called from a
 * debounced effect: type, pause a second, saved. The whole document goes up
 * each time — a note is a page, not a book, and last-writer-wins on a page
 * that two people rarely edit at the same moment is the honest trade
 * against a CRDT nobody asked for. Project 4 is the one with the CRDT.
 */

import * as v from 'valibot';
import { command } from '$app/server';
import { IdSchema, NoteDocSchema } from '#lib/domain/schemas.ts';
import { bump, requireMember } from '#lib/server/access.ts';
import { db, schema } from '#lib/server/db/index.ts';

export const saveNote = command(
	v.object({ tripId: IdSchema, doc: NoteDocSchema }),
	async ({ tripId, doc }) => {
		const { user } = await requireMember(tripId, 'editor');

		await db
			.insert(schema.note)
			.values({ tripId, doc, updatedBy: user.id })
			.onConflictDoUpdate({
				target: schema.note.tripId,
				set: { doc, updatedBy: user.id, updatedAt: new Date() }
			});

		await bump(tripId);
	}
);
