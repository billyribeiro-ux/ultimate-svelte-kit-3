/**
 * Rule versions, and the question they answer.
 *
 * Here is the problem, and it is the one that separates event sourcing as an
 * idea from event sourcing as a system you can run for years.
 *
 * On Tuesday you change the matching rules — say, self-trade prevention starts
 * cancelling the resting order instead of both. On Wednesday somebody replays
 * the log from genesis to investigate a complaint. The replay applies Tuesday's
 * rules to Monday's commands, produces different trades from the ones that
 * actually happened, and now your audit trail is fiction. It is *confident*
 * fiction: nothing errors, the numbers just quietly disagree with the fills you
 * reported to participants and settled in cash.
 *
 * The fix is not to freeze the rules — a venue that can never change its
 * matching logic is a venue that can never fix a bug in it. The fix is to keep
 * every version of the rules and record which one applied.
 *
 * So the sequencer stamps each command with the version in force when it
 * arrived, and the engine dispatches on that stamp rather than on whatever it
 * happens to have compiled in. Replaying Monday runs Monday's rules. Replaying
 * Wednesday runs Wednesday's. Both are exact.
 *
 * The cost is honest and worth naming: old rule versions can never be deleted,
 * and they have to keep compiling and keep being tested. That is the price of
 * being able to reconstruct any moment in the venue's history, and it is
 * cheaper than the alternative.
 */

/** The version a newly arriving command is stamped with. */
export const CURRENT_VERSION = 1;

/**
 * Every version the engine can still replay.
 *
 * Entries are only ever added. Removing one makes a stretch of history
 * unreplayable, which is a data-loss event with no error message — so the array
 * is `as const` and the test suite asserts that every version in the log has an
 * implementation.
 */
export const SUPPORTED_VERSIONS = [1] as const;

export type RuleVersion = (typeof SUPPORTED_VERSIONS)[number];

export function isSupportedVersion(version: number): version is RuleVersion {
	return (SUPPORTED_VERSIONS as readonly number[]).includes(version);
}

/**
 * What changed, in prose, for the people who have to read a replay.
 *
 * A changelog in code rather than in a wiki, because the wiki will be wrong.
 * When an auditor asks why two identical-looking orders behaved differently in
 * March and in May, this is the answer.
 */
export const VERSION_NOTES: Readonly<Record<RuleVersion, string>> = {
	1: 'Initial rules: price-time priority, limit and market orders, GTC/DAY/IOC/FOK, self-trade prevention, price collars, call auctions.'
};
