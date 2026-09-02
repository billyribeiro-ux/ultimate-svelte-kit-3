/**
 * THE PROCESS
 * ===========
 *
 * `node build/index.js`. One HTTP server, the handler, and a shutdown that
 * finishes the requests it has rather than dropping them.
 *
 * `PORT` and `HOST` come from the environment because that is where every
 * platform puts them. `ORIGIN` too, for the case where it was not baked in at
 * build time.
 */

import http from 'node:http';
import process from 'node:process';
import { handler } from './handler.js';

export const host = process.env.HOST ?? '0.0.0.0';
export const port = Number(process.env.PORT ?? 3000);

export const server = http.createServer(handler);

server.listen(port, host, () => {
	console.log(`adapter-ostinato listening on http://${host}:${port}`);
});

/*
 * On SIGTERM — which is what a platform sends before it kills a process — stop
 * accepting connections and let the in-flight ones finish. `closeIdleConnections`
 * matters: keep-alive sockets with nothing on them would otherwise hold the
 * process open until the platform's timeout, which is the slow, ugly kind of
 * shutdown that looks like a hang.
 */
function shutdown() {
	server.closeIdleConnections();
	server.close(() => process.exit(0));
	setTimeout(() => server.closeAllConnections(), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
