import { describe, expect, it } from 'vitest';
import { error } from '@sveltejs/kit';
import { messageOf } from './errors.ts';

/** What an awaited remote call rejects with: the `HttpError` that `error()` throws. */
function rejection(status: number, message: string, id?: string): unknown {
	try {
		if (id) error(status, message, { id });
		else error(status, message);
	} catch (e) {
		return e;
	}
}

describe('messageOf', () => {
	it("reads the server's sentence from an HttpError", () => {
		expect(messageOf(rejection(404, 'No such track in this room'), 'fallback')).toBe(
			'No such track in this room'
		);
	});

	it('keeps the reference an unexpected failure was logged under', () => {
		const failure = rejection(500, 'Something went wrong on our side.', 'f3c1');
		expect(messageOf(failure, 'fallback')).toBe('Something went wrong on our side. (ref f3c1)');
	});

	it('says what was being attempted when there is no sentence to read', () => {
		expect(messageOf(new TypeError('Failed to fetch'), 'Could not delete that')).toBe(
			'Could not delete that'
		);
	});
});
