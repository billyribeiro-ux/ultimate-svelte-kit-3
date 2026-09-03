/**
 * UNDO
 * ====
 *
 * Undo in a shared document is not the same problem as undo in a text editor,
 * and pretending otherwise produces a feature people learn not to trust.
 *
 * THE STACK HOLDS INVERSES, NOT STATES
 * ------------------------------------
 * Each entry is a pair of closures that *make new operations*. Undoing a move
 * writes the old position with a fresh stamp; it does not rewind the log, and it
 * does not remove anything from history. Every replica sees an ordinary edit
 * that happens to put the box back, which is the only representation that can
 * merge — a rewind cannot, because somebody else's later edit has no idea it
 * was supposed to be un-happened.
 *
 * IT IS YOUR STACK, NOT THE BOARD'S
 * ---------------------------------
 * Only operations this replica created go on it. Pressing undo must never move
 * something a colleague just moved: that is astonishing, unprompted, and
 * indistinguishable from a bug. The consequence people do have to learn is that
 * undo can be a no-op — if somebody else has since moved the box you moved, your
 * undo writes your old position and theirs wins or loses on stamp order like any
 * other concurrent edit.
 *
 * That is honest, and it is the same rule every collaborative editor arrives at.
 */

const LIMIT = 200;

export interface Entry {
	/** Shown in the tooltip: "Undo move". Not translated here — a key, not a string. */
	readonly label: string;
	readonly undo: () => void;
	readonly redo: () => void;
}

export class History {
	#past = $state.raw<Entry[]>([]);
	#future = $state.raw<Entry[]>([]);

	/** True while an undo or redo is running, so it cannot record itself. */
	#replaying = false;

	readonly canUndo = $derived(this.#past.length > 0);
	readonly canRedo = $derived(this.#future.length > 0);

	get nextUndo(): string | null {
		return this.#past.at(-1)?.label ?? null;
	}

	get nextRedo(): string | null {
		return this.#future.at(-1)?.label ?? null;
	}

	/**
	 * Record something that has already happened.
	 *
	 * Called *after* the change, not before, because the caller needs to have made
	 * the change to know what its inverse is — and because a failed edit should
	 * leave nothing on the stack.
	 */
	push(entry: Entry): void {
		if (this.#replaying) return;

		/*
		 * A new edit clears the redo stack.
		 *
		 * The alternative — a branching history — is a genuinely better model and
		 * one that almost nobody can use, because there is no interface for "which
		 * of these two futures did you mean". Every editor people are fluent in
		 * throws the branch away, so this does too.
		 */
		this.#past = [...this.#past, entry].slice(-LIMIT);
		this.#future = [];
	}

	/**
	 * Group several changes into one entry.
	 *
	 * Dragging five nodes emits ten operations and must undo once. The callback
	 * returns the pair of closures so that the caller can capture whatever "before"
	 * state it needs while it still exists.
	 */
	transaction(label: string, body: () => { undo: () => void; redo: () => void }): void {
		const { undo, redo } = body();
		this.push({ label, undo, redo });
	}

	undo(): void {
		const entry = this.#past.at(-1);
		if (!entry) return;

		this.#replaying = true;
		try {
			entry.undo();
		} finally {
			// `finally`, so a throwing inverse cannot wedge the stack into a state
			// where nothing can ever be recorded again.
			this.#replaying = false;
		}

		this.#past = this.#past.slice(0, -1);
		this.#future = [...this.#future, entry];
	}

	redo(): void {
		const entry = this.#future.at(-1);
		if (!entry) return;

		this.#replaying = true;
		try {
			entry.redo();
		} finally {
			this.#replaying = false;
		}

		this.#future = this.#future.slice(0, -1);
		this.#past = [...this.#past, entry];
	}

	clear(): void {
		this.#past = [];
		this.#future = [];
	}
}
