import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	viewer: locals.viewer
		? { userId: locals.viewer.userId, firmId: locals.viewer.firmId, role: locals.viewer.role }
		: null
});
