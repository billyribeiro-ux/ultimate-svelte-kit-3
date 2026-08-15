/**
 * Storage: the durable log, and the caches derived from it.
 *
 * Nothing in here knows what a trade is. It moves opaque JSON bodies in a total
 * order and tells consumers where they got to — the meaning lives in
 * `@sequent/protocol` and the rules live in `@sequent/core`.
 */

export * from './client.ts';
export * from './log.ts';
