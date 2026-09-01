/**
 * SNAPSHOTS AND COMPACTION
 * ========================
 *
 * A board is defined by its operations, and a busy board accumulates a great
 * many of them: one per keystroke, two per frame of a drag. Replaying a year of
 * that to open a document is not a plan.
 *
 * A snapshot is the document's state written out directly, plus the version
 * vector saying which operations it already accounts for. Opening a board then
 * means "load the snapshot, replay only what came after it", and the log behind
 * it can be discarded.
 *
 * WHAT COMPACTION MAY AND MAY NOT THROW AWAY
 * ------------------------------------------
 * Deleted **nodes and edges** can go, once every replica has seen the deletion:
 * membership is computed from add- and remove-stamps, so once both sides are
 * gone the element cannot come back and nothing can refer to it.
 *
 * Deleted **characters** stay, and this is the interesting one. It is perfectly
 * legal to type after a character somebody else has deleted — you had not seen
 * the deletion when you started typing — so a tombstone is still a valid anchor
 * for an operation that has not been created yet. There is no version vector
 * that makes it safe to drop; safety would need to know what nobody will do in
 * the future.
 *
 * So Tessera does not compact label tombstones. The cost is bounded by how much
 * has ever been typed into labels, which for a diagram is kilobytes. The
 * alternative — a quiescence protocol where every replica agrees to stop editing
 * so tombstones can be collected — buys a rounding error and introduces a
 * distributed handshake that can fail. This is the right trade, and it is a
 * trade rather than an oversight.
 */

import * as v from 'valibot';
import type { EncodedVersion, RgaSnapshot } from '#lib/crdt';

/** The OR-Set wire shape: element id to the stamps that added and removed it. */
export interface OrSetJson {
	readonly added: Record<string, string[]>;
	readonly removed: Record<string, string[]>;
}

/** A field register on the wire: the winning value and the stamp that wrote it. */
export type EncodedRegister = readonly [value: unknown, stamp: string];

export interface BoardSnapshot {
	/**
	 * The format version.
	 *
	 * Present from the first release, checked on every load, and the reason a
	 * future change to the document model is a migration rather than a support
	 * ticket that says "my board is blank". A snapshot outlives the code that
	 * wrote it — it sits in a browser's IndexedDB across upgrades.
	 */
	readonly format: 1;
	/** Which operations this snapshot already includes. */
	readonly seen: EncodedVersion;
	readonly nodes: OrSetJson;
	readonly edges: OrSetJson;
	readonly nodeFields: Record<string, Record<string, EncodedRegister>>;
	readonly edgeFields: Record<string, Record<string, EncodedRegister>>;
	readonly labels: Record<string, RgaSnapshot>;
}

const stamps = v.record(v.string(), v.array(v.string()));
const orSet = v.object({ added: stamps, removed: stamps });
const registers = v.record(v.string(), v.record(v.string(), v.tuple([v.unknown(), v.string()])));

/**
 * The envelope, validated. The *contents* are not re-validated field by field.
 *
 * Every value in here entered the system through `parseOperation`, which checked
 * it against the same rules the editor enforces, and a snapshot can hold tens of
 * thousands of registers. Re-running those schemas on load would cost real time
 * at exactly the moment a person is waiting to see their board.
 *
 * The line is drawn where trust changes hands: operations arrive from clients
 * and are checked; snapshots are written by this code from already-checked
 * operations, and only the shape is confirmed.
 */
export const BoardSnapshotSchema = v.object({
	format: v.literal(1),
	seen: v.record(v.string(), v.string()),
	nodes: orSet,
	edges: orSet,
	nodeFields: registers,
	edgeFields: registers,
	labels: v.record(
		v.string(),
		v.object({
			items: v.array(
				v.tuple([
					v.string(),
					v.nullable(v.string()),
					v.string(),
					v.union([v.literal(0), v.literal(1)])
				])
			),
			pending: v.optional(v.array(v.string()))
		})
	)
});

export function parseSnapshot(value: unknown): BoardSnapshot {
	return v.parse(BoardSnapshotSchema, value) as BoardSnapshot;
}

/** An empty board, for a document that has never been saved. */
export function emptySnapshot(): BoardSnapshot {
	return {
		format: 1,
		seen: {},
		nodes: { added: {}, removed: {} },
		edges: { added: {}, removed: {} },
		nodeFields: {},
		edgeFields: {},
		labels: {}
	};
}
