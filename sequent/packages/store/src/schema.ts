/**
 * The schema, as a module rather than a file.
 *
 * It began as `schema.sql` read at startup with `readFile`, which worked
 * perfectly until the first production build: the bundler has no reason to know
 * that a `.sql` file next to a module is needed at runtime, so it did not copy
 * it, and the app died on boot with ENOENT.
 *
 * Embedding it removes the question. The schema is code — it defines the shape
 * of everything the venue knows — and code belongs in modules, where the build
 * system can see it. The cost is a template literal; the benefit is that
 * "does this work when bundled" stops being a separate thing to remember.
 */

export const SCHEMA = String.raw`
-- The venue's storage, in one file.
--
-- Two things live here and they could not be more different in character.
--
-- The **log** is the system of record. Append-only, never updated, never
-- deleted. Everything the venue knows is a function of it, and if the rest of
-- this file were dropped the venue could be rebuilt from the log alone.
--
-- The **projections** are caches. Every one of them is derived from the log,
-- every one can be dropped and rebuilt, and none of them may ever be the only
-- place a fact exists. When a projection disagrees with the log, the log wins —
-- that is not a policy, it is the definition.
--
-- Keeping the distinction visible in the schema is deliberate. A table called
-- \`position\` looks authoritative; a comment saying it is a rebuildable cache is
-- what stops somebody writing to it directly during an incident.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

/* ========================================================================== */
/* The log                                                                     */
/* ========================================================================== */

-- Commands, in the order the sequencer accepted them.
--
-- \`seq\` is an explicit INTEGER PRIMARY KEY rather than an autoincrement,
-- because the sequencer owns it. Letting SQLite choose would mean the ordering
-- authority lived in two places, and the day they disagree is the day replay
-- stops reproducing history.
--
-- There are no UPDATE or DELETE statements against this table anywhere in the
-- codebase. A trigger below enforces that, because "we agreed not to" is not an
-- enforcement mechanism.
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

CREATE INDEX IF NOT EXISTS command_log_firm_idx ON command_log (firm_id, seq);

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
) STRICT;

CREATE INDEX IF NOT EXISTS event_log_caused_by_idx ON event_log (caused_by);
CREATE INDEX IF NOT EXISTS event_log_kind_idx ON event_log (kind, seq);
CREATE INDEX IF NOT EXISTS event_log_instrument_idx ON event_log (instrument_id, seq);

-- Append-only, enforced.
--
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
END;

CREATE TRIGGER IF NOT EXISTS event_log_is_append_only
BEFORE UPDATE ON event_log
BEGIN
	SELECT RAISE(ABORT, 'event_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS event_log_is_permanent
BEFORE DELETE ON event_log
BEGIN
	SELECT RAISE(ABORT, 'event_log is append-only');
END;

/* ========================================================================== */
/* Consumers                                                                   */
/* ========================================================================== */

-- How far each consumer has got.
--
-- The critical rule, and the reason this is a table rather than a file: a
-- consumer writes its checkpoint **inside the same transaction** as the effects
-- of the events it consumed. Either both land or neither does.
--
-- Get that wrong and you get one of two failure modes, both nasty. Checkpoint
-- first and a crash loses events silently — the projection is permanently
-- missing rows nobody will ever look for. Checkpoint last and a crash replays
-- events that already had effects, which is fine only if every effect is
-- idempotent, and "every" is a strong word.
CREATE TABLE IF NOT EXISTS consumer_checkpoint (
	consumer TEXT PRIMARY KEY,
	last_seq INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
) STRICT;

-- Engine state snapshots, so recovery does not always start from genesis.
--
-- A snapshot is an optimisation and nothing more: the log remains sufficient on
-- its own, and a corrupt or missing snapshot costs replay time rather than
-- correctness. That is the property to protect — the moment recovery *needs* a
-- snapshot, the log has stopped being the system of record.
CREATE TABLE IF NOT EXISTS engine_snapshot (
	seq INTEGER PRIMARY KEY,
	taken_at INTEGER NOT NULL,
	version INTEGER NOT NULL,
	-- A hash of the state, so a replay can prove it arrived at the same place.
	fingerprint TEXT NOT NULL,
	body TEXT NOT NULL
) STRICT;

/* ========================================================================== */
/* Projections — every one of these is a rebuildable cache                     */
/* ========================================================================== */

-- The tape: every trade, in the order it happened.
CREATE TABLE IF NOT EXISTS trade (
	trade_id TEXT PRIMARY KEY,
	seq INTEGER NOT NULL,
	instrument_id TEXT NOT NULL,
	at INTEGER NOT NULL,
	price INTEGER NOT NULL,
	quantity INTEGER NOT NULL,
	aggressor TEXT,
	buy_order_id TEXT NOT NULL,
	buy_firm_id TEXT NOT NULL,
	buy_account_id TEXT NOT NULL,
	sell_order_id TEXT NOT NULL,
	sell_firm_id TEXT NOT NULL,
	sell_account_id TEXT NOT NULL,
	buyer_fee INTEGER NOT NULL,
	seller_fee INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS trade_instrument_idx ON trade (instrument_id, seq);
CREATE INDEX IF NOT EXISTS trade_buy_account_idx ON trade (buy_account_id, seq);
CREATE INDEX IF NOT EXISTS trade_sell_account_idx ON trade (sell_account_id, seq);

-- A participant's view of their own orders. The engine holds live orders in
-- memory; this is the durable record, including the ones that are finished.
CREATE TABLE IF NOT EXISTS order_record (
	order_id TEXT PRIMARY KEY,
	seq INTEGER NOT NULL,
	firm_id TEXT NOT NULL,
	account_id TEXT NOT NULL,
	instrument_id TEXT NOT NULL,
	client_order_id TEXT NOT NULL,
	side TEXT NOT NULL,
	price INTEGER,
	quantity INTEGER NOT NULL,
	filled INTEGER NOT NULL DEFAULT 0,
	time_in_force TEXT NOT NULL,
	status TEXT NOT NULL,
	cancel_reason TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS order_record_firm_idx ON order_record (firm_id, seq DESC);
CREATE INDEX IF NOT EXISTS order_record_client_idx ON order_record (firm_id, client_order_id);

-- Net position per account per instrument, with the average price paid.
CREATE TABLE IF NOT EXISTS position (
	account_id TEXT NOT NULL,
	instrument_id TEXT NOT NULL,
	quantity INTEGER NOT NULL,
	-- Cost basis in the same scaled units as price × quantity. Signed, so a
	-- short position carries a negative basis and the P&L arithmetic is the
	-- same expression for both directions.
	cost_basis INTEGER NOT NULL,
	realised_pnl INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (account_id, instrument_id)
) STRICT;

/* ========================================================================== */
/* The ledger — double entry, and the constraint that makes it one             */
/* ========================================================================== */

CREATE TABLE IF NOT EXISTS ledger_account (
	account_id TEXT PRIMARY KEY,
	-- 'firm_cash', 'firm_securities', 'venue_revenue', 'venue_clearing'
	kind TEXT NOT NULL,
	owner_id TEXT NOT NULL,
	currency TEXT NOT NULL,
	instrument_id TEXT
) STRICT;

-- A transaction is a group of postings that must sum to zero.
CREATE TABLE IF NOT EXISTS ledger_transaction (
	transaction_id TEXT PRIMARY KEY,
	seq INTEGER NOT NULL,
	at INTEGER NOT NULL,
	kind TEXT NOT NULL,
	reference TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS ledger_posting (
	posting_id INTEGER PRIMARY KEY AUTOINCREMENT,
	transaction_id TEXT NOT NULL REFERENCES ledger_transaction (transaction_id),
	account_id TEXT NOT NULL REFERENCES ledger_account (account_id),
	amount INTEGER NOT NULL,
	CHECK (amount <> 0)
) STRICT;

CREATE INDEX IF NOT EXISTS ledger_posting_account_idx ON ledger_posting (account_id);
CREATE INDEX IF NOT EXISTS ledger_posting_transaction_idx ON ledger_posting (transaction_id);

-- Corrections are reversing entries, never updates. Same rule as the log, and
-- for the same reason: an accountant's question is "what did you think in
-- March", and an updated row cannot answer it.
CREATE TRIGGER IF NOT EXISTS ledger_posting_is_permanent
BEFORE UPDATE ON ledger_posting
BEGIN
	SELECT RAISE(ABORT, 'ledger postings are immutable; post a reversing entry');
END;

/* ========================================================================== */
/* Tenancy — firms, their people, and what each may do                         */
/* ========================================================================== */

-- A firm is the tenant. Everything else hangs off one.
CREATE TABLE IF NOT EXISTS firm (
	firm_id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	-- Simulated billing: seats bought, and the plan's ceiling.
	plan TEXT NOT NULL DEFAULT 'starter',
	seats INTEGER NOT NULL DEFAULT 1,
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL
) STRICT;

-- A trading account. A firm may have several — a desk each, say — and risk
-- limits are set per account rather than per firm, because that is the level
-- at which a risk manager actually thinks.
CREATE TABLE IF NOT EXISTS trading_account (
	account_id TEXT PRIMARY KEY,
	firm_id TEXT NOT NULL REFERENCES firm (firm_id),
	name TEXT NOT NULL,
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS trading_account_firm_idx ON trading_account (firm_id);

CREATE TABLE IF NOT EXISTS venue_user (
	user_id TEXT PRIMARY KEY,
	firm_id TEXT NOT NULL REFERENCES firm (firm_id),
	email TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	password_hash TEXT NOT NULL,
	-- 'trader' | 'risk_manager' | 'firm_admin' | 'auditor' | 'venue_operator'
	role TEXT NOT NULL,
	is_active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL
) STRICT;

-- Which accounts a trader may send orders for. A firm_admin implicitly has all
-- of them; a trader has exactly what is listed here and nothing else.
CREATE TABLE IF NOT EXISTS account_assignment (
	user_id TEXT NOT NULL REFERENCES venue_user (user_id) ON DELETE CASCADE,
	account_id TEXT NOT NULL REFERENCES trading_account (account_id) ON DELETE CASCADE,
	PRIMARY KEY (user_id, account_id)
) STRICT;

CREATE TABLE IF NOT EXISTS session (
	session_id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES venue_user (user_id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS session_user_idx ON session (user_id);

-- API keys, for the algorithms.
--
-- Only the hash is stored. The secret is shown once, at creation, and if the
-- holder loses it they get a new key — which is the correct trade: a venue that
-- can show you your own key can also be compelled to show it to somebody else.
CREATE TABLE IF NOT EXISTS api_key (
	key_id TEXT PRIMARY KEY,
	firm_id TEXT NOT NULL REFERENCES firm (firm_id),
	account_id TEXT REFERENCES trading_account (account_id),
	label TEXT NOT NULL,
	secret_hash TEXT NOT NULL,
	-- Space-separated: 'read', 'trade', 'admin'.
	scopes TEXT NOT NULL,
	rate_per_second INTEGER NOT NULL DEFAULT 20,
	revoked_at INTEGER,
	last_used_at INTEGER,
	created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS api_key_firm_idx ON api_key (firm_id);

/* ========================================================================== */
/* The outbox — how a side effect becomes atomic with the fact it reports      */
/* ========================================================================== */

-- Writing to the database and then calling somebody's webhook is two writes
-- with no ordering that is correct: commit first and a crash loses the
-- notification forever, send first and a rollback notifies about a trade that
-- did not happen. So the *intent to send* is written in the same transaction as
-- the fact, and a separate process does the sending.
CREATE TABLE IF NOT EXISTS outbox (
	outbox_id INTEGER PRIMARY KEY AUTOINCREMENT,
	kind TEXT NOT NULL,
	-- The event sequence that caused this. For ordering, and for answering
	-- "why was this sent" six weeks later.
	seq INTEGER NOT NULL,
	firm_id TEXT,
	-- Unique, so a projector replaying the same event does not enqueue twice.
	-- Projectors are re-run after every crash; without this, every restart
	-- re-notifies every firm about the last batch.
	idempotency_key TEXT NOT NULL UNIQUE,
	payload TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	-- When this may next be attempted. Backoff is a value here, not a sleep.
	available_at INTEGER NOT NULL,
	attempts INTEGER NOT NULL DEFAULT 0,
	-- A lease, not a lock: if the worker dies the lease expires and the next
	-- worker picks the message up. Nothing has to detect the crash.
	leased_until INTEGER,
	leased_by TEXT,
	delivered_at INTEGER,
	failed_at INTEGER,
	last_error TEXT
) STRICT;

-- The index claim runs on. Ordered to match the WHERE clause: the two null
-- checks narrow hardest, then the time comparison.
CREATE INDEX IF NOT EXISTS outbox_ready_idx
	ON outbox (delivered_at, failed_at, available_at, outbox_id);

CREATE INDEX IF NOT EXISTS outbox_dead_idx ON outbox (failed_at)
	WHERE failed_at IS NOT NULL;

/* ========================================================================== */
/* Webhooks                                                                    */
/* ========================================================================== */

-- Note secret is stored in clear, unlike api_key.secret_hash.
--
-- Not an oversight, and worth understanding: an API key is only ever
-- *verified*, so a one-way hash is enough. A webhook secret must be *used* to
-- compute a signature on every delivery, so the original bytes are required. A
-- hashed signing key cannot sign.
--
-- The consequence is that this table is more sensitive than api_key: a dump
-- of it lets somebody forge our webhooks to our members. In production these
-- belong behind a KMS.
CREATE TABLE IF NOT EXISTS webhook_endpoint (
	endpoint_id TEXT PRIMARY KEY,
	firm_id TEXT NOT NULL REFERENCES firm (firm_id),
	url TEXT NOT NULL,
	secret TEXT NOT NULL,
	-- Space-separated event names, matched with LIKE on ' ' || events || ' '.
	events TEXT NOT NULL,
	is_active INTEGER NOT NULL DEFAULT 1,
	-- An endpoint that fails this many times running has been decommissioned
	-- and nobody told us. It gets switched off so it stops burning throughput
	-- that firms who *are* listening are waiting for.
	consecutive_failures INTEGER NOT NULL DEFAULT 0,
	last_success_at INTEGER,
	created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS webhook_endpoint_firm_idx ON webhook_endpoint (firm_id, is_active);

-- Every attempt, kept. When a member says "we never got the fill", this is the
-- table that answers, and an aggregate counter could not.
CREATE TABLE IF NOT EXISTS webhook_delivery (
	delivery_id TEXT PRIMARY KEY,
	endpoint_id TEXT NOT NULL REFERENCES webhook_endpoint (endpoint_id),
	outbox_id INTEGER NOT NULL,
	event TEXT NOT NULL,
	status TEXT NOT NULL,
	status_code INTEGER,
	duration_ms INTEGER NOT NULL,
	error TEXT,
	at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS webhook_delivery_endpoint_idx ON webhook_delivery (endpoint_id, at DESC);

/* ========================================================================== */
/* Email — the same outbox, a different sink                                   */
/* ========================================================================== */

-- Not a queue. The outbox is the queue; this is the record of what was sent,
-- so a support conversation about "did the daily statement go out" has an
-- answer that does not involve reading the mail provider's dashboard.
CREATE TABLE IF NOT EXISTS email_sent (
	email_id TEXT PRIMARY KEY,
	outbox_id INTEGER NOT NULL,
	firm_id TEXT,
	recipient TEXT NOT NULL,
	subject TEXT NOT NULL,
	template TEXT NOT NULL,
	at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS email_sent_recipient_idx ON email_sent (recipient, at DESC);

/* ========================================================================== */
/* Billing                                                                     */
/* ========================================================================== */

-- An issued invoice never changes.
--
-- Same rule as the ledger and the log, and the same reason: "what did we bill
-- them in March" must have an answer, and an updated row cannot give one. A
-- correction is a credit note.
--
-- The lines are JSON rather than a child table. They are written once, read
-- whole, and never queried across — so a table would buy a join and cost the
-- guarantee that an invoice is one row that either exists or does not.
CREATE TABLE IF NOT EXISTS invoice (
	invoice_id TEXT PRIMARY KEY,
	firm_id TEXT NOT NULL REFERENCES firm (firm_id),
	plan_id TEXT NOT NULL,
	period_start INTEGER NOT NULL,
	period_end INTEGER NOT NULL,
	-- Scaled integer units, exactly like every price and fee in the venue, so a
	-- trading fee can be compared with an invoice line without a conversion.
	total INTEGER NOT NULL,
	lines TEXT NOT NULL,
	issued_at INTEGER NOT NULL,
	-- Simulated. A real venue would carry a provider reference here.
	paid_at INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS invoice_firm_idx ON invoice (firm_id, period_start DESC);

CREATE TRIGGER IF NOT EXISTS invoice_is_immutable
BEFORE UPDATE OF total, lines, period_start, period_end ON invoice
BEGIN
	SELECT RAISE(ABORT, 'an issued invoice cannot be changed; raise a credit note');
END;

-- Note: \`firm.billable_from\` is added by migration 1 rather than here.
--
-- This file is written entirely in CREATE TABLE IF NOT EXISTS so it can be run
-- against any database safely. \`ALTER TABLE\` has no such guard: it would
-- succeed once and then fail every subsequent start with "duplicate column
-- name". Changes to an existing shape belong in \`migrate.ts\`.

`;
