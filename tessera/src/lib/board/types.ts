/**
 * WHAT A BOARD IS
 * ===============
 *
 * Tessera draws system diagrams: boxes that are services, cylinders that are
 * datastores, arrows that are calls. Not "shapes" — the vocabulary is
 * deliberately narrow, because a tool that can draw anything makes every
 * diagram look different and a tool with six nouns makes them all comparable.
 *
 * Ids are `Stamp`s from the CRDT clock, which means an element's identity *is*
 * the moment it was created, by whom. Two replicas offline in a tunnel cannot
 * collide, no server round trip is needed to mint one, and sorting elements by
 * id sorts them by age. A UUID would do the first two and none of the rest.
 */

import type { Stamp } from '#lib/crdt';

export type NodeId = Stamp;
export type EdgeId = Stamp;

/**
 * The six things a node can be.
 *
 * `group` is the odd one out: it has no meaning of its own, it is a frame that
 * other nodes declare as their parent. It exists because "these four services
 * are one bounded context" is the single most common thing people reach for a
 * whiteboard to say.
 */
export const NODE_KINDS = ['service', 'datastore', 'queue', 'external', 'note', 'group'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/**
 * How one node talks to another. The distinction is drawn, not written: a
 * synchronous call is a solid arrow, asynchronous is dashed, a stream is a
 * double line, a dependency has no arrowhead at all.
 */
export const EDGE_KINDS = ['sync', 'async', 'stream', 'dependency'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/**
 * Colour by name, never by hex.
 *
 * A board stores `'jade'`, and what jade *is* depends on the theme the viewer is
 * using. Storing `#1f9d76` would freeze one person's light-mode palette into the
 * document and make it unreadable for everybody in dark mode — a mistake that is
 * invisible until somebody with different settings opens a board and finds it
 * illegible.
 */
export const FILLS = ['slate', 'indigo', 'jade', 'amber', 'rose', 'cyan'] as const;
export type Fill = (typeof FILLS)[number];

/** Which side of a node an edge leaves from. `auto` picks the nearest. */
export const PORTS = ['auto', 'top', 'right', 'bottom', 'left'] as const;
export type Port = (typeof PORTS)[number];

/**
 * The smallest a node may be, in board units.
 *
 * Enforced when resizing rather than when rendering, so that a node cannot be
 * dragged to zero and become unclickable — the classic way a shape is lost
 * forever in a canvas tool, still present in the document and impossible to
 * select.
 */
export const MIN_SIZE = 48;

/** The largest, so one runaway drag cannot make the board's bounds meaningless. */
export const MAX_SIZE = 8000;

/** The board coordinate system. Not pixels: pixels depend on the zoom. */
export interface Point {
	readonly x: number;
	readonly y: number;
}

export interface Rect extends Point {
	readonly w: number;
	readonly h: number;
}

/** Every scalar field of a node that a `node.set` operation can write. */
export interface NodeFields {
	readonly kind: NodeKind;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly fill: Fill;
	/** Fractional index — stacking order. See `crdt/fracdex.ts`. */
	readonly order: string;
	/** The group this node sits inside, or `null` for the top level. */
	readonly parent: NodeId | null;
}

export interface EdgeFields {
	readonly from: NodeId;
	readonly to: NodeId;
	readonly kind: EdgeKind;
	readonly fromPort: Port;
	readonly toPort: Port;
}

export type NodeField = keyof NodeFields;
export type EdgeField = keyof EdgeFields;

/** Defaults for a freshly dropped node. */
export const NODE_DEFAULTS = {
	w: 168,
	h: 88,
	fill: 'slate'
} as const satisfies Partial<NodeFields>;
