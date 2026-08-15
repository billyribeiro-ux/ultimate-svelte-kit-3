/**
 * The deterministic core.
 *
 * Everything in this package is a function of its arguments. No clock, no
 * randomness, no filesystem, no network — and the tsconfig has `"types": []`,
 * so most of those are not even nameable here.
 *
 * That is what makes the whole architecture work: the log is the system of
 * record, and this package is the rule for turning it into a venue.
 */

export * from './book.ts';
export * from './state.ts';
export * from './risk.ts';
export * from './auction.ts';
export * from './apply.ts';
