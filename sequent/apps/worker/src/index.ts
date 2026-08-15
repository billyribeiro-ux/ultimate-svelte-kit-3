/**
 * The worker process.
 *
 * Turns rows in the outbox into requests to somebody else's server. It decides
 * nothing — every message it sends was written transactionally by whoever knew
 * the fact — and its whole job is retrying until the outside world cooperates.
 */

export * from './deliver.ts';
export * from './loop.ts';
