/**
 * PART 2 — The log, and making it durable (chapters 12–17)
 *
 * The engine is a pure function. This part gives it somewhere to read from and
 * somewhere to write to, and makes both survive the process being killed.
 */

export const part2 = [
	{
		slug: 'a-table-as-a-log',
		title: 'A table as a log',
		summary:
			'Two append-only tables, enforced by triggers, and why SQLite is a defensible choice for the spine of an exchange.',
		goal: 'Build the log, and understand the three properties it actually needs.',
		blocks: [
			{
				type: 'p',
				text: 'A real venue\'s log lives in shared memory or Aeron and is measured in nanoseconds. Ours is a SQLite table. That choice is worth defending rather than apologising for.'
			},
			{
				type: 'p',
				text: 'A log needs exactly three properties: it must be **durable**, it must be **totally ordered**, and consumers must be able to **resume from a position**. A `STRICT` table with an explicit integer primary key in WAL mode has all three — plus one a message broker does not: you can `SELECT * FROM command_log WHERE seq = 1834` during an incident and read the answer with your eyes.'
			},
			{
				type: 'p',
				text: 'What it does not have is throughput. Tens of thousands of appends a second, not tens of millions. For a teaching venue that is four orders of magnitude more than we need, and every idea in this part — sequencing, checkpointing, gap detection, idempotent consumers — transfers unchanged to the fast version.'
			},

			{ type: 'h3', id: 'schema', text: 'The two tables' },
			{
				type: 'code',
				file: 'packages/store/src/schema.ts',
				lang: 'sql',
				code: `
-- Commands, in the order the sequencer accepted them.
--
-- \`seq\` is an explicit INTEGER PRIMARY KEY rather than an autoincrement,
-- because the sequencer owns it. Letting SQLite choose would mean the ordering
-- authority lived in two places, and the day they disagree is the day replay
-- stops reproducing history.
--
-- …
CREATE TABLE IF NOT EXISTS command_log (
	seq INTEGER PRIMARY KEY,

	-- The venue's clock reading when this arrived. Stamped once, by the
	-- sequencer, and read by the engine instead of a clock of its own.
	received_at INTEGER NOT NULL,

	-- Which rules version was in force. Replay dispatches on this rather than on
	-- whatever the engine happens to have compiled in, so a change to matching
	-- logic does not rewrite what happened last March.
	version INTEGER NOT NULL,

	kind TEXT NOT NULL,
	firm_id TEXT NOT NULL,

	-- The command itself, as JSON. Deliberately opaque to SQL: the schema of a
	-- command is owned by @sequent/protocol, and duplicating it in columns here
	-- would create a second definition to keep in step.
	body TEXT NOT NULL
) STRICT;

-- …

-- Events, in the order the engine produced them.
--
-- \`caused_by\` points at the command that produced this event. It is the single
-- most useful column in the database during an incident: every event knows its
-- cause, and every derived identifier contains its own sequence number, so
-- "why did this happen" is a lookup rather than an investigation.
CREATE TABLE IF NOT EXISTS event_log (
	seq INTEGER PRIMARY KEY AUTOINCREMENT,
	caused_by INTEGER NOT NULL REFERENCES command_log (seq),
	at INTEGER NOT NULL,
	version INTEGER NOT NULL,
	kind TEXT NOT NULL,
	instrument_id TEXT,
	body TEXT NOT NULL
) STRICT;`
			},
			{
				type: 'note',
				text: '`STRICT` is SQLite 3.37+. Without it, SQLite will happily store the string `"banana"` in an `INTEGER` column, because its type system is advisory by default. With it, that is an error. For a system of record, advisory typing is not enough.'
			},

			{ type: 'h3', id: 'triggers', text: 'Append-only, enforced' },
			{
				type: 'p',
				text: 'The log is append-only. Not "we agreed not to update it" — enforced.'
			},
			{
				type: 'code',
				file: 'packages/store/src/schema.ts',
				lang: 'sql',
				code: `
-- SQLite has no way to revoke UPDATE from a connection, so the enforcement is a
-- trigger that raises. It costs nothing on insert and it turns "somebody
-- corrected a row during an outage" from a silent rewrite of history into an
-- error with a stack trace.
CREATE TRIGGER IF NOT EXISTS command_log_is_append_only
BEFORE UPDATE ON command_log
BEGIN
	SELECT RAISE(ABORT, 'command_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS command_log_is_permanent
BEFORE DELETE ON command_log
BEGIN
	SELECT RAISE(ABORT, 'command_log is append-only');
END;`
			},
			{
				type: 'why',
				title: 'Why a trigger rather than a code review rule',
				text: 'At 3am during an incident, somebody will want to "just fix that one row". They will have a good reason. The trigger means they cannot, and have to fix it the way that leaves a trail — by appending a correction. Every enforcement that lives only in people\'s heads is an enforcement that fails under pressure, which is exactly when it matters.'
			},

			{ type: 'h3', id: 'pragmas', text: 'The pragmas, and one that must not be in a batch' },
			{
				type: 'code',
				file: 'packages/store/src/client.ts',
				lang: 'ts',
				code: `
/*
 * Separate \`execute\` calls, not a batch.
 *
 * \`batch\` wraps its statements in a transaction, and SQLite refuses to change
 * journal mode inside one — "cannot change into wal mode from within a
 * transaction". Written as a batch this fails, the error is easy to swallow,
 * and WAL silently never applies. The venue then works perfectly until two
 * processes read and write at once.
 */
await client.execute('PRAGMA journal_mode = WAL');
await client.execute('PRAGMA busy_timeout = 5000');
await client.execute('PRAGMA foreign_keys = ON');
/*
 * \`synchronous = FULL\` rather than the WAL default of \`NORMAL\`.
 *
 * NORMAL lets the OS decide when to flush, which means a machine that loses
 * power can lose the last few commits. For a cache that is a fine trade. For
 * an append-only log that is the system of record for other people's money,
 * it is not: the whole promise is that an acknowledged order is durable.
 */
await client.execute('PRAGMA synchronous = FULL');`
			},
			{
				type: 'warn',
				text: '`busy_timeout` is a property of the **connection**, not the database. Every process that opens a connection must set it again. A process that forgets is the one that fails under load with `SQLITE_BUSY` while every other process is fine — which is a maddening thing to debug. That is why every process in Sequent calls one `openStore` function rather than creating clients itself.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the three properties a log needs',
					'You can explain why `seq` is not an autoincrement in `command_log`',
					'You can explain why the WAL pragma cannot go in a batch',
					'You know why the append-only rule is a trigger'
				]
			}
		]
	},

	{
		slug: 'the-sequencer',
		title: 'The sequencer',
		summary:
			'One writer, a cached high-water mark, and a check that catches the botched deploy where two engines are running.',
		goal: 'Build the only thing allowed to assign sequence numbers, and the check that proves it is alone.',
		blocks: [
			{
				type: 'p',
				text: 'The sequencer is the venue\'s total order made concrete. It is the one place a command is given its position in history.'
			},
			{
				type: 'code',
				file: 'packages/store/src/log.ts',
				lang: 'ts',
				code: `
export class Sequencer {
	#next: number | undefined;
	readonly #client: Client;

	/* … */
	constructor(client: Client) {
		this.#client = client;
	}

	/**
	 * Read the high-water mark once, at startup.
	 *
	 * Cached afterwards, because asking the database for \`MAX(seq)\` on every
	 * append would put a query on the critical path of every order. The cache is
	 * safe only because this is the sole writer — the assumption is load-bearing,
	 * so \`assertSoleWriter\` below checks it rather than trusting it.
	 */
	async start(): Promise<void> {
		const result = await this.#client.execute(
			'SELECT COALESCE(MAX(seq), 0) AS high FROM command_log'
		);
		this.#next = Number(result.rows[0]?.['high'] ?? 0) + 1;
	}
}`
			},

			{ type: 'h3', id: 'sole-writer', text: 'Proving nobody else is writing' },
			{
				type: 'code',
				file: 'packages/store/src/log.ts',
				lang: 'ts',
				code: `
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
	const result = await this.#client.execute(
		'SELECT COALESCE(MAX(seq), 0) AS high FROM command_log'
	);
	const high = Number(result.rows[0]?.['high'] ?? 0);

	if (high !== this.nextSeq - 1) {
		throw new Error(
			\`Another writer has appended to the log: expected high-water \${this.nextSeq - 1}, found \${high}. \` +
				'Two sequencers are running. Stop one before anything else.'
		);
	}
}`
			},
			{
				type: 'why',
				title: 'Why on every batch rather than at startup',
				text: 'The failure appears mid-life, not at boot. Both processes start correctly — the second one reads the high-water mark and gets a sensible answer. It is only once both are appending that they diverge, and by then a startup check is long past.'
			},

			{ type: 'h3', id: 'validate', text: 'Validating on the way in' },
			{
				type: 'p',
				text: 'The gateway already validated the command. The sequencer validates it again, and the duplication is deliberate.'
			},
			{
				type: 'code',
				file: 'packages/store/src/log.ts',
				lang: 'ts',
				code: `
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
	 * a migration. A drill script that sent \`firmId\` where the schema wanted
	 * \`targetFirmId\` is exactly how this got added: it wrote happily, and the
	 * engine then produced an event with an \`undefined\` field that a downstream
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
			\`Refusing to append a malformed command to the log: \${
				thrown instanceof Error ? thrown.message : String(thrown)
			}\`,
			{ cause: thrown }
		);
	}

	await this.#client.execute({
		sql: \`INSERT INTO command_log (seq, received_at, version, kind, firm_id, body)
		      VALUES (?, ?, ?, ?, ?, ?)\`,
		args: [seq, receivedAt, version, validated.kind, validated.firmId, JSON.stringify(validated)]
	});

	this.#next = seq + 1;
	return { seq, receivedAt, version, body: validated };
}`
			},

			{ type: 'h3', id: 'bug', text: 'Bug found: a drill script poisoned the log' },
			{
				type: 'p',
				text: 'That validation was added because of a real incident, and the chain of consequences is worth following.'
			},
			{
				type: 'p',
				text: 'A test script fired the kill switch directly at the sequencer, bypassing the gateway. It sent `firmId` where the command schema wanted `targetFirmId`. TypeScript did not catch it, because the script used a cast — and a cast is a promise the compiler has no way to check.'
			},
			{
				type: 'ol',
				items: [
					'The malformed command was written to the append-only log, permanently.',
					'The engine applied it and produced a `kill_switch_changed` event whose `firmId` was `undefined`.',
					'The projector enqueued an outbox message from that event, with no firm.',
					'The worker tried to send the email, passed `undefined` to a database parameter, and failed.',
					'It retried. Six times. Reporting **"undefined cannot be passed as argument to the database"** — an error about the database, describing a problem three layers upstream and an hour earlier.'
				]
			},
			{
				type: 'warn',
				text: 'That is what a poisoned log looks like from the outside: a confusing error, in the wrong component, long after the cause. The fix is the parse above — and a second fix in the worker, so that a malformed payload dead-letters immediately with a clear message instead of retrying eight times to prove what the first attempt established.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the sequencer caches its high-water mark',
					'You can explain why `assertSoleWriter` runs on every batch',
					'You can explain why validating twice is worth it at the boundary of an append-only log'
				]
			}
		]
	},

	{
		slug: 'checkpoints',
		title: 'Checkpoints, and the transaction that makes them safe',
		summary:
			'How a consumer remembers where it got to, and the one rule that makes a crash survivable.',
		goal: 'Understand the checkpoint rule well enough to spot its violation anywhere.',
		blocks: [
			{
				type: 'p',
				text: 'The engine reads commands and writes events. If it crashes, it needs to know where it got to. That is a **checkpoint**: a number saying "I have processed everything up to here".'
			},
			{
				type: 'p',
				text: 'It sounds trivial. It is the single easiest thing in this project to get subtly wrong, and both wrong answers are silent.'
			},

			{ type: 'h3', id: 'two-failures', text: 'The two ways to get it wrong' },
			{
				type: 'code',
				file: 'wrong: checkpoint first',
				lang: 'ts',
				code: `
await saveCheckpoint(seq);
await writeEvents(events);   // ← crash here`
			},
			{
				type: 'p',
				text: 'The checkpoint says command 8,134 is done. Its events were never written. On restart the engine starts at 8,135, and **command 8,134 has silently disappeared** — an order somebody placed produced no events and no outcome. Nobody will ever look for it, because nothing recorded that it was missing.'
			},
			{
				type: 'code',
				file: 'wrong: checkpoint last',
				lang: 'ts',
				code: `
await writeEvents(events);
await saveCheckpoint(seq);   // ← crash here`
			},
			{
				type: 'p',
				text: 'The events are written; the checkpoint is not. On restart the engine replays 8,134 and writes its events **again** — a second copy of every trade it caused. Positions double. The ledger balances, because both copies balance, which is the worst kind of wrong: internally consistent and completely false.'
			},

			{ type: 'h3', id: 'the-rule', text: 'The rule' },
			{
				type: 'why',
				title: 'The checkpoint moves in the same transaction as the work',
				text: 'Not before. Not after. **In**. Either both land or neither does, and there is no third outcome for a crash to find.'
			},
			{
				type: 'code',
				file: 'packages/store/src/log.ts',
				lang: 'ts',
				code: `
export async function appendEvents(
	client: Client,
	consumer: string,
	causedBy: number,
	at: number,
	version: number,
	events: readonly Event[]
): Promise<void> {
	/* … */
	await withTransaction(client, async (tx) => {
		for (const body of events) {
			await tx.execute({
				sql: \`INSERT INTO event_log (caused_by, at, version, kind, instrument_id, body)
				      VALUES (?, ?, ?, ?, ?, ?)\`,
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
	});
}`
			},
			{
				type: 'p',
				text: 'The `checkpointIn` call at the bottom is inside the transaction. Always inside.'
			},
			{
				type: 'note',
				text: 'Notice that the rule lives in exactly **one place per consumer**: `appendEvents` for the engine, `applyBatch` for the projector. An individual projector cannot get it wrong, because it never sees the checkpoint. Putting a rule in exactly one place is how you stop it being violated by the fourteenth person to add a consumer.'
			},

			{ type: 'h3', id: 'idempotent', text: 'And every consumer is idempotent anyway' },
			{
				type: 'p',
				text: 'The transaction makes duplicates impossible for the *engine*. Downstream consumers get a second guarantee, because they will be re-run: a crash between reading a batch and committing it means the batch arrives again.'
			},
			{
				type: 'p',
				text: 'So every write a projector makes is idempotent:'
			},
			{
				type: 'ul',
				items: [
					'`INSERT ... ON CONFLICT DO UPDATE`, never a bare insert',
					'`SET filled = ?` computed from the event, never an unguarded `filled = filled + ?`'
				]
			},
			{
				type: 'p',
				text: 'That second one is the important discipline. An unguarded accumulating update is correct exactly once and wrong on every replay — and replay is not an exceptional path here, it is the normal recovery path. The one increment the trade projector does make sits behind an already-projected check keyed on the trade id, so it runs at most once per trade: the guard, not the increment, is what makes it safe.'
			},

			{ type: 'h3', id: 'gaps', text: 'Detecting a gap' },
			{
				type: 'code',
				file: 'packages/store/src/log.ts',
				lang: 'ts',
				code: `
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
		\`SELECT COUNT(*) AS n, COALESCE(MIN(seq), 1) AS lo, COALESCE(MAX(seq), 0) AS hi FROM command_log\`
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
			\`The command log has gaps: \${count} rows spanning \${lo}..\${hi}. \` +
				'The total order is incomplete and replay cannot be trusted.'
		);
	}
}`
			},
			{
				type: 'p',
				text: 'The `lo !== 1` half of the check is not decoration. A log missing its *first* rows still has a contiguous span, so counting rows against the span alone would pass it — pinning the start of the sequence to 1 is what catches that case.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can describe both ways of getting a checkpoint wrong, and what each looks like afterwards',
					'You can state the rule in one sentence',
					'You can explain why an unguarded `filled = filled + ?` is dangerous and `SET filled = ?` computed from the event is not'
				]
			}
		]
	},

	{
		slug: 'snapshots-and-recovery',
		title: 'Snapshots, and the promise they must not break',
		summary:
			'Making restart fast without letting the venue depend on a cache — and the fault-injection test that caught it depending on one.',
		goal: 'Build snapshots and recovery, and prove the snapshot is an optimisation rather than a source of truth.',
		blocks: [
			{
				type: 'p',
				text: 'Replaying a million commands on every restart would work and would take minutes. So the engine periodically writes a **snapshot**: the whole in-memory state, serialised, tagged with the sequence number it represents.'
			},
			{
				type: 'p',
				text: 'Recovery then becomes: load the newest snapshot, replay only the commands after it.'
			},
			{
				type: 'why',
				title: 'The promise',
				text: 'A snapshot is an **optimisation and nothing more**. The log remains sufficient on its own, and a corrupt or missing snapshot must cost replay *time* rather than *correctness*. The moment recovery genuinely needs a snapshot, the log has stopped being the system of record and the whole architecture has quietly become something else.'
			},

			{ type: 'h3', id: 'fingerprint', text: 'Fingerprinting the state' },
			{
				type: 'code',
				file: 'apps/engine/src/snapshot.ts',
				lang: 'ts',
				code: `
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
		// The FNV prime, by shift-and-add, because \`hash * 16777619\` loses
		// precision the moment the product passes 2^53.
		hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
	}

	return hash.toString(16).padStart(8, '0');
}`
			},

			{ type: 'h3', id: 'deserialise', text: 'Rebuilding the book from a snapshot' },
			{
				type: 'p',
				text: 'Serialising the book as a nested structure of levels and queues would work and would be fragile — the invariants (sorted, `total` correct) would have to be preserved by the serialiser and trusted by the deserialiser.'
			},
			{
				type: 'p',
				text: 'Instead we serialise a flat list of orders and **rebuild** the book by resting each one in sequence order. The invariants are re-established by the same code that maintains them normally, so they cannot drift.'
			},
			{
				type: 'code',
				file: 'apps/engine/src/snapshot.ts',
				lang: 'ts',
				code: `
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
	}`
			},

			{ type: 'h3', id: 'bug', text: 'Bug found: a corrupt snapshot took the venue down' },
			{
				type: 'p',
				text: 'Every file in this project says the snapshot is an optimisation. A fault-injection test was written to prove it — write nonsense into `engine_snapshot`, then check recovery produces the same state as before.'
			},
			{
				type: 'terminal',
				code: `FAIL  the snapshot is an optimisation, not a source of truth
      > recovers when the snapshot is corrupt

TypeError: body.instruments is not iterable
 ❯ deserialise apps/engine/src/snapshot.ts:143:28
 ❯ loadSnapshot apps/engine/src/snapshot.ts:263:10
 ❯ recover      apps/engine/src/recover.ts:89:19`
			},
			{
				type: 'p',
				text: 'The exception escaped `recover` and the engine would not start. The claim had been a claim; the property did not exist.'
			},
			{
				type: 'code',
				file: 'apps/engine/src/snapshot.ts',
				lang: 'ts',
				code: `
	/*
	 * A snapshot that will not parse is treated as **absent**, not as an error.
	 *
	 * …
	 *
	 * Returning \`undefined\` makes recovery fall back to replaying from genesis,
	 * which is slower and correct. That is the trade the whole architecture was
	 * built to be able to make, and it does not exist unless this \`catch\` does.
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
			\`[engine] snapshot at seq \${Number(row['seq'])} is unreadable; replaying from genesis instead.\`,
			thrown
		);
		return undefined;
	}`
			},

			{ type: 'h3', id: 'vacuous', text: 'And one more test, so the others mean something' },
			{
				type: 'code',
				file: 'apps/engine/src/chaos.spec.ts',
				lang: 'ts',
				code: `
it('has a snapshot to ignore in the first place', async () => {
	const last = await writeSession(30);
	await runUntil(last);

	/*
	 * Without this, the two tests above pass trivially: if the engine never
	 * wrote a snapshot, "recovers without one" and "recovers from a corrupt
	 * one" are both testing the same empty path, and the suite is green while
	 * proving nothing.
	 *
	 * \`runEngine\` writes one on clean shutdown, so there must be one here.
	 */
	const snapshot = await loadSnapshot(client);

	expect(snapshot).toBeDefined();
	expect(snapshot!.fingerprint).toMatch(/^[0-9a-f]+$/);
});`
			},
			{
				type: 'why',
				title: 'Vacuous tests are worse than no tests',
				text: 'A test that passes because the code path it exercises does not run is *actively harmful*: it is a green tick telling you something is proven when nothing is. Whenever a test asserts "X still works without Y", add a second test asserting Y exists.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can state what a snapshot is and what it is not',
					'You can explain why the book is rebuilt by resting rather than deserialised directly',
					'You can explain what a vacuous test is and how to guard against one'
				]
			}
		]
	},

	{
		slug: 'the-engine-process',
		title: 'The engine process',
		summary:
			'The loop, one transaction per command, graceful shutdown — and the file-descriptor leak that killed it after ten thousand orders.',
		goal: 'Run the engine for real, and see the most serious bug in the project.',
		blocks: [
			{
				type: 'p',
				text: 'The loop is small, and its smallness is the design working. Everything difficult has been pushed into `packages/core`, where it is a pure function anybody can test without a database.'
			},
			{
				type: 'code',
				file: 'apps/engine/src/loop.ts',
				lang: 'ts',
				code: `
while (!signal.aborted) {
	const batch = await readCommands(client, cursor, batchSize);

	if (batch.length === 0) {
		await sleep(idleMs, signal);
		continue;
	}

	// …

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
		// …
	}

	// …
}`
			},

			{ type: 'h3', id: 'resume', text: 'Where to resume from' },
			{
				type: 'code',
				file: 'apps/engine/src/loop.ts',
				lang: 'ts',
				code: `
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
}`
			},
			{
				type: 'p',
				text: 'That can happen when the snapshot was written after a command was applied in memory but before its events committed. Resuming from the *state* would skip that command — the fill would have moved a position in memory and never been written down. Resuming from the **checkpoint** replays it, which is safe precisely because events and checkpoint move together.'
			},

			{ type: 'h3', id: 'shutdown', text: 'Shutting down properly' },
			{
				type: 'code',
				file: 'apps/engine/src/main.ts',
				lang: 'ts',
				code: `
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
		console.log(\`[engine] \${signal} — finishing the current batch\`);
		controller.abort();
	});
}`
			},
			{
				type: 'warn',
				text: 'Handling only `SIGINT` is the usual mistake. `SIGTERM` is what a container runtime sends when it wants the process gone; `SIGINT` is Ctrl-C. Handle only the second and every deploy kills the engine mid-command instead of letting it finish. And **abort**, never `process.exit` — exiting inside a signal handler abandons an open transaction.'
			},

			{ type: 'h3', id: 'bug', text: 'Bug found: the engine leaked two file descriptors per command' },
			{
				type: 'p',
				text: 'A load test asked for ten thousand orders. It failed:'
			},
			{
				type: 'terminal',
				code: `LibsqlError: SQLITE_CANTOPEN: unable to open database file
 ❯ appendEvents packages/store/src/log.ts:200
 ❯ runEngine    apps/engine/src/loop.ts:110`
			},
			{
				type: 'p',
				text: 'An error about being unable to open the database, thrown by code that had the database open the whole time. Disk was fine — 28GB free. So it was file descriptors, and a short script confirmed it:'
			},
			{
				type: 'terminal',
				code: `fds at start: 34
after 1000 transactions: 2033
after 2000 transactions: 4033
after 3000 transactions: 6033
after 4000 transactions: 8033`
			},
			{
				type: 'p',
				text: '`@libsql/client`\'s `client.transaction()` opens a **second connection** to the database, and never releases it. Not on `commit()`. Not on `rollback()`. Not on an explicit `close()`. Two descriptors per transaction, forever.'
			},
			{
				type: 'p',
				text: 'The engine opens one transaction per command, so at the default file-descriptor limit it dies after about ten thousand orders. A venue would have run for a few minutes of real trading.'
			},
			{
				type: 'p',
				text: 'Two alternatives were measured, and both are flat:'
			},
			{
				type: 'terminal',
				code: `=== batch() ===
after 3000: 35

=== explicit BEGIN/COMMIT on the one connection ===
after 3000: 35

=== transaction() + commit() + close() ===
after 500: 1033`
			},
			{
				type: 'code',
				file: 'packages/store/src/client.ts',
				lang: 'ts',
				code: `
/**
 * Run a function inside a transaction, on **this** connection.
 *
 * …
 *
 * \`BEGIN IMMEDIATE\` on the existing connection has none of that. It is also
 * *more* correct for our purposes: \`IMMEDIATE\` takes the write lock at the
 * start rather than upgrading half way through, so a busy venue gets a clean
 * wait on \`busy_timeout\` instead of \`SQLITE_BUSY\` mid-transaction.
 */
export async function withTransaction<T>(
	client: Executor,
	work: (tx: Executor) => Promise<T>
): Promise<T> {
	const previous = chains.get(client) ?? Promise.resolve();

	const run = previous.then(async () => {
		await client.execute('BEGIN IMMEDIATE');

		try {
			const result = await work(client);
			await client.execute('COMMIT');
			return result;
		} catch (thrown) {
			/* … */
			try {
				await client.execute('ROLLBACK');
			} catch {
				// The original error is the one worth having.
			}

			throw thrown;
		}
	});

	// The chain must continue whether this call succeeded or not, or one failed
	// transaction would block every later one on this connection forever.
	chains.set(
		client,
		run.then(
			() => undefined,
			() => undefined
		)
	);

	return run;
}`
			},
			{
				type: 'note',
				text: 'The promise chain is not decoration. SQLite allows one write transaction per connection, and in `apps/engine` the engine loop and the projector loop share a client — without the queue their statements would land in one transaction and commit together. Not a deadlock, not an error, and completely wrong.'
			},
			{
				type: 'why',
				title: 'What a load test is actually for',
				text: 'Not to produce a number for a slide. This bug was invisible below ten thousand transactions, which means it was invisible to every unit test, every integration test, and every hour of manual use. Volume is a *category* of test, and this is the class of thing it finds.'
			},
			{
				type: 'p',
				text: 'There is now a regression test that counts `/proc/self/fd`, so a refactor back to `client.transaction()` fails in two seconds rather than in production.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why the engine uses one transaction per command rather than per batch',
					'You can explain why it resumes from the checkpoint rather than the state',
					'You can explain why `SIGTERM` matters as much as `SIGINT`',
					'You understand what class of bug only volume can find'
				]
			}
		]
	}
];
