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
			 * **Optional, and it has to be.** A required property here removes the
			 * `error(404, 'Not found')` shorthand from the entire codebase — the
			 * string overload only exists while `App.Error` is `{ message }` — and
			 * every `error()` call becomes an object literal repeating a field that
			 * only `handleError` can meaningfully fill in.
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
