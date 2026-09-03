import { dev } from '$app/env';

/**
 * FIRE AND FORGET, BUT NOT BLINDLY
 * ================================
 *
 * A presence heartbeat is not worth a toast: if one is lost, the next is
 * fifteen seconds away, and a person who is about to leave does not want
 * to be told that their goodbye failed. So these commands are sent and
 * not awaited. But `.catch(() => {})` hides *every* failure, including the
 * kind that is a bug — a heartbeat that the server's schema rejects — and
 * that is exactly what happened before the end-to-end suite noticed that
 * the seeded ids were malformed (see `scripts/seed.ts`).
 *
 * The compromise: ignored in production, where nothing can be done about
 * it, and a console warning in development, where somebody is looking.
 */
export function fireAndForget(promise: Promise<unknown>, what: string): void {
	promise.catch((error: unknown) => {
		if (dev) console.warn(`[meridian] ${what} failed and was ignored:`, error);
	});
}
