/**
 * `GET /api/v1` — what this API is and how to talk to it.
 *
 * Unauthenticated on purpose. A developer integrating with the venue needs to
 * find out how authentication works *before* they have a key, and an API whose
 * documentation requires the credential it is documenting is a support ticket
 * generator.
 *
 * There is nothing here worth protecting: the endpoint list is in the public
 * documentation, and knowing that `/api/v1/orders` exists does not help anybody
 * who cannot authenticate to it.
 *
 * This is also where the versioning promise lives. `v1` is in the path rather
 * than in a header because a URL can be pasted into a browser, curled, and
 * bookmarked — and because a header-versioned API is one where the wrong
 * version is invisible in every log you have.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { CURRENT_VERSION, SUPPORTED_VERSIONS } from '@sequent/protocol';
import { DEFAULT_LIMIT, MAX_LIMIT, SCOPES } from '@sequent/store';

export const GET: RequestHandler = () =>
	json({
		data: {
			name: 'Sequent venue API',
			version: 'v1',
			protocol: { current: CURRENT_VERSION, supported: SUPPORTED_VERSIONS },

			authentication: {
				scheme: 'Authorization: Bearer <key-id>.<secret>',
				scopes: SCOPES,
				note: 'A key is always at most as powerful as a trader at its firm. Scopes narrow; they never promote.'
			},

			rateLimits: {
				headers: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
				note: 'A token bucket per key. Writes cost two tokens, reads one. A refused request costs nothing.'
			},

			pagination: {
				style: 'cursor',
				parameters: { cursor: 'opaque', limit: `1..${MAX_LIMIT}, default ${DEFAULT_LIMIT}` },
				note: 'Pass `pagination.nextCursor` back as `?cursor=`. A null cursor means the end.'
			},

			errors: {
				shape: { error: { code: 'string', message: 'string', requestId: 'string' } },
				codes: [
					'unauthenticated',
					'forbidden',
					'not_found',
					'invalid_request',
					'rate_limited',
					'internal'
				],
				note: 'Branch on `code`. `message` is for humans and may change without notice.'
			},

			endpoints: [
				{ method: 'GET', path: '/api/v1/instruments', scope: 'read' },
				{ method: 'GET', path: '/api/v1/instruments/{instrumentId}/book', scope: 'read' },
				{ method: 'GET', path: '/api/v1/orders', scope: 'read' },
				{ method: 'POST', path: '/api/v1/orders', scope: 'trade' },
				{ method: 'GET', path: '/api/v1/orders/{clientOrderId}', scope: 'read' },
				{ method: 'DELETE', path: '/api/v1/orders/{clientOrderId}', scope: 'trade' },
				{ method: 'GET', path: '/api/v1/trades', scope: 'read' },
				{ method: 'GET', path: '/api/v1/positions', scope: 'read' }
			],

			conventions: {
				prices:
					'Integers scaled by 10,000. £45.505 is 455050. Never a float — 0.1 + 0.2 is not 0.3 in binary, and a venue that rounds is a venue that loses money.',
				orderIdempotency:
					'`clientOrderId` is yours to choose and is unique per firm. Retrying a POST with the same one is safe: the engine rejects the duplicate.',
				accepted:
					'POST and DELETE answer 202. The venue has sequenced your command; the engine decides the outcome, which arrives on the event stream.'
			}
		}
	});
