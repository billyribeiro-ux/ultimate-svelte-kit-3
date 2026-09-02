import type { User } from '#lib/server/identity.ts';

declare global {
	namespace App {
		interface Locals {
			/**
			 * Whoever this browser is, if it has registered a passkey.
			 *
			 * Optional rather than `User | null`: most pages work without one, and
			 * the ones that need one call `requireUser()` and get a typed value or a
			 * 401. A non-optional property here would push a `!` into every route
			 * that does not care.
			 */
			user?: User;
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
			 * Shallow routing: the cell whose inspector is open, as a history entry,
			 * so the back button closes it instead of leaving the sheet.
			 */
			inspect?: string;
			/** The dialog the workspace has open: a new-sheet form or an import. */
			dialog?: 'new' | 'import';
		}
	}
}

export {};
