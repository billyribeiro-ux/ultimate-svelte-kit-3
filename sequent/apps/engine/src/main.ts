/**
 * The engine process.
 *
 * Two loops, one process, and they are genuinely independent:
 *
 *   **The engine** reads commands, applies the rules, writes events. It is the
 *   only thing in the venue allowed to decide what happened.
 *
 *   **The projector** reads events and updates the read models — the tape, the
 *   order records, positions, the ledger. It decides nothing; it only arranges
 *   what the engine already decided into shapes a query can answer quickly.
 *
 * They share a process here because a venue this size does not need two, and
 * they share nothing else. Each keeps its own checkpoint, each can be restarted
 * without the other noticing, and moving the projector into its own process is
 * a matter of deleting one line from this file and adding a second entry point.
 * That is the test of whether the decoupling is real: if splitting them requires
 * thought, they were never decoupled.
 *
 * ## Why the projector must not be inside the engine loop
 *
 * The tempting version writes the events and updates the read models in one
 * transaction. It is simpler, and it welds the venue's latency to its slowest
 * projection: a new report that takes 40ms to maintain would add 40ms to every
 * order, and nobody would connect the two.
 *
 * Separating them means the read models can lag. They do, by milliseconds, and
 * that is a property to design around rather than a bug — the terminal shows a
 * sequence number so a client can tell how far behind it is looking.
 */

import { catchUp, openStore, PROJECTOR_CONSUMER, readCheckpoint } from '@sequent/store';
import { runEngine, ENGINE_CONSUMER } from './loop.ts';

const url = process.env['DATABASE_URL'] ?? 'file:sequent.db';

/* -------------------------------------------------------------------------- */
/* Shutdown                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One controller, aborted by either signal.
 *
 * `SIGTERM` is what a container runtime sends when it wants the process gone;
 * `SIGINT` is Ctrl-C. Handling only the second is the usual mistake, and it
 * means every deploy kills the engine mid-command instead of letting it finish.
 *
 * Aborting rather than calling `process.exit` is the whole point: the loops see
 * the signal, finish the batch they are in, commit the checkpoint, and return.
 * `process.exit` in a signal handler abandons an open transaction.
 */
const controller = new AbortController();
let shuttingDown = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		if (shuttingDown) {
			// A second signal means somebody is impatient and the graceful path is
			// stuck. Honour it — but say so, because the checkpoint may now be
			// behind and the next start will replay.
			console.error('[engine] second signal, exiting immediately');
			process.exit(130);
		}

		shuttingDown = true;
		console.log(`[engine] ${signal} — finishing the current batch`);
		controller.abort();
	});
}

/* -------------------------------------------------------------------------- */
/* The projector loop                                                          */
/* -------------------------------------------------------------------------- */

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
	new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});

/**
 * Keep the read models caught up, forever.
 *
 * `catchUp` is idempotent and checkpointed, so the failure handling is a `catch`
 * and a pause rather than anything clever. A projector that crashes and restarts
 * re-reads from its checkpoint and arrives at the same answer — which is exactly
 * what "idempotent projector" buys, and why this loop can afford to be four
 * lines long.
 */
async function runProjector(client: Awaited<ReturnType<typeof openStore>>): Promise<void> {
	let consecutiveFailures = 0;

	while (!controller.signal.aborted) {
		try {
			const applied = await catchUp(client);
			consecutiveFailures = 0;

			// Poll faster while there is work, slower when idle. A fixed interval is
			// either too slow under load or busy-waiting when quiet.
			await sleep(applied > 0 ? 2 : 25, controller.signal);
		} catch (thrown) {
			consecutiveFailures += 1;
			console.error(`[projector] failed (${consecutiveFailures})`, thrown);

			/*
			 * Back off, capped at five seconds.
			 *
			 * A projector that retries instantly against a database that is down
			 * turns one outage into two: the database cannot recover because it is
			 * being hammered by the process waiting for it to recover.
			 */
			await sleep(Math.min(5000, 100 * 2 ** consecutiveFailures), controller.signal);
		}
	}
}

/* -------------------------------------------------------------------------- */
/* Start                                                                       */
/* -------------------------------------------------------------------------- */

const client = await openStore({ url });

console.log(`[engine] starting against ${url}`);
console.log(`[engine] resuming from seq ${await readCheckpoint(client, ENGINE_CONSUMER)}`);
console.log(`[projector] resuming from seq ${await readCheckpoint(client, PROJECTOR_CONSUMER)}`);

let lastReported = 0;

/*
 * Both loops run concurrently and the process waits for both.
 *
 * `Promise.all` and not `Promise.race`: if the engine returns because it was
 * aborted, the projector must still be given the chance to drain what the
 * engine just wrote. Racing would exit with events written and unprojected —
 * correct, because they would be picked up next start, but it would make every
 * restart show a moment of stale read models for no reason.
 */
await Promise.all([
	runEngine(client, {
		signal: controller.signal,
		onProgress: ({ lastSeq, applied, events }) => {
			if (applied === 0) return;

			// Log at most once a second. An engine that logs every command produces
			// a log nobody reads and an I/O cost nobody budgeted for.
			const now = Date.now();
			if (now - lastReported < 1000) return;
			lastReported = now;

			console.log(`[engine] seq ${lastSeq} (+${applied} commands, ${events} events)`);
		}
	}),
	runProjector(client)
]);

console.log('[engine] stopped cleanly');
console.log(`[engine] checkpoint at seq ${await readCheckpoint(client, ENGINE_CONSUMER)}`);
console.log(`[projector] checkpoint at seq ${await readCheckpoint(client, PROJECTOR_CONSUMER)}`);

client.close();
