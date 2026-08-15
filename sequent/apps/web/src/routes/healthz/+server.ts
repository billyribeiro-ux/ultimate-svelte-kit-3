/**
 * `GET /healthz` — is this venue keeping up?
 *
 * ## Unauthenticated, and what that costs
 *
 * A load balancer cannot hold a credential, so this endpoint is open. That
 * means the numbers on it are public, and the body is chosen accordingly: lag
 * figures and a level, no firm names, no counts that reveal who is trading.
 *
 * `?verbose=1` adds the individual problems, which are still safe — "the
 * projector is 4,000 events behind" tells an outsider nothing they could use.
 *
 * ## Why the status code matters more than the body
 *
 * A load balancer reads the code and nothing else. So `down` answers **503**,
 * which takes this instance out of rotation, and `degraded` answers **200**,
 * which does not — because "the read models are a bit behind" is not a reason
 * to stop serving traffic, and an instance that removes itself for that will
 * remove every instance at once during a busy minute.
 *
 * Getting this backwards produces the worst kind of outage: one your health
 * check caused.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { health, verdict } from '@sequent/store';
import { db } from '#lib/server/db.ts';

export const GET: RequestHandler = async ({ url }) => {
	const status = await health(db);
	const result = verdict(status);

	const body = {
		status: result.level,
		summary: result.summary,
		lag: {
			engine: status.engineLag,
			projector: status.projectorLag,
			outboxAgeMs: status.outboxAgeMs
		},
		// A boolean, not the amount. The amount is the venue's business; whether
		// the books balance is the only part an outsider needs.
		booksBalance: status.trialBalance === 0,
		...(url.searchParams.get('verbose') === '1' ? { problems: result.problems } : {})
	};

	return Response.json(body, {
		status: result.level === 'down' ? 503 : 200,
		headers: {
			// Never cached. A health check served from a CDN is a health check that
			// reports the state of a minute ago, forever.
			'cache-control': 'no-store'
		}
	});
};
