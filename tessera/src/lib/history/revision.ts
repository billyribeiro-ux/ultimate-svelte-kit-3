/**
 * A point in a board's history, as an object with behaviour.
 *
 * This class exists to cross the network. It is registered in `hooks.ts` under
 * `transport`, so a `query()` can return an array of these and the component
 * that renders them gets real instances with real methods — rather than plain
 * objects and a parallel set of free functions that must be kept in step with
 * the shape.
 */

import { ago, type Locale, type Messages } from '#lib/i18n/index.ts';

export class BoardRevision {
	constructor(
		/** The server's sequence number. The only cursor a client should hold. */
		readonly seq: number,
		readonly at: Date,
		/** Set when somebody named this point. Null for an ordinary run of edits. */
		readonly label: string | null,
		readonly authorName: string,
		/** How many operations this revision covers since the previous one. */
		readonly operations: number
	) {}

	get isCheckpoint(): boolean {
		return this.label !== null;
	}

	/** One line for the history list, in the reader's language. */
	describe(locale: Locale, t: Messages, now?: Date): string {
		const when = ago(locale, this.at, now);
		if (this.label) return `${this.label} · ${when}`;
		return `${t.history.operations(this.operations)} · ${when}`;
	}

	/** The wire form. Kept next to the constructor so the two cannot disagree. */
	toTuple(): [number, number, string | null, string, number] {
		return [this.seq, this.at.getTime(), this.label, this.authorName, this.operations];
	}

	static fromTuple(tuple: [number, number, string | null, string, number]): BoardRevision {
		const [seq, at, label, authorName, operations] = tuple;
		return new BoardRevision(seq, new Date(at), label, authorName, operations);
	}
}
