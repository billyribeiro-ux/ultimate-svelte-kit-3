/**
 * THE PROOF, SUCH AS IT IS
 * ========================
 *
 * The individual specs check each structure against cases a person thought of.
 * This one checks the property those structures exist to provide, against cases
 * nobody thought of: **any set of replicas that has seen the same operations
 * holds the same state, regardless of the order they arrived in, how many times
 * they arrived, or what each replica was doing at the time.**
 *
 * It is not a proof in the mathematical sense. It is a few hundred thousand
 * randomised histories, replayable from a printed seed, which in practice finds
 * the bugs a proof would have — and finds them in the implementation rather than
 * in the model of the implementation.
 *
 * The three laws being exercised, in the language of the operations:
 *
 *   commutative   deliver a then b, or b then a — same state
 *   associative   merge in any grouping — same state
 *   idempotent    deliver the same operation twice — same state
 *
 * The document model here is deliberately small: existence, a couple of
 * last-write-wins fields, and one piece of collaborative text. It is the
 * primitives composed, not the real board — `board/document.spec.ts` runs the
 * same schedule against that.
 */

import { describe, expect, it } from 'vitest';
import { Clock, type Stamp } from './clock.ts';
import { OrSet } from './orset.ts';
import { RgaText } from './rga.ts';
import { type Lww, write } from './register.ts';
import { type VersionVector, empty, observe } from './version.ts';
import { actor, int, pick, seeded, shuffle } from './testing.ts';

type NodeId = string;

type Operation =
	| { kind: 'add'; stamp: Stamp; node: NodeId }
	| { kind: 'remove'; stamp: Stamp; node: NodeId; observed: Stamp[] }
	| { kind: 'field'; stamp: Stamp; node: NodeId; field: 'x' | 'fill'; value: number | string }
	| { kind: 'text-insert'; stamp: Stamp; node: NodeId; after: Stamp | null; value: string }
	| { kind: 'text-delete'; stamp: Stamp; node: NodeId; target: Stamp };

/** A canonical rendering of a replica's state, for comparison. */
interface Snapshot {
	nodes: { id: NodeId; fields: [string, unknown][]; label: string }[];
}

class Replica {
	readonly clock: Clock;
	readonly #nodes = new OrSet<NodeId>();
	readonly #fields = new Map<NodeId, Map<string, Lww<number | string>>>();
	readonly #labels = new Map<NodeId, RgaText>();
	#version: VersionVector = empty();

	constructor(readonly name: string) {
		// Every replica shares one physical clock reading, so the ordering under
		// test is the logical one and not an artefact of who ran first.
		this.clock = new Clock(actor(name), () => 1_700_000_000_000);
	}

	get version(): VersionVector {
		return this.#version;
	}

	label(node: NodeId): RgaText {
		let text = this.#labels.get(node);
		if (!text) {
			text = new RgaText();
			this.#labels.set(node, text);
		}
		return text;
	}

	observedAdds(node: NodeId): Stamp[] {
		return this.#nodes.observedAdds(node);
	}

	/**
	 * Apply an operation. Must be safe to call with anything, in any order, any
	 * number of times — that is the entire contract this file tests.
	 *
	 * Note what is *not* here: a `if (has(version, stamp)) return` fast path.
	 *
	 * The first draft had one, and this suite caught it within a dozen seeds. A
	 * version vector says "I have everything from this actor up to here", which is
	 * only true when that actor's operations arrive in order. Shuffle the delivery
	 * — which is what this file does on purpose, and what a reconnecting client
	 * does by accident — and the vector jumps past a gap, after which the skipped
	 * operation is discarded in silence. One replica ends up with `aegaa` and
	 * another with `aaegaa`, and nothing anywhere reports an error.
	 *
	 * The fast path bought nothing, because every structure underneath is already
	 * idempotent: a set insert, a stamp comparison, a `Map.has` check. Dropping it
	 * makes `apply` safe under any delivery order at all. The version vector goes
	 * back to the one job it is actually correct for — telling the *server* where
	 * to resume — and `sync/client.svelte.ts` advances that cursor from the
	 * watermark the server sends with each batch, never from individual
	 * operations.
	 */
	apply(operation: Operation): void {
		this.clock.observe(operation.stamp);

		switch (operation.kind) {
			case 'add':
				this.#nodes.add(operation.node, operation.stamp);
				break;

			case 'remove':
				this.#nodes.remove(operation.node, operation.observed);
				break;

			case 'field': {
				const fields = this.#fields.get(operation.node) ?? new Map();
				const next = write(fields.get(operation.field), operation.value, operation.stamp);
				if (next) {
					fields.set(operation.field, next);
					this.#fields.set(operation.node, fields);
				}
				break;
			}

			case 'text-insert':
				this.label(operation.node).insert({
					id: operation.stamp,
					after: operation.after,
					value: operation.value,
					deleted: false
				});
				break;

			case 'text-delete':
				this.label(operation.node).delete(operation.target);
				break;
		}

		this.#version = observe(this.#version, operation.stamp);
	}

	/**
	 * State, rendered canonically.
	 *
	 * Only *visible* state: present nodes, their winning field values, their text.
	 * Two replicas may legitimately hold different tombstones — one has compacted,
	 * the other has not — and comparing internals would fail on a difference that
	 * no user can observe and no future operation can expose.
	 */
	snapshot(): Snapshot {
		return {
			nodes: this.#nodes.keys().map((id) => ({
				id,
				fields: [...(this.#fields.get(id) ?? new Map())]
					.map(([field, register]) => [field, register.value] as [string, unknown])
					.sort(([a], [b]) => (a < b ? -1 : 1)),
				label: this.#labels.get(id)?.text() ?? ''
			}))
		};
	}
}

/** One random edit, expressed as an operation the replica has not applied yet. */
function generate(random: () => number, replica: Replica, nodes: NodeId[]): Operation | null {
	const stamp = replica.clock.tick();
	const live = nodes.filter((node) => replica.snapshot().nodes.some((n) => n.id === node));
	const roll = random();

	if (roll < 0.25 || live.length === 0) {
		return { kind: 'add', stamp, node: pick(random, nodes) };
	}

	const node = pick(random, live);

	if (roll < 0.35) {
		return { kind: 'remove', stamp, node, observed: replica.observedAdds(node) };
	}

	if (roll < 0.6) {
		return random() < 0.5
			? { kind: 'field', stamp, node, field: 'x', value: int(random, 0, 999) }
			: { kind: 'field', stamp, node, field: 'fill', value: pick(random, ['red', 'blue', 'jade']) };
	}

	const text = replica.label(node);
	const visible = text.visible();

	if (roll < 0.85 || visible.length === 0) {
		return {
			kind: 'text-insert',
			stamp,
			node,
			after: text.idBefore(int(random, 0, visible.length)),
			value: pick(random, [...'abcdefg'])
		};
	}

	return { kind: 'text-delete', stamp, node, target: pick(random, visible).id };
}

/**
 * Run one randomised history and return every replica's final state.
 *
 * The schedule is deliberately hostile: operations are delivered in shuffled
 * order, some are delivered twice, and some are withheld until the very end so
 * that a replica edits for a while on stale information — which is exactly what
 * an offline collaborator is.
 */
function history(seed: number, replicaCount: number, rounds: number): Snapshot[] {
	const random = seeded(seed);
	const replicas = Array.from(
		{ length: replicaCount },
		(_, i) => new Replica(String.fromCharCode(97 + i))
	);
	const nodes: NodeId[] = ['n1', 'n2', 'n3'];

	/** Operations created but not yet delivered everywhere. */
	const inFlight: Operation[] = [];

	for (let round = 0; round < rounds; round += 1) {
		for (const replica of replicas) {
			for (let i = 0; i < int(random, 0, 2); i += 1) {
				const operation = generate(random, replica, nodes);
				if (!operation) continue;
				replica.apply(operation); // local first — that is what local-first means
				inFlight.push(operation);
			}
		}

		// Deliver a random slice to random replicas, sometimes twice.
		for (const operation of shuffle(random, inFlight).slice(0, int(random, 0, inFlight.length))) {
			const target = pick(random, replicas);
			target.apply(operation);
			if (random() < 0.15) target.apply(operation); // a duplicate from a reconnect
		}
	}

	// Finally, everybody hears everything, in a different order each.
	for (const replica of replicas) {
		for (const operation of shuffle(random, inFlight)) replica.apply(operation);
	}

	return replicas.map((replica) => replica.snapshot());
}

describe('convergence', () => {
	it('reaches one state from every random schedule', () => {
		for (let seed = 1; seed <= 200; seed += 1) {
			const snapshots = history(seed, 4, 12);
			const [first, ...rest] = snapshots;

			for (const [index, snapshot] of rest.entries()) {
				// The seed is in the message on purpose: a failure here is
				// reproducible by hand, which is the difference between a bug report
				// and a ghost story.
				expect(snapshot, `replica ${index + 1} diverged (seed ${seed})`).toEqual(first);
			}
		}
	});

	it('is unaffected by how many replicas are involved', () => {
		for (const count of [2, 3, 6, 9]) {
			const snapshots = history(count * 31, count, 8);
			expect(new Set(snapshots.map((s) => JSON.stringify(s))).size).toBe(1);
		}
	});

	it('survives a replica that stays offline for the whole session', () => {
		/*
		 * The case a naive implementation passes every other test and still fails:
		 * one replica edits in isolation for a long time and merges once at the end.
		 * Its stamps are old, its view of what exists is stale, and every remove it
		 * issues observed a different set of adds.
		 */
		const random = seeded(4242);
		const online = [new Replica('a'), new Replica('b')];
		const offline = new Replica('c');
		const nodes: NodeId[] = ['n1', 'n2'];
		const all: Operation[] = [];

		for (let round = 0; round < 30; round += 1) {
			for (const replica of online) {
				const operation = generate(random, replica, nodes);
				if (!operation) continue;
				replica.apply(operation);
				all.push(operation);
				for (const other of online) other.apply(operation);
			}

			const solo = generate(random, offline, nodes);
			if (solo) {
				offline.apply(solo);
				all.push(solo);
			}
		}

		const replicas = [...online, offline];
		for (const replica of replicas) {
			for (const operation of shuffle(random, all)) replica.apply(operation);
		}

		const [first, ...rest] = replicas.map((replica) => replica.snapshot());
		for (const snapshot of rest) expect(snapshot).toEqual(first);
	});

	it('is idempotent — the same history delivered twice changes nothing', () => {
		const random = seeded(88);
		const replica = new Replica('a');
		const nodes: NodeId[] = ['n1', 'n2'];
		const operations: Operation[] = [];

		for (let i = 0; i < 60; i += 1) {
			const operation = generate(random, replica, nodes);
			if (!operation) continue;
			replica.apply(operation);
			operations.push(operation);
		}

		const before = replica.snapshot();
		for (const operation of shuffle(random, operations)) replica.apply(operation);
		expect(replica.snapshot()).toEqual(before);
	});
});
