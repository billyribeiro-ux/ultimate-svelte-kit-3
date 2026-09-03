import { json } from '@sveltejs/kit';
import { version } from '$app/env';
import type { RequestHandler } from './$types';
import { client } from '#lib/server/db/index.ts';

/**
 * THE HEALTH ENDPOINT
 * ===================
 *
 * The question a load balancer, a container runtime and a person with
 * `curl` all ask: is this process able to serve? "Able" means the database
 * answers — a server that is up and cannot reach its data is a server that
 * should not be receiving traffic.
 *
 * `version` is the commit the build was made from (see `vite.config.ts`), so
 * "which version is live?" is one request. `no-store`, because a cached
 * "healthy" is worse than none.
 */
const startedAt = Date.now();

export const GET: RequestHandler = async () => {
	const headers = { 'cache-control': 'no-store' };
	try {
		await client.execute('select 1');
	} catch {
		return json({ ok: false, version }, { status: 503, headers });
	}
	return json(
		{ ok: true, version, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) },
		{ headers }
	);
};
