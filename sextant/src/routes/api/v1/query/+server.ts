/**
 * THE READ API
 * ============
 *
 * Run an SQF query with an API key, from something that is not a browser: a
 * scheduled report, a Grafana panel, a shell script, another service's health
 * check. It is the counterpart of the ingest endpoint, and it is what the `read`
 * scope has always meant.
 *
 * WHY `QUERY` AND NOT `GET`
 * ------------------------
 * A query is a **read**: safe, idempotent, no side effects. `GET` says exactly
 * that, and cannot carry a body — so the SQF text has to go in the URL, where
 * three things go wrong at once.
 *
 *   1. **Length.** SQF is bounded at four thousand characters here. URLs are
 *      bounded at about two thousand by intermediaries that never announce it,
 *      so a long query fails somewhere in the middle of somebody's network with
 *      a 414 and no explanation.
 *   2. **Logs.** Every proxy, load balancer and CDN on the path writes the full
 *      URL to an access log. `where user_id == "…"` is then in three log files
 *      that were never meant to hold it.
 *   3. **Escaping.** A query is full of quotes, pipes, brackets and spaces.
 *      Percent-encoding all of it is a step every client gets wrong once.
 *
 * `POST` fixes all three and lies about the semantics: it tells every cache and
 * every retry policy that this request changes something, so nothing may cache
 * it and a client library will refuse to retry it on a timeout.
 *
 * `QUERY` — added to `+server` handlers in SvelteKit 3.0.0-next.24 — is the
 * method that means "a read, with a body". It is safe and idempotent like `GET`
 * and carries a body like `POST`, which is precisely the shape of this endpoint.
 *
 * `POST` IS ALSO ACCEPTED, DELIBERATELY
 * -------------------------------------
 * `QUERY` is new, and a great deal of software in the path between a script and
 * this server will refuse a method it does not recognise — old proxies, some
 * corporate egress filters, a few HTTP client libraries that validate the method
 * against a hard-coded list. Offering `POST` as an alias costs one line and is
 * the difference between an API somebody can use today and one they file a
 * ticket about. The `QUERY` handler is the one to reach for; the `POST` one is
 * the fallback, and the response says which was used so a client can tell.
 *
 * There is a third benefit, at the bottom of the file: because `QUERY` is not a
 * mutating form method, SvelteKit's cross-site check does not apply to it.
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { authenticateKey, hasScope } from '#lib/server/access.ts';
import { check } from '#lib/sqf/check.ts';
import { parse } from '#lib/sqf/parser.ts';
import { run } from '#lib/server/storage.ts';
import { DEFAULT_RANGE, resolve } from '#lib/time/range.ts';

/**
 * The body.
 *
 * `range` takes the same expressions the interface uses — `-6h`, or
 * `from..to` in epoch milliseconds — so a link copied out of the address bar
 * pastes straight into a script. Sharing the vocabulary is most of what makes an
 * API feel like the same product.
 */
const RequestSchema = v.object({
	q: v.pipe(v.string(), v.minLength(1, 'Send a query in `q`.'), v.maxLength(4_000)),
	range: v.optional(v.pipe(v.string(), v.maxLength(64)), DEFAULT_RANGE),
	/**
	 * How many rows to read.
	 *
	 * Lower than the interface's ceiling by default, because a machine asking for
	 * twenty thousand rows on a schedule is nearly always a query that wanted a
	 * `summarize` — and the honest way to find that out is a truncation flag in
	 * the first response rather than a slow endpoint nobody looks at.
	 */
	maxRows: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20_000)), 1_000)
});

/** One implementation; two methods point at it. See the note above. */
async function handle(request: Request, method: 'QUERY' | 'POST'): Promise<Response> {
	const access = await authenticateKey(request.headers.get('authorization'));

	if (!access) {
		return json(
			{ message: 'Provide a valid API key in the Authorization header.' },
			{
				status: 401,
				headers: { 'www-authenticate': 'Bearer realm="sextant", charset="UTF-8"' }
			}
		);
	}

	/*
	 * `read`, not `ingest`.
	 *
	 * The two scopes exist because they belong to different machines: a collector
	 * writes and must never be able to read another team's logs, and a reporting
	 * job is the reverse. A key that could do both would make a compromised
	 * collector a data breach rather than a nuisance.
	 */
	if (!hasScope(access, 'read')) {
		return json({ message: 'This key may write but not read.' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Body is not valid JSON.' }, { status: 400 });
	}

	const parsed = v.safeParse(RequestSchema, body);
	if (!parsed.success) {
		return json(
			{
				message: 'The request body is not valid.',
				issues: parsed.issues.map((issue) => ({
					path: issue.path?.map((segment) => String(segment.key)).join('.') ?? '',
					message: issue.message
				}))
			},
			{ status: 400 }
		);
	}

	/*
	 * The same parser and the same checker the editor uses.
	 *
	 * Not a second, laxer path for machines. A query that the interface refuses
	 * must be refused here too, or the two disagree about what the language is —
	 * and the API becomes the place people go to run the thing the product said
	 * was wrong.
	 */
	const query = parse(parsed.output.q);
	if (!query.query || query.errors.length > 0) {
		const first = query.errors[0];
		return json(
			{
				message: first?.message ?? 'Could not parse the query.',
				hint: first?.hint,
				// The span, so a client can underline it exactly as the editor does.
				span: first ? { start: first.span.start, end: first.span.end } : undefined
			},
			{ status: 400 }
		);
	}

	const checked = check(query.query);
	if (checked.errors.length > 0) {
		const first = checked.errors[0]!;
		return json(
			{
				message: first.message,
				hint: first.hint,
				span: { start: first.span.start, end: first.span.end }
			},
			{ status: 400 }
		);
	}

	const window = resolve(parsed.output.range);

	const result = await run(query.query, {
		tenantId: access.tenantId,
		from: window.from,
		to: window.to,
		maxRows: parsed.output.maxRows,
		// adapter-node aborts this when the caller disconnects, so a query whose
		// client has gone away stops before it finishes for nobody.
		signal: request.signal
	});

	return json(
		{
			columns: result.columns,
			rows: result.rows,
			/*
			 * Truncation, said in the payload rather than implied by the row count.
			 *
			 * A machine cannot look at a banner. A script that pages by asking for a
			 * thousand rows and getting a thousand has no way to tell "that is all of
			 * them" from "that is the first page" unless the response says so.
			 */
			truncated: result.truncated,
			scanned: result.scanned,
			pushed: result.pushed,
			range: { from: window.from, to: window.to, expression: window.expression },
			method
		},
		{
			headers: {
				/*
				 * A read, and cacheable in principle — but never by a shared cache.
				 *
				 * The response depends entirely on which key asked, and the key is in a
				 * header rather than the URL, so a cache keyed on the URL alone would
				 * serve one tenant's rows to another. `private` says only the client's
				 * own cache may keep it; `Vary: Authorization` says even that must key
				 * on the credential.
				 */
				'cache-control': 'private, no-store',
				vary: 'Authorization'
			}
		}
	);
}

export const QUERY: RequestHandler = ({ request }) => handle(request, 'QUERY');

/** The compatibility alias. See the note at the top of the file. */
export const POST: RequestHandler = ({ request }) => handle(request, 'POST');

/**
 * NO CSRF EXEMPTION, AND NONE NEEDED
 * ==================================
 *
 * This file, like the ingest route, used to end with a
 * `config = { csrf: { checkOrigin: false } }` that did nothing at all — see the
 * long note at the bottom of `api/v1/ingest/+server.ts` for why that key is
 * ignored and why the check never applied here anyway.
 *
 * `QUERY` makes the point twice over. SvelteKit's cross-site check covers
 * `POST`, `PUT`, `PATCH` and `DELETE`; `QUERY` is not a mutating form method, so
 * it is not in the set at all. The `POST` alias is, but only for content types a
 * cross-site form can produce — and this endpoint takes JSON.
 *
 * What keeps a browser out is the `Authorization` header: no cross-site form can
 * set one, and a cross-origin `fetch` that does needs a preflight this app
 * answers with a 405 and no `Access-Control-Allow-Origin`.
 */
