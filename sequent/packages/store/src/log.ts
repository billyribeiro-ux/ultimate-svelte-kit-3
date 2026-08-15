/**
 * The durable log, and the consumers that tail it.
 *
 * This is the spine of the system: the gateway appends commands to one end, the
 * engine reads them and appends events to the other, and every other process
 * reads events. Nothing talks to anything else directly.
 *
 * ## Why a table and not Kafka
 *
 * A real venue uses shared memory, or Aeron, or Chronicle Queue, and measures
 * the hop in nanoseconds. We use a SQLite table, and the choice is worth
 * defending rather than apologising for.
 *
 * A log needs three properties: it must be **durable**, it must be **totally
 * ordered**, and consumers must be able to **resume from a position**. A
 * `STRICT` table with an explicit integer primary key in WAL mode has all
 * three, plus one a message broker does not: you can `SELECT * FROM
 * command_log WHERE seq = 1834` during an incident and read the answer with
 * your eyes.
 *
 * What it does not have is throughput. Tens of thousands of appends a second,
 * not tens of millions. For a teaching venue that is four orders of magnitude
 * more than we need, and every idea in this file — sequencing, checkpointing,
 * gap detection, idempotent consumers — transfers unchanged to the fast version.
 */

import type { Client, InValue, Transaction } from '@libsql/client';
import { parseCommand, type Command, type Event } from '@sequent/protocol';

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

export interface CommandRecord {
	readonly seq: number;
	readonly receivedAt: number;
	readonly version: number;
	readonly body: Command;
}

export interface EventRecord {
	readonly seq: number;
	readonly causedBy: number;
	readonly at: number;
	readonly version: number;
	readonly body: Event;
}

/* -------------------------------------------------------------------------- */
/* Appending                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The sequencer: the one place a command is given its position in history.
 *
 * Single writer, by construction. Not because concurrency is hard here, but
 * because the total order **is** the product: two writers assigning sequence
 * numbers would need to agree on an order anyway, and every distributed
 * consensus protocol ever written exists because that agreement is expensive.
 * One writer makes it free.
 *
 * The whole venue therefore has a throughput ceiling equal to what this class
 * can append per second. That is a real limit and it is the right trade: an
 * exchange that could accept two orders simultaneously would have to explain
 * which one was first, and "we are not sure" is not an answer a venue can give.
 */
export class Sequencer {
	#next: number | undefined;
	readonly #client: Client;

	/*
	 * Written out rather than declared as a constructor parameter property.
	 *
	 * Node executes TypeScript in strip-only mode — it deletes the types and runs
	 * what is left — so any syntax that requires code to be *generated* is
	 * refused outright. `constructor(private readonly client: Client) {}` is the
	 * commonest one: it looks like a type annotation and is actually an
	 * instruction to emit an assignment.
	 *
	 * The same rule rules out enums, namespaces and decorators. Three extra lines
	 * buys running the source directly with no build step at all.
	 */
	constructor(client: Client) {
		this.#client = client;
	}

	/**
	 * Read the high-water mark once, at startup.
	 *
	 * Cached afterwards, because asking the database for `MAX(seq)` on every
	 * append would put a query on the critical path of every order. The cache is
	 * safe only because this is the sole writer — the assumption is load-bearing,
	 * so `assertSoleWriter` below checks it rather than trusting it.
	 */
	async start(): Promise<void> {
		const result = await this.#client.execute('SELECT COALESCE(MAX(seq), 0) AS high FROM command_log');
		this.#next = Number(result.rows[0]?.['high'] ?? 0) + 1;
	}

	get nextSeq(): number {
		if (this.#next === undefined) throw new Error('Sequencer.start() has not been called');
		return this.#next;
	}

	/**
	 * Stamp a command and write it down.
	 *
	 * `receivedAt` is passed in rather than read from a clock here, for the same
	 * reason it is passed to the engine: the caller may be replaying, and a
	 * replay must be able to supply the original timestamps. Defaulting it would
	 * make the wrong thing easy.
	 */
	async append(body: Command, receivedAt: number, version: number): Promise<CommandRecord> {
		const seq = this.nextSeq;

		/*
		 * Validated here, even though the gateway already did.
		 *
		 * The duplication is deliberate, and the reason is the append-only trigger:
		 * a malformed command written to this table can never be corrected or
		 * removed. It sits there being replayed by every recovery, forever, and the
		 * engine has to cope with it on every single one.
		 *
		 * That asymmetry — cheap to check, impossible to undo — is what makes a
		 * second parse worth its cost at the boundary of a durable log. It also
		 * covers the writers that are not the gateway: the seed, an admin script,
		 * a migration. A drill script that sent `firmId` where the schema wanted
		 * `targetFirmId` is exactly how this got added: it wrote happily, and the
		 * engine then produced an event with an `undefined` field that a downstream
		 * worker retried six times before anybody noticed.
		 *
		 * TypeScript did not catch it because the script cast, and a cast is a
		 * promise the compiler has no way to check.
		 */
		let validated: Command;
		try {
			validated = parseCommand(body);
		} catch (thrown) {
			throw new Error(
				`Refusing to append a malformed command to the log: ${
					thrown instanceof Error ? thrown.message : String(thrown)
				}`,
				{ cause: thrown }
			);
		}

		await this.#client.execute({
			sql: `INSERT INTO command_log (seq, received_at, version, kind, firm_id, body)
			      VALUES (?, ?, ?, ?, ?, ?)`,
			args: [seq, receivedAt, version, validated.kind, validated.firmId, JSON.stringify(validated)]
		});

		this.#next = seq + 1;
		return { seq, receivedAt, version, body: validated };
	}

	/**
	 * Prove nobody else has written since we started.
	 *
	 * Two sequencers running at once is the failure this architecture cannot
	 * survive — the log would interleave two people's idea of the order and no
	 * replay would reproduce either. It is also exactly the thing that happens
	 * during a botched deploy, when the new process starts before the old one has
	 * finished shutting down.
	 *
	 * Cheap to check, catastrophic to miss, so it is checked on every batch.
	 */
	async assertSoleWriter(): Promise<void> {
		const result = await this.#client.execute('SELECT COALESCE(MAX(seq), 0) AS high FROM command_log');
		const high = Number(result.rows[0]?.['high'] ?? 0);

		if (high !== this.nextSeq - 1) {
			throw new Error(
				`Another writer has appended to the log: expected high-water ${this.nextSeq - 1}, found ${high}. ` +
					'Two sequencers are running. Stop one before anything else.'
			);
		}
	}
}

/**
 * Write the events a command produced, and the fact that it was processed.
 *
 * One transaction, always. If the events were committed and the checkpoint were
 * not, recovery would replay a command whose effects are already in the log and
 * produce a second copy of every trade it caused. If the checkpoint were
 * committed and the events were not, those trades would simply never have
 * happened as far as anybody downstream could tell.
 *
 * Both failures are silent, and both are prevented by the same `BEGIN`.
 */
export async function appendEvents(
	client: Client,
	consumer: string,
	causedBy: number,
	at: number,
	version: number,
	events: readonly Event[]
): Promise<void> {
	const tx = await client.transaction('write');

	try {
		for (const body of events) {
			await tx.execute({
				sql: `INSERT INTO event_log (caused_by, at, version, kind, instrument_id, body)
				      VALUES (?, ?, ?, ?, ?, ?)`,
				args: [
					causedBy,
					at,
					version,
					body.kind,
					instrumentOf(body) as InValue,
					JSON.stringify(body)
				]
			});
		}

		await checkpointIn(tx, consumer, causedBy, at);
		await tx.commit();
	} catch (error) {
		await tx.rollback();
		throw error;
	}
}

/** Not every event belongs to an instrument, and the column says so honestly. */
function instrumentOf(event: Event): string | null {
	return 'instrumentId' in event && typeof event.instrumentId === 'string'
		? event.instrumentId
		: null;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Commands after `afterSeq`, oldest first.
 *
 * `limit` exists because recovery reads the whole log, and a venue's whole log
 * does not fit in memory. Reading in batches turns an unbounded allocation into
 * a loop.
 */
export async function readCommands(
	client: Client,
	afterSeq: number,
	limit = 1_000
): Promise<CommandRecord[]> {
	const result = await client.execute({
		sql: `SELECT seq, received_at, version, body FROM command_log
		      WHERE seq > ? ORDER BY seq ASC LIMIT ?`,
		args: [afterSeq, limit]
	});

	return result.rows.map((row) => ({
		seq: Number(row['seq']),
		receivedAt: Number(row['received_at']),
		version: Number(row['version']),
		body: JSON.parse(String(row['body'])) as Command
	}));
}

export async function readEvents(
	client: Client,
	afterSeq: number,
	limit = 1_000
): Promise<EventRecord[]> {
	const result = await client.execute({
		sql: `SELECT seq, caused_by, at, version, body FROM event_log
		      WHERE seq > ? ORDER BY seq ASC LIMIT ?`,
		args: [afterSeq, limit]
	});

	return result.rows.map((row) => ({
		seq: Number(row['seq']),
		causedBy: Number(row['caused_by']),
		at: Number(row['at']),
		version: Number(row['version']),
		body: JSON.parse(String(row['body'])) as Event
	}));
}

/**
 * Check the log has no holes.
 *
 * A gap means a command was assigned a sequence number and never committed,
 * which means the total order has a hole in it and every replay after that
 * point is describing a different venue from the one that ran.
 *
 * This should never fire. It is checked at startup anyway, because the cost is
 * one query and the alternative is discovering it from a participant asking why
 * their fill is missing.
 */
export async function assertNoGaps(client: Client): Promise<void> {
	const result = await client.execute(
		`SELECT COUNT(*) AS n, COALESCE(MIN(seq), 1) AS lo, COALESCE(MAX(seq), 0) AS hi FROM command_log`
	);

	const row = result.rows[0];
	if (!row) return;

	const count = Number(row['n']);
	const lo = Number(row['lo']);
	const hi = Number(row['hi']);

	if (count === 0) return;

	// Sequence numbers start at 1 and increase by exactly one.
	if (lo !== 1 || hi - lo + 1 !== count) {
		throw new Error(
			`The command log has gaps: ${count} rows spanning ${lo}..${hi}. ` +
				'The total order is incomplete and replay cannot be trusted.'
		);
	}
}

/* -------------------------------------------------------------------------- */
/* Checkpoints                                                                 */
/* -------------------------------------------------------------------------- */

export async function readCheckpoint(client: Client, consumer: string): Promise<number> {
	const result = await client.execute({
		sql: 'SELECT last_seq FROM consumer_checkpoint WHERE consumer = ?',
		args: [consumer]
	});

	return Number(result.rows[0]?.['last_seq'] ?? 0);
}

/**
 * Move a consumer's checkpoint, inside a transaction the caller owns.
 *
 * Taking the transaction as an argument rather than opening one is the entire
 * point of this function's existence. A projector must write its rows and its
 * checkpoint together; giving it a helper that opens its own transaction would
 * make the broken version the convenient one.
 */
export async function checkpointIn(
	tx: Transaction,
	consumer: string,
	seq: number,
	at: number
): Promise<void> {
	await tx.execute({
		sql: `INSERT INTO consumer_checkpoint (consumer, last_seq, updated_at) VALUES (?, ?, ?)
		      ON CONFLICT (consumer) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at`,
		args: [consumer, seq, at]
	});
}

/* -------------------------------------------------------------------------- */
/* Tailing                                                                     */
/* -------------------------------------------------------------------------- */

export interface TailOptions {
	/** How long to wait before looking again when the log is quiet. */
	readonly idleMs?: number;
	readonly batchSize?: number;
	readonly signal: AbortSignal;
}

/**
 * Follow the event log forever, yielding batches.
 *
 * It polls. That is a real limitation and worth being honest about: a consumer
 * learns about an event somewhere between zero and `idleMs` after it lands, and
 * in a venue that matters.
 *
 * What makes it acceptable here is the shape of the loop — it only sleeps when
 * the log is *empty*. Under load it never waits at all, because there is always
 * another batch ready, and the latency that matters is the busy-period latency
 * rather than the idle one. Under no load, nobody is waiting.
 *
 * The alternative is a notification channel, and the reason we do not have one
 * is that it would be a second mechanism to keep correct: a missed notification
 * has to fall back to polling anyway, so the polling has to be right regardless.
 * One correct mechanism beats two, one of which is only usually needed.
 */
export async function* tailEvents(
	client: Client,
	from: number,
	{ idleMs = 25, batchSize = 500, signal }: TailOptions
): AsyncGenerator<EventRecord[]> {
	let cursor = from;

	while (!signal.aborted) {
		const batch = await readEvents(client, cursor, batchSize);

		if (batch.length === 0) {
			await sleep(idleMs, signal);
			continue;
		}

		cursor = batch[batch.length - 1]!.seq;
		yield batch;
	}
}

/** A sleep that wakes early when the caller gives up. */
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
