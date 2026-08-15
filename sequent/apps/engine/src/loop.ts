/**
 * The engine loop.
 *
 * Read the next command, apply the rules that were in force when it arrived,
 * write the events it produced and the checkpoint together, repeat. That is the
 * entire process, and its smallness is the design working: everything difficult
 * has been pushed into `@sequent/core`, where it is a pure function anybody can
 * test without a database.
 *
 * What is left here is the part that touches the world, and the part that has
 * to be right when the world misbehaves: crash recovery, graceful shutdown, and
 * the checkpoint discipline that makes both safe.
 */

import type { Client } from '@libsql/client';
import type { EngineState } from '@sequent/core';
import { appendEvents, readCheckpoint, readCommands } from '@sequent/store';
import { rulesFor } from './rules.ts';
import { writeSnapshot } from './snapshot.ts';
import { recover } from './recover.ts';

/** The name this process checkpoints under. One engine, one consumer. */
export const ENGINE_CONSUMER = 'engine';

export interface LoopOptions {
	readonly signal: AbortSignal;
	/** How long to wait when there is nothing to do. */
	readonly idleMs?: number;
	readonly batchSize?: number;
	/** Take a snapshot every this many commands. */
	readonly snapshotEvery?: number;
	/** Called after every batch, for logging and metrics. */
	readonly onProgress?: (progress: Progress) => void;
}

export interface Progress {
	readonly lastSeq: number;
	readonly applied: number;
	readonly events: number;
}

/**
 * Start the engine and run until the signal aborts.
 *
 * Recovery happens first, and it happens before a single new command is read.
 * An engine that started serving while still catching up would be matching
 * against a partial book — accepting orders that should have crossed with
 * liquidity it has not learned about yet.
 */
export async function runEngine(client: Client, options: LoopOptions): Promise<EngineState> {
	const { signal, idleMs = 5, batchSize = 200, snapshotEvery = 10_000, onProgress } = options;

	const recovered = await recover(client);
	const state = recovered.state;

	/*
	 * Where to resume from.
	 *
	 * The checkpoint, not the state's `lastSeq`. They are usually the same, and
	 * the case where they differ is the one that matters: a crash between
	 * applying a command and committing its events leaves the state ahead of the
	 * checkpoint. Resuming from the state would skip the command whose events
	 * were lost — the fill would have moved a position in memory and never been
	 * written down.
	 *
	 * Resuming from the checkpoint replays it instead. That is safe because
	 * `appendEvents` writes events and checkpoint in one transaction, so a
	 * replayed command is one whose events definitely did not land.
	 */
	const checkpoint = await readCheckpoint(client, ENGINE_CONSUMER);
	let cursor = Math.min(checkpoint, state.lastSeq);

	/*
	 * If the checkpoint is behind the recovered state, the state has seen
	 * commands whose events were never committed. The state is the thing that is
	 * wrong, so rebuild it up to the checkpoint and go from there.
	 */
	if (checkpoint < state.lastSeq) {
		const rebuilt = await recoverTo(client, checkpoint);
		Object.assign(state, rebuilt);
		cursor = checkpoint;
	}

	let sinceSnapshot = 0;

	while (!signal.aborted) {
		const batch = await readCommands(client, cursor, batchSize);

		if (batch.length === 0) {
			await sleep(idleMs, signal);
			continue;
		}

		let events = 0;

		for (const record of batch) {
			if (signal.aborted) break;

			const produced = rulesFor(record.version)(state, record);

			/*
			 * One transaction per command, not per batch.
			 *
			 * Batching the writes would be faster and would make a crash mid-batch
			 * ambiguous: some commands applied to the in-memory state, none of them
			 * durable, and the recovery path would have to work out which. Per
			 * command, the rule is simple — either a command's events are in the log
			 * or the command has not happened yet.
			 */
			await appendEvents(
				client,
				ENGINE_CONSUMER,
				record.seq,
				record.receivedAt,
				record.version,
				produced
			);

			cursor = record.seq;
			events += produced.length;
			sinceSnapshot += 1;
		}

		if (sinceSnapshot >= snapshotEvery) {
			await writeSnapshot(client, state, state.lastSeq, state.now);
			sinceSnapshot = 0;
		}

		onProgress?.({ lastSeq: cursor, applied: batch.length, events });
	}

	/*
	 * On the way out, one last snapshot.
	 *
	 * Not required for correctness — the log is sufficient — but a clean shutdown
	 * is the cheapest opportunity the venue will ever have to write one, and it
	 * turns the next start from a full replay into an instant one.
	 */
	await writeSnapshot(client, state, state.lastSeq, state.now);

	return state;
}

/** Rebuild the state up to an exact sequence number. */
async function recoverTo(client: Client, seq: number): Promise<EngineState> {
	const { replayFromGenesis } = await import('./recover.ts');
	const result = await replayFromGenesis(client, seq);
	return result.state;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve();

		const timer = setTimeout(finish, ms);
		signal.addEventListener('abort', finish, { once: true });

		function finish() {
			clearTimeout(timer);
			signal.removeEventListener('abort', finish);
			resolve();
		}
	});
}
