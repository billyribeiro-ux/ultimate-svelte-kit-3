/**
 * A SHEET AS CSV, STREAMED
 * ========================
 *
 * The response body is a `ReadableStream` that produces one row at a time
 * from a generator. The first bytes leave the server before the last row
 * has been formatted, and a sheet with a hundred thousand rows never exists
 * as one string in memory. Cancelling the download cancels the generator.
 *
 * Who may download: the owner or a link-holder for a private sheet, and
 * anybody for a published one — in which case it is the *published* copy.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getPublished, getSheet } from '#lib/server/sheets.ts';
import { csvLines } from '#lib/sheet/render.ts';

export const GET: RequestHandler = async ({ params, locals }) => {
	const own = await getSheet(params.id, locals.user ?? null);
	const published = own ? null : await getPublished(params.id);
	const source = own ? { title: own.title, doc: own.doc } : published;
	if (!source) error(404, 'No such sheet');

	const encoder = new TextEncoder();
	const lines = csvLines(source.doc, 'en-US');

	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			const { value, done } = lines.next();
			if (done) controller.close();
			else controller.enqueue(encoder.encode(value));
		},
		cancel() {
			lines.return(undefined);
		}
	});

	const filename = `${source.title.replace(/[^\w\- ]+/g, '').trim() || 'sheet'}.csv`;
	return new Response(stream, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
};
