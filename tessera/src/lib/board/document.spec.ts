import { describe, expect, it } from 'vitest';
import { BoardDocument } from './document.svelte';
import { MIDDLE, between, newActorId, type ActorId, type OrderKey } from '#lib/crdt/index.ts';
import { emptySnapshot } from './snapshot';
import type { Operation } from './ops';
import type { NodeId } from './types';

/** A document with a fixed clock, so ordering is logical rather than accidental. */
function board(name: string, at = 1_700_000_000_000): BoardDocument {
	return new BoardDocument(name.repeat(8).slice(0, 8) as ActorId, () => at);
}

function addBox(document: BoardDocument, x = 0, y = 0, order: OrderKey = MIDDLE): NodeId {
	return document.addNode({ x, y, order });
}

describe('nodes', () => {
	it('appears in the projection with its defaults filled in', () => {
		const document = board('a');
		const id = addBox(document, 40, 60);
		const view = document.nodes.get(id);

		expect(view).toBeDefined();
		expect(view).toMatchObject({ x: 40, y: 60, kind: 'service', fill: 'slate', label: '' });
	});

	it('updates one field without disturbing the others', () => {
		const document = board('a');
		const id = addBox(document);

		document.setNode(id, 'fill', 'jade');
		document.moveNode(id, 12, 34);

		expect(document.nodes.get(id)).toMatchObject({ fill: 'jade', x: 12, y: 34, w: 168 });
	});

	it('clamps a resize to something still clickable', () => {
		// A node dragged to zero is present in the document, invisible on screen and
		// impossible to select — lost, without ever being deleted.
		const document = board('a');
		const id = addBox(document);

		document.resizeNode(id, { x: 0, y: 0, w: 2, h: 2 });
		expect(document.nodes.get(id)).toMatchObject({ w: 48, h: 48 });
	});

	it('takes incident edges with it when it goes', () => {
		const document = board('a');
		const from = addBox(document, 0, 0);
		const to = addBox(document, 300, 0);
		const edge = document.addEdge({ from, to });

		expect(document.edges.has(edge)).toBe(true);
		document.removeNode(from);

		// An edge left pointing at a deleted node renders as an arrow to nowhere and
		// survives every later merge, because nothing else has a reason to remove it.
		expect(document.edges.has(edge)).toBe(false);
	});

	it('brings a node back with its identity intact', () => {
		const document = board('a');
		const id = addBox(document, 10, 20);
		const fields = document.nodeFields(id)!;

		document.removeNode(id);
		expect(document.nodes.has(id)).toBe(false);

		document.restoreNode(id, fields);
		expect(document.nodes.get(id)).toMatchObject({ x: 10, y: 20 });
	});
});

describe('labels', () => {
	it('materialises typing into the view', () => {
		const document = board('a');
		const id = addBox(document);

		document.insertText(id, 0, 'Gateway');
		expect(document.nodes.get(id)?.label).toBe('Gateway');

		document.deleteText(id, 0, 4);
		expect(document.nodes.get(id)?.label).toBe('way');
	});

	it('handles an emoji as one character', () => {
		const document = board('a');
		const id = addBox(document);

		document.insertText(id, 0, 'ok 🎯');
		expect(document.nodes.get(id)?.label).toBe('ok 🎯');

		document.deleteText(id, 3, 4);
		expect(document.nodes.get(id)?.label).toBe('ok ');
	});

	it('labels edges too', () => {
		const document = board('a');
		const from = addBox(document, 0, 0);
		const to = addBox(document, 300, 0);
		const edge = document.addEdge({ from, to });

		document.insertText(edge, 0, 'POST /orders');
		expect(document.edges.get(edge)?.label).toBe('POST /orders');
	});
});

describe('painting order', () => {
	it('sorts by fractional index, then by id', () => {
		const document = board('a');
		const low = addBox(document, 0, 0, between(null, MIDDLE));
		const high = addBox(document, 0, 0, between(MIDDLE, null));

		expect(document.painted().map((node) => node.id)).toEqual([low, high]);
	});

	it('is stable when two replicas mint the same key', () => {
		/*
		 * Concurrent "bring to front" on two different nodes produces the same key on
		 * both replicas. Without the id tiebreak the two boards paint them in
		 * whatever order their sort implementation chose — converged data, divergent
		 * pictures.
		 */
		const document = board('a');
		const first = addBox(document, 0, 0, MIDDLE);
		const second = addBox(document, 0, 0, MIDDLE);

		const painted = document.painted().map((node) => node.id);
		expect(painted).toEqual([first, second].sort());
	});
});

describe('snapshots', () => {
	it('round-trips a populated board', () => {
		const document = board('a');
		const from = addBox(document, 10, 10);
		const to = addBox(document, 300, 10);
		document.addEdge({ from, to, kind: 'async' });
		document.insertText(from, 0, 'Edge proxy');
		document.setNode(to, 'fill', 'rose');

		const restored = BoardDocument.fromSnapshot(document.actor, document.toSnapshot(), () => 1);

		expect(restored.toSnapshot()).toEqual(document.toSnapshot());
		expect(restored.nodes.get(from)?.label).toBe('Edge proxy');
		expect(restored.nodes.get(to)?.fill).toBe('rose');
	});

	it('starts from nothing without complaint', () => {
		const document = BoardDocument.fromSnapshot(newActorId(), emptySnapshot());
		expect(document.nodes.size).toBe(0);
	});

	it('does not reissue stamps after a reload', () => {
		/*
		 * The clock resumes from the snapshot's version vector. Skip that and a
		 * reload reissues stamps this replica already used: two characters with one
		 * identity, the RGA keeps the first, and the symptom is "sometimes my typing
		 * does not appear, but only just after a refresh".
		 */
		const first = board('a');
		const id = addBox(first);
		first.insertText(id, 0, 'before');

		const reloaded = BoardDocument.fromSnapshot(first.actor, first.toSnapshot(), () => 1);
		reloaded.insertText(id, 6, 'after');

		expect(reloaded.nodes.get(id)?.label).toBe('beforeafter');
	});
});

describe('compaction', () => {
	it('forgets a deleted node once everybody has seen the deletion', () => {
		const document = board('a');
		const id = addBox(document);
		document.removeNode(id);

		expect(document.compact(document.version)).toBeGreaterThan(0);
		expect(document.toSnapshot().nodes).toEqual({ added: {}, removed: {} });
		expect(document.nodes.has(id)).toBe(false);
	});

	it('keeps history a straggler could still contradict', () => {
		const document = board('a');
		const id = addBox(document);
		document.removeNode(id);

		expect(document.compact(new Map())).toBe(0);
	});
});

describe('convergence', () => {
	it('two replicas editing the same board reach the same snapshot', () => {
		/*
		 * The same property `crdt/convergence.spec.ts` proves for the primitives,
		 * asserted against the real document — including the parts that are not
		 * CRDTs at all, like the reconciliation into the reactive projection.
		 */
		const alice = board('a');
		const bob = board('b');

		const toBob: Operation[] = [];
		const toAlice: Operation[] = [];
		alice.onLocalOperation((operation) => toBob.push(operation));
		bob.onLocalOperation((operation) => toAlice.push(operation));

		// A shared starting point, created by Alice and delivered to Bob.
		const shared = addBox(alice, 0, 0);
		alice.insertText(shared, 0, 'api');
		bob.applyAll(toBob.splice(0));

		// Now both edit the same node without hearing from each other.
		alice.moveNode(shared, 100, 100);
		alice.insertText(shared, 3, '-gateway');
		bob.setNode(shared, 'fill', 'amber');
		bob.insertText(shared, 0, 'public-');
		bob.addEdge({ from: shared, to: shared });

		// Exchange, in opposite orders.
		const fromAlice = toBob.splice(0);
		const fromBob = toAlice.splice(0);
		bob.applyAll(fromAlice);
		alice.applyAll(fromBob);

		expect(alice.toSnapshot()).toEqual(bob.toSnapshot());
		expect(alice.nodes.get(shared)?.fill).toBe('amber');
		expect(alice.nodes.get(shared)?.x).toBe(100);
		expect(alice.nodes.get(shared)?.label).toContain('gateway');
	});

	it('a field written for a node that has not arrived yet still lands', () => {
		/*
		 * Operation order is not guaranteed. A `node.set` can reach a replica before
		 * the `node.add` it describes; the register has to be kept anyway, and
		 * applied to the view the moment the node appears.
		 */
		const alice = board('a');
		const sent: Operation[] = [];
		alice.onLocalOperation((operation) => sent.push(operation));

		const id = addBox(alice);
		alice.setNode(id, 'fill', 'cyan');

		const bob = board('b');
		const [add, ...rest] = sent;
		bob.applyAll(rest); // the colour first
		bob.apply(add!); // the node second

		expect(bob.nodes.get(id)?.fill).toBe('cyan');
	});
});
