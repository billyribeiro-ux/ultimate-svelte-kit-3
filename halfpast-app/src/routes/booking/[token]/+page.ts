import type { PageLoad } from './$types';

/** The token is a route parameter; a query cannot read those, so hand it over. */
export const load: PageLoad = ({ params }) => {
	return { token: params.token };
};
