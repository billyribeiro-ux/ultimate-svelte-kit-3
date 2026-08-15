/**
 * Snapshots, and the property that must survive them.
 *
 * Recovery from genesis is correct and, after a few million commands, slow. A
 * snapshot is the obvious fix: write the state down periodically, and on restart
 * load the most recent one and replay only what came after.
 *
 * The danger is subtle and worth stating before any code. The moment recovery
 * *needs* a snapshot, the snapshot has become the system of record and the log
 * has been demoted to a changelog. Everything the architecture promises —
 * replay any moment, prove any fill, reconstruct the book at 14:32:07.113 —
 * depends on the log alone being sufficient.
 *
 * So the rule is: **a snapshot may only ever be an optimisation.** Delete every
 * snapshot and the venue must still recover, more slowly. That is a property
 * you can test, and `recover.spec.ts` does.
 *
 * The fingerprint is how we keep ourselves honest. Every snapshot records a hash
 * of the state it captured, and the recovery path can replay from genesis and
 * compare. If they ever disagree, the snapshot is wrong and the log is right,
 * and we would rather find that out in a test than in an investigation.
 */

import type { Client } from '@libsql/client';
import type { InstrumentId, OrderId, Price, Quantity } from '@sequent/protocol';
import {
	emptyBook,
	newState,
	rest,
	trackLive,
	type EngineState,
	type Instrument,
	type LiveOrder,
	type RiskLimits
} from '@sequent/core';

/* -------------------------------------------------------------------------- */
/* Serialising                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The state, flattened into something JSON can hold.
 *
 * Note what is *not* here: the books. They are rebuilt by resting every live
 * order in sequence order, which is cheaper to write, smaller on disk, and —
 * the real reason — impossible to get subtly wrong. Serialising the ladder
 * structure would mean a second implementation of "what a correct book looks
 * like", and the day the two disagree is the day a restart silently reorders
 * somebody's queue position.
 */
interface SnapshotBody {
	readonly lastSeq: number;
	readonly now: number;
	readonly instruments: Array<{
		instrumentId: string;
		name: string;
		currency: string;
		tickSize: number;
		lotSize: number;
		referencePrice: number;
		phase: Instrument['phase'];
	}>;
	readonly orders: Array<{
		orderId: string;
		firmId: string;
		accountId: string;
		instrumentId: string;
		clientOrderId: string;
		side: 'buy' | 'sell';
		price: number;
		originalQuantity: number;
		remaining: number;
		seq: number;
		expiresAtClose: boolean;
	}>;
	readonly limits: Array<[string, RiskLimits]>;
	readonly killed: string[];
	readonly positions: Array<[string, number]>;
}

export function serialise(state: EngineState): SnapshotBody {
	/*
	 * Orders are written in sequence order, not in whatever order the index
	 * happens to hold them.
	 *
	 * This is the line that makes recovery deterministic. Resting orders back
	 * onto a book in a different order gives every queue a different shape, and
	 * price-time priority — the promise the whole venue is built on — would
	 * quietly depend on the internal iteration order of a `Map` surviving a
	 * process restart.
	 */
	const orders = [...state.orders.values()]
		.sort((a, b) => a.seq - b.seq)
		.map((order) => ({
			orderId: order.orderId as string,
			firmId: order.firmId as string,
			accountId: order.accountId as string,
			instrumentId: order.instrumentId as string,
			clientOrderId: order.clientOrderId as string,
			side: order.side,
			price: order.price as number,
			originalQuantity: order.originalQuantity as number,
			remaining: order.remaining as number,
			seq: order.seq,
			expiresAtClose: order.expiresAtClose
		}));

	return {
		lastSeq: state.lastSeq,
		now: state.now,
		instruments: [...state.instruments.values()]
			.map((instrument) => ({
				instrumentId: instrument.instrumentId as string,
				name: instrument.name,
				currency: instrument.currency,
				tickSize: instrument.tickSize,
				lotSize: instrument.lotSize,
				referencePrice: instrument.referencePrice as number,
				phase: instrument.phase
			}))
			.sort((a, b) => a.instrumentId.localeCompare(b.instrumentId)),
		orders,
		limits: [...state.limits.entries()]
			.map(([accountId, limits]) => [accountId as string, limits] as [string, RiskLimits])
			.sort(([a], [b]) => a.localeCompare(b)),
		killed: [...state.killed].sort(),
		positions: [...state.positions.entries()].sort(([a], [b]) => a.localeCompare(b))
	};
}

/**
 * Rebuild a state from a snapshot body.
 *
 * The books are reconstructed by resting the orders in sequence order, which is
 * exactly what the live engine did the first time. Same input, same procedure,
 * same queues.
 */
export function deserialise(body: SnapshotBody): EngineState {
	const state = newState();
	state.lastSeq = body.lastSeq;
	state.now = body.now;

	for (const record of body.instruments) {
		state.instruments.set(record.instrumentId as InstrumentId, {
			instrumentId: record.instrumentId as InstrumentId,
			name: record.name,
			currency: record.currency,
			tickSize: record.tickSize,
			lotSize: record.lotSize,
			referencePrice: record.referencePrice as Price,
			phase: record.phase,
			book: emptyBook(record.instrumentId as InstrumentId)
		});
	}

	for (const record of body.orders) {
		const instrument = state.instruments.get(record.instrumentId as InstrumentId);
		if (!instrument) continue;

		const order: LiveOrder = {
			orderId: record.orderId as OrderId,
			firmId: record.firmId as LiveOrder['firmId'],
			accountId: record.accountId as LiveOrder['accountId'],
			instrumentId: record.instrumentId as InstrumentId,
			clientOrderId: record.clientOrderId as LiveOrder['clientOrderId'],
			side: record.side,
			price: record.price as Price,
			originalQuantity: record.originalQuantity as Quantity,
			remaining: record.remaining as Quantity,
			seq: record.seq,
			expiresAtClose: record.expiresAtClose
		};

		rest(instrument.book, order);
		trackLive(state, order);
	}

	for (const [accountId, limits] of body.limits) {
		state.limits.set(accountId as LiveOrder['accountId'], limits);
	}
	for (const firmId of body.killed) state.killed.add(firmId as LiveOrder['firmId']);
	for (const [key, size] of body.positions) state.positions.set(key, size);

	return state;
}

/* -------------------------------------------------------------------------- */
/* Fingerprinting                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A short, order-independent hash of the venue's state.
 *
 * Used to prove that a recovered engine arrived at the same place as the one it
 * replaced. Comparing two states field by field would work and would need
 * updating every time the state grows a field — and the version that forgets to
 * compare the new field is the version that passes while being wrong.
 *
 * FNV-1a over the canonical JSON. Not a cryptographic hash: nobody is attacking
 * this, and 32 bits of "did these two runs agree" is exactly the question.
 */
export function fingerprint(state: EngineState): string {
	const canonical = JSON.stringify(serialise(state));

	let hash = 0x811c9dc5;
	for (let i = 0; i < canonical.length; i += 1) {
		hash ^= canonical.charCodeAt(i);
		// The FNV prime, by shift-and-add, because `hash * 16777619` loses
		// precision the moment the product passes 2^53.
		hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
	}

	return hash.toString(16).padStart(8, '0');
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

export async function writeSnapshot(
	client: Client,
	state: EngineState,
	version: number,
	takenAt: number
): Promise<string> {
	const mark = fingerprint(state);

	await client.execute({
		sql: `INSERT INTO engine_snapshot (seq, taken_at, version, fingerprint, body) VALUES (?, ?, ?, ?, ?)
		      ON CONFLICT (seq) DO NOTHING`,
		args: [state.lastSeq, takenAt, version, mark, JSON.stringify(serialise(state))]
	});

	return mark;
}

export interface LoadedSnapshot {
	readonly state: EngineState;
	readonly fingerprint: string;
}

/**
 * The most recent snapshot at or before `atMostSeq`, if there is one.
 *
 * `atMostSeq` exists for the auditor's question — "what did the book look like
 * at sequence 1,834" — which is answered by loading the last snapshot before
 * that point and replaying forward. Without the bound, answering it would mean
 * replaying from genesis every time.
 */
export async function loadSnapshot(
	client: Client,
	atMostSeq = Number.MAX_SAFE_INTEGER
): Promise<LoadedSnapshot | undefined> {
	const result = await client.execute({
		sql: `SELECT seq, fingerprint, body FROM engine_snapshot WHERE seq <= ? ORDER BY seq DESC LIMIT 1`,
		args: [atMostSeq]
	});

	const row = result.rows[0];
	if (!row) return undefined;

	/*
	 * A snapshot that will not parse is treated as **absent**, not as an error.
	 *
	 * This is the difference between a claim and a property. Everywhere in this
	 * codebase says the snapshot is an optimisation and the log is the system of
	 * record — and until a fault-injection test wrote nonsense into the table,
	 * that was only a claim: `deserialise` threw `body.instruments is not
	 * iterable`, the exception escaped `recover`, and the engine would not start.
	 * A corrupt cache took the venue down.
	 *
	 * Returning `undefined` makes recovery fall back to replaying from genesis,
	 * which is slower and correct. That is the trade the whole architecture was
	 * built to be able to make, and it does not exist unless this `catch` does.
	 *
	 * It is logged rather than swallowed silently: a venue that quietly replays
	 * from genesis every start is one whose snapshots have been broken for
	 * months and whose boot time nobody has questioned.
	 */
	try {
		return {
			state: deserialise(JSON.parse(String(row['body'])) as SnapshotBody),
			fingerprint: String(row['fingerprint'])
		};
	} catch (thrown) {
		console.error(
			`[engine] snapshot at seq ${Number(row['seq'])} is unreadable; replaying from genesis instead.`,
			thrown
		);
		return undefined;
	}
}
