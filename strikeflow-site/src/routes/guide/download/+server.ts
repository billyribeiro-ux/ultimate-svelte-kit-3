/**
 * GATED PDF DOWNLOAD
 *
 * Serves the ebook only to someone holding a valid signed token.
 *
 * WHY THE FILE IS NOT IN `static/`
 * Anything in `static/` is copied verbatim into the build and served directly by the
 * CDN. A file there is public, full stop — the URL is guessable, and the moment one
 * person shares it your email gate is decorative. So the PDF lives in a top-level
 * `private/` directory that never enters the client build, and only this handler,
 * running on the server, can read it.
 *
 * Note that we verify the token AGAIN here, even though the thank-you page already
 * did. That page and this endpoint are independently reachable — a user can bookmark
 * this URL, or hit it directly. Every entry point validates for itself. Trusting that
 * "an earlier screen already checked" is how authorisation bugs happen.
 */

import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import type { RequestHandler } from './$types';
import { verifyDownloadToken } from '#lib/server/tokens.ts';

/** Per-request work — nothing to prerender. */
export const prerender = false;

const EBOOK_PATH = resolvePath(
	process.cwd(),
	join('private', 'ebook', 'strikeflow-options-flow-guide.pdf')
);

const FILENAME = 'StrikeFlow-How-To-Read-Options-Flow.pdf';

export const GET: RequestHandler = async ({ url }) => {
	const result = verifyDownloadToken(url.searchParams.get('t'));

	if (!result.valid) {
		/*
		 * 403, not 404.
		 *
		 * The resource exists; the caller just isn't allowed it. Returning 404 to
		 * hide existence is a reasonable pattern for genuinely secret resources, but
		 * here the whole site advertises that this PDF exists, so pretending
		 * otherwise only confuses legitimate users with expired links.
		 */
		error(
			403,
			result.reason === 'expired' ? 'This download link has expired' : 'Invalid download link'
		);
	}

	let file: Buffer;
	try {
		file = await readFile(EBOOK_PATH);
	} catch {
		// A missing build artefact is our fault, not the user's — hence 500, and a
		// message that tells the operator what to run.
		error(500, 'The guide is temporarily unavailable. Please try again shortly.');
	}

	return new Response(new Uint8Array(file), {
		headers: {
			'Content-Type': 'application/pdf',
			// `attachment` makes the browser save rather than display it.
			// The quotes around the filename matter — it contains no spaces here, but
			// the day someone renames it, unquoted would break.
			'Content-Disposition': `attachment; filename="${FILENAME}"`,
			'Content-Length': String(file.byteLength),
			// `private` keeps a shared CDN from caching a response that required
			// authorisation. Without it, a CDN could serve this PDF to the next
			// person who requests the URL, token or no token.
			'Cache-Control': 'private, no-store',
			'X-Robots-Tag': 'noindex, nofollow'
		}
	});
};
