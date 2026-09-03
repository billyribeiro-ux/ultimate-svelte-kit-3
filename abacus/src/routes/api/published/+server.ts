/**
 * THE PUBLISHED SHEETS API
 * ========================
 *
 *   GET    the newest published sheets, for anything that can only make a GET
 *   QUERY  a search, with the criteria in the body
 *
 * `QUERY` is the HTTP method for "a read with a body" — a GET may not carry
 * one, and a POST says "this changes something", which a search does not.
 * SvelteKit 3.0.0-next.24 added it to the methods a `+server.ts` may export.
 */

import * as v from 'valibot';
import { desc, sql } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db, schema } from '#lib/server/db/index.ts';

/** Exported with a leading underscore — SvelteKit's escape hatch for "not a handler" — so the test beside this file can import it. */
export const _SearchSchema = v.object({
	q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80))),
	limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)), 20)
});

async function list(limit: number) {
	const rows = await db.query.sheets.findMany({
		where: sql`${schema.sheets.published} is not null`,
		orderBy: [desc(schema.sheets.publishedAt)],
		limit,
		with: { owner: { columns: { name: true } } }
	});
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		owner: row.owner.name,
		cells: row.cellCount,
		publishedAt: new Date(row.publishedAt!).toISOString(),
		url: `/s/${row.id}`
	}));
}

export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return json({ sheets: await list(20) });
};

export const QUERY: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Send a JSON body');
	}
	const parsed = v.safeParse(_SearchSchema, body);
	if (!parsed.success) error(400, parsed.issues[0]?.message ?? 'Bad request');

	const { q, limit } = parsed.output;
	const needle = q?.toLowerCase();
	const all = await list(50);
	const matched = all
		.filter(
			(s) =>
				!needle || s.title.toLowerCase().includes(needle) || s.owner.toLowerCase().includes(needle)
		)
		.slice(0, limit);
	return json({ sheets: matched, total: matched.length });
};
