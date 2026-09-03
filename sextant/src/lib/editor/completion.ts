/**
 * COMPLETION
 * ==========
 *
 * What to offer at the caret, and — much harder — what *not* to offer.
 *
 * A completion list that shows every identifier in the language is a list nobody
 * reads. The value is entirely in the filtering: after `from ` there are exactly
 * three legal words, and showing three is the difference between an editor that
 * teaches the language and one that requires you to already know it.
 *
 * WHY THIS IS NOT THE PARSER
 * --------------------------
 * The obvious approach is to parse and ask the tree what belongs at the offset.
 * It does not work, and the reason is structural: **the text under a caret is
 * almost always syntactically invalid.** Somebody typing `from logs | where sta`
 * has an incomplete expression, and `| ` on its own has no stage at all. A parser
 * built to reject invalid input has nothing useful to say about either.
 *
 * So completion works off the **token stream**, which the lexer produces for any
 * input at all, and reconstructs just enough structure — which stage we are in,
 * whether we are left or right of a comparison — to know what is legal. That is
 * a few dozen lines and it is robust precisely because it understands so little.
 *
 * The check that runs alongside it *does* use the parser, because an error
 * message is about text somebody has finished typing.
 */

import { lex } from '#lib/sqf/lexer.ts';
import { KEYWORDS, type Token } from '#lib/sqf/token.ts';
import { FUNCTIONS, TABLES, columnFor, tableFor } from '#lib/sqf/schema.ts';
import { SOURCES, type Source } from '#lib/sqf/ast.ts';

export type CompletionKind = 'source' | 'stage' | 'column' | 'function' | 'keyword' | 'value';

export interface Completion {
	readonly label: string;
	readonly kind: CompletionKind;
	/** The type or signature, shown dimmed to the right of the label. */
	readonly detail: string;
	readonly doc: string;
	/** What actually goes into the text. Differs from the label for calls and strings. */
	readonly insert: string;
	/**
	 * Where to leave the caret, as an offset into `insert`.
	 *
	 * `count()` inserts six characters and puts the caret at 6 — past the
	 * parentheses, because it takes no arguments. `avg()` puts it at 4, inside
	 * them. Getting this wrong is the difference between completion saving a
	 * keystroke and costing one.
	 */
	readonly caret: number;
}

/** What the editor knows that the schema does not: the values actually present. */
export interface Catalogue {
	readonly source: Source;
	/** Service names seen recently. Used to complete `service == "…"`. */
	readonly services: readonly string[];
}

export interface CompletionResult {
	/** The characters the completion replaces: `[from, to)` in the source. */
	readonly from: number;
	readonly to: number;
	readonly prefix: string;
	readonly items: readonly Completion[];
}

/**
 * The stages, with what each one is for.
 *
 * Duplicated from the parser's keyword table on purpose: the parser needs the
 * spelling and this needs the sentence, and threading documentation through the
 * token definitions would put prose in the hottest file in the front end.
 */
const STAGES: readonly { name: string; doc: string }[] = [
	{ name: 'where', doc: 'Keep only the rows matching a condition.' },
	{ name: 'summarize', doc: 'Aggregate, optionally grouped with `by`.' },
	{ name: 'project', doc: 'Choose and rename the columns to keep.' },
	{ name: 'sort', doc: 'Order the rows, `asc` or `desc`.' },
	{ name: 'take', doc: 'Keep the first N rows.' }
];

/** Where the caret is, in terms of what is legal there. */
type Place =
	| { kind: 'source' }
	| { kind: 'stage' }
	/** An expression. `aggregates` says whether an aggregation is legal here. */
	| { kind: 'expr'; aggregates: boolean }
	/** The right-hand side of a comparison against a known column. */
	| { kind: 'value'; column: string }
	/** After `sort by x`, where a direction goes. */
	| { kind: 'direction' };

export function completionsAt(
	source: string,
	cursor: number,
	catalogue: Catalogue
): CompletionResult {
	const { tokens } = lex(source);

	const from = replaceFrom(source, tokens, cursor);
	const prefix = source.slice(from, cursor);

	const place = placeAt(tokens, from);
	const items = offer(place, catalogue);

	return { from, to: cursor, prefix, items: rank(items, prefix) };
}

/**
 * The start of the text a completion would replace.
 *
 * Two cases, and the second is the one that is easy to get wrong.
 *
 * Inside a **string** the range starts at the opening quote, so completing
 * `service == "payments-w` replaces `"payments-w` with `"payments-worker"`
 * rather than replacing just `w`. Walking back over word characters would stop
 * at the hyphen and produce `"payments-payments-worker"` — a bug that hides
 * completely behind a test whose fixtures happen not to contain a hyphen. The
 * lexer emits a `string` token for an unterminated string precisely so that this
 * case has a token to ask.
 *
 * Everywhere else it is the identifier under the caret, taken from the raw
 * characters rather than from a token, because `service.` lexes as two tokens
 * and reads as one name to the person typing it.
 */
function replaceFrom(source: string, tokens: readonly Token[], cursor: number): number {
	for (const token of tokens) {
		if (token.kind !== 'string') continue;
		if (token.span.start < cursor && cursor <= token.span.end) return token.span.start;
	}

	let at = cursor;
	while (at > 0 && /[A-Za-z0-9_.]/.test(source[at - 1]!)) at -= 1;
	return at;
}

/**
 * Which of the five places the caret is in.
 *
 * One left-to-right pass over the tokens before the caret. No stack and no
 * nesting: SQF pipelines are flat, and the only nesting is inside parentheses,
 * where the answer — "an expression" — is the same as outside them.
 */
function placeAt(tokens: readonly Token[], cursor: number): Place {
	const before = tokens.filter((token) => token.kind !== 'eof' && token.span.end <= cursor);
	const last = before[before.length - 1];

	// Nothing yet, or still inside the first word: the query starts with `from`.
	if (!last) return { kind: 'stage' };
	if (last.kind === 'from') return { kind: 'source' };

	/*
	 * Walk backwards to the nearest pipe, and take the first token after it as the
	 * stage. Backwards rather than forwards because only the *current* stage
	 * matters, and a query can have twenty.
	 */
	let pipe = -1;
	for (let i = before.length - 1; i >= 0; i -= 1) {
		if (before[i]!.kind === '|') {
			pipe = i;
			break;
		}
	}

	// Before any pipe at all: still naming the source.
	if (pipe === -1) return before.length <= 2 ? { kind: 'source' } : { kind: 'stage' };

	const head = before[pipe + 1];
	if (!head) return { kind: 'stage' };

	// A value completion beats every structural answer: `service == "` is a place
	// where only strings are legal, whatever stage it is in.
	const value = valueContext(before);
	if (value) return { kind: 'value', column: value };

	switch (head.kind) {
		case 'where':
			return { kind: 'expr', aggregates: false };
		case 'project':
			return { kind: 'expr', aggregates: false };
		case 'take':
			// A number, and nothing this can helpfully suggest.
			return { kind: 'expr', aggregates: false };
		case 'sort': {
			const previous = before[before.length - 1]!;
			// Directly after an expression, a direction is what comes next.
			if (previous.kind === 'ident' || previous.kind === ')') return { kind: 'direction' };
			return { kind: 'expr', aggregates: false };
		}
		case 'summarize': {
			/*
			 * `summarize` has two halves and they allow different things.
			 *
			 * Before `by`, aggregations are required and bare columns are an error.
			 * After it, the opposite. Offering `count()` in a `by` list is offering
			 * something that will always fail the check — which is worse than offering
			 * nothing, because it looks like an endorsement.
			 */
			const by = before.slice(pipe + 1).some((token) => token.kind === 'by');
			return { kind: 'expr', aggregates: !by };
		}
		default:
			// A pipe followed by something that is not a stage keyword: they are still
			// typing the stage name.
			return { kind: 'stage' };
	}
}

/**
 * Is the caret on the right of a comparison against a column?
 *
 * Looks at the last two significant tokens. `service == ` gives `service`, and
 * so does `service in [` — the `[` sits between, so the scan skips it. Anything
 * else gives nothing, and the caller falls back to a structural answer.
 */
function valueContext(before: readonly Token[]): string | undefined {
	const comparisons = new Set(['==', '!=', '=~', '!~', 'contains', 'startswith', 'in']);

	// Skip back over an open bracket and any complete list items already typed, so
	// that `service in ["a", "b", ` still knows the column.
	let at = before.length - 1;
	while (at >= 0 && ['[', ',', 'string', 'number'].includes(before[at]!.kind)) at -= 1;

	const operator = before[at];
	const column = before[at - 1];

	if (!operator || !column) return undefined;
	if (!comparisons.has(operator.kind)) return undefined;
	if (column.kind !== 'ident') return undefined;

	return column.text;
}

function offer(place: Place, catalogue: Catalogue): Completion[] {
	switch (place.kind) {
		case 'source':
			return TABLES.map((table) => ({
				label: table.name,
				kind: 'source' as const,
				detail: 'source',
				doc: table.doc,
				insert: table.name,
				caret: table.name.length
			}));

		case 'stage':
			return STAGES.map((stage) => ({
				label: stage.name,
				kind: 'stage' as const,
				detail: 'stage',
				doc: stage.doc,
				insert: `${stage.name} `,
				caret: stage.name.length + 1
			}));

		case 'direction':
			return [
				{
					label: 'asc',
					kind: 'keyword',
					detail: 'direction',
					doc: 'Smallest first.',
					insert: 'asc',
					caret: 3
				},
				{
					label: 'desc',
					kind: 'keyword',
					detail: 'direction',
					doc: 'Largest first. Usually what you want for a duration.',
					insert: 'desc',
					caret: 4
				}
			];

		case 'value': {
			const column = columnFor(catalogue.source, place.column);

			// Only `service` has a value list worth offering. A generic "distinct
			// values of this column" would be a full scan on every keystroke, and for
			// a column like `message` it would be a list as long as the data.
			if (place.column !== 'service' || !column) return [];

			return catalogue.services.map((service) => ({
				label: service,
				kind: 'value' as const,
				detail: 'service',
				doc: 'Seen in the last 24 hours.',
				insert: `"${service}"`,
				caret: service.length + 2
			}));
		}

		case 'expr': {
			const table = tableFor(catalogue.source);

			const columns: Completion[] = table.columns.map((column) => ({
				label: column.name,
				kind: 'column' as const,
				detail: column.type,
				doc: column.doc,
				insert: column.name,
				caret: column.name.length
			}));

			const functions: Completion[] = FUNCTIONS.filter(
				(fn) => place.aggregates || !fn.aggregate
			).map((fn) => ({
				label: fn.name,
				kind: 'function' as const,
				detail: `(${fn.params.join(', ')}) → ${fn.returns}`,
				doc: fn.doc,
				insert: `${fn.name}()`,
				// Inside the parentheses when there are arguments, past them when there
				// are none. `count()` never wants a caret between its brackets.
				caret: fn.params.length === 0 ? fn.name.length + 2 : fn.name.length + 1
			}));

			const operators: Completion[] = ['and', 'or', 'not', 'contains', 'startswith', 'in']
				.filter((word) => word in KEYWORDS)
				.map((word) => ({
					label: word,
					kind: 'keyword' as const,
					detail: 'operator',
					doc: '',
					insert: `${word} `,
					caret: word.length + 1
				}));

			return [...columns, ...functions, ...operators];
		}
	}
}

/**
 * Filter and order.
 *
 * Three rules, in this order: a prefix match beats a substring match, a shorter
 * label beats a longer one, and alphabetical breaks the tie. Fuzzy matching —
 * where `dur` matches `p95_duration_ms` — is deliberately absent: it is
 * wonderful in a file finder, where you know the answer and are recalling it,
 * and confusing in a schema you are still learning, because it puts things you
 * have never heard of at the top of a list.
 */
function rank(items: readonly Completion[], prefix: string): Completion[] {
	if (prefix === '') {
		return [...items].sort((a, b) => a.label.localeCompare(b.label));
	}

	const needle = prefix.toLowerCase().replace(/^"/, '');

	return items
		.map((item) => {
			const label = item.label.toLowerCase();
			if (label.startsWith(needle)) return { item, score: 0 };
			if (label.includes(needle)) return { item, score: 1 };
			return { item, score: 2 };
		})
		.filter((entry) => entry.score < 2)
		.sort(
			(a, b) =>
				a.score - b.score ||
				a.item.label.length - b.item.label.length ||
				a.item.label.localeCompare(b.item.label)
		)
		.map((entry) => entry.item);
}

/** The sources, for the editor's placeholder text. Exported so the list is stated once. */
export const SOURCE_NAMES: readonly string[] = SOURCES;
