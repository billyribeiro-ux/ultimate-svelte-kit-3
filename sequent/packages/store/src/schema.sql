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
