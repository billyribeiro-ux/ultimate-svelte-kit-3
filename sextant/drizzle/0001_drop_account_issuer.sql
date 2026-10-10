-- Better Auth 1.7.0 added a required `issuer` column to `account` and a unique
-- index over (issuer, account_id); 1.7.3 withdrew both, and 1.7.7 never writes
-- the column — so a `NOT NULL` it does not fill fails every sign-up on insert.
-- The index goes first because SQLite cannot drop a column an index still
-- names. A new migration, not an edit to 0000: every database that ran 0000
-- has the column, and the journal is how they all arrive at the same shape.
DROP INDEX `account_issuer_accountId_uidx`;--> statement-breakpoint
ALTER TABLE `account` DROP COLUMN `issuer`;