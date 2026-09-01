/**
 * The board domain.
 *
 * Everything about what a diagram *is*, built on the CRDT primitives and knowing
 * nothing about storage, the network, or the DOM. `document.svelte.ts` is the
 * only file here that touches Svelte, and only to project the model into signals
 * the renderer can read.
 */

export { BoardDocument, EdgeView, NodeView, type ApplyResult } from './document.svelte';
export {
	BATCH_LIMIT,
	BatchSchema,
	OperationSchema,
	isCreation,
	isRemoval,
	parseBatch,
	parseOperation,
	targetOf,
	type EdgeSetOperation,
	type NodeSetOperation,
	type Operation,
	type OperationKind
} from './ops';
export {
	BoardSnapshotSchema,
	emptySnapshot,
	parseSnapshot,
	type BoardSnapshot,
	type EncodedRegister,
	type OrSetJson
} from './snapshot';
export {
	bounds,
	centre,
	contains,
	fromCorners,
	inflate,
	intersects,
	portPoint,
	roundedPath,
	route,
	snap
} from './geometry';
export {
	EDGE_KINDS,
	FILLS,
	MAX_SIZE,
	MIN_SIZE,
	NODE_DEFAULTS,
	NODE_KINDS,
	PORTS,
	type EdgeField,
	type EdgeFields,
	type EdgeId,
	type EdgeKind,
	type Fill,
	type NodeField,
	type NodeFields,
	type NodeId,
	type NodeKind,
	type Point,
	type Port,
	type Rect
} from './types';
