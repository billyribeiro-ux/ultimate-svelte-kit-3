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
-- `position` looks authoritative; a comment saying it is a rebuildable cache is
-- what stops somebody writing to it directly during an incident.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

/* ========================================================================== */
/* The log                                                                     */
/* ========================================================================== */

-- Commands, in the order the sequencer accepted them.
--
-- `seq` is an explicit INTEGER PRIMARY KEY rather than an autoincrement,
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
-- `caused_by` points at the command that produced this event. It is the single
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
