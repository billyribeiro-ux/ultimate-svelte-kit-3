import { describe, expect, it } from 'vitest';
import { error } from '@sveltejs/kit';
import { messageFrom, NO_ANSWER } from './errors.ts';

/**
 * A real refusal, made the way a remote function makes one.
 *
 * `error(…)` throws Kit's `HttpError`, the class every refused remote call
 * rejects with in the browser. Building a lookalike object by hand would test
 * the shape somebody believes a refusal has — and believing it was an `Error`
 * was the original bug.
 */
function refusal(status: number, message: string): unknown {
	try {
		error(status, message);
	} catch (thrown) {
		return thrown;
	}
	return undefined;
}

describe('messageFrom', () => {
	it('reads the server’s own sentence from a refusal', () => {
		expect(messageFrom(refusal(403, 'Your role does not allow that.'))).toBe(
			'Your role does not allow that.'
		);
	});

	it('says something of ours, not the browser’s, when the venue never answered', () => {
		// What `fetch` rejects with when the connection drops. "Failed to fetch"
		// is written for a developer, not for somebody trying to cancel an order.
		expect(messageFrom(new TypeError('Failed to fetch'))).toBe(NO_ANSWER);
	});
});
