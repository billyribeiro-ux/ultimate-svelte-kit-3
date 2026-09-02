/**
 * THE INGEST ENDPOINT
 * ===================
 *
 * A real HTTP endpoint rather than a remote function, and the reason is worth
 * stating: **the caller is not a browser running this application.** It is an
 * OpenTelemetry collector, a Fluent Bit sidecar, a shell script with curl in it.
 * A remote function's whole value is that it is imported by a component and
 * typed end to end, and none of that reaches a Go binary reading a YAML file.
 *
 * So this is a plain POST with an API key, a JSON body and honest status codes —
 * the contract a collector already knows how to speak.
 *
 * `export const config` sits at the bottom of the file: this route is
 * deliberately excluded from the CSRF check that protects everything else,
 * because a collector has no cookie to forge and no origin to send.
 */

import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import * as v from 'valibot';
import { authenticateKey, hasScope } from '#lib/server/access.ts';
import { BatchSchema, IngestError, ingest } from '#lib/server/ingest.ts';
import { publish } from '#lib/server/bus.ts';

/**
 * The most bytes one request may carry.
 *
 * Checked against `content-length` *before* the body is read, so an oversized
 * request costs one header parse rather than eight megabytes of buffering. A
 * sender without a content-length is still bounded — the read below counts as it
 * goes — but the header check is what makes the common case cheap.
 */
const MAX_BYTES = 4 * 1024 * 1024;

export const POST: RequestHandler = async ({ request }) => {
	const access = await authenticateKey(request.headers.get('authorization'));

	if (!access) {
		/*
		 * A `WWW-Authenticate` header on the 401.
		 *
		 * Not decoration: it is what tells a collector that the failure is
		 * authentication rather than a transient error, so it stops retrying and
		 * logs something a person can act on. Without it, a collector with a revoked
		 * key retries forever and the only symptom is a rate limit somewhere else.
		 *
		 * A plain `Response`, not `error(401, …)`. SvelteKit's `error` throws an
		 * `HttpError` and renders it through `handleError`, and there is no way to
		 * attach a header to that — so the version written with `error()` had this
		 * comment above a response that did not carry the header it describes. The
		 * end-to-end test that asserts the header is what found it.
		 */
		return json(
			{ message: 'Provide a valid API key in the Authorization header.' },
			{
				status: 401,
				headers: { 'www-authenticate': 'Bearer realm="sextant", charset="UTF-8"' }
			}
		);
	}

	if (!hasScope(access, 'ingest')) {
		error(403, { message: 'This key may read but not write.' });
	}

	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_BYTES) {
		error(413, { message: `Body exceeds ${MAX_BYTES} bytes.` });
	}

	let body: unknown;
	try {
		body = await readJson(request);
	} catch (thrown) {
		if (thrown instanceof IngestError) error(thrown.status, { message: thrown.message });
		error(400, { message: 'Body is not valid JSON.' });
	}

	const parsed = v.safeParse(BatchSchema, body);
	if (!parsed.success) {
		/*
		 * Every issue, with its path — not just the first.
		 *
		 * A collector sending a batch of five thousand with a systematic mistake
		 * gets one response, and telling it about one bad field means five thousand
		 * round trips to find them all. Capped, because a batch where everything is
		 * wrong should not produce a four-megabyte error.
		 */
		const issues = parsed.issues.slice(0, 20).map((issue) => ({
			path: issue.path?.map((segment) => String(segment.key)).join('.') ?? '',
			message: issue.message
		}));

		error(400, { message: `Batch rejected: ${issues[0]?.message ?? 'invalid'}`, issues });
	}

	try {
		const result = await ingest({ tenantId: access.tenantId, batch: parsed.output });

		/*
		 * Tell the tails, after the write and outside the transaction.
		 *
		 * Inside it, a slow listener would hold a write lock; before it, a tail
		 * would show a row that had not been committed and might not be. Afterwards
		 * is the only correct place, and it is also the only place where "the batch
		 * succeeded" is known.
		 */
		if (parsed.output.logs.length > 0) {
			publish(access.tenantId, { signal: 'logs', rows: parsed.output.logs as never });
		}
		if (parsed.output.spans.length > 0) {
			publish(access.tenantId, { signal: 'spans', rows: parsed.output.spans as never });
		}

		return json(result, { status: 202 });
	} catch (thrown) {
		if (thrown instanceof IngestError) {
			return json(
				{ message: thrown.message },
				{
					status: thrown.status,
					headers: thrown.retryAfter ? { 'retry-after': String(thrown.retryAfter) } : {}
				}
			);
		}
		throw thrown;
	}
};

/**
 * Read the body, counting bytes as it goes.
 *
 * `request.json()` would be one line and would buffer whatever arrives — a
 * sender that lies about its content-length, or omits it entirely, could stream
 * gigabytes into memory before anything objected. Reading the stream by hand
 * costs fifteen lines and makes the limit real rather than advisory.
 */
async function readJson(request: Request): Promise<unknown> {
	const reader = request.body?.getReader();
	if (!reader) return {};

	const chunks: Uint8Array[] = [];
	let size = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;

		size += value.byteLength;
		if (size > MAX_BYTES) {
			// Cancel rather than just throwing: without it the sender keeps writing
			// into a socket nobody is reading, and the connection stays open until a
			// timeout somewhere else closes it.
			await reader.cancel();
			throw new IngestError(413, `Body exceeds ${MAX_BYTES} bytes.`);
		}

		chunks.push(value);
	}

	return JSON.parse(new TextDecoder().decode(concat(chunks, size))) as unknown;
}

function concat(chunks: readonly Uint8Array[], size: number): Uint8Array {
	const out = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.byteLength;
	}
	return out;
}

/**
 * ROUTE CONFIGURATION
 * ===================
 *
 * SvelteKit 3 lets a route carry its own config, and this is the one place in
 * the application that needs it.
 *
 * `csrf.checkOrigin: false` because the caller is a machine. The CSRF check
 * compares the `Origin` header against the app's own, which is exactly right for
 * a browser and meaningless for a collector — a Go binary sends no `Origin` at
 * all, so with the check on, every ingest request is refused with a message
 * about cross-site requests that makes no sense to whoever is reading the
 * collector's log.
 *
 * Turning it off here is safe for the reason CSRF exists to protect against does
 * not apply: there is no ambient credential. A browser cannot be tricked into
 * making this request usefully, because the request needs an `Authorization`
 * header that no cross-site form can set.
 */
export const config = {
	csrf: { checkOrigin: false }
};
