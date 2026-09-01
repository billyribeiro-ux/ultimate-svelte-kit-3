/**
 * THE EDITOR
 * ==========
 *
 * Selection, tools and every command a person can invoke. The components render
 * this; they do not contain it. A `Board.svelte` that owned the drag logic would
 * be four hundred lines that can only be tested by clicking.
 *
 * HOW OFTEN A DRAG WRITES TO THE DOCUMENT
 * ---------------------------------------
 * The obvious implementation emits `node.set x` and `node.set y` on every
 * pointermove. At 120Hz on a modern trackpad, dragging five shapes is twelve
 * hundred operations a second, all but the last of which are overwritten by the
 * next one.
 *
 * The other extreme — update a local preview and commit once on release — keeps
 * the log perfectly clean and means collaborators see nothing at all until the
 * drag ends, then a shape teleports. In a tool whose entire premise is watching
 * each other work, that is the wrong trade.
 *
 * So: throttled to `DRAG_HZ`, with a final exact commit on release. Twenty
 * updates a second is smooth enough that nobody can tell it is not continuous,
 * and it is a sixth of the traffic. The intermediate operations are genuinely
 * wasted, and that waste is the price of the feature; compaction collects them
 * later.
 */

import { SvelteSet } from 'svelte/reactivity';
import type { Stamp } from '#lib/crdt/index.ts';
import { between, betweenMany, compareOrder, MIDDLE, type OrderKey } from '#lib/crdt/index.ts';
import {
	bounds,
	contains,
	fromCorners,
	intersects,
	snap,
	type EdgeId,
	type Fill,
	type NodeFields,
	type NodeId,
	type NodeKind,
	type Point,
	type Rect
} from '#lib/board/index.ts';
import type { BoardDocument, NodeView } from '#lib/board/index.ts';
import type { History } from '#lib/history/undo.svelte.ts';
import type { Camera } from './camera.svelte.ts';
import { snapTo, type Guide } from './snapping.ts';

/** The board grid, in board units. Holding Alt suspends it. */
export const GRID = 8;

/** How many document updates a second a drag produces. */
const DRAG_HZ = 20;

export type Tool = 'select' | 'connect' | NodeKind;

interface DragState {
	readonly origin: Point;
	/** Where each dragged node started, so the whole gesture is one undo entry. */
	readonly start: Map<NodeId, Rect>;
	last: number;
}

export class BoardEditor {
	readonly selection = new SvelteSet<Stamp>();

	tool = $state<Tool>('select');

	/** The rubber band, in board coordinates. Replaced wholesale each frame. */
	marquee = $state.raw<Rect | null>(null);
	/** Alignment guides to draw while dragging. */
	guides = $state.raw<readonly Guide[]>([]);
	/** The node a new connection is being dragged from. */
	connectingFrom = $state<NodeId | null>(null);
	connectingTo = $state.raw<Point | null>(null);
	/** The element whose label is being edited in place. */
	editing = $state<Stamp | null>(null);

	#drag: DragState | null = null;
	#marqueeOrigin: Point | null = null;
	#additive = false;

	readonly document: BoardDocument;
	readonly camera: Camera;
	readonly history: History;
	readonly readOnly: boolean;

	constructor(document: BoardDocument, camera: Camera, history: History, readOnly: boolean) {
		this.document = document;
		this.camera = camera;
		this.history = history;
		this.readOnly = readOnly;
	}

	/* ---------------------------------------------------------------- */
	/* Selection                                                         */
	/* ---------------------------------------------------------------- */

	get selectedNodes(): NodeView[] {
		return [...this.selection]
			.map((id) => this.document.nodes.get(id as NodeId))
			.filter((node): node is NodeView => node !== undefined);
	}

	get selectionBounds(): Rect | null {
		return bounds(this.selectedNodes.map((node) => node.rect));
	}

	select(id: Stamp, additive = false): void {
		if (!additive) this.selection.clear();
		if (additive && this.selection.has(id)) this.selection.delete(id);
		else this.selection.add(id);
	}

	selectOnly(ids: Iterable<Stamp>): void {
		this.selection.clear();
		for (const id of ids) this.selection.add(id);
	}

	selectAll(): void {
		this.selectOnly([...this.document.nodes.keys()]);
	}

	clearSelection(): void {
		this.selection.clear();
	}

	/* ---------------------------------------------------------------- */
	/* Creating                                                          */
	/* ---------------------------------------------------------------- */

	/** The order key that puts a new node on top of everything. */
	#topOrder(): OrderKey {
		const painted = this.document.painted();
		const highest = painted.at(-1);
		return highest ? between(highest.order, null) : MIDDLE;
	}

	addNode(kind: NodeKind, at: Point): NodeId | null {
		if (this.readOnly) return null;

		const id = this.document.addNode({
			kind,
			// Centred on the drop point rather than corner-anchored: people aim at
			// where they want the middle of the box, not its top-left pixel.
			x: snap(at.x - 84, GRID),
			y: snap(at.y - 44, GRID),
			order: this.#topOrder()
		});

		this.history.push({
			label: 'add',
			undo: () => this.document.removeNode(id),
			redo: () => {
				const fields = this.document.nodeFields(id);
				if (fields) this.document.restoreNode(id, fields);
			}
		});

		this.selectOnly([id]);
		this.editing = id;
		return id;
	}

	connect(from: NodeId, to: NodeId): EdgeId | null {
		if (this.readOnly || from === to) return null;

		const id = this.document.addEdge({ from, to });
		this.history.push({
			label: 'connect',
			undo: () => this.document.removeEdge(id),
			redo: () => {
				const fields = this.document.edgeFields(id);
				if (fields) this.document.addEdge(fields);
			}
		});
		return id;
	}

	/* ---------------------------------------------------------------- */
	/* Dragging                                                          */
	/* ---------------------------------------------------------------- */

	beginDrag(origin: Point): void {
		if (this.readOnly || this.selection.size === 0) return;

		const start = new Map<NodeId, Rect>();
		for (const node of this.selectedNodes) start.set(node.id, node.rect);

		this.#drag = { origin, start, last: 0 };
	}

	get dragging(): boolean {
		return this.#drag !== null;
	}

	/**
	 * @param free hold Alt to ignore the grid and the alignment guides.
	 */
	updateDrag(current: Point, free = false): void {
		const drag = this.#drag;
		if (!drag) return;

		let dx = current.x - drag.origin.x;
		let dy = current.y - drag.origin.y;

		if (!free) {
			const moving = bounds([...drag.start.values()]);
			if (moving) {
				const proposed = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h };
				const others = this.document
					.painted()
					.filter((node) => !drag.start.has(node.id))
					.map((node) => node.rect);

				const result = snapTo(proposed, others, this.camera.scale);
				this.guides = result.guides;

				/*
				 * Snapping wins over the grid.
				 *
				 * Applying both means a shape that has clicked onto a neighbour's edge is
				 * then rounded off it again, so it sits one or two units out and the
				 * guide is still showing. Alignment to another shape is what the person
				 * asked for; the grid is the fallback when nothing is nearby.
				 */
				if (result.dx !== 0 || result.dy !== 0) {
					dx += result.dx;
					dy += result.dy;
				} else {
					const anchor = [...drag.start.values()][0];
					if (anchor) {
						dx += snap(anchor.x + dx, GRID) - (anchor.x + dx);
						dy += snap(anchor.y + dy, GRID) - (anchor.y + dy);
					}
				}
			}
		} else {
			this.guides = [];
		}

		// Throttled. See the note at the top of the file.
		const now = performance.now();
		if (now - drag.last < 1000 / DRAG_HZ) return;
		drag.last = now;

		this.#applyDrag(drag, dx, dy);
	}

	endDrag(current: Point, free = false): void {
		const drag = this.#drag;
		this.#drag = null;
		this.guides = [];
		if (!drag) return;

		let dx = current.x - drag.origin.x;
		let dy = current.y - drag.origin.y;

		if (!free) {
			const anchor = [...drag.start.values()][0];
			if (anchor) {
				dx += snap(anchor.x + dx, GRID) - (anchor.x + dx);
				dy += snap(anchor.y + dy, GRID) - (anchor.y + dy);
			}
		}

		// The exact final position, whatever the throttle last managed to send.
		this.#applyDrag(drag, dx, dy);

		if (dx === 0 && dy === 0) return;

		const start = drag.start;
		this.history.push({
			label: 'move',
			undo: () => {
				for (const [id, rect] of start) this.document.moveNode(id, rect.x, rect.y);
			},
			redo: () => {
				for (const [id, rect] of start) this.document.moveNode(id, rect.x + dx, rect.y + dy);
			}
		});
	}

	#applyDrag(drag: DragState, dx: number, dy: number): void {
		for (const [id, rect] of drag.start) {
			this.document.moveNode(id, rect.x + dx, rect.y + dy);
		}
	}

	/* ---------------------------------------------------------------- */
	/* The marquee                                                       */
	/* ---------------------------------------------------------------- */

	beginMarquee(origin: Point, additive: boolean): void {
		this.#marqueeOrigin = origin;
		this.#additive = additive;
		if (!additive) this.clearSelection();
	}

	updateMarquee(current: Point): void {
		if (!this.#marqueeOrigin) return;

		const rect = fromCorners(this.#marqueeOrigin, current);
		this.marquee = rect;

		const inside = this.document
			.painted()
			.filter((node) => intersects(rect, node.rect))
			.map((node) => node.id);

		/*
		 * Recomputed from scratch on every move rather than added to incrementally.
		 *
		 * A shape that the band has passed over and then retreated from must become
		 * unselected again, and tracking that with adds and removes means holding a
		 * second copy of "what was selected before the drag" anyway. This way the
		 * selection is a pure function of the rectangle.
		 */
		if (this.#additive) {
			for (const id of inside) this.selection.add(id);
		} else {
			this.selectOnly(inside);
		}
	}

	endMarquee(): void {
		this.#marqueeOrigin = null;
		this.marquee = null;
	}

	/** Which node is under a board point, topmost first. */
	hitTest(point: Point): NodeView | null {
		const painted = this.document.painted();
		for (let i = painted.length - 1; i >= 0; i -= 1) {
			const node = painted[i]!;
			if (contains(node.rect, point)) return node;
		}
		return null;
	}

	/* ---------------------------------------------------------------- */
	/* Commands                                                          */
	/* ---------------------------------------------------------------- */

	nudge(dx: number, dy: number): void {
		if (this.readOnly || this.selection.size === 0) return;

		const start = new Map<NodeId, Rect>();
		for (const node of this.selectedNodes) start.set(node.id, node.rect);

		for (const [id, rect] of start) this.document.moveNode(id, rect.x + dx, rect.y + dy);

		this.history.push({
			label: 'move',
			undo: () => {
				for (const [id, rect] of start) this.document.moveNode(id, rect.x, rect.y);
			},
			redo: () => {
				for (const [id, rect] of start) this.document.moveNode(id, rect.x + dx, rect.y + dy);
			}
		});
	}

	deleteSelection(): void {
		if (this.readOnly || this.selection.size === 0) return;

		/*
		 * Capture everything needed to put it back *before* deleting it.
		 *
		 * Including the edges, which `removeNode` also deletes as a side effect. An
		 * undo that restores the shapes and not the arrows between them is worse
		 * than no undo at all, because it looks like it worked.
		 */
		const nodes = this.selectedNodes.map((node) => ({
			id: node.id,
			fields: this.document.nodeFields(node.id)!,
			label: this.document.label(node.id).text()
		}));

		const edges = [...this.document.edges.values()]
			.filter((edge) => this.selection.has(edge.from) || this.selection.has(edge.to))
			.map((edge) => ({ fields: this.document.edgeFields(edge.id)! }));

		for (const { id } of nodes) this.document.removeNode(id);
		this.clearSelection();

		this.history.push({
			label: 'delete',
			undo: () => {
				for (const { id, fields, label } of nodes) {
					this.document.restoreNode(id, fields);
					if (label) this.document.insertText(id, 0, label);
				}
				for (const { fields } of edges) this.document.addEdge(fields);
			},
			redo: () => {
				for (const { id } of nodes) this.document.removeNode(id);
			}
		});
	}

	duplicateSelection(): void {
		if (this.readOnly || this.selection.size === 0) return;

		const originals = this.selectedNodes;
		const keys = betweenMany(this.#topOrder(), null, originals.length);
		const created: NodeId[] = [];

		for (const [index, node] of originals.entries()) {
			const id = this.document.addNode({
				kind: node.kind,
				x: node.x + GRID * 3,
				y: node.y + GRID * 3,
				w: node.w,
				h: node.h,
				fill: node.fill,
				parent: node.parent,
				order: keys[index] ?? this.#topOrder()
			});
			const label = this.document.label(node.id).text();
			if (label) this.document.insertText(id, 0, label);
			created.push(id);
		}

		this.selectOnly(created);

		this.history.push({
			label: 'duplicate',
			undo: () => {
				for (const id of created) this.document.removeNode(id);
			},
			redo: () => {
				for (const id of created) {
					const fields = this.document.nodeFields(id);
					if (fields) this.document.restoreNode(id, fields);
				}
			}
		});
	}

	setFill(fill: Fill): void {
		if (this.readOnly) return;

		const before = this.selectedNodes.map((node) => ({ id: node.id, fill: node.fill }));
		for (const { id } of before) this.document.setNode(id, 'fill', fill);

		this.history.push({
			label: 'colour',
			undo: () => {
				for (const entry of before) this.document.setNode(entry.id, 'fill', entry.fill);
			},
			redo: () => {
				for (const entry of before) this.document.setNode(entry.id, 'fill', fill);
			}
		});
	}

	/**
	 * Restack the selection.
	 *
	 * One field write per shape, whatever the board's size — that is what the
	 * fractional index buys. With integer z-orders this would renumber everything
	 * above the moved shape and conflict with anybody else's restacking.
	 */
	restack(direction: 'forward' | 'backward'): void {
		if (this.readOnly || this.selection.size === 0) return;

		const painted = this.document.painted();
		const before = this.selectedNodes.map((node) => ({ id: node.id, order: node.order }));

		for (const node of this.selectedNodes) {
			const index = painted.findIndex((candidate) => candidate.id === node.id);
			if (index < 0) continue;

			const [low, high] =
				direction === 'forward'
					? [painted[index + 1], painted[index + 2]]
					: [painted[index - 2], painted[index - 1]];

			// At the end of the stack already: nothing to swap with.
			if (direction === 'forward' && !low) continue;
			if (direction === 'backward' && !high) continue;

			this.document.setNode(node.id, 'order', between(low?.order ?? null, high?.order ?? null));
		}

		const after = this.selectedNodes.map((node) => ({ id: node.id, order: node.order }));

		this.history.push({
			label: direction === 'forward' ? 'bring forward' : 'send backward',
			undo: () => {
				for (const entry of before) this.document.setNode(entry.id, 'order', entry.order);
			},
			redo: () => {
				for (const entry of after) this.document.setNode(entry.id, 'order', entry.order);
			}
		});
	}

	/** Frame everything, or the selection if there is one. */
	fit(): void {
		const target = this.selectionBounds ?? bounds(this.document.painted().map((node) => node.rect));
		if (target) void this.camera.fit(target);
	}

	/** The node ids in a stable order, for the keyboard outline and Tab cycling. */
	get ordered(): NodeView[] {
		return this.document
			.painted()
			.slice()
			.sort((a, b) => compareOrder({ key: a.order, id: a.id }, { key: b.order, id: b.id }));
	}

	/** Fields for a brand new node of a given kind, used by the outline's add button. */
	defaultsFor(
		kind: NodeKind,
		at: Point
	): Partial<NodeFields> & Pick<NodeFields, 'x' | 'y' | 'order'> {
		return { kind, x: snap(at.x, GRID), y: snap(at.y, GRID), order: this.#topOrder() };
	}
}
