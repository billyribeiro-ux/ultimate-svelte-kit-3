/**
 * Versioned rules, and the question that makes event sourcing hard to live with.
 *
 * Here is the problem in one paragraph.
 *
 * On Tuesday you change the matching logic — a bug in self-trade prevention,
 * say, or a new tick ladder. On Wednesday an auditor asks you to reconstruct
 * last month. You replay the log, Tuesday's rules apply to March's commands,
 * and the replay produces trades that never happened. Nothing errors. The
 * numbers simply, quietly, disagree with the fills you reported to participants
 * and settled in cash — and the disagreement is in the direction of your own
 * source of truth, so it is your reconstruction that looks authoritative.
 *
 * Most systems that hit this discover it during the investigation.
 *
 * The two wrong answers are worth naming, because both are tempting:
 *
 *   **"Never change the rules."** A venue that cannot fix a bug in its matching
 *   logic is a venue that ships the bug forever.
 *
 *   **"Re-stamp the old commands."** Rewriting the log to say the new rules
 *   always applied is falsifying records. It is also very easy, which is what
 *   makes it dangerous.
 *
 * The right answer is to keep every version of the rules and record which one
 * was in force. The sequencer stamps each command as it arrives; the engine
 * dispatches on that stamp rather than on whatever it happens to have compiled
 * in. Replaying March runs March's rules. Replaying today runs today's. Both are
 * exact, and the log never changes.
 *
 * The cost is real and it is the price of admission: old rule versions can never
 * be deleted, they have to keep compiling, and they have to keep being tested.
 * A test below asserts that every version in `SUPPORTED_VERSIONS` has an
 * implementation, so removing one fails the build rather than making a stretch
 * of history unreplayable.
 */

import { apply, type EngineState } from '@sequent/core';
import { isSupportedVersion, type Event, type SequencedCommand } from '@sequent/protocol';

/** One version of the venue's rules. */
export type RuleSet = (state: EngineState, command: SequencedCommand) => Event[];

/**
 * Every rule version the engine can run, by version number.
 *
 * Today there is one, and `apply` is it. That is the honest starting state and
 * the structure matters more than the contents: when version 2 arrives, it goes
 * in here beside version 1 rather than replacing it, and the diff shows a
 * developer adding a rule set rather than editing history.
 *
 * When that day comes, version 1 becomes a frozen copy of today's `apply` — and
 * the frozen copy is the point. A shared implementation with `if (version === 2)`
 * scattered through it drifts: somebody fixes a bug in a branch both versions
 * take, and March quietly starts replaying differently.
 */
const RULES: Readonly<Record<number, RuleSet>> = {
	1: apply
};

/**
 * The rules that were in force for a command.
 *
 * Throws rather than falling back to the current version. A fallback would make
 * an unknown version replay under today's rules and produce a plausible,
 * confident, wrong answer — which is the exact failure this whole file exists to
 * prevent. Refusing to guess is the feature.
 */
export function rulesFor(version: number): RuleSet {
	if (!isSupportedVersion(version)) {
		throw new Error(
			`No rules for version ${version}. This engine cannot replay that part of the log; ` +
				'deploy a build that still contains the version rather than guessing.'
		);
	}

	const rules = RULES[version];
	if (!rules) {
		throw new Error(`Version ${version} is declared supported but has no implementation`);
	}

	return rules;
}

/** Which versions this build can actually run. Used by the startup check. */
export function implementedVersions(): number[] {
	return Object.keys(RULES)
		.map(Number)
		.sort((a, b) => a - b);
}
