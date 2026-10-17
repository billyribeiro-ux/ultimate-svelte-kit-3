import { error } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { failureOf, messageOf } from './errors.ts';

/** What `error()` throws, caught — the shape a refused remote call rejects with. */
function refusal(status: number, message: string): unknown {
	try {
		error(status, message);
	} catch (e) {
		return e;
	}
}

describe('messageOf', () => {
	it('reads the server’s sentence from an HttpError’s body', () => {
		expect(messageOf(refusal(401, 'Sign in with a passkey first'), 'Could not save')).toBe(
			'Sign in with a passkey first'
		);
	});

	it('says what was being attempted for anything that is not a refusal', () => {
		expect(messageOf(new TypeError('Failed to fetch'), 'Could not save')).toBe('Could not save');
		expect(messageOf(undefined, 'Could not save')).toBe('Could not save');
	});
});

describe('failureOf', () => {
	it('reads an App.Error’s message', () => {
		expect(failureOf({ message: 'No such sheet', id: 'abc' })).toBe('No such sheet');
	});

	it('says something, not nothing, for a shape it does not recognise', () => {
		expect(failureOf(null)).toBe('Something went wrong.');
		expect(failureOf({ message: 42 })).toBe('Something went wrong.');
		expect(failureOf('a string')).toBe('Something went wrong.');
	});
});
