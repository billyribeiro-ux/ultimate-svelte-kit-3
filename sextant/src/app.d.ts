import type { Session, User } from 'better-auth';

declare global {
	namespace App {
		interface Locals {
			/**
			 * Optional, not `User | null`.
			 *
			 * The ingest endpoint and the sign-in page are unauthenticated, and typing
			 * this as non-optional would push a `!` into every route that is.
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
			/** Field-level detail from a rejected ingest batch. See the ingest route. */
			issues?: { path: string; message: string }[];
		}

		interface PageState {
			/**
			 * Shallow routing: which trace the detail drawer is showing.
			 *
			 * In history state rather than in a component, so the back button closes
			 * the drawer — which is what a person expects on a phone, where the drawer
			 * covers the results, and what makes a trace link shareable without
			 * navigating away from the query that found it.
			 */
			trace?: string;
			/** The row a detail panel is expanded on, by index into the current result. */
			row?: number;
		}
	}
}

export {};
