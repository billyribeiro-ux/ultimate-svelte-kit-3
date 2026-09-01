/**
 * THE REACTIVE DOCUMENT
 * =====================
 *
 * Two representations of the same board, kept in step by one function.
 *
 *   the CRDT      plain objects and Maps. Correct under any delivery order,
 *                 mergeable, serialisable, and completely unaware of Svelte.
 *   the views     `$state` objects the components render from.
 *
 * It is tempting to collapse them — make the CRDT itself reactive and render
 * straight off it. Two reasons not to.
 *
 * The first is performance. Deep reactivity over a CRDT means a proxy around
 * every tombstone, every add-stamp, every character of every label. Dragging one
 * node touches structures that no component reads, and each touch costs a
 * signal write. The projection is the working set; it is roughly a hundredth of
 * the size.
 *
 * The second is that the CRDT's internals are *not* what a component wants. A
 * component wants `node.x === 240`. The CRDT holds "a last-write-wins register
 * whose current winner is 240, and here are the two losing writes". Rendering
 * from the model would put merge semantics into the markup.
 *
 * So: `apply()` mutates the model, works out what actually changed, and writes
 * that much into the views. One node moving invalidates one number.
 */

import { SvelteMap } from 'svelte/reactivity';
import {
	type ActorId,
	type Lww,
	type OrderKey,
	type Stamp,
	type VersionVector,
	Clock,
	OrSet,
	RgaText,
	compareOrder,
	emptyVersion,
	observeVersion,
	versionFromJSON,
	versionToJSON,
	write
} from '#lib/crdt/index.ts';
import {
	type EdgeField,
	type EdgeFields,
	type EdgeId,
	type EdgeKind,
	type Fill,
	type NodeField,
	type NodeFields,
	type NodeId,
	type NodeKind,
	type Port,
	type Rect,
	MAX_SIZE,
	MIN_SIZE,
	NODE_DEFAULTS
} from './types.ts';
import type { Operation } from './ops.ts';
import { type BoardSnapshot, type EncodedRegister, emptySnapshot } from './snapshot.ts';

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

/**
 * One node, as the renderer sees it.
 *
 * Every field is its own signal. That granularity is the point: a drag writes
 * `x` and `y` sixty times a second, and nothing that reads only `fill` should
 * re-run because of it.
 */
export class NodeView {
	kind = $state<NodeKind>('service');
	x = $state(0);
	y = $state(0);
	/*
	 * Annotated `<number>` rather than inferred.
	 *
	 * `NODE_DEFAULTS` is `as const`, so the inferred type of `$state(168)` is the
	 * literal `168` and the first resize is a type error complaining that `number`
	 * is not assignable to `168`. Widening at the declaration is the fix; removing
	 * `as const` would lose the literal types the operation schemas depend on.
	 */
	w = $state<number>(NODE_DEFAULTS.w);
	h = $state<number>(NODE_DEFAULTS.h);
	fill = $state<Fill>(NODE_DEFAULTS.fill);
	order = $state<OrderKey>('V' as OrderKey);
	parent = $state<NodeId | null>(null);
	/** The materialised text of the label. The characters live in the CRDT. */
	label = $state('');

	constructor(readonly id: NodeId) {}

	/** Bounds, as a plain object — handy for geometry that should not be reactive. */
	get rect(): Rect {
		return { x: this.x, y: this.y, w: this.w, h: this.h };
	}
}

export class EdgeView {
	from = $state<NodeId>('' as NodeId);
	to = $state<NodeId>('' as NodeId);
	kind = $state<EdgeKind>('sync');
	fromPort = $state<Port>('auto');
	toPort = $state<Port>('auto');
	label = $state('');

	constructor(readonly id: EdgeId) {}
}

/** What `apply` did, so callers can skip work when the answer is "nothing". */
export interface ApplyResult {
	readonly changed: boolean;
}

/* ------------------------------------------------------------------ */
/* The document                                                        */
/* ------------------------------------------------------------------ */

export class BoardDocument {
	/* The model. Deliberately not reactive. */
	readonly #nodes = new OrSet<NodeId>();
	readonly #edges = new OrSet<EdgeId>();
	readonly #nodeFields = new Map<NodeId, Map<NodeField, Lww<unknown>>>();
	readonly #edgeFields = new Map<EdgeId, Map<EdgeField, Lww<unknown>>>();
	/** Labels for nodes and edges alike — ids are unique across both. */
	readonly #labels = new Map<Stamp, RgaText>();

	/* The projection. */
	readonly nodes = new SvelteMap<NodeId, NodeView>();
	readonly edges = new SvelteMap<EdgeId, EdgeView>();

	readonly #clock: Clock;
	#version: VersionVector = emptyVersion();

	/**
	 * Called with every operation this replica creates.
	 *
	 * A set rather than a single slot. Two things listen — the sync engine, which
	 * queues operations for the server, and the history stack, which records them
	 * for undo — and the first version of this held one function, so whichever
	 * subscribed second silently replaced the first. The symptom was undo working
	 * perfectly and nothing ever reaching the network.
	 */
	readonly #listeners = new Set<(operation: Operation) => void>();

	readonly actor: ActorId;

	constructor(actor: ActorId, now: () => number = Date.now) {
		this.actor = actor;
		this.#clock = new Clock(actor, now);
	}

	/** Everything this replica has applied, for the sync cursor. */
	get version(): VersionVector {
		return this.#version;
	}

	get clock(): Clock {
		return this.#clock;
	}

	onLocalOperation(listener: (operation: Operation) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/**
	 * Nodes in painting order: bottom first.
	 *
	 * Never sorts on `order` alone — two replicas can mint the same fractional
	 * index concurrently, and `Array#sort` is only required to be stable, not to
	 * agree between engines. `compareOrder` breaks the tie with the id.
	 */
	painted(): NodeView[] {
		return [...this.nodes.values()].sort((a, b) =>
			compareOrder({ key: a.order, id: a.id }, { key: b.order, id: b.id })
		);
	}

	/* ---------------------------------------------------------------- */
	/* Applying                                                          */
	/* ---------------------------------------------------------------- */

	/**
	 * Apply an operation from anywhere — this replica, the network, a replay.
	 *
	 * Safe in any order, any number of times. There is no "have I seen this?"
	 * check: every structure underneath is idempotent, and the fast path that
	 * looked like a free win silently dropped operations that arrived out of
	 * order. See `crdt/version.ts`.
	 */
	apply(operation: Operation): ApplyResult {
		this.#clock.observe(operation.stamp);
		this.#version = observeVersion(this.#version, operation.stamp);

		let changed = false;

		switch (operation.kind) {
			case 'node.add': {
				changed = this.#nodes.add(operation.id, operation.stamp);
				// Seed the registers from the creating operation, stamped with it, so a
				// concurrent edit made before this add arrived still wins if it is later.
				for (const [field, value] of Object.entries(operation.fields)) {
					changed =
						this.#writeNodeField(operation.id, field as NodeField, value, operation.stamp) ||
						changed;
				}
				if (changed) this.#reconcileNode(operation.id);
				break;
			}

			case 'node.remove': {
				changed = this.#nodes.remove(operation.target, operation.observed);
				if (changed) this.#reconcileNode(operation.target);
				break;
			}

			case 'node.set': {
				changed = this.#writeNodeField(
					operation.target,
					operation.field,
					operation.value,
					operation.stamp
				);
				if (changed) this.#reconcileNodeField(operation.target, operation.field);
				break;
			}

			case 'edge.add': {
				changed = this.#edges.add(operation.id, operation.stamp);
				for (const [field, value] of Object.entries(operation.fields)) {
					changed =
						this.#writeEdgeField(operation.id, field as EdgeField, value, operation.stamp) ||
						changed;
				}
				if (changed) this.#reconcileEdge(operation.id);
				break;
			}

			case 'edge.remove': {
				changed = this.#edges.remove(operation.target, operation.observed);
				if (changed) this.#reconcileEdge(operation.target);
				break;
			}

			case 'edge.set': {
				changed = this.#writeEdgeField(
					operation.target,
					operation.field,
					operation.value,
					operation.stamp
				);
				if (changed) this.#reconcileEdgeField(operation.target, operation.field);
				break;
			}

			case 'text.insert': {
				changed = this.label(operation.target).insert({
					// The operation's stamp is the character's identity. One stamp, two
					// jobs, and no way for them to disagree.
					id: operation.stamp,
					after: operation.after,
					value: operation.value,
					deleted: false
				});
				if (changed) this.#reconcileLabel(operation.target);
				break;
			}

			case 'text.delete': {
				const text = this.label(operation.target);
				for (const character of operation.chars) {
					changed = text.delete(character) || changed;
				}
				if (changed) this.#reconcileLabel(operation.target);
				break;
			}
		}

		return { changed };
	}

	/** Apply many, reconciling once per element rather than once per operation. */
	applyAll(operations: Iterable<Operation>): ApplyResult {
		let changed = false;
		for (const operation of operations) {
			changed = this.apply(operation).changed || changed;
		}
		return { changed };
	}

	/* ---------------------------------------------------------------- */
	/* Emitting                                                          */
	/* ---------------------------------------------------------------- */

	/**
	 * Apply locally, then hand to the sync layer.
	 *
	 * The order matters and is the whole of "local-first": the screen updates from
	 * the local apply, synchronously, in the same frame as the input event. The
	 * network is told afterwards and is allowed to take as long as it likes,
	 * including forever.
	 */
	#commit(operation: Operation): Operation {
		this.apply(operation);
		for (const listener of this.#listeners) listener(operation);
		return operation;
	}

	addNode(fields: Partial<NodeFields> & Pick<NodeFields, 'x' | 'y' | 'order'>): NodeId {
		const stamp = this.#clock.tick();
		const id = stamp as NodeId;

		this.#commit({
			kind: 'node.add',
			stamp,
			id,
			fields: {
				kind: 'service',
				w: NODE_DEFAULTS.w,
				h: NODE_DEFAULTS.h,
				fill: NODE_DEFAULTS.fill,
				parent: null,
				...fields
			}
		});

		return id;
	}

	/** Re-create a node that was removed, keeping its id and everything pointing at it. */
	restoreNode(id: NodeId, fields: NodeFields): void {
		this.#commit({ kind: 'node.add', stamp: this.#clock.tick(), id, fields });
	}

	removeNode(id: NodeId): void {
		/*
		 * Edges first, and edges *incident to* this node, not just selected ones.
		 *
		 * Leaving them behind produces an edge pointing at nothing: it renders as an
		 * arrow to the origin, or not at all, and it survives every subsequent merge
		 * because nothing else has a reason to remove it.
		 */
		for (const edge of this.edges.values()) {
			if (edge.from === id || edge.to === id) this.removeEdge(edge.id);
		}

		this.#commit({
			kind: 'node.remove',
			stamp: this.#clock.tick(),
			target: id,
			observed: this.#nodes.observedAdds(id)
		});
	}

	setNode<F extends NodeField>(id: NodeId, field: F, value: NodeFields[F]): void {
		this.#commit({
			kind: 'node.set',
			stamp: this.#clock.tick(),
			target: id,
			field,
			value
		} as Operation);
	}

	/** Move a node, as one gesture: two operations, so a concurrent resize survives. */
	moveNode(id: NodeId, x: number, y: number): void {
		this.setNode(id, 'x', x);
		this.setNode(id, 'y', y);
	}

	resizeNode(id: NodeId, rect: Rect): void {
		const w = clamp(rect.w, MIN_SIZE, MAX_SIZE);
		const h = clamp(rect.h, MIN_SIZE, MAX_SIZE);

		this.setNode(id, 'x', rect.x);
		this.setNode(id, 'y', rect.y);
		this.setNode(id, 'w', w);
		this.setNode(id, 'h', h);
	}

	addEdge(fields: Partial<EdgeFields> & Pick<EdgeFields, 'from' | 'to'>): EdgeId {
		const stamp = this.#clock.tick();
		const id = stamp as EdgeId;

		this.#commit({
			kind: 'edge.add',
			stamp,
			id,
			fields: { kind: 'sync', fromPort: 'auto', toPort: 'auto', ...fields }
		});

		return id;
	}

	removeEdge(id: EdgeId): void {
		this.#commit({
			kind: 'edge.remove',
			stamp: this.#clock.tick(),
			target: id,
			observed: this.#edges.observedAdds(id)
		});
	}

	setEdge<F extends EdgeField>(id: EdgeId, field: F, value: EdgeFields[F]): void {
		this.#commit({
			kind: 'edge.set',
			stamp: this.#clock.tick(),
			target: id,
			field,
			value
		} as Operation);
	}

	/**
	 * Type `value` into a label at `offset`, one operation per character.
	 *
	 * Each character hangs off the previous one, so a paste is a chain rather than
	 * a fan — which is what makes it survive somebody else typing in the middle of
	 * it while it lands.
	 */
	insertText(target: Stamp, offset: number, value: string): void {
		let after = this.label(target).idBefore(offset);

		for (const character of [...value]) {
			const stamp = this.#clock.tick();
			this.#commit({ kind: 'text.insert', stamp, target, after, value: character });
			after = stamp;
		}
	}

	deleteText(target: Stamp, from: number, to: number): void {
		const chars = this.label(target).idsBetween(from, to);
		if (chars.length === 0) return;

		this.#commit({ kind: 'text.delete', stamp: this.#clock.tick(), target, chars });
	}

	/* ---------------------------------------------------------------- */
	/* Reading the model                                                 */
	/* ---------------------------------------------------------------- */

	label(target: Stamp): RgaText {
		let text = this.#labels.get(target);
		if (!text) {
			text = new RgaText();
			this.#labels.set(target, text);
		}
		return text;
	}

	/** The add stamps behind a node, for building a removal operation elsewhere. */
	observedNodeAdds(id: NodeId): Stamp[] {
		return this.#nodes.observedAdds(id);
	}

	observedEdgeAdds(id: EdgeId): Stamp[] {
		return this.#edges.observedAdds(id);
	}

	/** Every field of a node as plain values — what `restoreNode` needs for undo. */
	nodeFields(id: NodeId): NodeFields | null {
		const view = this.nodes.get(id);
		if (!view) return null;

		return {
			kind: view.kind,
			x: view.x,
			y: view.y,
			w: view.w,
			h: view.h,
			fill: view.fill,
			order: view.order,
			parent: view.parent
		};
	}

	edgeFields(id: EdgeId): EdgeFields | null {
		const view = this.edges.get(id);
		if (!view) return null;

		return {
			from: view.from,
			to: view.to,
			kind: view.kind,
			fromPort: view.fromPort,
			toPort: view.toPort
		};
	}

	/* ---------------------------------------------------------------- */
	/* Model → view                                                      */
	/* ---------------------------------------------------------------- */

	#writeNodeField(id: NodeId, field: NodeField, value: unknown, stamp: Stamp): boolean {
		const fields = this.#nodeFields.get(id) ?? new Map<NodeField, Lww<unknown>>();
		const next = write(fields.get(field), value, stamp);
		if (!next) return false;

		fields.set(field, next);
		this.#nodeFields.set(id, fields);
		return true;
	}

	#writeEdgeField(id: EdgeId, field: EdgeField, value: unknown, stamp: Stamp): boolean {
		const fields = this.#edgeFields.get(id) ?? new Map<EdgeField, Lww<unknown>>();
		const next = write(fields.get(field), value, stamp);
		if (!next) return false;

		fields.set(field, next);
		this.#edgeFields.set(id, fields);
		return true;
	}

	/** Create, delete or fully refresh a node's view to match the model. */
	#reconcileNode(id: NodeId): void {
		const present = this.#nodes.has(id);
		const view = this.nodes.get(id);

		if (!present) {
			if (view) this.nodes.delete(id);
			return;
		}

		const target = view ?? new NodeView(id);
		const fields = this.#nodeFields.get(id);

		if (fields) {
			for (const field of fields.keys()) this.#reconcileNodeField(id, field, target);
		}
		target.label = this.#labels.get(id)?.text() ?? '';

		// Set last: a component that reacts to the map gaining a key should find a
		// fully populated view, not one whose fields arrive a microtask later.
		if (!view) this.nodes.set(id, target);
	}

	#reconcileNodeField(id: NodeId, field: NodeField, into?: NodeView): void {
		const view = into ?? this.nodes.get(id);
		if (!view) return; // A field write for a node that is not present. Kept in the model.

		const winner = this.#nodeFields.get(id)?.get(field);
		if (!winner) return;

		switch (field) {
			case 'kind':
				view.kind = winner.value as NodeKind;
				break;
			case 'x':
				view.x = winner.value as number;
				break;
			case 'y':
				view.y = winner.value as number;
				break;
			case 'w':
				view.w = winner.value as number;
				break;
			case 'h':
				view.h = winner.value as number;
				break;
			case 'fill':
				view.fill = winner.value as Fill;
				break;
			case 'order':
				view.order = winner.value as OrderKey;
				break;
			case 'parent':
				view.parent = winner.value as NodeId | null;
				break;
		}
	}

	#reconcileEdge(id: EdgeId): void {
		const present = this.#edges.has(id);
		const view = this.edges.get(id);

		if (!present) {
			if (view) this.edges.delete(id);
			return;
		}

		const target = view ?? new EdgeView(id);
		const fields = this.#edgeFields.get(id);

		if (fields) {
			for (const field of fields.keys()) this.#reconcileEdgeField(id, field, target);
		}
		target.label = this.#labels.get(id)?.text() ?? '';

		if (!view) this.edges.set(id, target);
	}

	#reconcileEdgeField(id: EdgeId, field: EdgeField, into?: EdgeView): void {
		const view = into ?? this.edges.get(id);
		if (!view) return;

		const winner = this.#edgeFields.get(id)?.get(field);
		if (!winner) return;

		switch (field) {
			case 'from':
				view.from = winner.value as NodeId;
				break;
			case 'to':
				view.to = winner.value as NodeId;
				break;
			case 'kind':
				view.kind = winner.value as EdgeKind;
				break;
			case 'fromPort':
				view.fromPort = winner.value as Port;
				break;
			case 'toPort':
				view.toPort = winner.value as Port;
				break;
		}
	}

	#reconcileLabel(target: Stamp): void {
		const text = this.#labels.get(target)?.text() ?? '';
		const node = this.nodes.get(target as NodeId);
		if (node) {
			node.label = text;
			return;
		}
		const edge = this.edges.get(target as EdgeId);
		if (edge) edge.label = text;
	}

	/* ---------------------------------------------------------------- */
	/* Snapshots                                                         */
	/* ---------------------------------------------------------------- */

	/**
	 * Write the whole document out.
	 *
	 * Deterministic: two replicas holding the same state produce byte-identical
	 * snapshots. That is what makes `expect(a.toSnapshot()).toEqual(b.toSnapshot())`
	 * a meaningful convergence assertion, and what lets the server hash a snapshot
	 * to notice that a client is out of step.
	 */
	toSnapshot(): BoardSnapshot {
		const nodeFields: Record<string, Record<string, EncodedRegister>> = {};
		for (const [id, fields] of this.#nodeFields) {
			nodeFields[id] = Object.fromEntries(
				[...fields].map(([field, register]) => [field, [register.value, register.stamp]] as const)
			);
		}

		const edgeFields: Record<string, Record<string, EncodedRegister>> = {};
		for (const [id, fields] of this.#edgeFields) {
			edgeFields[id] = Object.fromEntries(
				[...fields].map(([field, register]) => [field, [register.value, register.stamp]] as const)
			);
		}

		const labels: BoardSnapshot['labels'] = {};
		for (const [id, text] of this.#labels) labels[id] = text.toJSON();

		return {
			format: 1,
			seen: versionToJSON(this.#version),
			nodes: this.#nodes.toJSON(),
			edges: this.#edges.toJSON(),
			nodeFields,
			edgeFields,
			labels
		};
	}

	/**
	 * Build a document from a snapshot.
	 *
	 * A factory rather than a `load()` method, because loading into a document
	 * that already holds state is a merge, and a merge of two snapshots is not
	 * something this class should quietly pretend to do. Replay the operations if
	 * you want a merge; that is what they are for.
	 */
	static fromSnapshot(
		actor: ActorId,
		snapshot: BoardSnapshot = emptySnapshot(),
		now: () => number = Date.now
	): BoardDocument {
		const document = new BoardDocument(actor, now);

		document.#nodes.merge(OrSet.fromJSON(snapshot.nodes));
		document.#edges.merge(OrSet.fromJSON(snapshot.edges));

		for (const [id, fields] of Object.entries(snapshot.nodeFields)) {
			const map = new Map<NodeField, Lww<unknown>>();
			for (const [field, [value, stamp]] of Object.entries(fields)) {
				map.set(field as NodeField, { value, stamp: stamp as Stamp });
			}
			document.#nodeFields.set(id as NodeId, map);
		}

		for (const [id, fields] of Object.entries(snapshot.edgeFields)) {
			const map = new Map<EdgeField, Lww<unknown>>();
			for (const [field, [value, stamp]] of Object.entries(fields)) {
				map.set(field as EdgeField, { value, stamp: stamp as Stamp });
			}
			document.#edgeFields.set(id as EdgeId, map);
		}

		for (const [id, text] of Object.entries(snapshot.labels)) {
			document.#labels.set(id as Stamp, RgaText.fromJSON(text));
		}

		document.#version = versionFromJSON(snapshot.seen);

		/*
		 * Drag the clock past everything in the snapshot before issuing a single new
		 * stamp.
		 *
		 * Without this, a reload resets the clock to the wall time and this replica
		 * happily reissues stamps it already used — two different characters with
		 * one identity, which the RGA resolves by keeping the first and silently
		 * discarding the second. The symptom is "sometimes my typing does not
		 * appear, but only just after a refresh", which is a genuinely horrible
		 * thing to debug.
		 */
		for (const stamp of Object.values(snapshot.seen)) {
			document.#clock.observe(stamp as Stamp);
		}

		for (const id of document.#nodes.keys()) document.#reconcileNode(id);
		for (const id of document.#edges.keys()) document.#reconcileEdge(id);

		return document;
	}

	/**
	 * Forget history that no replica can still contradict.
	 *
	 * `stable` must be a version vector that **every** replica is known to
	 * dominate — in practice, what the server computes from the cursors its
	 * clients have acknowledged, minus a retention window. Pass a vector that is
	 * ahead of some straggler and their pending operations refer to add-stamps
	 * that no longer exist, which brings deleted elements back.
	 *
	 * Label tombstones are deliberately left alone; see the note at the top of
	 * `snapshot.ts`.
	 *
	 * @returns how many pieces of history were dropped.
	 */
	compact(stable: VersionVector): number {
		let dropped = this.#nodes.compact(stable) + this.#edges.compact(stable);

		for (const id of [...this.#nodeFields.keys()]) {
			if (this.#nodes.history(id).added.size > 0) continue;
			this.#nodeFields.delete(id);
			this.#labels.delete(id);
			dropped += 1;
		}

		for (const id of [...this.#edgeFields.keys()]) {
			if (this.#edges.history(id).added.size > 0) continue;
			this.#edgeFields.delete(id);
			this.#labels.delete(id);
			dropped += 1;
		}

		return dropped;
	}
}

function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value));
}
