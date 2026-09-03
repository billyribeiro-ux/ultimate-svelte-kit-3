import type { PageServerLoad } from './$types.js';
import { MINUTE, floorTo } from '#lib/series/bucket.ts';
import { requireTenant } from '#lib/server/access.ts';
import { servicesFor } from '#lib/server/storage.ts';
import { DEFAULT_RANGE } from '#lib/time/range.ts';

/**
 * WHAT THE PAGE NEEDS BEFORE IT CAN PAINT, AND WHAT IT DOES NOT
 * =============================================================
 *
 * Two returned values, and the difference between them is the whole lesson about
 * streamed loads.
 *
 * `q` and `range` are **awaited**. They come straight off the URL and the page
 * cannot render without them — there is no sensible "loading" state for the
 * contents of the query box, and rendering an empty one that fills in a moment
 * later means the editor is briefly wrong and the caret jumps.
 *
 * `services` is a **promise, returned unawaited**. SvelteKit streams it: the
 * HTML goes out immediately and the value arrives in a later chunk. It feeds
 * completion, which nobody can use until they have focused the editor and typed
 * something — by which time it has long since landed. Awaiting it would hold the
 * entire page behind a `GROUP BY` over a day of data.
 *
 * The rule this illustrates: **await what the first paint needs, stream what the
 * first interaction needs.** Streaming everything is a page of spinners;
 * awaiting everything is a page that waits for its slowest query.
 */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	const access = await requireTenant(locals.user?.id, params.tenant, 'viewer');

	return {
		q: url.searchParams.get('q') ?? 'from logs',
		range: url.searchParams.get('range') ?? DEFAULT_RANGE,
		view: url.searchParams.get('view') ?? 'table',

		/*
		 * No `await`. The `.catch` is essential rather than defensive: an unhandled
		 * rejection in a streamed promise arrives *after* the response has started,
		 * so it cannot become an error page — it becomes an unhandled rejection in
		 * the browser and a page that never finishes hydrating. Resolving to an
		 * empty list degrades completion and nothing else.
		 */
		services: servicesFor(access.tenantId, floorTo(Date.now() - 86_400_000, MINUTE)).catch(
			() => [] as string[]
		)
	};
};
