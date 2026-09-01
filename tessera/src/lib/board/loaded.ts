/**
 * What the server hands over when a board is opened.
 *
 * A class rather than a plain object, and registered with the `transport` hook,
 * so that the thing arriving in the browser knows how to turn itself into a
 * working document. The alternative is every call site doing
 * `BoardDocument.fromSnapshot(actorId(), result.snapshot)` and one of them
 * eventually forgetting the actor.
 */

import type { ActorId } from '#lib/crdt/index.ts';
import type { Role } from '#lib/server/roles.ts';
import { BoardDocument } from './document.svelte';
import { parseSnapshot, type BoardSnapshot } from './snapshot';

export class LoadedBoard {
	constructor(
		readonly id: string,
		readonly title: string,
		readonly snapshot: BoardSnapshot,
		/**
		 * The sequence the snapshot is current to.
		 *
		 * The client streams from here. Getting it wrong in the safe direction
		 * (too low) costs a few redundant operations; wrong in the other direction
		 * silently loses everything in between, which is the kind of bug that shows
		 * up as "sometimes a box I definitely drew is missing".
		 */
		readonly watermark: number,
		readonly role: Role
	) {}

	get readOnly(): boolean {
		return this.role === 'viewer' || this.role === 'commenter';
	}

	/** Build the reactive document for this replica. */
	hydrate(actor: ActorId): BoardDocument {
		return BoardDocument.fromSnapshot(actor, this.snapshot);
	}

	toTuple(): [string, string, string, number, Role] {
		return [this.id, this.title, JSON.stringify(this.snapshot), this.watermark, this.role];
	}

	static fromTuple([id, title, snapshot, watermark, role]: [
		string,
		string,
		string,
		number,
		Role
	]): LoadedBoard {
		/*
		 * The snapshot is validated here rather than trusted.
		 *
		 * It has come from the server, which built it from operations it validated
		 * — but it has also been through JSON, and it may have been written by an
		 * older version of this application. `parseSnapshot` checks the format
		 * version, which is the difference between "your board looks wrong" and a
		 * clear error naming the field.
		 */
		return new LoadedBoard(id, title, parseSnapshot(JSON.parse(snapshot)), watermark, role);
	}
}
