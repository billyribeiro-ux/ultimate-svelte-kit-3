/**
 * THE HEALTH CHECK
 * ================
 *
 * What a load balancer, a container orchestrator or a person with `curl`
 * asks. It touches the database, because a process that is up with a
 * database that is not is a process that should not receive traffic; and it
 * returns the build version, because "which version is running" is the
 * first question in every incident.
 */

import { version } from '$app/env';
import type { RequestHandler } from './$types.js';
import { client } from '#lib/server/db/index.ts';

/*
 * `Response.json(…)` is the platform's own: the same `content-type` and the
 * same serialisation SvelteKit's `json(…)` helper wrapped, which is why
 * SvelteKit 3 deprecated the helper. One fewer import, and a handler that
 * reads the same in a Worker, in Deno, or in a test with no framework in it.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	try {
		await client.execute('select 1');
		return Response.json({ ok: true, version, uptime: Math.round(process.uptime()) });
	} catch (error) {
		return Response.json({ ok: false, version, error: (error as Error).message }, { status: 503 });
	}
};
