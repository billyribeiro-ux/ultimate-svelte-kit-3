/**
 * CLIENT HOOKS
 * ============
 *
 * `handleError` here catches what goes wrong *in the browser* during a
 * navigation or a render: a `load` that threw on the client, a component
 * that threw while hydrating. The server's `handleError` never sees these.
 *
 * It logs, and it hands the error page a message and a reference. A real
 * deployment would send the reference and the stack to an error tracker
 * here; this one keeps the shape so that adding it is one line.
 */

import type { HandleClientError } from '@sveltejs/kit/hooks';

export const handleError: HandleClientError = ({ error, event }) => {
	const id = crypto.randomUUID();
	console.error(`[${id}] at ${event.url.pathname}`, error);
	return { message: 'Something went wrong in this tab.', id };
};
