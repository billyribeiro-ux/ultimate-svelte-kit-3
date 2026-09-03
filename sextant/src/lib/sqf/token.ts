/**
 * TOKENS
 * ======
 *
 * The vocabulary of SQF, and the one design decision that runs through the whole
 * front end: **every token carries its position in the source text.**
 *
 * That costs two numbers per token and it is what makes every error message in
 * this language point at a column rather than saying "syntax error". A parser
 * that throws away positions can never get them back, and retrofitting them
 * means touching every node, every constructor and every test — which is why
 * this is decided here, in the smallest file, before anything is built on it.
 *
 * A `Span` is a half-open range `[start, end)` into the original string, which
 * is what a text editor wants for a squiggly underline and what `String#slice`
 * wants for quoting the offending text back.
 */

/** A half-open range into the query text. */
export interface Span {
	readonly start: number;
	readonly end: number;
}

export const SPAN_NONE: Span = { start: 0, end: 0 };

/** The union of two spans, plus everything between them. */
export function joinSpans(a: Span, b: Span): Span {
	return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

/**
 * Token kinds.
 *
 * Keywords are their own kinds rather than identifiers-with-a-lookup, so the
 * parser switches on a kind and the checker never has to ask "is this string
 * `where`?". The cost is that a keyword cannot be used as a column name, which
 * is a language design decision worth making explicitly: SQF column names come
 * from telemetry that people control, and `where` as a label name would be
 * hostile to read even if it parsed.
 */
export type TokenKind =
	// literals and names
	| 'ident'
	| 'number'
	| 'string'
	| 'duration'
	// keywords
	| 'from'
	| 'where'
	| 'summarize'
	| 'by'
	| 'project'
	| 'sort'
	| 'take'
	| 'and'
	| 'or'
	| 'not'
	| 'asc'
	| 'desc'
	| 'true'
	| 'false'
	| 'null'
	// operators
	/**
	 * Assignment, in `summarize p95 = …`. Never comparison.
	 *
	 * Having both `=` and `==` in a language is a well-known source of bugs, and
	 * the mitigation here is that they are not interchangeable *anywhere*: `=` is
	 * only legal in an alias position and `==` is only legal in an expression, so
	 * writing the wrong one is always a parse error with a specific message
	 * rather than a query that runs and means something else.
	 */
	| '='
	| '=='
	| '!='
	| '<'
	| '<='
	| '>'
	| '>='
	| '=~'
	| '!~'
	| 'contains'
	| 'startswith'
	| 'in'
	| '+'
	| '-'
	| '*'
	| '/'
	// punctuation
	| '('
	| ')'
	| '['
	| ']'
	| ','
	| '.'
	| '|'
	| 'eof';

export interface Token {
	readonly kind: TokenKind;
	/** The exact source text, unprocessed. Escapes in a string are resolved in `value`. */
	readonly text: string;
	/**
	 * The decoded value, for the three kinds that have one.
	 *
	 * A `duration` decodes to milliseconds here rather than in the parser, so that
	 * `5m` and `300s` are indistinguishable by the time anything downstream sees
	 * them — and so the unit table lives in exactly one place.
	 */
	readonly value?: string | number;
	readonly span: Span;
}

/** The keywords, by their exact spelling. Lower case only; SQF is case-sensitive. */
export const KEYWORDS: Readonly<Record<string, TokenKind>> = {
	from: 'from',
	where: 'where',
	summarize: 'summarize',
	by: 'by',
	project: 'project',
	sort: 'sort',
	take: 'take',
	and: 'and',
	or: 'or',
	not: 'not',
	asc: 'asc',
	desc: 'desc',
	true: 'true',
	false: 'false',
	null: 'null',
	contains: 'contains',
	startswith: 'startswith',
	in: 'in'
};

/**
 * Case sensitivity, decided once.
 *
 * SQL is case-insensitive for keywords and this language is not. The reason is
 * that SQF identifiers are *label names from telemetry*, where `Host` and `host`
 * are genuinely different series — so the language cannot fold case for
 * identifiers, and having keywords fold while identifiers do not is the kind of
 * inconsistency that produces a bug report every month forever.
 */
export function isKeyword(text: string): boolean {
	return Object.hasOwn(KEYWORDS, text);
}
