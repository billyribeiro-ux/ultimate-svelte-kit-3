/**
 * ERRORS THAT POINT AT SOMETHING
 * ==============================
 *
 * One error type for the whole front end — lexer, parser, checker — because a
 * person typing a query does not care which phase objected, only where and why.
 *
 * Every error carries a `Span`, so the editor can underline the exact text, and
 * a `hint` where there is something concrete to suggest. The distinction between
 * `message` and `hint` matters: the message says what is wrong, the hint says
 * what to do, and mixing them produces the "expected one of: 47 tokens" style of
 * message that is technically complete and practically useless.
 */

import type { Span } from './token.ts';

export class SqfError extends Error {
	readonly span: Span;
	/** A concrete suggestion, when there is one. Never a restatement of the message. */
	readonly hint: string | undefined;

	constructor(message: string, span: Span, hint?: string) {
		super(message);
		this.name = 'SqfError';
		this.span = span;
		this.hint = hint;
	}

	/**
	 * The error rendered against the source, the way a compiler prints one.
	 *
	 * Used by the test suite and by the CLI in `scripts/`. The editor does not use
	 * it — it has the span and draws its own underline — but having a text form
	 * means a failing test says what went wrong instead of `expected true to be
	 * false`.
	 */
	format(source: string): string {
		const before = source.slice(0, this.span.start);
		const line = before.split('\n').length;
		const column = this.span.start - (before.lastIndexOf('\n') + 1);
		const width = Math.max(1, this.span.end - this.span.start);

		const text = source.split('\n')[line - 1] ?? '';

		return [
			`${this.message} (line ${line}, column ${column + 1})`,
			`  ${text}`,
			`  ${' '.repeat(column)}${'^'.repeat(width)}`,
			...(this.hint ? [`  hint: ${this.hint}`] : [])
		].join('\n');
	}
}

/**
 * Did-you-mean, by edit distance.
 *
 * Bounded at distance 2 and at a third of the word's length, because past that
 * the suggestion is noise: proposing `duration` for a typo of `d` is worse than
 * proposing nothing, and a wrong suggestion is followed more often than no
 * suggestion is ignored.
 */
export function nearest(word: string, candidates: readonly string[]): string | undefined {
	let best: string | undefined;
	let bestDistance = Math.min(2, Math.floor(word.length / 3)) + 1;

	for (const candidate of candidates) {
		const distance = editDistance(word, candidate);
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}

	return best;
}

/**
 * Levenshtein distance, two rows rather than a full matrix.
 *
 * Called with a handful of candidates on a keystroke, so it is not hot — but a
 * full matrix for a schema with two hundred columns allocates two hundred arrays
 * per keypress, and the two-row version is the same eight lines.
 */
function editDistance(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
	let current = new Array<number>(b.length + 1);

	for (let i = 1; i <= a.length; i += 1) {
		current[0] = i;
		for (let j = 1; j <= b.length; j += 1) {
			const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
			current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution);
		}
		[previous, current] = [current, previous];
	}

	return previous[b.length]!;
}
