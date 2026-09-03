import type { PageLoad } from './$types.js';

/**
 * A universal load, not a server one, and there is nothing to fetch in it.
 *
 * The trace itself comes from a remote function called in the component, which
 * means it is cached and deduplicated with the drawer's call — open a trace in
 * the drawer, then reload onto this page, and the data is already there.
 *
 * All this does is lift the parameter out of `params` so the component reads
 * `data.traceId` rather than `page.params.traceId`. That is not ceremony: a
 * component that reaches into `page.params` cannot be rendered anywhere else,
 * and both of this project's trace views are rendered from two places.
 */
export const load: PageLoad = ({ params }) => ({ traceId: params.traceId });
