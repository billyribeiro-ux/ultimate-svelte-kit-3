import type { Session, User } from 'better-auth';
import type { DndEvent } from 'svelte-dnd-action';

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
			 * `error(404, m.error_no_trip())` shorthand from the entire codebase —
			 * the string overload only exists while `App.Error` needs nothing
			 * beyond the `status` and `message` it always has.
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

/*
 * The two events `svelte-dnd-action` dispatches on a zone. Its action used to
 * carry these types onto the element it was applied to; applied through
 * `fromAction` and `{@attach}` (see `Itinerary.svelte`), nothing does, so
 * `onconsider` and `onfinalize` are declared here — the augmentation Svelte's
 * TypeScript docs give for "custom events coming from an action".
 */
declare module 'svelte/elements' {
	interface HTMLAttributes<T> {
		onconsider?: EventHandler<CustomEvent<DndEvent>, T> | null;
		onfinalize?: EventHandler<CustomEvent<DndEvent>, T> | null;
	}
}

export {};
