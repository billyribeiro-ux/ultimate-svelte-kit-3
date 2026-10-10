/**
 * THE REQUEST HANDLER
 * ===================
 *
 * Every request goes through the same four steps:
 *
 *   1. a static file? — `client/` (with a year-long cache for the hashed
 *      `_app/immutable` files) and `prerendered/`
 *   2. otherwise, which function? — `pick` matches the path against the route
 *      patterns each function owns
 *   3. that function's `server.respond`
 *   4. if that function was the catch-all and the `reroute` hook moved the
 *      request, `applyReroute` hands it to the function that owns the new path
 *
 * Step 4 is the only part that is not in every Node adapter, and it is the part
 * this adapter exists for.
 */

import { pathToFileURL } from 'node:url';
import sirv from 'sirv';
import { createReadableStream, getRequest, setResponse } from '@sveltejs/kit/node';
import { applyReroute } from '@sveltejs/kit/adapter';
import { appDir, base, functions, origin, patterns, precompress, prerendered } from 'ENTRIES';
import { dir } from './dir.js';
import { pick } from 'PARTITION';

const startedAt = Date.now();

/** @typedef {(typeof functions)[number]} Entry */

/*
 * Three servers, each written by `builder.generateServerInstance` with a
 * different idea of which routes exist, and each in a bundle of its own under
 * `functions/` — `../index.js` says why they cannot share one. Each is the
 * whole SvelteKit runtime, `init` and `respond` and nothing else, over its own
 * copy of the app. SvelteKit 3.0 deprecated the `Server` class in favour of
 * these ready-made objects: an adapter no longer builds a server from a
 * manifest, it imports one.
 *
 * Imported *by path, at run time*, with a dynamic `import()` the bundler is
 * not allowed to touch — `functions/<name>/index.js` next to `dir.js`, which
 * knows where the build is. The first version of this file used three static
 * imports and asked rolldown to rewrite them into relative paths, and it did,
 * verbatim: `./functions/pages/index.js`. The trouble is that the module the
 * rewrite lands in is wherever the bundler put this code — `index.js` and
 * `handler.js` are both entries, so the body they share became a chunk under
 * `chunks/` — and from there `./functions/` is a folder that does not exist.
 * The server died on its first import. A path computed from `dir` is right
 * from any chunk, which is the same reason `dir.js` exists for `client/`.
 */
/** @type {Record<Entry, import('@sveltejs/kit').Server>} */
const servers = Object.fromEntries(
	await Promise.all(
		functions.map(async (fn) => {
			/** @type {{ server: import('@sveltejs/kit').Server }} */
			const { server } = await import(pathToFileURL(`${dir}/functions/${fn}/index.js`).href);
			return [fn, server];
		})
	)
);

const compiled = {
	pages: patterns.pages.map((source) => new RegExp(source)),
	api: patterns.api.map((source) => new RegExp(source))
};

/*
 * `init` runs the app's `init` hook and hands the server its environment and
 * a `read` implementation, which is what makes `read()` from `$app/server`
 * work: it streams a file out of `client/`.
 */
const ready = Promise.all(
	Object.values(servers).map((server) =>
		server.init({
			env: process.env,
			read: (file) => createReadableStream(`${dir}/client/${file}`)
		})
	)
);

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */

/**
 * @param {string} path
 * @param {boolean} client
 */
function serve(path, client) {
	return sirv(path, {
		etag: true,
		gzip: precompress,
		brotli: precompress,
		setHeaders: client
			? (res, pathname) => {
					// Hashed filenames never change, so a browser may keep them forever.
					if (pathname.startsWith(`/${appDir}/immutable/`) && res.statusCode === 200) {
						res.setHeader('cache-control', 'public,max-age=31536000,immutable');
					}
				}
			: undefined
	});
}

const serveClient = serve(`${dir}/client${base}`, true);
const servePrerendered = serve(`${dir}/prerendered${base}`, false);

/**
 * A prerendered page is a file, but a file that must answer at exactly one
 * URL. `/gallery/` and `/gallery` are different strings, and the app was built
 * with `trailingSlash: 'never'`, so the one with the slash redirects rather
 * than serving a second copy at a second address.
 *
 * @type {import('node:http').RequestListener extends (req: infer Req, res: infer Res) => any ? (req: Req, res: Res, next: () => void) => void : never}
 */
function prerenderedPage(req, res, next) {
	const url = new URL(req.url ?? '/', 'http://internal');
	let pathname = url.pathname;
	try {
		pathname = decodeURIComponent(pathname);
	} catch {
		// leave it; a bad escape falls through to SvelteKit, which answers 400
	}

	if (prerendered.has(pathname)) {
		servePrerendered(req, res, next);
		return;
	}

	const alternative = pathname.endsWith('/') ? pathname.slice(0, -1) : `${pathname}/`;
	if (prerendered.has(alternative)) {
		res.writeHead(308, { location: alternative + url.search });
		res.end();
		return;
	}

	next();
}

/* ------------------------------------------------------------------ */
/* SvelteKit                                                           */
/* ------------------------------------------------------------------ */

/**
 * The origin SvelteKit compares against for CSRF: baked in at build time from
 * `paths.origin` — which `vite.config.ts` fills from `PUBLIC_ORIGIN` — else
 * guessed from the request, which is the guess that goes wrong behind a proxy
 * and why the first option exists.
 *
 * There used to be a third option between those two: an `ORIGIN` environment
 * variable read when the process started. adapter-node 6 removed it in favour
 * of the config value, and this adapter follows, for the reason `PUBLIC_ORIGIN`
 * is declared `static` in `src/env.ts`: an origin that could differ between the
 * build and the process would make the CSRF check compare two different
 * origins, and the way to make a mismatch impossible is to have one place.
 *
 * @param {import('node:http').IncomingMessage} req
 */
function originFor(req) {
	if (origin) return origin;

	const protocol = req.headers['x-forwarded-proto'] ?? 'http';
	const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
	return `${protocol}://${host}`;
}

/**
 * @param {Entry} entry
 * @param {Request} request
 * @param {import('node:http').IncomingMessage} req
 */
function respond(entry, request, req) {
	return servers[entry].respond(request, {
		getClientAddress: () => {
			const forwarded = req.headers['x-forwarded-for'];
			if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? '';
			return req.socket.remoteAddress ?? '';
		},
		// `event.platform` in the app. `emulate()` in `../index.js` produces the
		// same shape during development, so nothing has to guard against `undefined`.
		platform: {
			adapter: 'adapter-ostinato',
			entry: entry === 'router' ? 'pages' : entry,
			startedAt
		}
	});
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function sveltekit(req, res) {
	await ready;

	/** @type {Request} */
	let request;
	try {
		// Synchronous since 3.0: the body becomes a stream, nothing is read yet,
		// so there was never anything to wait for and now there is no `await`.
		request = getRequest({ request: req, base: originFor(req), bodySizeLimit: 512 * 1024 });
	} catch {
		res.statusCode = 400;
		res.end('Bad Request');
		return;
	}

	const entry = pick(new URL(request.url).pathname, compiled);
	let response = await respond(entry, request, req);

	if (entry === 'router') {
		/*
		 * THE HAND-OFF
		 * ------------
		 * The catch-all has no routes. If its `reroute` hook produced a different
		 * path, the response carries `x-sveltekit-rerouted-url` and `applyReroute`
		 * calls `next` with that URL; otherwise it returns the response untouched
		 * — a 404 from `src/error.html`, or `/_app/env.js`, which every server can
		 * answer.
		 *
		 * The rerouted request is a *new* request to the owning function, so
		 * `event.url` there is the rerouted URL. That is the same trade every
		 * multi-function platform makes, and it is why the `reroute` hook is
		 * documented as not changing `event.url`: within one function it does not;
		 * across two, the second never saw the original.
		 */
		response = await applyReroute(response, (url) => {
			const target = pick(url.pathname, compiled);
			if (target === 'router') return new Response('Not Found', { status: 404 });
			return respond(target, new Request(url, request), req);
		});
	}

	// Which function answered, for the diagnostics page and the end-to-end suite.
	response.headers.set('x-ostinato-entry', entry);
	setResponse(res, response);
}

/* ------------------------------------------------------------------ */
/* The chain                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export function handler(req, res) {
	serveClient(req, res, () => {
		prerenderedPage(req, res, () => {
			sveltekit(req, res).catch((error) => {
				console.error(error);
				if (!res.headersSent) res.statusCode = 500;
				res.end('Internal Server Error');
			});
		});
	});
}
