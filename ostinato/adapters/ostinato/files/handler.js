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
 *   3. that function's `Server.respond`
 *   4. if that function was the catch-all and the `reroute` hook moved the
 *      request, `applyReroute` hands it to the function that owns the new path
 *
 * Step 4 is the only part that is not in every Node adapter, and it is the part
 * this adapter exists for.
 */

import process from 'node:process';
import sirv from 'sirv';
import { createReadableStream, getRequest, setResponse } from '@sveltejs/kit/node';
import { applyReroute } from '@sveltejs/kit/adapter';
import { Server } from 'SERVER';
import { manifest as pagesManifest } from 'MANIFEST_PAGES';
import { manifest as apiManifest } from 'MANIFEST_API';
import { manifest as routerManifest } from 'MANIFEST_ROUTER';
import { appDir, base, origin, patterns, precompress, prerendered } from 'ENTRIES';
import { dir } from './dir.js';
import { pick } from 'PARTITION';

const startedAt = Date.now();

/*
 * Three servers from three manifests. Each is the whole SvelteKit runtime with
 * a different idea of which routes exist; the code behind the routes is shared,
 * because the bundle has one copy of it.
 */
const servers = {
	pages: new Server(pagesManifest),
	api: new Server(apiManifest),
	router: new Server(routerManifest)
};

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
 * The origin SvelteKit compares against for CSRF: baked in at build time when
 * `PUBLIC_ORIGIN` was set, else `ORIGIN` from the environment, else guessed
 * from the request — which is the guess that goes wrong behind a proxy, and
 * why the first two options exist.
 *
 * @param {import('node:http').IncomingMessage} req
 */
function originFor(req) {
	if (origin) return origin;
	if (process.env.ORIGIN) return process.env.ORIGIN;

	const protocol = req.headers['x-forwarded-proto'] ?? 'http';
	const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
	return `${protocol}://${host}`;
}

/**
 * @param {'pages' | 'api' | 'router'} entry
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
		request = await getRequest({ request: req, base: originFor(req), bodySizeLimit: 512 * 1024 });
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
