import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { viewerFromSession } from '@sequent/store';
import { db } from '#lib/server/db.ts';

/** Attach the viewer to every request, once. */
const handleAuth: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('sequent_session');

	event.locals.viewer = sessionId
		? ((await viewerFromSession(db, sessionId, Date.now())) ?? null)
		: null;

	return resolve(event);
};

const handleHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	return response;
};

export const handle: Handle = sequence(handleAuth, handleHeaders);

/**
 * `kind` is one of 'app' | 'framework' | 'validation' | 'unknown'.
 *
 * Only 'unknown' is a surprise. Logging the others at error level trains
 * everybody to ignore the log.
 */
export const handleError: HandleServerError = ({ kind, error: thrown, event }) => {
	if (kind !== 'unknown') return {};

	const id = crypto.randomUUID().slice(0, 8);
	console.error(`[${id}] ${event.request.method} ${event.url.pathname}`, thrown);

	return { id, message: 'Something went wrong at our end.' };
};
