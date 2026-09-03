/**
 * THE SHAPE OF A FORMULA
 * ======================
 *
 * `=SUM(A1:B2) * 1.1` becomes a tree: a `binary` node whose left side is a
 * `call` and whose right side is a `number`. The parser builds it, the
 * evaluator walks it, the dependency graph reads the references out of it,
 * and the formula bar colours the source by the `span` on each node.
 *
 * Every node carries its `span` — where in the source it came from — because
 * the second-best thing a formula can do is be right, and the best thing it
 * can do when it is wrong is say *where*.
 */

export interface Span {
	start: number;
	end: number;
}

/**
 * A reference to one cell. `absRow` and `absCol` record the dollar signs:
 * `$A$1` stays put when the formula is copied, `A1` moves with it.
 */
export interface CellRef {
	row: number;
	col: number;
	absRow: boolean;
	absCol: boolean;
}

export interface RangeRef {
	start: CellRef;
	end: CellRef;
}

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';

export type Node =
	| { type: 'number'; value: number; span: Span }
	| { type: 'string'; value: string; span: Span }
	| { type: 'boolean'; value: boolean; span: Span }
	| { type: 'error'; code: string; span: Span }
	| { type: 'ref'; ref: CellRef; span: Span }
	| { type: 'range'; range: RangeRef; span: Span }
	| { type: 'unary'; op: '-' | '+' | '%'; operand: Node; span: Span }
	| { type: 'binary'; op: BinaryOp; left: Node; right: Node; span: Span }
	| { type: 'call'; name: string; args: Node[]; span: Span };

/** A reference as it appears in the source, with its span, for colouring. */
export interface Reference {
	ref: CellRef | RangeRef;
	span: Span;
}

/** Every reference in a formula, in source order. */
export function references(node: Node, out: Reference[] = []): Reference[] {
	switch (node.type) {
		case 'ref':
			out.push({ ref: node.ref, span: node.span });
			break;
		case 'range':
			out.push({ ref: node.range, span: node.span });
			break;
		case 'unary':
			references(node.operand, out);
			break;
		case 'binary':
			references(node.left, out);
			references(node.right, out);
			break;
		case 'call':
			for (const arg of node.args) references(arg, out);
			break;
		case 'number':
		case 'string':
		case 'boolean':
		case 'error':
			break;
		default:
			node satisfies never;
	}
	return out;
}

export const isRangeRef = (ref: CellRef | RangeRef): ref is RangeRef => 'start' in ref;

/** `$A$1` → text, and back. */
export function formatCellRef(ref: CellRef): string {
	return `${ref.absCol ? '$' : ''}${colNameOf(ref.col)}${ref.absRow ? '$' : ''}${ref.row + 1}`;
}

export function formatRef(ref: CellRef | RangeRef): string {
	return isRangeRef(ref)
		? `${formatCellRef(ref.start)}:${formatCellRef(ref.end)}`
		: formatCellRef(ref);
}

/* A local copy of the column naming, to keep this module free of imports the worker does not need. */
function colNameOf(col: number): string {
	let name = '';
	let n = col + 1;
	while (n > 0) {
		const rem = (n - 1) % 26;
		name = String.fromCharCode(65 + rem) + name;
		n = Math.floor((n - 1) / 26);
	}
	return name;
}
