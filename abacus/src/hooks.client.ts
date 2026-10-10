/**
 * CLIENT HOOKS
 * ============
 *
 * `handleError` here catches what goes wrong *in the browser* during a
 * navigation or a render: a `load` that threw on the client, a component
 * that threw while hydrating. The server's `handleError` never sees these.
 *
 * It looks at `kind`, as the server's does. An `app` error is an
 * `error(404, 'No such template')` that a universal `load` threw in this tab;
 * it already says what it means, and returning nothing keeps its status and
 * message. Only an `unknown` error — a component that threw, a bug — is
 * logged and given a reference. A real deployment would send the reference
 * and the stack to an error tracker here; this one keeps the shape so that
 * adding it is one line.
 *
 * What a remote function threw on the server is not handled here at all: it
 * arrives already through the server's hook and is not passed to this one a
 * second time.
 */

import type { HandleClientError } from '@sveltejs/kit/hooks';

export const handleError: HandleClientError = ({ error, event, kind }) => {
	if (kind !== 'unknown') return;

	const id = crypto.randomUUID();
	console.error(`[${id}] at ${event.url.pathname}`, error);
	return { message: 'Something went wrong in this tab.', id };
};
