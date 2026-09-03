import type { Session, User } from 'better-auth';

declare global {
	namespace App {
		interface Locals {
			/**
			 * Whoever this browser is, if they have signed in.
			 *
			 * Optional rather than `User | null`: most pages work without one, and
			 * the ones that need one call `requireUser()` and get a typed value or a
			 * redirect. A non-optional property here would push a `!` into every
			 * route that does not care.
			 */
			user?: User;
			session?: Session;
		}

		interface Error {
			/**
			 * A correlation id for an unexpected failure.
			 *
			 * Optional, and it has to be. A required property here removes the
			 * `error(404, 'Not found')` shorthand from the entire codebase — the
			 * string overload only exists while `App.Error` is `{ message }`.
			 */
			id?: string;
		}

		interface PageState {
			/**
			 * Shallow routing: the dialog a trip page has open, as a history entry,
			 * so the back button closes it instead of leaving the trip.
			 */
			dialog?: 'stop' | 'expense' | 'invite';
			/** The stop the dialog is editing, if any. */
			stop?: string;
		}
	}
}

export {};
