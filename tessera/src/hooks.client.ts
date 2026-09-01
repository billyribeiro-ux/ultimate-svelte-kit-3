import type { HandleClientError } from '@sveltejs/kit/hooks';

/**
 * The browser's half of error handling.
 *
 * Deliberately quiet. An unexpected client error in Tessera is usually survivable
 * — the document lives in memory and in IndexedDB, and a failed render does not
 * lose it — so the message says so rather than implying work has been lost.
 *
 * There is no reporting call here. Adding one is a decision about what leaves a
 * user's machine, and a board's contents can be commercially sensitive; the
 * hook is the wrong place to make that decision quietly.
 */
export const handleError: HandleClientError = ({ error, kind }) => {
	// A 404 or a deliberate `error(...)` already says what it means.
	if (kind !== 'unknown') return;

	console.error('[tessera]', error);

	return {
		message: 'Something went wrong in the browser. Your board is safe on this device.'
	};
};
