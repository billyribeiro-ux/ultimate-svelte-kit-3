/**
 * COLOURING REFERENCES
 * ====================
 *
 * While a formula is being typed, every reference in it gets a colour — the
 * first reference the first colour, and so on — and the same colour outlines
 * the range on the grid. This is what lets a person see that `B2:B9` is the
 * column they meant.
 *
 * It works from *tokens*, not from a parsed tree, because a formula being
 * typed is unfinished more often than not: `=SUM(A1:` does not parse, and
 * the colours must not vanish at every keystroke that makes it unparseable.
 */

import { rect, type Rect } from '#lib/sheet/address.ts';
import { cellRef } from './parser.ts';
import { tokenize, type Token } from './lexer.ts';

export interface Highlight {
	/** Where in the source, for the formula bar. */
	start: number;
	end: number;
	/** Which cells, for the grid. */
	rect: Rect;
	/** 0–5, cycling; the palette is in tokens.css. */
	hue: number;
}

/** The references in a formula source (without its leading `=`), coloured in order. */
export function highlights(source: string): Highlight[] {
	let tokens: Token[];
	try {
		tokens = tokenize(source);
	} catch {
		// Tokenise as far as it goes: an unterminated string means no references
		// after it, which is fine — they will colour in when the quote closes.
		return [];
	}

	const out: Highlight[] = [];
	for (let i = 0; i < tokens.length; i += 1) {
		const token = tokens[i]!;
		if (token.type !== 'ref') continue;
		let start;
		try {
			start = cellRef(token);
		} catch {
			continue;
		}
		const colon = tokens[i + 1];
		const endToken = tokens[i + 2];
		if (colon?.type === 'colon' && endToken?.type === 'ref') {
			try {
				const end = cellRef(endToken);
				out.push({
					start: token.start,
					end: endToken.end,
					rect: rect({ row: start.row, col: start.col }, { row: end.row, col: end.col }),
					hue: out.length % 6
				});
				i += 2;
				continue;
			} catch {
				// fall through: colour the first cell on its own
			}
		}
		out.push({
			start: token.start,
			end: token.end,
			rect: rect({ row: start.row, col: start.col }, { row: start.row, col: start.col }),
			hue: out.length % 6
		});
	}
	return out;
}
