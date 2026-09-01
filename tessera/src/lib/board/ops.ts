/**
 * THE OPERATION ALGEBRA
 * =====================
 *
 * Every change to a board is one of eight operations. Nothing else can modify a
 * document — not the editor, not the server, not a migration. That is a strong
 * claim and it is what makes the rest of the system tractable: sync ships
 * operations, history replays operations, undo emits inverse operations, and the
 * permission check is a function from an operation to yes or no.
 *
 * TWO IDS, AND WHY THEY ARE NOT THE SAME FIELD
 * --------------------------------------------
 * `node.add` carries both a `stamp` and an `id`, which looks redundant, since a
 * node's id is the stamp of the operation that created it.
 *
 * It is redundant exactly once — the first time. Undoing a delete re-adds the
 * same node: same `id`, because it is the same node and everything pointing at
 * it must keep pointing at it; new `stamp`, because it is a new event that no
 * existing removal can have observed, which is what makes the node come back.
 * Collapse the two fields and undo of a delete becomes impossible to express.
 *
 * ONE FIELD PER OPERATION
 * -----------------------
 * `node.set` writes a single field. Dragging a box emits an `x` and a `y`, not
 * one `{x, y}`. It costs a few more bytes and it buys the merge that people
 * expect: if you resize a box while I recolour it, both survive. Bundling
 * fields makes the whole bundle last-write-wins, and somebody's work vanishes
 * for no reason they can see.
 *
 * VALIDATION IS NOT OPTIONAL
 * --------------------------
 * These schemas run on the server against every operation from every client.
 * A CRDT converges on whatever it is given, including nonsense: `w: -1e9`
 * converges perfectly and makes the board unusable for everybody, permanently,
 * with no way to select the shape and fix it. "It's collaborative" is not a
 * reason to trust input; it is a reason to distrust it more, because a bad
 * operation propagates.
 */

import * as v from 'valibot';
import type { Stamp } from '#lib/crdt/index.ts';
import { isOrderKey } from '#lib/crdt/index.ts';
import {
	EDGE_KINDS,
	FILLS,
	MAX_SIZE,
	MIN_SIZE,
	NODE_KINDS,
	PORTS,
	type EdgeFields,
	type EdgeId,
	type NodeFields,
	type NodeId
} from './types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * A `node.set` for each field, as a union.
 *
 * The mapped type distributes over the field names, so `field: 'x'` narrows
 * `value` to `number` and `field: 'fill'` narrows it to `Fill`. Writing this as
 * `{ field: NodeField; value: unknown }` would compile and would move every
 * mistake to runtime.
 */
export type NodeSetOperation = {
	[F in keyof NodeFields]: {
		readonly kind: 'node.set';
		readonly stamp: Stamp;
		readonly target: NodeId;
		readonly field: F;
		readonly value: NodeFields[F];
	};
}[keyof NodeFields];

export type EdgeSetOperation = {
	[F in keyof EdgeFields]: {
		readonly kind: 'edge.set';
		readonly stamp: Stamp;
		readonly target: EdgeId;
		readonly field: F;
		readonly value: EdgeFields[F];
	};
}[keyof EdgeFields];

export type Operation =
	| {
			readonly kind: 'node.add';
			readonly stamp: Stamp;
			readonly id: NodeId;
			readonly fields: NodeFields;
	  }
	| {
			readonly kind: 'node.remove';
			readonly stamp: Stamp;
			readonly target: NodeId;
			/**
			 * The add stamps this removal observed. See `crdt/orset.ts`.
			 *
			 * A plain array, not `readonly Stamp[]`, and this is a boundary decision
			 * rather than an oversight. valibot infers `Stamp[]` for the wire type, and
			 * `readonly Stamp[]` is not assignable to it — so a `readonly` here makes
			 * every call that sends an operation to the server need a cast. The
			 * properties are still `readonly`, which is what stops an operation being
			 * edited after it is created; only the array's own mutability is given up,
			 * and nothing in the codebase mutates one.
			 */
			readonly observed: Stamp[];
	  }
	| NodeSetOperation
	| {
			readonly kind: 'edge.add';
			readonly stamp: Stamp;
			readonly id: EdgeId;
			readonly fields: EdgeFields;
	  }
	| {
			readonly kind: 'edge.remove';
			readonly stamp: Stamp;
			readonly target: EdgeId;
			readonly observed: Stamp[];
	  }
	| EdgeSetOperation
	| {
			readonly kind: 'text.insert';
			readonly stamp: Stamp;
			/** The node or edge whose label this is. */
			readonly target: Stamp;
			/** The character this one follows, or `null` for the start. */
			readonly after: Stamp | null;
			readonly value: string;
	  }
	| {
			readonly kind: 'text.delete';
			readonly stamp: Stamp;
			readonly target: Stamp;
			readonly chars: Stamp[];
	  };

export type OperationKind = Operation['kind'];

/* ------------------------------------------------------------------ */
/* Wire validation                                                     */
/* ------------------------------------------------------------------ */

/** 13 digits of milliseconds, 5 of counter, 8 of actor. See `crdt/clock.ts`. */
const stamp = v.pipe(
	v.string(),
	v.regex(/^\d{18}[0-9a-z]{8}$/, 'Not a stamp'),
	v.transform((value) => value as Stamp)
);

/**
 * A coordinate.
 *
 * Finite, because `Infinity` and `NaN` both survive JSON round-trips as `null`
 * in some encoders and as themselves in others, and a node at `NaN` disappears
 * from the render and from every hit test — present in the document, invisible,
 * unselectable.
 *
 * The bound is generous rather than tight: a board is not a photograph, and
 * somebody laying out a large system legitimately spreads over a lot of space.
 * It exists to keep the number in a range where floating-point arithmetic is
 * still exact enough for snapping to work.
 */
const coordinate = v.pipe(v.number(), v.finite(), v.minValue(-1e7), v.maxValue(1e7));

const dimension = v.pipe(v.number(), v.finite(), v.minValue(MIN_SIZE), v.maxValue(MAX_SIZE));

const orderKey = v.pipe(
	v.string(),
	v.check((value) => isOrderKey(value), 'Not a fractional index')
);

/**
 * One character.
 *
 * `[...value].length === 1` rather than `value.length === 1`, so an emoji is one
 * character and a lone surrogate half is none. A surrogate half stored as its
 * own CRDT item lets a concurrent insertion land between the halves, and the
 * label renders as a replacement glyph on every replica from then on.
 */
const character = v.pipe(
	v.string(),
	v.check((value) => [...value].length === 1, 'Expected exactly one character')
);

const nodeFields = v.object({
	kind: v.picklist(NODE_KINDS),
	x: coordinate,
	y: coordinate,
	w: dimension,
	h: dimension,
	fill: v.picklist(FILLS),
	order: orderKey,
	parent: v.nullable(stamp)
});

const edgeFields = v.object({
	from: stamp,
	to: stamp,
	kind: v.picklist(EDGE_KINDS),
	fromPort: v.picklist(PORTS),
	toPort: v.picklist(PORTS)
});

/**
 * How many add-stamps a single removal may name.
 *
 * Unbounded, a client could send a removal naming a million stamps and make the
 * server allocate them. The real number is the count of concurrent re-creations
 * of one element, which is never more than the number of collaborators.
 */
const OBSERVED_LIMIT = 256;

/** How many characters one `text.delete` may tombstone — a select-all of a label. */
const CHARS_LIMIT = 4096;

const observed = v.pipe(v.array(stamp), v.maxLength(OBSERVED_LIMIT));

export const OperationSchema = v.variant('kind', [
	v.object({ kind: v.literal('node.add'), stamp, id: stamp, fields: nodeFields }),
	v.object({ kind: v.literal('node.remove'), stamp, target: stamp, observed }),

	/*
	 * `node.set` is a variant *within* a variant: one entry per field, so the
	 * value is validated against that field's own rules. A single
	 * `{ field: string, value: unknown }` schema would accept `x: 'left'` and
	 * `fill: -3`, and a CRDT converges on those just as reliably as on good data.
	 */
	v.object({
		kind: v.literal('node.set'),
		stamp,
		target: stamp,
		field: v.literal('kind'),
		value: v.picklist(NODE_KINDS)
	}),
	v.object({
		kind: v.literal('node.set'),
		stamp,
		target: stamp,
		field: v.literal('x'),
		value: coordinate
	}),
	v.object({
		kind: v.literal('node.set'),
		stamp,
		target: stamp,
		field: v.literal('y'),
		value: coordinate
	}),
	v.object({
		kind: v.literal('node.set'),
		stamp,
		target: stamp,
		field: v.literal('w'),
		value: dimension
	}),
	v.object({
		kind: v.literal('node.set'),
		stamp,
		target: stamp,
		field: v.literal('h'),
		value: dimension
	}),
	v.object({
		kind: v.literal('node.set'),
		stamp,
		target: stamp,
		field: v.literal('fill'),
		value: v.picklist(FILLS)
	}),
	v.object({
		kind: v.literal('node.set'),
		stamp,
		target: stamp,
		field: v.literal('order'),
		value: orderKey
	}),
	v.object({
		kind: v.literal('node.set'),
		stamp,
		target: stamp,
		field: v.literal('parent'),
		value: v.nullable(stamp)
	}),

	v.object({ kind: v.literal('edge.add'), stamp, id: stamp, fields: edgeFields }),
	v.object({ kind: v.literal('edge.remove'), stamp, target: stamp, observed }),
	v.object({
		kind: v.literal('edge.set'),
		stamp,
		target: stamp,
		field: v.literal('from'),
		value: stamp
	}),
	v.object({
		kind: v.literal('edge.set'),
		stamp,
		target: stamp,
		field: v.literal('to'),
		value: stamp
	}),
	v.object({
		kind: v.literal('edge.set'),
		stamp,
		target: stamp,
		field: v.literal('kind'),
		value: v.picklist(EDGE_KINDS)
	}),
	v.object({
		kind: v.literal('edge.set'),
		stamp,
		target: stamp,
		field: v.literal('fromPort'),
		value: v.picklist(PORTS)
	}),
	v.object({
		kind: v.literal('edge.set'),
		stamp,
		target: stamp,
		field: v.literal('toPort'),
		value: v.picklist(PORTS)
	}),

	v.object({
		kind: v.literal('text.insert'),
		stamp,
		target: stamp,
		after: v.nullable(stamp),
		value: character
	}),
	v.object({
		kind: v.literal('text.delete'),
		stamp,
		target: stamp,
		chars: v.pipe(v.array(stamp), v.maxLength(CHARS_LIMIT))
	})
]);

/**
 * How many operations one request may carry.
 *
 * Typing produces one operation per keystroke and a paste produces one per
 * character, so a batch of a few hundred is ordinary. A batch of a hundred
 * thousand is somebody probing for a memory limit.
 */
export const BATCH_LIMIT = 512;

export const BatchSchema = v.pipe(v.array(OperationSchema), v.maxLength(BATCH_LIMIT));

/** Parse an untrusted operation. Throws `ValiError` with a path to the bad field. */
export function parseOperation(value: unknown): Operation {
	return v.parse(OperationSchema, value) as Operation;
}

export function parseBatch(value: unknown): Operation[] {
	return v.parse(BatchSchema, value) as Operation[];
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/**
 * The element an operation acts on.
 *
 * Used by undo (to group operations that belong to one gesture) and by the
 * permission layer (to answer "may this person touch this element?"). Written as
 * an exhaustive switch so that adding a ninth operation is a type error here
 * rather than a silent `undefined` in an authorisation check.
 */
export function targetOf(operation: Operation): Stamp {
	switch (operation.kind) {
		case 'node.add':
		case 'edge.add':
			return operation.id;
		case 'node.remove':
		case 'node.set':
		case 'edge.remove':
		case 'edge.set':
		case 'text.insert':
		case 'text.delete':
			return operation.target;
	}
}

/** Does this operation create an element? Creation is the one thing a `commenter` may never do. */
export function isCreation(operation: Operation): boolean {
	return operation.kind === 'node.add' || operation.kind === 'edge.add';
}

/** Does this operation destroy one? */
export function isRemoval(operation: Operation): boolean {
	return operation.kind === 'node.remove' || operation.kind === 'edge.remove';
}
