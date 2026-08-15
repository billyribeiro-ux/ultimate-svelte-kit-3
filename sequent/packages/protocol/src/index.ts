/**
 * The contract between every process in Sequent.
 *
 * The web gateway, the engine and the worker share nothing except this package.
 * They do not share a database connection, a class, or a helper — only a
 * vocabulary of commands and events and the rules for reading them.
 *
 * That constraint is what makes the architecture real rather than decorative.
 * If the gateway could reach into the engine's state, it eventually would, and
 * the day the engine moves to another machine — or another language — every one
 * of those reaches becomes a rewrite.
 */

export * from './ids.ts';
export * from './money.ts';
export * from './commands.ts';
export * from './events.ts';
export * from './version.ts';
