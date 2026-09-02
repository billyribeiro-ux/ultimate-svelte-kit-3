/**
 * SYNTAX HIGHLIGHTING, FROM THE REAL LEXER
 * ========================================
 *
 * Every editor on the web highlights with a pile of regular expressions, and
 * every one of them is subtly wrong: `"a | b"` gets a pipe coloured inside a
 * string, `1e-5` becomes a number and a minus, `contains` inside an identifier
 * lights up as a keyword. Those are not bugs to fix one at a time — they are
 * what happens when the highlighter and the parser disagree about the language.
 *
 * There is a lexer four files away that is already correct, already tested, and
 * already produces a `Span` for every token. Using it means the highlighting is
 * *by construction* the same tokenisation the query will be parsed with, and it
 * means adding a keyword to the language highlights it with no further work.
 *
 * The one thing the lexer does not emit is whitespace and unrecognised text,
 * because a parser has no use for either. This file fills the gaps, so the
 * output covers the source exactly — which it must, since it is rendered
 * underneath a transparent textarea and any missing character shifts every
 * character after it.
 */

import { lex } from '#lib/sqf/lexer.ts';
import { KEYWORDS, type TokenKind } from '#lib/sqf/token.ts';
import { functionFor } from '#lib/sqf/schema.ts';

export type Category =
	| 'keyword'
	| 'operator'
	| 'punctuation'
	| 'string'
	| 'number'
	| 'duration'
	| 'function'
	| 'ident'
	| 'plain';

export interface Chunk {
	readonly text: string;
	readonly category: Category;
}

const OPERATORS = new Set<TokenKind>([
	'=',
	'==',
	'!=',
	'<',
	'<=',
	'>',
	'>=',
	'=~',
	'!~',
	'+',
	'-',
	'*',
	'/'
]);

const PUNCTUATION = new Set<TokenKind>(['(', ')', '[', ']', ',', '.', '|']);

/**
 * The source, split into coloured runs that concatenate back to the source.
 *
 * That last property is the whole contract and is worth a test: the overlay is
 * positioned by nothing but the text itself, so a dropped space puts the
 * highlighting one character out of step with what somebody is typing.
 */
export function highlight(source: string): Chunk[] {
	const { tokens } = lex(source);
	const chunks: Chunk[] = [];
	let at = 0;

	for (const token of tokens) {
		if (token.kind === 'eof') break;

		// Whitespace, comments and anything the lexer skipped.
		if (token.span.start > at) {
			chunks.push({ text: source.slice(at, token.span.start), category: 'plain' });
		}

		chunks.push({
			text: source.slice(token.span.start, token.span.end),
			category: categorise(token.kind, token.text)
		});
		at = token.span.end;
	}

	/*
	 * Everything after the last token.
	 *
	 * Not an edge case — it is the *normal* case while somebody is typing, because
	 * an unterminated string produces a lexer error and no token, and the text
	 * still has to be drawn or the caret and the characters part company.
	 */
	if (at < source.length) chunks.push({ text: source.slice(at), category: 'plain' });

	return chunks;
}

function categorise(kind: TokenKind, text: string): Category {
	if (kind === 'string') return 'string';
	if (kind === 'number') return 'number';
	if (kind === 'duration') return 'duration';
	if (OPERATORS.has(kind)) return 'operator';
	if (PUNCTUATION.has(kind)) return 'punctuation';
	// A keyword kind is any kind whose spelling is in the keyword table — which
	// covers `where` and `contains` alike without listing them twice.
	if (text in KEYWORDS) return 'keyword';
	// `avg` is an identifier to the lexer and a function to a reader. Colouring it
	// differently is the cheapest possible "this name means something".
	if (kind === 'ident' && functionFor(text)) return 'function';
	if (kind === 'ident') return 'ident';
	return 'plain';
}

/**
 * Split a chunk list at a source offset.
 *
 * Used to place a zero-width anchor element at the caret inside the highlight
 * layer. The layer is already a character-perfect mirror of the textarea, so
 * measuring an element inside it gives the caret's pixel position for free —
 * which is otherwise a famously fiddly thing to compute, involving a second
 * hidden mirror div built solely to be measured.
 *
 * Reusing the mirror that has to exist anyway is the whole trick.
 */
export function splitAt(chunks: readonly Chunk[], offset: number): [Chunk[], Chunk[]] {
	const before: Chunk[] = [];
	const after: Chunk[] = [];
	let at = 0;

	for (const chunk of chunks) {
		const end = at + chunk.text.length;

		if (end <= offset) before.push(chunk);
		else if (at >= offset) after.push(chunk);
		else {
			// The caret is inside this chunk: cut it, keeping the category on both
			// halves so the colour does not change as the caret moves through a word.
			before.push({ text: chunk.text.slice(0, offset - at), category: chunk.category });
			after.push({ text: chunk.text.slice(offset - at), category: chunk.category });
		}

		at = end;
	}

	return [before, after];
}

export interface MarkChunk {
	readonly text: string;
	readonly marked: boolean;
}

/**
 * The source split into marked and unmarked runs, for the error underlay.
 *
 * Ranges are merged first, because a parse error and a check error frequently
 * cover the same text — and two overlapping `<span>`s each carrying a wavy
 * underline draw it twice, at slightly different offsets, which looks like a
 * rendering bug rather than like an error.
 */
export function marks(
	source: string,
	ranges: readonly { start: number; end: number }[]
): MarkChunk[] {
	const sorted = [...ranges]
		.map((range) => ({
			// Clamped, and never empty: an error at end-of-input has a zero-width span,
			// and a zero-width span underlines nothing at all.
			start: Math.max(0, Math.min(source.length, range.start)),
			end: Math.max(0, Math.min(source.length, Math.max(range.end, range.start + 1)))
		}))
		.sort((a, b) => a.start - b.start);

	const merged: { start: number; end: number }[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
		else merged.push({ ...range });
	}

	const out: MarkChunk[] = [];
	let at = 0;

	for (const range of merged) {
		if (range.start > at) out.push({ text: source.slice(at, range.start), marked: false });
		out.push({ text: source.slice(range.start, range.end), marked: true });
		at = range.end;
	}

	if (at < source.length) out.push({ text: source.slice(at), marked: false });

	return out;
}
