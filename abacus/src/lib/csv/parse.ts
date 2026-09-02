/**
 * A STREAMING CSV PARSER
 * ======================
 *
 * RFC 4180 with the lenient parts every real file needs: any of `,` `;` and
 * tab as the delimiter (detected from the first line), CRLF or LF line
 * endings, quoted fields that may contain the delimiter, newlines and `""`
 * for a literal quote, and a final line with or without a newline.
 *
 * WHY STREAMING
 * -------------
 * A two hundred megabyte export does not fit in a string a browser is happy
 * to hold, and even where it would, a parser that needs the whole file
 * before it can start is a parser that shows a spinner for the whole file.
 * This one is a state machine: `push()` takes a chunk of any size — a byte,
 * a megabyte — and returns the rows that chunk *completed*, keeping the
 * partial field and the quoting state for the next one. The Web Worker in
 * `worker.ts` feeds it from `File.stream()` and reports progress as it goes.
 *
 * The one subtlety a streaming parser has that a whole-file parser does not:
 * a `"` inside a quoted field means either "end of field" or, if another `"`
 * follows, "a literal quote" — and the next character may be in the next
 * chunk. The parser remembers that it is waiting to find out.
 */

export interface ParserOptions {
	/** Detected from the first line when omitted. */
	delimiter?: string;
}

export class CsvParser {
	#delimiter: string | null;
	#field = '';
	#row: string[] = [];
	#inQuotes = false;
	#quoteInQuotes = false; // saw `"` inside quotes; deciding what it means
	#afterCR = false;
	#firstLine = '';
	#done = false;

	constructor(options: ParserOptions = {}) {
		this.#delimiter = options.delimiter ?? null;
	}

	get delimiter(): string {
		return this.#delimiter ?? ',';
	}

	/** The rows this chunk completed. */
	push(chunk: string): string[][] {
		if (this.#done) throw new Error('The parser has finished');
		const rows: string[][] = [];

		for (let i = 0; i < chunk.length; i += 1) {
			const ch = chunk[i]!;

			if (this.#delimiter === null) {
				// Still on the first line, and it has not ended: keep it for detection.
				if (ch === '\n' || ch === '\r') {
					this.#delimiter = detectDelimiter(this.#firstLine);
					this.#replay(this.#firstLine, rows);
					this.#firstLine = '';
				} else {
					this.#firstLine += ch;
					continue;
				}
			}

			this.#consume(ch, rows);
		}

		return rows;
	}

	/** The last row, if the file did not end with a newline. */
	finish(): string[][] {
		if (this.#done) return [];
		this.#done = true;
		const rows: string[][] = [];
		if (this.#delimiter === null) {
			this.#delimiter = detectDelimiter(this.#firstLine);
			this.#replay(this.#firstLine, rows);
			this.#firstLine = '';
		}
		if (this.#quoteInQuotes) {
			// A closing quote at the very end of the file.
			this.#inQuotes = false;
			this.#quoteInQuotes = false;
		}
		if (this.#field !== '' || this.#row.length > 0 || this.#inQuotes) {
			this.#row.push(this.#field);
			rows.push(this.#row);
			this.#field = '';
			this.#row = [];
		}
		return rows;
	}

	#replay(text: string, rows: string[][]): void {
		for (const ch of text) this.#consume(ch, rows);
	}

	#consume(ch: string, rows: string[][]): void {
		const delimiter = this.#delimiter!;

		if (this.#quoteInQuotes) {
			this.#quoteInQuotes = false;
			if (ch === '"') {
				this.#field += '"';
				return;
			}
			this.#inQuotes = false;
			// fall through: the character after the closing quote is ordinary
		}

		if (this.#inQuotes) {
			if (ch === '"') this.#quoteInQuotes = true;
			else this.#field += ch;
			return;
		}

		if (this.#afterCR) {
			this.#afterCR = false;
			if (ch === '\n') return; // the LF of a CRLF
		}

		if (ch === '"' && this.#field === '') {
			this.#inQuotes = true;
		} else if (ch === delimiter) {
			this.#row.push(this.#field);
			this.#field = '';
		} else if (ch === '\n' || ch === '\r') {
			this.#row.push(this.#field);
			rows.push(this.#row);
			this.#field = '';
			this.#row = [];
			this.#afterCR = ch === '\r';
		} else {
			this.#field += ch;
		}
	}
}

/**
 * Which of the usual delimiters the first line uses: the one that appears
 * most often outside quotes, comma winning ties. A file with none of them is
 * a one-column file, which is what a list of names is.
 */
export function detectDelimiter(line: string): string {
	const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
	let inQuotes = false;
	for (const ch of line) {
		if (ch === '"') inQuotes = !inQuotes;
		else if (!inQuotes && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
	}
	let best = ',';
	for (const [d, n] of Object.entries(counts)) if (n > (counts[best] ?? 0)) best = d;
	return best;
}

/** Whole-string convenience, for tests and for small pastes. */
export function parseCsv(text: string, options: ParserOptions = {}): string[][] {
	const parser = new CsvParser(options);
	return [...parser.push(text), ...parser.finish()];
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

/** A field as CSV writes it: quoted when it must be, doubled quotes inside. */
export function escapeField(value: string, delimiter = ','): string {
	if (
		value.includes(delimiter) ||
		value.includes('"') ||
		value.includes('\n') ||
		value.includes('\r') ||
		value !== value.trim()
	) {
		return `"${value.replaceAll('"', '""')}"`;
	}
	return value;
}

export function rowToCsv(row: readonly string[], delimiter = ','): string {
	return row.map((field) => escapeField(field, delimiter)).join(delimiter);
}
