/**
 * The source language.
 *
 * Its type *is* the contract: every other catalogue is checked against it with
 * `satisfies`, so a key added here and forgotten in French is a build error
 * rather than the word `board.untitled` appearing in somebody's interface.
 *
 * Values are functions where they take arguments. That is deliberate — the
 * alternative is `"{count} selected"` and a runtime interpolator, which cannot
 * be type-checked, cannot express Japanese having no plural, and turns a missing
 * argument into a literal `{count}` on screen.
 *
 * Note the absence of `as const`. It is tempting, and it makes the whole scheme
 * collapse: with it, `Messages` says `boards: 'Boards'` — the *literal* — and
 * `satisfies Messages` then demands that the French catalogue also say
 * `'Boards'`. Every translated line becomes a type error. Without it the strings
 * widen to `string`, the function signatures are kept, and the shape is what is
 * checked. Which is what we wanted to check.
 */
export const en = {
	app: {
		name: 'Tessera',
		tagline: 'Diagrams that stay in step'
	},

	nav: {
		boards: 'Boards',
		signIn: 'Sign in',
		signOut: 'Sign out',
		language: 'Language'
	},

	board: {
		untitled: 'Untitled board',
		create: 'New board',
		open: 'Open',
		empty: 'Nothing here yet. Press N to add your first box.',
		nodes: (count: number) => (count === 1 ? '1 shape' : `${count} shapes`),
		lastEdited: (when: string) => `Edited ${when}`
	},

	sync: {
		live: 'All changes saved',
		offline: 'Offline — your work is safe on this device',
		connecting: 'Reconnecting…',
		pending: (count: number) => (count === 1 ? '1 change waiting' : `${count} changes waiting`),
		refused: 'The server refused a change. Reload to see the current board.'
	},

	presence: {
		alone: 'Only you',
		others: (count: number) => (count === 1 ? '1 other person' : `${count} other people`),
		follow: (name: string) => `Follow ${name}`,
		stopFollowing: 'Stop following'
	},

	tools: {
		select: 'Select',
		service: 'Service',
		datastore: 'Datastore',
		queue: 'Queue',
		external: 'External system',
		note: 'Note',
		group: 'Group',
		connect: 'Connect'
	},

	editing: {
		undo: 'Undo',
		redo: 'Redo',
		duplicate: 'Duplicate',
		delete: 'Delete',
		bringForward: 'Bring forward',
		sendBackward: 'Send backward',
		rename: 'Rename',
		colour: 'Colour'
	},

	comments: {
		heading: 'Comments',
		placeholder: 'Leave a comment',
		post: 'Post',
		resolve: 'Resolve',
		reopen: 'Reopen',
		resolved: 'Resolved',
		none: 'No comments yet'
	},

	history: {
		heading: 'History',
		checkpoint: 'Save a checkpoint',
		restore: 'Restore this version',
		viewing: 'Viewing an earlier version',
		exit: 'Back to now',
		operations: (count: number) => (count === 1 ? '1 change' : `${count} changes`)
	},

	a11y: {
		canvas: 'Board canvas. Use arrow keys to move the selection, Tab to cycle shapes.',
		outline: 'Board outline',
		selected: (label: string) => `${label}, selected`,
		joined: (name: string) => `${name} joined`,
		left: (name: string) => `${name} left`,
		skip: 'Skip to the board'
	},

	errors: {
		notFound: 'That board does not exist, or you do not have access to it.',
		forbidden: 'You do not have permission to do that.',
		generic: 'Something went wrong. The board on this device is unchanged.'
	}
};

/** The shape every other catalogue must match. */
export type Messages = typeof en;
