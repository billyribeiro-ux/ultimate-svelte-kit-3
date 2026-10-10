import type { Session, User } from 'better-auth';
import type { Locale } from '#lib/i18n/index.ts';

declare global {
	namespace App {
		interface Locals {
			/**
			 * Optional, not `User | null`.
			 *
			 * Most of this application is behind a sign-in, but the embed route and
			 * the marketing pages are not, and typing this as non-optional would push
			 * a `!` into every one of them.
			 */
			user?: User;
			session?: Session;
			/** Resolved by `handleLocale` before anything renders. Always set. */
			locale: Locale;
		}

		interface Error {
			/**
			 * A correlation id for an unexpected failure.
			 *
			 * Shown to the user so they can quote it, and written to the server log
			 * alongside the stack. It is the whole of what an error page needs to be
			 * useful without leaking anything.
			 *
			 * **Optional, and it has to be.** SvelteKit 3's `error(status, message,
			 * extras)` always takes the message as a string and any other
			 * `App.Error` properties as a third argument — and a *required*
			 * property here makes that third argument mandatory, so every
			 * `error(404, 'Not found')` in the codebase grows an object literal
			 * repeating a field that only `handleError` can meaningfully fill in.
			 *
			 * `status` is not declared here because SvelteKit 3 adds it to every
			 * `App.Error` itself.
			 */
			id?: string;
		}

		interface PageState {
			/**
			 * Shallow routing: which element's inspector is open.
			 *
			 * Kept in history state rather than in a component, so that the back
			 * button closes the panel — which is what a person expects on a phone,
			 * where the panel covers the board.
			 */
			inspecting?: string;
		}
	}
}

export {};
