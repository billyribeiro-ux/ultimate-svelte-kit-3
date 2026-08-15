/**
 * Storage: the durable log, and the caches derived from it.
 *
 * Nothing in the log layer knows what a trade is — it moves opaque JSON bodies
 * in a total order and tells consumers where they got to. The projections do
 * know, and every one of them can be deleted and rebuilt from the log.
 */

export * from './client.ts';
export * from './log.ts';
export * from './ledger.ts';
export * from './projections.ts';
