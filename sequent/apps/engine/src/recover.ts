/**
 * Recovery: rebuilding the venue from what was written down.
 *
 * Two paths, and the relationship between them is the whole point.
 *
 *   `replayFromGenesis` reads every command ever accepted and applies it. It is
 *   correct by construction and it is slow.
 *
 *   `recover` loads the most recent snapshot and replays only what came after.
 *   It is fast, and it is only *trustworthy* because the slow path exists to
 *   check it against.
 *
 * The test suite runs both on the same log and asserts the fingerprints match.
 * That is what keeps the snapshot an optimisation rather than a second source of
 * truth — and the difference between those two things is whether you can still
 * answer an auditor after the snapshot table is corrupted.
 */

import type { Client } from '@libsql/client';
import { newState, type EngineState } from '@sequent/core';
import { assertNoGaps, readCommands } from '@sequent/store';
import { rulesFor } from './rules.ts';
import { fingerprint, loadSnapshot } from './snapshot.ts';

export interface RecoveryResult {
	readonly state: EngineState;
	/** How many commands were replayed to get here. */
	readonly replayed: number;
	/** Where the replay started. Zero means from genesis. */
	readonly from: number;
	readonly fingerprint: string;
}

const BATCH = 1_000;

/**
 * Rebuild the venue by replaying every command from the beginning.
 *
 * `upToSeq` answers the auditor's question directly: give it 1,834 and you get
 * the exact state of every book, position and limit immediately after command
 * 1,834 was applied. Not an approximation, not a reconstruction from
 * projections — the same objects the live engine held at that moment.
 *
 * Reading in batches rather than all at once is not premature: a venue's log
 * does not fit in memory, and the version that works on a test database and
 * fails on the real one is a bad way to find out.
 */
export async function replayFromGenesis(
	client: Client,
	upToSeq = Number.MAX_SAFE_INTEGER
): Promise<RecoveryResult> {
	await assertNoGaps(client);

	const state = newState();
	let cursor = 0;
	let replayed = 0;

	for (;;) {
		const batch = await readCommands(client, cursor, BATCH);
		if (batch.length === 0) break;

		for (const record of batch) {
			if (record.seq > upToSeq) {
				return { state, replayed, from: 0, fingerprint: fingerprint(state) };
			}

			// The rules that were in force when this command arrived — not the ones
			// this build happens to prefer.
			rulesFor(record.version)(state, record);
			replayed += 1;
		}

		cursor = batch[batch.length - 1]!.seq;
	}

	return { state, replayed, from: 0, fingerprint: fingerprint(state) };
}

/**
 * Rebuild the venue the fast way, and say honestly how it got there.
 *
 * If there is no snapshot this is exactly `replayFromGenesis`, which is the
 * property that matters: an empty snapshot table costs time, never
 * correctness. Delete every row and the venue still comes back.
 */
export async function recover(client: Client): Promise<RecoveryResult> {
	await assertNoGaps(client);

	const snapshot = await loadSnapshot(client);

	if (!snapshot) return replayFromGenesis(client);

	const state = snapshot.state;
	const from = state.lastSeq;
	let cursor = from;
	let replayed = 0;

	/*
	 * A snapshot that does not match its own fingerprint is corrupt, and the
	 * right response is to ignore it rather than to fail.
	 *
	 * This is the moment the "snapshots are only an optimisation" rule earns
	 * everything it cost. A system that treated the snapshot as authoritative
	 * would have to stop here and page somebody. We can shrug, throw it away and
	 * take the slow path, because the log is still sufficient.
	 */
	if (fingerprint(state) !== snapshot.fingerprint) {
		return replayFromGenesis(client);
	}

	for (;;) {
		const batch = await readCommands(client, cursor, BATCH);
		if (batch.length === 0) break;

		for (const record of batch) {
			rulesFor(record.version)(state, record);
			replayed += 1;
		}

		cursor = batch[batch.length - 1]!.seq;
	}

	return { state, replayed, from, fingerprint: fingerprint(state) };
}

/**
 * Prove the fast path and the slow path agree.
 *
 * Run in the test suite and available as an operational command, because the
 * cheapest time to discover that snapshots have drifted is any time other than
 * during an investigation.
 */
export async function verifyRecovery(client: Client): Promise<{
	ok: boolean;
	fromSnapshot: string;
	fromGenesis: string;
}> {
	const fast = await recover(client);
	const slow = await replayFromGenesis(client);

	return {
		ok: fast.fingerprint === slow.fingerprint,
		fromSnapshot: fast.fingerprint,
		fromGenesis: slow.fingerprint
	};
}
