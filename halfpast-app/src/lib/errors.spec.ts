import { error } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { messageFrom } from './errors.ts';

/**
 * The real thing `error()` throws, rather than an object shaped like it.
 *
 * In the browser a remote call rejects with SvelteKit's `HandledHttpError`, a
 * subclass of this same `HttpError`, and `messageFrom` asks `isHttpError`,
 * which is an `instanceof`. A hand-written `{ status, body }` is not an
 * instance of anything, so it would test a shape the browser never produces.
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

	it('falls back when the HttpError has no words in it', () => {
		// What a proxy's 413 over HTTP/2 becomes: an HttpError whose message is
		// the status text, and HTTP/2 has no status text.
		const silent = thrownBy(413, '');
		expect(messageFrom(silent, 'Could not cancel that.')).toBe('Could not cancel that.');
	});

	it('falls back for a proxy s error page, whose status text nobody wrote for a customer', () => {
		/*
		 * The browser builds exactly this for a 502 page that never came from
		 * SvelteKit: `new HttpError({ status: 502, message: response.statusText })`,
		 * an instance of the same class `error()` throws, so `isHttpError` cannot
		 * tell it apart. "Bad Gateway" is not a sentence for a customer.
		 */
		const proxyPage = thrownBy(502, 'Bad Gateway');
		expect(messageFrom(proxyPage, 'Could not cancel that.')).toBe('Could not cancel that.');
	});

	it('does not trust a lookalike that SvelteKit did not make', () => {
		// The right shape, the wrong origin: nothing vetted this sentence.
		const lookalike = { status: 400, body: { status: 400, message: 'Not from us.' } };
		expect(messageFrom(lookalike, 'Could not cancel that.')).toBe('Could not cancel that.');
	});

	it('falls back for the App.Error a boundary receives, which has no body', () => {
		// This is why `+error.svelte` reads `error.message` and not this helper.
		const handled: App.Error = { status: 404, message: 'We could not find that booking.' };
		expect(messageFrom(handled, 'FALLBACK')).toBe('FALLBACK');
	});
});
