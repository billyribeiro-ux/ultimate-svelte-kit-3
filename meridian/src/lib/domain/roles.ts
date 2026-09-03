import type { Role } from './schemas.ts';

/** What a person is to a trip: a member's role, or `link` for a stranger with the share link. */
export type ViewerRole = Role | 'link';

export function canEdit(role: ViewerRole): boolean {
	return role === 'owner' || role === 'editor';
}

export function isOwner(role: ViewerRole): boolean {
	return role === 'owner';
}
