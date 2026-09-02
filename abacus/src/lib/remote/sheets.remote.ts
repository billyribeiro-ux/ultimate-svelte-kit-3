/**
 * SHEETS, OVER THE WIRE
 * =====================
 *
 * Every read and write of a stored sheet. Creating, renaming and deleting
 * are forms — they work with JavaScript off and `remove.for(id)` gives each
 * card its own pending state. Saving a document is a command with a version
 * check. Publishing is a command that returns the public address.
 */

import * as v from 'valibot';
import { error, invalid, redirect } from '@sveltejs/kit';
import { command, form, query, requested } from '$app/server';
import { DocumentSchema } from '#lib/sheet/document.ts';
import { TEMPLATES, templateDocument } from '#lib/sheet/templates.ts';
import * as store from '#lib/server/sheets.ts';
import { currentUser, requireUser } from '#lib/server/session.ts';

const TitleSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, 'Give it a title'),
	v.maxLength(120)
);

export const getMine = query(async () => {
	const user = currentUser();
	return user ? store.listSheets(user.id) : [];
});

/** A sheet to open — owner, or link access. A 404 for everybody else. */
export const getSheet = query(v.string(), (id) => store.requireSheet(id, currentUser()));

export const create = form(
	v.object({
		title: TitleSchema,
		template: v.optional(v.picklist(Object.keys(TEMPLATES) as [string, ...string[]])),
		/** A whole document, as JSON — the local sheet being saved to an account. */
		_doc: v.optional(v.pipe(v.string(), v.maxLength(4_000_000)))
	}),
	async ({ title, template, _doc }, issue) => {
		const user = requireUser();
		let doc = template ? templateDocument(template) : undefined;
		if (_doc) {
			try {
				doc = v.parse(DocumentSchema, JSON.parse(_doc));
			} catch {
				invalid(issue._doc('That sheet could not be read'));
			}
		}
		const sheet = await store.createSheet(user, title, doc);
		void getMine().refresh();
		redirect(303, `/sheet/${sheet.id}`);
	}
);

export const rename = form(
	v.object({ id: v.string(), title: TitleSchema }),
	async ({ id, title }) => {
		await store.renameSheet(id, requireUser(), title);
		void getMine().refresh();
		void getSheet(id).refresh();
	}
);

export const setAccess = form(
	v.object({ id: v.string(), access: v.picklist(['private', 'link']) }),
	async ({ id, access }) => {
		await store.setAccess(id, requireUser(), access);
		void getSheet(id).refresh();
		void getMine().refresh();
	}
);

export const remove = form(v.object({ id: v.string() }), async ({ id }) => {
	await store.deleteSheet(id, requireUser());
	await requested(getMine, 1).refreshAll();
});

/**
 * Save the whole document. `baseVersion` is what the browser last saw; a
 * 409 means somebody saved first. The new version comes back so the next
 * save knows its base.
 */
export const save = command(
	v.object({ id: v.string(), doc: DocumentSchema, baseVersion: v.pipe(v.number(), v.integer()) }),
	async ({ id, doc, baseVersion }) => {
		const result = await store.saveDocument(id, requireUser(), doc, baseVersion);
		void getMine().refresh();
		return result;
	}
);

export const publish = command(v.string(), async (id) => {
	const published = await store.publishSheet(id, requireUser());
	void getSheet(id).refresh();
	void getMine().refresh();
	void getPublished(id).refresh();
	return { url: `/s/${published.id}` };
});

export const unpublish = command(v.string(), async (id) => {
	await store.unpublishSheet(id, requireUser());
	void getSheet(id).refresh();
	void getMine().refresh();
});

/** Anybody may read a published sheet; that is what published means. */
export const getPublished = query(v.string(), async (id) => {
	const published = await store.getPublished(id);
	if (!published) error(404, 'No such published sheet');
	return published;
});
