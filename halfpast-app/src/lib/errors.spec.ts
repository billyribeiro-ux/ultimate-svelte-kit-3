import { error } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { messageFrom } from './errors.ts';

/**
 * The real thing `error()` throws, rather than an object shaped like it.
 *
 * In the browser a remote call rejects with SvelteKit's `HandledHttpError`, a
 * subclass of this same `HttpError`, so a test built on a hand-written
 * `{ status, body }` would keep passing if SvelteKit ever moved the message.
 */
function thrownBy(status: number, message: string): unknown {
	try {
		error(status, message);
	} catch (thrown) {
		return thrown;
	}
	throw new Error('error() returned instead of throwing');
}

describe('messageFrom', () => {
	it('reads the message an error() call put in the body', () => {
		const thrown = thrownBy(400, 'A shift has to end after it starts.');

		// The trap the helper exists for: this is not an Error at all.
		expect(thrown).not.toBeInstanceOf(Error);
		expect(messageFrom(thrown, 'Could not add that shift.')).toBe(
			'A shift has to end after it starts.'
		);
	});

	it('falls back for a dropped connection, rather than showing the browser s wording', () => {
		// What `fetch` rejects with when the request never gets an answer.
		const offline = new TypeError('Failed to fetch');
		expect(messageFrom(offline, 'Could not add that shift.')).toBe('Could not add that shift.');
	});

	it('falls back for a bug in our own code, whose message is not for customers', () => {
		const bug = new TypeError("Cannot read properties of undefined (reading 'id')");
		expect(messageFrom(bug, 'Could not cancel that.')).toBe('Could not cancel that.');
	});

	it('falls back for the App.Error a boundary receives, which has no body', () => {
		// This is why `+error.svelte` reads `error.message` and not this helper.
		const handled: App.Error = { status: 404, message: 'We could not find that booking.' };
		expect(messageFrom(handled, 'FALLBACK')).toBe('FALLBACK');
	});
});
