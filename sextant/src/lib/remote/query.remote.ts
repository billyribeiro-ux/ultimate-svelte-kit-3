/**
 * RUNNING QUERIES
 * ===============
 *
 * The seam between the browser and the storage layer. Four functions, and three
 * of them exist to show a different piece of the remote-function surface doing
 * work it is actually needed for.
 */

import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { getRequestEvent, query } from '$app/server';
import { check } from '#lib/sqf/check.ts';
import { parse } from '#lib/sqf/parser.ts';
import { TABLES, tableFor } from '#lib/sqf/schema.ts';
import { SOURCES } from '#lib/sqf/ast.ts';
import { assemble } from '#lib/trace/assemble.ts';
import { MINUTE, floorTo, stepFor } from '#lib/series/bucket.ts';
import { resolve } from '#lib/time/range.ts';
import { requireTenant } from '#lib/server/access.ts';
import { run, servicesFor, spansFor } from '#lib/server/storage.ts';

const tenantSlug = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

const RequestSchema = v.object({
	tenant: tenantSlug,
	/** The SQF text, exactly as typed. Bounded because it comes from a URL. */
	q: v.pipe(v.string(), v.maxLength(4_000)),
	/** A range expression — `-6h` or `from..to`. Resolved server-side. */
	range: v.pipe(v.string(), v.maxLength(64))
});

/**
 * Run a query and return rows.
 *
 * The parse and check happen here as well as in the editor. That is not
 * redundancy for its own sake: the editor's copy exists to draw a squiggle as
 * somebody types, and this one exists because the query text arrives in a URL
 * that anybody can edit. A checker that only runs in the browser is a
 * suggestion.
 */
export const runQuery = query(RequestSchema, async ({ tenant, q, range }) => {
	const { user } = requireUser();
	const access = await requireTenant(user.id, tenant, 'viewer');

	const parsed = parse(q);
	if (!parsed.query || parsed.errors.length > 0) {
		error(400, { message: parsed.errors[0]?.message ?? 'Could not parse the query.' });
	}

	const checked = check(parsed.query);
	if (checked.errors.length > 0) {
		error(400, { message: checked.errors[0]!.message });
	}

	const window = resolve(range);

	/*
	 * TWO ABORT SIGNALS, FOR TWO DIFFERENT LAYERS
	 *
	 * This is the *request's* signal, from `getRequestEvent()`. adapter-node
	 * aborts it when the client disconnects, so a query whose caller has gone away
	 * stops before it reaches the database rather than running to completion for
	 * nobody.
	 *
	 * The other one is `getAbortSignal()` from `svelte`, which is a **client**
	 * API: it lives inside an async `$derived` and is aborted when that derived's
	 * dependencies change. `ExplorePage.svelte` uses it to cancel the in-flight
	 * query when the time range moves under it.
	 *
	 * They are easy to confuse and they solve opposite halves of the same problem.
	 * The client one stops the browser waiting for an answer it no longer wants;
	 * this one stops the server computing it. Dragging a time range fires a query
	 * per frame, and without *both* the last position waits behind forty queries
	 * nobody wants and the answer arrives seconds after the pointer stopped.
	 */
	const result = await run(parsed.query, {
		tenantId: access.tenantId,
		from: window.from,
		to: window.to,
		signal: getRequestEvent().request.signal
	});

	return {
		columns: result.columns,
		rows: result.rows,
		truncated: result.truncated,
		scanned: result.scanned,
		pushed: result.pushed,
		range: { from: window.from, to: window.to, live: window.live }
	};
});

/**
 * A sparkline for one group, as a batched query.
 *
 * `query.batch` is the point of this function. A results table of forty rows
 * wants a small chart per row, and forty separate calls is forty round trips —
 * on a connection with 80ms of latency that is three seconds of staircase before
 * the last chart appears.
 *
 * The batcher collects every call made in one tick and hands them over as an
 * array. The resolver runs **one** query covering all of them and returns a
 * lookup function, so each caller gets its own answer from one round trip.
 *
 * The subtlety worth knowing: the resolver must return a *function*, not an
 * array. Returning an array would make the mapping positional, and positional
 * mapping breaks the moment the resolver deduplicates — which it must, because a
 * table with the same service twice would otherwise ask for it twice.
 */
export const sparkline = query.batch(
	v.object({ tenant: tenantSlug, range: v.pipe(v.string(), v.maxLength(64)), key: v.string() }),
	async (requests) => {
		const first = requests[0]!;
		const { user } = requireUser();
		const access = await requireTenant(user.id, first.tenant, 'viewer');

		const window = resolve(first.range);
		const step = stepFor(window, 24);

		/*
		 * One query for every requested key.
		 *
		 * `where service in [...]` rather than a query per key. The `in` list is
		 * bounded by the batch size, which is bounded by how many rows a table
		 * renders — and a table that renders a thousand rows has a virtualizer, so
		 * only the visible ones ever ask.
		 */
		const keys = [...new Set(requests.map((request) => request.key))];
		const list = keys.map((key) => JSON.stringify(key)).join(', ');

		const parsed = parse(
			`from logs | where service in [${list}] | summarize n = count() by service, bucket = bin(timestamp, ${step})`
		);

		const result = parsed.query
			? await run(parsed.query, {
					tenantId: access.tenantId,
					from: window.from,
					to: window.to,
					signal: getRequestEvent().request.signal
				})
			: { rows: [] };

		/* Group the flat result back into one series per key. */
		const series = new Map<string, { at: number; value: number }[]>();
		for (const row of result.rows) {
			const key = String(row.service);
			const points = series.get(key) ?? [];
			points.push({ at: Number(row.bucket), value: Number(row.n) });
			series.set(key, points);
		}

		for (const points of series.values()) points.sort((a, b) => a.at - b.at);

		// A lookup function, not an array. See the note above.
		return (request: { key: string }) => series.get(request.key) ?? [];
	}
);

/**
 * One trace, assembled.
 *
 * Returns a plain object rather than the `Trace` class: the tree is already
 * JSON-shaped, and registering a transport for it would buy nothing that
 * `structuredClone` does not already do. That is the test from the previous
 * project applied honestly — `transport` is for values that carry *behaviour*,
 * and this one does not.
 */
export const trace = query(
	v.object({ tenant: tenantSlug, traceId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)) }),
	async ({ tenant, traceId }) => {
		const { user } = requireUser();
		const access = await requireTenant(user.id, tenant, 'viewer');

		const rows = await spansFor(access.tenantId, traceId);

		return assemble(
			traceId,
			rows.map((row) => ({
				spanId: row.spanId,
				parentId: row.parentId === '' ? null : row.parentId,
				name: row.name,
				service: row.service,
				start: row.timestamp,
				duration: row.duration,
				status: row.status === 'error' ? ('error' as const) : ('ok' as const),
				attributes: safeParse(row.attributes)
			}))
		);
	}
);

/**
 * What the editor offers for completion.
 *
 * The columns come from the static schema and the services from the data, which
 * is the right split: a column list that changed with the data would make
 * completion unpredictable, and a service list that did not would be useless
 * after the first deploy.
 */
export const completions = query(
	v.object({ tenant: tenantSlug, source: v.picklist(SOURCES) }),
	async ({ tenant, source }) => {
		const { user } = requireUser();
		const access = await requireTenant(user.id, tenant, 'viewer');

		const table = tableFor(source);

		return {
			sources: TABLES.map((entry) => ({ name: entry.name, doc: entry.doc })),
			columns: table.columns.map((column) => ({
				name: column.name,
				type: column.type,
				doc: column.doc,
				common: column.common === true
			})),
			// A day, not the query's range: completion that changes as you narrow the
			// time range is completion that stops offering the thing you are looking
			// for at the moment you narrow in on it.
			services: await servicesFor(access.tenantId, floorTo(Date.now() - 86_400_000, MINUTE))
		};
	}
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * The signed-in user, or a 401.
 *
 * Every function in this file starts with it. That is deliberate repetition
 * rather than something to factor into a wrapper: a wrapper that adds the check
 * can be forgotten at the call site, and the failure mode of forgetting is an
 * unauthenticated read of somebody's logs.
 */
function requireUser() {
	const event = getRequestEvent();
	if (!event.locals.user) error(401, 'Sign in to continue.');
	return { user: event.locals.user };
}

function safeParse(text: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(text);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}
