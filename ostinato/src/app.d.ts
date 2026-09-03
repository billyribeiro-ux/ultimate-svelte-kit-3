import type { Artist } from '#lib/server/identity.ts';

declare global {
	namespace App {
		interface Locals {
			/**
			 * Whoever this browser is, if it has published anything.
			 *
			 * Optional rather than `Artist | null`: most pages work without one, and
			 * the ones that need one call `requireArtist()` and get a typed value or a
			 * redirect. A non-optional property here would push a `!` into every
			 * route that does not care.
			 */
			artist?: Artist;
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
			 * Shallow routing: which panel the studio has open as a history entry.
			 *
			 * In history state rather than in a component, so the back button (or a
			 * swipe, on a phone) closes the panel instead of leaving the studio and
			 * losing the pattern being worked on.
			 */
			panel?: 'sound' | 'share' | 'samples';
			/** The pattern a gallery card has expanded into, without leaving the gallery. */
			preview?: string;
		}

		interface Platform {
			/**
			 * What the adapter knows that the framework does not.
			 *
			 * `adapters/ostinato` fills this in from its runtime, and `emulate()` in
			 * the same file fills it in during `vite dev` and `vite preview`, so code
			 * reading `event.platform` sees the same shape everywhere.
			 */
			adapter: string;
			/** Which of the adapter's functions answered — the two real ones, or the catch-all. */
			entry: 'pages' | 'api' | 'router';
			/** When the process started, as a unix timestamp in milliseconds. */
			startedAt: number;
		}
	}
}

export {};
