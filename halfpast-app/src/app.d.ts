import type { User, Session } from 'better-auth';

/**
 * Ambient types for the app.
 *
 * The `App` namespace is SvelteKit's way of letting a project fill in the shapes
 * the framework deliberately leaves open. Everything declared here is visible
 * everywhere without an import, and — more usefully — is *enforced* everywhere:
 * once `Locals` says `user` may be undefined, every `load` that forgets to check
 * is a compile error.
 *
 * See https://svelte.dev/docs/kit/types#app.d.ts
 */
declare global {
	namespace App {
		interface Locals {
			/** Set by `handleAuth` in `hooks.server.ts`. Absent for a signed-out visitor. */
			user?: User;
			session?: Session;
		}

		/**
		 * The shape of the object `+error.svelte` receives.
		 *
		 * `message` is required by SvelteKit. `id` is ours: `handleError` logs the
		 * same short code it puts on screen, so a support conversation can start
		 * with a string that actually finds the stack trace.
		 */
		interface Error {
			message: string;
			id?: string;
		}

		/** Data every page gets from the root layout, without asking for it. */
		interface PageData {
			user?: { id: string; name: string; email: string } | undefined;
		}
	}
}

export {};
