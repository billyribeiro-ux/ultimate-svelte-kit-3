/**
 * PART 3 — The board: an algebra of eight operations, and the projection
 * (chapters 13–16)
 *
 * The CRDT knows about stamps and sets. This part teaches it what a diagram is,
 * and — for the first time in the course — introduces Svelte. The interesting
 * decision in it is that the two are kept apart: the model is not reactive, the
 * projection is, and one function keeps them in step.
 */

export const part3 = [
	{
		slug: 'eight-operations',
		title: 'Eight operations, and nothing else',
		summary:
			'The vocabulary of a board, the operation algebra every change goes through, and why validation matters more in a CRDT than anywhere else.',
		goal: 'Define every possible change to a document as one of eight validated operations.',
		blocks: [
			{
				type: 'p',
				text: 'Tessera draws system diagrams. Not "shapes" — the vocabulary is deliberately narrow, because a tool that can draw anything makes every diagram look different, and a tool with six nouns makes them all comparable.'
			},
			{
				type: 'code',
				file: 'src/lib/board/types.ts',
				lang: 'ts',
				code: `
/**
 * WHAT A BOARD IS
 * ===============
 *
 * Tessera draws system diagrams: boxes that are services, cylinders that are
 * datastores, arrows that are calls. Not "shapes" — the vocabulary is
 * deliberately narrow, because a tool that can draw anything makes every
 * diagram look different and a tool with six nouns makes them all comparable.
 *
 * Ids are \`Stamp\`s from the CRDT clock, which means an element's identity *is*
 * the moment it was created, by whom. Two replicas offline in a tunnel cannot
 * collide, no server round trip is needed to mint one, and sorting elements by
 * id sorts them by age. A UUID would do the first two and none of the rest.
 */

import type { Stamp } from '#lib/crdt/index.ts';

export type NodeId = Stamp;
export type EdgeId = Stamp;

/**
 * The six things a node can be.
 *
 * \`group\` is the odd one out: it has no meaning of its own, it is a frame that
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
 * A board stores \`'jade'\`, and what jade *is* depends on the theme the viewer is
 * using. Storing \`#1f9d76\` would freeze one person's light-mode palette into the
 * document and make it unreadable for everybody in dark mode — a mistake that is
 * invisible until somebody with different settings opens a board and finds it
 * illegible.
 */
export const FILLS = ['slate', 'indigo', 'jade', 'amber', 'rose', 'cyan'] as const;
export type Fill = (typeof FILLS)[number];

/** Which side of a node an edge leaves from. \`auto\` picks the nearest. */
export const PORTS = ['auto', 'top', 'right', 'bottom', 'left'] as const;
export type Port = (typeof PORTS)[number];
`
			},
			{
				type: 'why',
				title: 'Ids are stamps, and that is a design decision',
				text: 'An element’s identity **is** the moment it was created, by whom. Two replicas offline in a tunnel cannot collide. No round trip is needed to mint one. Sorting by id sorts by age, for free. A UUID gives you the first two and none of the rest — and, crucially, a UUID cannot be compared with an operation stamp, so you would need both.'
			},
			{
				type: 'warn',
				text: 'Colour by name, never by hex. A board stores `\'jade\'`, and what jade *is* depends on the viewer’s theme. Store `#1f9d76` and you have frozen one person’s light-mode palette into the document, making it illegible for everybody in dark mode. This is invisible until somebody with different settings opens the board.'
			},
			{
				type: 'code',
				file: 'src/lib/board/types.ts',
				lang: 'ts',
				code: `
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

/** Every scalar field of a node that a \`node.set\` operation can write. */
export interface NodeFields {
	readonly kind: NodeKind;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly fill: Fill;
	/** Fractional index — stacking order. See \`crdt/fracdex.ts\`. */
	readonly order: string;
	/** The group this node sits inside, or \`null\` for the top level. */
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
} as const satisfies Partial<NodeFields>;`
			},
			{
				type: 'p',
				text: '`MIN_SIZE` is enforced when *resizing*, not when rendering. A node dragged to zero would be present in the document, invisible, and impossible to select — the classic way a shape is lost forever in a canvas tool.'
			},

			{ type: 'h3', id: 'the-algebra', text: 'The algebra' },
			{
				type: 'code',
				file: 'src/lib/board/ops.ts',
				lang: 'ts',
				code: `
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
 * \`node.add\` carries both a \`stamp\` and an \`id\`, which looks redundant, since a
 * node's id is the stamp of the operation that created it.
 *
 * It is redundant exactly once — the first time. Undoing a delete re-adds the
 * same node: same \`id\`, because it is the same node and everything pointing at
 * it must keep pointing at it; new \`stamp\`, because it is a new event that no
 * existing removal can have observed, which is what makes the node come back.
 * Collapse the two fields and undo of a delete becomes impossible to express.
 *
 * ONE FIELD PER OPERATION
 * -----------------------
 * \`node.set\` writes a single field. Dragging a box emits an \`x\` and a \`y\`, not
 * one \`{x, y}\`. It costs a few more bytes and it buys the merge that people
 * expect: if you resize a box while I recolour it, both survive. Bundling
 * fields makes the whole bundle last-write-wins, and somebody's work vanishes
 * for no reason they can see.
 *
 * VALIDATION IS NOT OPTIONAL
 * --------------------------
 * These schemas run on the server against every operation from every client.
 * A CRDT converges on whatever it is given, including nonsense: \`w: -1e9\`
 * converges perfectly and makes the board unusable for everybody, permanently,
 * with no way to select the shape and fix it. "It's collaborative" is not a
 * reason to trust input; it is a reason to distrust it more, because a bad
 * operation propagates.
 */`
			},
			{
				type: 'p',
				text: 'Read the first paragraph again, because it is a strong claim and it is what makes the rest of the system tractable. **Nothing else can modify a document.** Sync ships operations. History replays operations. Undo emits inverse operations. The permission check is a function from an operation to yes or no. Every one of those is simple because there is exactly one way in.'
			},
			{
				type: 'code',
				file: 'src/lib/board/ops.ts',
				lang: 'ts',
				code: `
/**
 * A \`node.set\` for each field, as a union.
 *
 * The mapped type distributes over the field names, so \`field: 'x'\` narrows
 * \`value\` to \`number\` and \`field: 'fill'\` narrows it to \`Fill\`. Writing this as
 * \`{ field: NodeField; value: unknown }\` would compile and would move every
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
			 * The add stamps this removal observed. See \`crdt/orset.ts\`.
			 *
			 * A plain array, not \`readonly Stamp[]\`, and this is a boundary decision
			 * rather than an oversight. valibot infers \`Stamp[]\` for the wire type, and
			 * \`readonly Stamp[]\` is not assignable to it — so a \`readonly\` here makes
			 * every call that sends an operation to the server need a cast. The
			 * properties are still \`readonly\`, which is what stops an operation being
			 * edited after it is created; only the array's own mutability is given up,
			 * and nothing in the codebase mutates one.
			 */
			readonly observed: Stamp[];
	  }`
			},
			{
				type: 'p',
				text: 'The mapped type is worth pausing on. It distributes over the field names, so `field: \'x\'` narrows `value` to `number` and `field: \'fill\'` narrows it to `Fill`. Writing it as `{ field: NodeField; value: unknown }` would compile fine and move every mistake to runtime.'
			},
			{
				type: 'why',
				title: 'Two ids on one operation',
				text: '`node.add` carries both a `stamp` and an `id`, which looks redundant — a node’s id *is* the stamp of the operation that created it. It is redundant exactly once: the first time. Undoing a delete re-adds the same node with the **same id**, because everything pointing at it must keep pointing at it, and a **new stamp**, because it must be an event no existing removal has observed. That is what makes it come back (chapter 09). Collapse the two fields and undo of a delete becomes inexpressible.'
			},

			{ type: 'h3', id: 'validation', text: 'Why validation matters more here' },
			{
				type: 'warn',
				text: 'A CRDT converges on whatever it is given, **including nonsense**. `w: -1e9` converges perfectly and makes the board unusable for everybody, permanently, with no way to select the shape and fix it. "It’s collaborative" is not a reason to trust input; it is a reason to distrust it more, because a bad operation *propagates*.'
			},
			{
				type: 'code',
				file: 'src/lib/board/ops.ts',
				lang: 'ts',
				code: `
/** 13 digits of milliseconds, 5 of counter, 8 of actor. See \`crdt/clock.ts\`. */
const stamp = v.pipe(
	v.string(),
	v.regex(/^\\d{18}[0-9a-z]{8}$/, 'Not a stamp'),
	v.transform((value) => value as Stamp)
);

/**
 * A coordinate.
 *
 * Finite, because \`Infinity\` and \`NaN\` both survive JSON round-trips as \`null\`
 * in some encoders and as themselves in others, and a node at \`NaN\` disappears
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
);`
			},
			{
				type: 'p',
				text: 'Each of those schemas encodes a failure somebody could otherwise cause. `v.finite()` because `NaN` survives a JSON round trip as `null` in some encoders and as itself in others, and a node at `NaN` vanishes from the render *and* from every hit test — present, invisible, unselectable. The coordinate bound is generous rather than tight, and exists to keep numbers in a range where floating-point arithmetic is still exact enough for snapping.'
			},
			{
				type: 'code',
				file: 'src/lib/board/ops.ts',
				lang: 'ts',
				code: `
/**
 * One character.
 *
 * \`[...value].length === 1\` rather than \`value.length === 1\`, so an emoji is one
 * character and a lone surrogate half is none. A surrogate half stored as its
 * own CRDT item lets a concurrent insertion land between the halves, and the
 * label renders as a replacement glyph on every replica from then on.
 */
const character = v.pipe(
	v.string(),
	v.check((value) => [...value].length === 1, 'Expected exactly one character')
);`
			},
			{
				type: 'p',
				text: 'The emoji trap again, this time at the boundary: `[...value].length === 1`, so a lone surrogate half is *zero* characters and gets rejected before it can be stored as its own CRDT item.'
			},
			{
				type: 'code',
				file: 'src/lib/board/ops.ts',
				lang: 'ts',
				code: `
/**
 * How many add-stamps a single removal may name.
 *
 * Unbounded, a client could send a removal naming a million stamps and make the
 * server allocate them. The real number is the count of concurrent re-creations
 * of one element, which is never more than the number of collaborators.
 */
const OBSERVED_LIMIT = 256;

/** How many characters one \`text.delete\` may tombstone — a select-all of a label. */
const CHARS_LIMIT = 4096;

const observed = v.pipe(v.array(stamp), v.maxLength(OBSERVED_LIMIT));

export const OperationSchema = v.variant('kind', [
	v.object({ kind: v.literal('node.add'), stamp, id: stamp, fields: nodeFields }),
	v.object({ kind: v.literal('node.remove'), stamp, target: stamp, observed }),

	/*
	 * \`node.set\` is a variant *within* a variant: one entry per field, so the
	 * value is validated against that field's own rules. A single
	 * \`{ field: string, value: unknown }\` schema would accept \`x: 'left'\` and
	 * \`fill: -3\`, and a CRDT converges on those just as reliably as on good data.
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
		value: coordinate`
			},
			{
				type: 'p',
				text: '`node.set` is a variant *within* a variant — one schema entry per field, so each value is checked against that field’s own rules. A single `{ field: string, value: unknown }` would accept `x: \'left\'` and `fill: -3`, and the CRDT would converge on those just as reliably as on good data.'
			},
			{
				type: 'note',
				text: 'The three limits — `OBSERVED_LIMIT` at 256, `CHARS_LIMIT` at 4096, `BATCH_LIMIT` at 512 — each have a comment explaining what the real number is and what an attacker gets without the bound. That is the right way to write a limit: not a round number, but the largest legitimate case with a note about it.'
			},

			{ type: 'h3', id: 'classification', text: 'Classifying an operation' },
			{
				type: 'code',
				file: 'src/lib/board/ops.ts',
				lang: 'ts',
				code: `
/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/**
 * The element an operation acts on.
 *
 * Used by undo (to group operations that belong to one gesture) and by the
 * permission layer (to answer "may this person touch this element?"). Written as
 * an exhaustive switch so that adding a ninth operation is a type error here
 * rather than a silent \`undefined\` in an authorisation check.
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

/** Does this operation create an element? Creation is the one thing a \`commenter\` may never do. */
export function isCreation(operation: Operation): boolean {
	return operation.kind === 'node.add' || operation.kind === 'edge.add';
}

/** Does this operation destroy one? */
export function isRemoval(operation: Operation): boolean {
	return operation.kind === 'node.remove' || operation.kind === 'edge.remove';
}`
			},
			{
				type: 'p',
				text: 'An exhaustive switch with no `default`, so adding a ninth operation is a **type error here** rather than a silent `undefined` in an authorisation check. That is not stylistic. `targetOf` is used by the permission layer to answer "may this person touch this element?", and a new operation kind falling through to `undefined` is a permission bypass.'
			},

			{
				type: 'checkpoint',
				items: [
					'Every change to a board is one of eight operations, and you can name them.',
					'You can explain why `node.add` needs both `stamp` and `id`.',
					'You can say why input validation is *more* important in a CRDT than in a request/response app.'
				]
			}
		]
	},

	{
		slug: 'the-reactive-document',
		title: 'The model and the projection',
		summary:
			'Two representations of one board, why they are not collapsed into one, and the listener bug that made undo work perfectly while nothing reached the network.',
		goal: 'Understand the split between an unreactive CRDT and the `$state` objects components render from.',
		blocks: [
			{
				type: 'p',
				text: 'This is where Svelte finally appears, and the first decision is to keep most of the project away from it.'
			},
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
/**
 * THE REACTIVE DOCUMENT
 * =====================
 *
 * Two representations of the same board, kept in step by one function.
 *
 *   the CRDT      plain objects and Maps. Correct under any delivery order,
 *                 mergeable, serialisable, and completely unaware of Svelte.
 *   the views     \`$state\` objects the components render from.
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
 * component wants \`node.x === 240\`. The CRDT holds "a last-write-wins register
 * whose current winner is 240, and here are the two losing writes". Rendering
 * from the model would put merge semantics into the markup.
 *
 * So: \`apply()\` mutates the model, works out what actually changed, and writes
 * that much into the views. One node moving invalidates one number.`
			},
			{
				type: 'why',
				title: 'The temptation, and the two reasons to resist it',
				text: 'Making the CRDT itself reactive and rendering straight off it is genuinely tempting — one representation, no synchronisation code. The first cost is performance: deep reactivity over a CRDT means a proxy around every tombstone, every add-stamp, every character of every label, and dragging one node touches structures no component reads. The second cost is worse: the CRDT’s internals are not what a component wants. A component wants `node.x === 240`. The CRDT holds "a register whose current winner is 240, and here are the two losing writes". Rendering from the model puts merge semantics into the markup.'
			},

			{ type: 'h3', id: 'the-views', text: 'The views' },
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
/**
 * One node, as the renderer sees it.
 *
 * Every field is its own signal. That granularity is the point: a drag writes
 * \`x\` and \`y\` sixty times a second, and nothing that reads only \`fill\` should
 * re-run because of it.
 */
export class NodeView {
	kind = $state<NodeKind>('service');
	x = $state(0);
	y = $state(0);
	/*
	 * Annotated \`<number>\` rather than inferred.
	 *
	 * \`NODE_DEFAULTS\` is \`as const\`, so the inferred type of \`$state(168)\` is the
	 * literal \`168\` and the first resize is a type error complaining that \`number\`
	 * is not assignable to \`168\`. Widening at the declaration is the fix; removing
	 * \`as const\` would lose the literal types the operation schemas depend on.
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
}`
			},
			{
				type: 'p',
				text: 'Every field is its own signal. That granularity is the whole point: a drag writes `x` and `y` sixty times a second, and nothing that reads only `fill` should re-run because of it.'
			},
			{
				type: 'note',
				text: 'The `$state<number>(NODE_DEFAULTS.w)` annotation is a small, real papercut worth knowing. `NODE_DEFAULTS` is `as const`, so the *inferred* type of `$state(168)` is the literal `168`, and the first resize is a type error saying `number` is not assignable to `168`. Widening at the declaration is the fix; removing `as const` would lose the literal types the operation schemas depend on.'
			},

			{ type: 'h3', id: 'the-fields', text: 'The document’s fields' },
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
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
	}`
			},
			{
				type: 'warn',
				text: 'That listener set is a bug fixed. It held **one function** at first. Two things subscribe — the sync engine, which queues operations for the server, and the history stack, which records them for undo — so whichever subscribed second silently replaced the first. The symptom was undo working perfectly and nothing ever reaching the network. A `Set` costs nothing and makes the bug unrepresentable.'
			},
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
/**
 * Nodes in painting order: bottom first.
 *
 * Never sorts on \`order\` alone — two replicas can mint the same fractional
 * index concurrently, and \`Array#sort\` is only required to be stable, not to
 * agree between engines. \`compareOrder\` breaks the tie with the id.
 */
painted(): NodeView[] {
	return [...this.nodes.values()].sort((a, b) =>
		compareOrder({ key: a.order, id: a.id }, { key: b.order, id: b.id })
	);
}

/* ---------------------------------------------------------------- */
/* Applying                                                          */
/* ---------------------------------------------------------------- */`
			},
			{
				type: 'p',
				text: 'And there is `compareOrder` from chapter 08, at the one place that matters: painting order. Never `order` alone.'
			},

			{ type: 'h3', id: 'apply', text: 'One way in' },
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
/**
 * Apply an operation from anywhere — this replica, the network, a replay.
 *
 * Safe in any order, any number of times. There is no "have I seen this?"
 * check: every structure underneath is idempotent, and the fast path that
 * looked like a free win silently dropped operations that arrived out of
 * order. See \`crdt/version.ts\`.
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
		}`
			},
			{
				type: 'p',
				text: 'The shape of every branch is the same: mutate the model, get back a boolean saying whether anything actually changed, and only then touch the projection. `write()` returning `undefined` from chapter 10 is what makes that boolean cheap and honest.'
			},
			{
				type: 'p',
				text: 'Note the `node.add` branch seeds every register from the creating operation, stamped with it — so a concurrent edit made *before* this add arrived still wins if its stamp is later. That is a one-line detail that decides whether "I renamed a box while it was still syncing" works.'
			},
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'p',
				text: 'The operation’s stamp *is* the character’s identity. One stamp, two jobs, and no way for them to disagree — the payoff from making stamps unique in chapter 06.'
			},

			{ type: 'h3', id: 'commit', text: 'Local first, in four lines' },
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'p',
				text: 'That is the entire architecture of chapter 02, expressed as four lines and an ordering. Apply, then notify. The screen updates synchronously, in the same frame as the input event. The network is told afterwards and is allowed to take as long as it likes, including forever.'
			},

			{ type: 'h3', id: 'commands', text: 'The commands' },
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'warn',
				text: '`removeNode` removes edges **incident to** the node, not just selected ones. Leave them and you get an edge pointing at nothing: it renders as an arrow to the origin, or not at all, and it survives every subsequent merge because nothing else has any reason to remove it. Dangling references are forever in an append-only system.'
			},
			{
				type: 'p',
				text: 'And `moveNode` is two operations rather than one. Two extra stamps, fifty-two bytes, and a concurrent resize survives your drag. That is chapter 10’s per-field rule, cashed in.'
			},
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
/**
 * Type \`value\` into a label at \`offset\`, one operation per character.
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
}`
			},
			{
				type: 'p',
				text: 'Each character hangs off the previous one, so a paste is a **chain** rather than a fan. That is what makes it survive somebody typing in the middle of it while it lands.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can explain why the CRDT is not reactive and the projection is.',
					'You can point at the four lines that make the application local-first.',
					'You can say why a move is two operations and a delete is several.'
				]
			}
		]
	},

	{
		slug: 'reconciliation',
		title: 'Keeping the projection honest',
		summary:
			'Model to view: writing the smallest possible amount into `$state`, and the ordering detail that stops a half-built node reaching a component.',
		goal: 'Update one number in the interface when one number changes in the model.',
		blocks: [
			{
				type: 'p',
				text: 'The model changed. Now the projection has to match it, and the goal is to write as little as possible — because every `$state` write schedules work, and a drag produces a hundred and twenty of them a second.'
			},
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'p',
				text: 'Three cases in `#reconcileNode`, and they are the three things that can happen to an element: it is gone (delete the view), it is new (build one), or it exists (refresh it).'
			},
			{
				type: 'warn',
				text: 'Look at the last two lines. The view is populated **before** it is put into the map. A component reacting to `nodes` gaining a key must find a fully populated view — not one whose fields arrive a microtask later. Put the `set` first and you get a frame where every new node renders at the origin with default size, which reads as a flicker and is very hard to attribute.'
			},
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
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
	}`
			},
			{
				type: 'p',
				text: 'A long switch that could have been `view[field] = winner.value`. It is written out because the one-liner needs a cast to `any` to compile — the union of field names does not distribute over the view’s property types on its own — and an `any` in the one function that writes every field of every element is exactly the wrong place to put one. Twenty tedious lines, checked by the compiler.'
			},
			{
				type: 'p',
				text: 'Also note the early return: `if (!view) return;` — *a field write for a node that is not present*. That is not an error. An operation can legitimately arrive for a node whose `add` has not shown up yet, or for one that has been deleted. The write goes into the model and the projection simply has nothing to update. When the add arrives, `#reconcileNode` reads every field it finds and the node appears complete.'
			},

			{ type: 'h3', id: 'batching', text: 'Applying a batch' },
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
/** Apply many, reconciling once per element rather than once per operation. */
applyAll(operations: Iterable<Operation>): ApplyResult {
	let changed = false;
	for (const operation of operations) {
		changed = this.apply(operation).changed || changed;
	}
	return { changed };
}`
			},
			{
				type: 'note',
				text: 'Svelte 5 batches signal writes within a microtask, so a catch-up of thirty thousand operations produces one render rather than thirty thousand — without any explicit batching in this code. It is worth knowing that is *why* this loop is allowed to be naive, rather than assuming it is fine.'
			},

			{
				type: 'checkpoint',
				items: [
					'One field changing in the model writes exactly one signal.',
					'A new view is fully populated before it enters the reactive map.',
					'You can explain why a field write for an absent element is not an error.'
				]
			}
		]
	},

	{
		slug: 'snapshots-and-compaction',
		title: 'Snapshots, and what may never be forgotten',
		summary:
			'Writing a document out deterministically, the clock bug that only appeared after a refresh, and the tombstones that can never be collected.',
		goal: 'Open a board without replaying its whole history, and know exactly which history is safe to drop.',
		blocks: [
			{
				type: 'p',
				text: 'A board is defined by its operations, and a busy board accumulates a great many: one per keystroke, two per frame of a drag. Replaying a year of that to open a document is not a plan.'
			},
			{
				type: 'code',
				file: 'src/lib/board/snapshot.ts',
				lang: 'ts',
				code: `
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
 */`
			},
			{
				type: 'why',
				title: 'The tombstones that can never be collected',
				text: 'Deleted **nodes** can go once every replica has seen the deletion: membership is computed from add- and remove-stamps, so with both gone the element cannot come back and nothing can refer to it. Deleted **characters** cannot. It is perfectly legal to type after a character somebody else has deleted — you had not seen the deletion when you started — so a tombstone is still a valid anchor for an operation *that has not been created yet*. There is no version vector that makes dropping it safe, because safety would require knowing what nobody will do in the future. So Tessera does not compact label tombstones, and that is a trade rather than an oversight: the cost is bounded by how much has ever been typed into labels, which for a diagram is kilobytes.'
			},
			{
				type: 'code',
				file: 'src/lib/board/snapshot.ts',
				lang: 'ts',
				code: `
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
	readonly labels: Record<string, RgaSnapshot>;`
			},
			{
				type: 'p',
				text: '`format: 1`, present from the first release and checked on every load. A snapshot outlives the code that wrote it — it sits in a browser’s IndexedDB across upgrades — so this is the difference between a future model change being a migration and it being a support ticket that says "my board is blank".'
			},
			{
				type: 'code',
				file: 'src/lib/board/snapshot.ts',
				lang: 'ts',
				code: `
/**
 * The envelope, validated. The *contents* are not re-validated field by field.
 *
 * Every value in here entered the system through \`parseOperation\`, which checked
 * it against the same rules the editor enforces, and a snapshot can hold tens of
 * thousands of registers. Re-running those schemas on load would cost real time
 * at exactly the moment a person is waiting to see their board.
 *
 * The line is drawn where trust changes hands: operations arrive from clients
 * and are checked; snapshots are written by this code from already-checked
 * operations, and only the shape is confirmed.
 */
export const BoardSnapshotSchema = v.object({`
			},
			{
				type: 'note',
				text: 'The line is drawn where trust changes hands. Operations arrive from clients and are checked field by field. Snapshots are written by this code *from already-checked operations*, so only the envelope’s shape is confirmed. Re-running every schema on a snapshot with tens of thousands of registers would cost real time at exactly the moment a person is waiting to see their board.'
			},

			{ type: 'h3', id: 'deterministic', text: 'Deterministic output' },
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
/**
 * Write the whole document out.
 *
 * Deterministic: two replicas holding the same state produce byte-identical
 * snapshots. That is what makes \`expect(a.toSnapshot()).toEqual(b.toSnapshot())\`
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
}`
			},
			{
				type: 'p',
				text: 'Two replicas holding the same state produce **byte-identical** snapshots — which is what makes `expect(a.toSnapshot()).toEqual(b.toSnapshot())` a meaningful convergence assertion, and what lets the server hash a snapshot to notice a client is out of step. The sorting inside `OrSet#toJSON` from chapter 09 is what pays for that here.'
			},

			{ type: 'h3', id: 'restore', text: 'Loading one back, and a bug that needed a refresh to see' },
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
/**
 * Build a document from a snapshot.
 *
 * A factory rather than a \`load()\` method, because loading into a document
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
`
			},
			{
				type: 'p',
				text: 'A **factory**, not a `load()` method. Loading into a document that already holds state is a merge, and a merge of two snapshots is not something this class should quietly pretend to do. Replay the operations if you want a merge; that is what they are for.'
			},
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'warn',
				text: 'This is the sort of bug worth remembering the *shape* of. Without those two lines, a reload resets the clock to the current wall time, and the replica happily reissues stamps it has already used. Two different characters end up with one identity, which the RGA resolves by keeping the first and silently discarding the second. The symptom is "sometimes my typing does not appear, but only just after a refresh" — intermittent, unreproducible on demand, and nowhere near the code at fault.'
			},

			{ type: 'h3', id: 'compact', text: 'Compaction, with its safety argument attached' },
			{
				type: 'code',
				file: 'src/lib/board/document.svelte.ts',
				lang: 'ts',
				code: `
/**
 * Forget history that no replica can still contradict.
 *
 * \`stable\` must be a version vector that **every** replica is known to
 * dominate — in practice, what the server computes from the cursors its
 * clients have acknowledged, minus a retention window. Pass a vector that is
 * ahead of some straggler and their pending operations refer to add-stamps
 * that no longer exist, which brings deleted elements back.
 *
 * Label tombstones are deliberately left alone; see the note at the top of
 * \`snapshot.ts\`.
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
}`
			},
			{
				type: 'p',
				text: 'The doc comment is the safety argument, and it is deliberately in the imperative: `stable` **must** be a vector every replica is known to dominate. In practice that is what the server computes from acknowledged client cursors, minus a retention window. There is no way for the type system to enforce it, so it is written down where somebody about to call it will read it.'
			},

			{
				type: 'checkpoint',
				items: [
					'Two replicas in the same state produce identical snapshot bytes.',
					'You can say which tombstones are collectable and which are not, and why.',
					'You can explain why a restored document must observe every stamp in its own snapshot.'
				]
			}
		]
	}
];
