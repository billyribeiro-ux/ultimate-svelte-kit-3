/**
 * THE SHEET
 * =========
 *
 * Everything about *working on* a sheet that the engine does not know:
 * which cell is selected, what is being typed, undo and redo, the clipboard,
 * the fill handle, column widths, the title, whether it has been saved. A
 * class in a `.svelte.ts` file, so `$state` works in it and so it can be
 * tested without a component.
 *
 * WHERE THE REACTIVITY LINE IS
 * ----------------------------
 * The engine holds ten thousand cells in plain `Map`s and recalculates them
 * without Svelte noticing anything — that is the whole point of chapter 10.
 * This class publishes one number, `version`, which goes up when the engine
 * finishes a batch. The grid reads `sheet.version` and then reads cells from
 * the engine; the read is untracked and the number is what re-runs it. One
 * signal for the grid instead of one per cell, which is the difference
 * between a sheet that scrolls and one that does not.
 *
 * UNDO IS COMMANDS WITH INVERSES
 * ------------------------------
 * Project 6 kept undo as snapshots of a two-kilobyte pattern. A sheet can be
 * megabytes, so here every change is a *command* that knows how to undo
 * itself: an edit remembers what the cells held before, a deleted row
 * remembers its cells. Undo runs the inverse; redo runs the command again.
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { Engine, type Edit } from '#lib/engine/engine.ts';
import { shiftFormula, translateFormula, type Shift } from '#lib/engine/rewrite.ts';
import { compare, type Scalar } from '#lib/formula/values.ts';
import { parseCsv, rowToCsv } from '#lib/csv/parse.ts';
import { inRect, key, rect, rectSize, unkey, type Address, type Rect } from './address.ts';
import { partsFromSerial, serialFromParts } from './dates.ts';
import {
	DEFAULT_COLUMN_WIDTH,
	DEFAULT_ROW_HEIGHT,
	emptyDocument,
	type Document
} from './document.ts';
import { formatScalar, GENERAL, type CellFormat } from './format.ts';
import { parseInput } from './locale.ts';
import type { Op } from './ops.ts';

export interface Command {
	label: string;
	apply(): void;
	revert(): void;
}

/**
 * What the clipboard holds: the cells relative to the copied rectangle, where
 * that rectangle was (so a paste knows how far each formula has moved), and
 * the text other applications get.
 */
export interface ClipboardPayload {
	origin: Address;
	rows: number;
	cols: number;
	cells: { dr: number; dc: number; input: string; format: CellFormat }[];
	text: string;
}

const HISTORY_LIMIT = 200;

export class Sheet {
	readonly engine: Engine;

	/** Goes up once per change. The grid watches this and nothing finer. */
	version = $state(0);
	title = $state('Untitled sheet');
	locale = $state('en-US');

	/** Column widths and row heights that differ from the default, in pixels. */
	readonly columns = new SvelteMap<number, number>();
	readonly rows = new SvelteMap<number, number>();
	frozen = $state({ rows: 0, cols: 0 });

	/** The selection is a rectangle between two corners; `anchor` is the cell that takes typing. */
	anchor = $state<Address>({ row: 0, col: 0 });
	focus = $state<Address>({ row: 0, col: 0 });
	readonly selection: Rect = $derived(rect(this.anchor, this.focus));

	/** The cell being edited and the text in the editor, or `null`. */
	editing = $state<{ row: number; col: number; text: string } | null>(null);

	/** Changes since the last save. */
	dirty = $state(false);
	canUndo = $state(false);
	canRedo = $state(false);

	/** Cells changed by somebody else, for the grid to flash. Cleared by the grid after the flash. */
	readonly flashes = new SvelteSet<number>();

	/** Where a local change goes after it is applied: the collaboration layer, when there is one. */
	onop: ((op: Op) => void) | null = null;

	#undo: Command[] = [];
	#redo: Command[] = [];

	constructor(options: { locale?: string; now?: () => Date; random?: () => number } = {}) {
		if (options.locale) this.locale = options.locale;
		this.engine = new Engine({
			// Literals are read in the sheet's locale, and the locale can change.
			parseLiteral: (text) => parseInput(text, this.locale).value,
			now: options.now,
			random: options.random,
			locale: this.locale
		});
	}

	/* ---------------------------------------------------------------- */
	/* Reading                                                           */
	/* ---------------------------------------------------------------- */

	/*
	 * Every read below touches `this.version` before it touches the engine.
	 * The engine is a plain `Map` — deliberately, so ten thousand cells are
	 * not ten thousand proxies — which means a template expression like
	 * `{sheet.display(r, c)}` would otherwise depend on nothing reactive and
	 * never run again. Reading `version` subscribes it: one number changes
	 * per batch of edits, and every visible cell re-reads its value from the
	 * engine. That is the whole reactivity contract between the grid and the
	 * engine, and it lives in these four methods rather than in the grid.
	 */
	value(row: number, col: number): Scalar {
		void this.version;
		return this.engine.value(row, col);
	}

	input(row: number, col: number): string {
		void this.version;
		return this.engine.get(row, col)?.input ?? '';
	}

	format(row: number, col: number): CellFormat {
		void this.version;
		return this.engine.get(row, col)?.format ?? GENERAL;
	}

	/** The text a cell shows. */
	display(row: number, col: number): string {
		void this.version;
		const cell = this.engine.get(row, col);
		if (!cell) return '';
		return formatScalar(cell.value, cell.format, this.locale);
	}

	columnWidth(col: number): number {
		return this.columns.get(col) ?? DEFAULT_COLUMN_WIDTH;
	}

	rowHeight(row: number): number {
		return this.rows.get(row) ?? DEFAULT_ROW_HEIGHT;
	}

	/* ---------------------------------------------------------------- */
	/* Selection                                                         */
	/* ---------------------------------------------------------------- */

	select(anchor: Address, focus: Address = anchor): void {
		this.anchor = anchor;
		this.focus = focus;
	}

	/** Move the anchor; with `extend`, keep it and move the focus instead — Shift+arrow. */
	move(dRow: number, dCol: number, extend = false): void {
		const from = extend ? this.focus : this.anchor;
		const next = { row: Math.max(0, from.row + dRow), col: Math.max(0, from.col + dCol) };
		if (extend) this.focus = next;
		else this.select(next);
	}

	/* ---------------------------------------------------------------- */
	/* The edit session                                                  */
	/* ---------------------------------------------------------------- */

	/**
	 * Start editing the anchor cell. The grid's in-cell input and the formula
	 * bar both bind to `editing.text`, so the session lives here rather than
	 * in either of them.
	 */
	beginEdit(text?: string): void {
		const { row, col } = this.anchor;
		this.editing = { row, col, text: text ?? this.input(row, col) };
	}

	/** Apply what was typed, if it changed, and return the cell it went into. */
	commitEdit(): Address | null {
		const editing = this.editing;
		if (!editing) return null;
		this.editing = null;
		if (editing.text !== this.input(editing.row, editing.col)) {
			this.setCell(editing.row, editing.col, editing.text);
		}
		return { row: editing.row, col: editing.col };
	}

	cancelEdit(): void {
		this.editing = null;
	}

	/* ---------------------------------------------------------------- */
	/* Editing                                                           */
	/* ---------------------------------------------------------------- */

	/** Type into one cell. */
	setCell(row: number, col: number, input: string | null): void {
		this.edit([{ row, col, input }], 'Edit');
	}

	/** Several cells as one undo step. */
	edit(edits: Edit[], label: string): void {
		const prepared = edits.map((e) => this.#withImpliedFormat(e));
		const before = this.#snapshot(prepared);
		this.#run({
			label,
			apply: () => this.#applyLocal(prepared),
			revert: () => this.#applyLocal(before)
		});
	}

	clear(target: Rect = this.selection): void {
		const edits: Edit[] = [];
		for (const k of this.engine.cells.keys()) {
			const a = unkey(k);
			if (inRect(target, a)) edits.push({ row: a.row, col: a.col, input: null, format: GENERAL });
		}
		if (edits.length > 0) this.edit(edits, 'Clear');
	}

	setFormat(format: CellFormat, target: Rect = this.selection): void {
		if (rectSize(target) > 20_000) return;
		const edits: Edit[] = [];
		for (let r = target.top; r <= target.bottom; r += 1) {
			for (let c = target.left; c <= target.right; c += 1) {
				// A format on an empty cell is kept, so that typing into it later is formatted.
				edits.push({ row: r, col: c, format });
			}
		}
		this.edit(edits, 'Format');
	}

	/* ---------------------------------------------------------------- */
	/* Structure                                                         */
	/* ---------------------------------------------------------------- */

	insertRows(at: number, count = 1): void {
		this.#shift({ kind: 'insert-rows', at, count });
	}

	deleteRows(at: number, count = 1): void {
		this.#shift({ kind: 'delete-rows', at, count });
	}

	insertColumns(at: number, count = 1): void {
		this.#shift({ kind: 'insert-cols', at, count });
	}

	deleteColumns(at: number, count = 1): void {
		this.#shift({ kind: 'delete-cols', at, count });
	}

	#shift(shift: Shift): void {
		const rows = shift.kind === 'insert-rows' || shift.kind === 'delete-rows';
		const insert = shift.kind === 'insert-rows' || shift.kind === 'insert-cols';
		const inverse: Shift = {
			kind: rows
				? insert
					? 'delete-rows'
					: 'insert-rows'
				: insert
					? 'delete-cols'
					: 'insert-cols',
			at: shift.at,
			count: shift.count
		};

		// A deletion must remember what it deleted, so that undo can put it back:
		// the cells in the deleted band, and every formula the deletion rewrote.
		// Inserting the rows again does not undo a rewrite — `A1:A2` that became
		// `A1:A1` would stay `A1:A1`, and a reference into the band became `#REF!`
		// for good — so those formulas are restored from this snapshot.
		const restore: Edit[] = [];
		const sizes = rows ? this.rows : this.columns;
		const removedSizes: [index: number, size: number][] = [];
		if (!insert) {
			for (const [index, size] of sizes) {
				if (index >= shift.at && index < shift.at + shift.count) removedSizes.push([index, size]);
			}
			for (const [k, cell] of this.engine.cells) {
				const a = unkey(k);
				const index = rows ? a.row : a.col;
				const inBand = index >= shift.at && index < shift.at + shift.count;
				const body = cell.input.slice(1);
				const rewritten = cell.formula !== null && shiftFormula(body, shift) !== body;
				if (inBand || rewritten) {
					restore.push({ row: a.row, col: a.col, input: cell.input, format: cell.format });
				}
			}
		}

		this.#run({
			label: `${insert ? 'Insert' : 'Delete'} ${rows ? 'rows' : 'columns'}`,
			apply: () => {
				this.engine.shift(shift);
				this.#shiftSizes(shift);
				this.#emit({ type: 'shift', kind: shift.kind, at: shift.at, count: shift.count });
				this.#sync();
			},
			revert: () => {
				this.engine.shift(inverse);
				this.#shiftSizes(inverse);
				this.#emit({ type: 'shift', kind: inverse.kind, at: inverse.at, count: inverse.count });
				for (const [index, size] of removedSizes) {
					sizes.set(index, size);
					this.#emit({ type: 'size', axis: rows ? 'row' : 'column', index, size });
				}
				if (restore.length > 0) this.#applyLocal(restore);
				this.#sync();
			}
		});
	}

	/** Column widths and row heights move with their columns and rows. */
	#shiftSizes(shift: Shift): void {
		const rows = shift.kind === 'insert-rows' || shift.kind === 'delete-rows';
		const insert = shift.kind === 'insert-rows' || shift.kind === 'insert-cols';
		const map = rows ? this.rows : this.columns;
		// Scratch space, copied back into the reactive map below in one go.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const moved = new Map<number, number>();
		for (const [index, size] of map) {
			if (index < shift.at) moved.set(index, size);
			else if (insert) moved.set(index + shift.count, size);
			else if (index >= shift.at + shift.count) moved.set(index - shift.count, size);
		}
		map.clear();
		for (const [index, size] of moved) map.set(index, size);
	}

	resizeColumn(col: number, width: number): void {
		this.columns.set(col, Math.max(24, Math.min(2000, Math.round(width))));
		this.dirty = true;
		this.#emit({ type: 'size', axis: 'column', index: col, size: this.columnWidth(col) });
	}

	resizeRow(row: number, height: number): void {
		this.rows.set(row, Math.max(16, Math.min(1000, Math.round(height))));
		this.dirty = true;
		this.#emit({ type: 'size', axis: 'row', index: row, size: this.rowHeight(row) });
	}

	rename(title: string): void {
		const next = title.trim() || 'Untitled sheet';
		if (next === this.title) return;
		this.title = next;
		this.dirty = true;
		this.#emit({ type: 'title', title: next });
	}

	/* ---------------------------------------------------------------- */
	/* Clipboard                                                         */
	/* ---------------------------------------------------------------- */

	copy(target: Rect = this.selection): ClipboardPayload {
		const cells: ClipboardPayload['cells'] = [];
		const lines: string[] = [];
		for (let r = target.top; r <= target.bottom; r += 1) {
			const line: string[] = [];
			for (let c = target.left; c <= target.right; c += 1) {
				const cell = this.engine.get(r, c);
				if (cell)
					cells.push({
						dr: r - target.top,
						dc: c - target.left,
						input: cell.input,
						format: cell.format
					});
				line.push(this.display(r, c));
			}
			lines.push(rowToCsv(line, '\t'));
		}
		return {
			origin: { row: target.top, col: target.left },
			rows: target.bottom - target.top + 1,
			cols: target.right - target.left + 1,
			cells,
			text: lines.join('\n')
		};
	}

	cut(target: Rect = this.selection): ClipboardPayload {
		const payload = this.copy(target);
		this.clear(target);
		return payload;
	}

	/**
	 * Paste our own cells, with formulas moved the way a copy moves them:
	 * `=A1*2` copied one row down becomes `=A2*2`, and `$A$1` stays. The
	 * distance is from where the cells were copied to where they land.
	 */
	paste(payload: ClipboardPayload, at: Address = this.anchor): void {
		const dRow = at.row - payload.origin.row;
		const dCol = at.col - payload.origin.col;
		const edits: Edit[] = payload.cells.map(({ dr, dc, input, format }) => ({
			row: at.row + dr,
			col: at.col + dc,
			input: input.startsWith('=') ? `=${translateFormula(input.slice(1), dRow, dCol)}` : input,
			format
		}));
		if (edits.length > 0) this.edit(edits, 'Paste');
		this.select(at, { row: at.row + payload.rows - 1, col: at.col + payload.cols - 1 });
	}

	/** Paste text from anywhere: tab-separated (a spreadsheet) or comma-separated. */
	pasteText(text: string, at: Address = this.anchor): void {
		const delimiter = text.includes('\t') ? '\t' : undefined;
		const rows = parseCsv(text.replace(/\r?\n$/, ''), { delimiter });
		const edits: Edit[] = [];
		for (const [dr, line] of rows.entries()) {
			for (const [dc, value] of line.entries()) {
				edits.push({ row: at.row + dr, col: at.col + dc, input: value });
			}
		}
		if (edits.length > 0) this.edit(edits, 'Paste');
		const last = rows.at(-1) ?? [];
		this.select(at, { row: at.row + rows.length - 1, col: at.col + Math.max(0, last.length - 1) });
	}

	/* ---------------------------------------------------------------- */
	/* Fill                                                              */
	/* ---------------------------------------------------------------- */

	/**
	 * Drag the fill handle: extend `source` to cover `target`. Formulas are
	 * translated, a run of numbers or dates continues its arithmetic series,
	 * text ending in a number counts up, and anything else repeats.
	 */
	fill(source: Rect, target: Rect): void {
		const edits: Edit[] = [];
		const down = target.bottom > source.bottom || target.top < source.top;
		const length = down ? source.bottom - source.top + 1 : source.right - source.left + 1;

		const lanes = down
			? Array.from({ length: source.right - source.left + 1 }, (_, i) => source.left + i)
			: Array.from({ length: source.bottom - source.top + 1 }, (_, i) => source.top + i);

		for (const lane of lanes) {
			const sourceCells = Array.from({ length }, (_, i) =>
				down ? this.engine.get(source.top + i, lane) : this.engine.get(lane, source.left + i)
			);
			const series = detectSeries(sourceCells.map((c) => c?.value ?? null));

			const from = down ? target.top : target.left;
			const to = down ? target.bottom : target.right;
			for (let position = from; position <= to; position += 1) {
				const sourceStart = down ? source.top : source.left;
				if (position >= sourceStart && position < sourceStart + length) continue;
				const offset = position - sourceStart; // negative when filling upwards/leftwards
				const index = ((offset % length) + length) % length;
				const template = sourceCells[index];
				const row = down ? position : lane;
				const col = down ? lane : position;

				if (!template) {
					edits.push({ row, col, input: null, format: GENERAL });
					continue;
				}
				let input = template.input;
				if (template.formula) {
					const dRow = down ? position - (sourceStart + index) : 0;
					const dCol = down ? 0 : position - (sourceStart + index);
					input = `=${translateFormula(input.slice(1), dRow, dCol)}`;
				} else if (series) {
					input = series(offset);
				} else {
					const counted = /^(.*?)(\d+)$/.exec(input);
					if (counted && length === 1) input = `${counted[1]}${Number(counted[2]) + offset}`;
				}
				edits.push({ row, col, input, format: template.format });
			}
		}
		if (edits.length > 0) this.edit(edits, 'Fill');
		this.select({ row: target.top, col: target.left }, { row: target.bottom, col: target.right });
	}

	/* ---------------------------------------------------------------- */
	/* Sort                                                              */
	/* ---------------------------------------------------------------- */

	/** Reorder the rows of a rectangle by one of its columns. Empties sort last either way. */
	sort(target: Rect, byCol: number, direction: 'asc' | 'desc'): void {
		const rowsInOrder = Array.from(
			{ length: target.bottom - target.top + 1 },
			(_, i) => target.top + i
		);
		const keyed = rowsInOrder.map((row) => ({ row, value: this.engine.value(row, byCol) }));
		keyed.sort((a, b) => {
			if (a.value === null && b.value === null) return 0;
			if (a.value === null) return 1;
			if (b.value === null) return -1;
			const c = compare(a.value, b.value);
			const sign = typeof c === 'number' ? c : 0;
			return direction === 'asc' ? sign : -sign;
		});

		const edits: Edit[] = [];
		keyed.forEach(({ row: fromRow }, i) => {
			const toRow = target.top + i;
			for (let c = target.left; c <= target.right; c += 1) {
				const cell = this.engine.get(fromRow, c);
				const input = cell
					? cell.formula
						? `=${translateFormula(cell.input.slice(1), toRow - fromRow, 0)}`
						: cell.input
					: null;
				edits.push({ row: toRow, col: c, input, format: cell?.format ?? GENERAL });
			}
		});
		this.edit(edits, `Sort ${direction === 'asc' ? 'ascending' : 'descending'}`);
	}

	/* ---------------------------------------------------------------- */
	/* Find and replace                                                  */
	/* ---------------------------------------------------------------- */

	find(query: string, options: { matchCase?: boolean; regex?: boolean } = {}): Address[] {
		if (query === '') return [];
		const pattern = toPattern(query, options);
		const found: Address[] = [];
		for (const [k, cell] of this.engine.cells) {
			const a = unkey(k);
			if (pattern.test(cell.input) || pattern.test(this.display(a.row, a.col))) found.push(a);
		}
		return found.sort((a, b) => a.row - b.row || a.col - b.col);
	}

	replace(
		query: string,
		replacement: string,
		options: { matchCase?: boolean; regex?: boolean } = {}
	): number {
		if (query === '') return 0;
		const pattern = toPattern(query, { ...options, global: true });
		const edits: Edit[] = [];
		for (const [k, cell] of this.engine.cells) {
			if (!pattern.test(cell.input)) continue;
			pattern.lastIndex = 0;
			const a = unkey(k);
			edits.push({ row: a.row, col: a.col, input: cell.input.replace(pattern, replacement) });
		}
		if (edits.length > 0) this.edit(edits, 'Replace');
		return edits.length;
	}

	/* ---------------------------------------------------------------- */
	/* History                                                           */
	/* ---------------------------------------------------------------- */

	undo(): void {
		const command = this.#undo.pop();
		if (!command) return;
		command.revert();
		this.#redo.push(command);
		this.#syncHistory();
	}

	redo(): void {
		const command = this.#redo.pop();
		if (!command) return;
		command.apply();
		this.#undo.push(command);
		this.#syncHistory();
	}

	#run(command: Command): void {
		command.apply();
		this.#undo.push(command);
		if (this.#undo.length > HISTORY_LIMIT) this.#undo.shift();
		this.#redo.length = 0;
		this.#syncHistory();
	}

	#syncHistory(): void {
		this.canUndo = this.#undo.length > 0;
		this.canRedo = this.#redo.length > 0;
	}

	/* ---------------------------------------------------------------- */
	/* Documents and remote changes                                      */
	/* ---------------------------------------------------------------- */

	load(doc: Document): void {
		this.engine.reset();
		this.title = doc.title;
		this.columns.clear();
		this.rows.clear();
		for (const [c, w] of Object.entries(doc.columns)) this.columns.set(Number(c), w);
		for (const [r, h] of Object.entries(doc.rows)) this.rows.set(Number(r), h);
		this.frozen = { ...doc.frozen };
		this.engine.apply(
			doc.cells.map((cell) => ({ row: cell.r, col: cell.c, input: cell.i, format: cell.f }))
		);
		this.#undo.length = 0;
		this.#redo.length = 0;
		this.#syncHistory();
		this.select({ row: 0, col: 0 });
		this.#sync();
		// What was just loaded is, by definition, what is saved.
		this.dirty = false;
	}

	toDocument(): Document {
		const doc = emptyDocument(this.title);
		for (const [c, w] of this.columns) doc.columns[String(c)] = w;
		for (const [r, h] of this.rows) doc.rows[String(r)] = h;
		doc.frozen = { ...this.frozen };
		for (const [k, cell] of this.engine.cells) {
			const a = unkey(k);
			doc.cells.push({
				r: a.row,
				c: a.col,
				i: cell.input,
				...(cell.format.kind === 'general' ? {} : { f: cell.format })
			});
		}
		doc.cells.sort((a, b) => a.r - b.r || a.c - b.c);
		return doc;
	}

	/** Somebody else's change: applied without an undo entry, and flashed. */
	applyRemote(op: Op): void {
		switch (op.type) {
			case 'cells': {
				this.engine.apply(op.cells.map((c) => ({ row: c.r, col: c.c, input: c.i, format: c.f })));
				for (const c of op.cells) this.flashes.add(key(c.r, c.c));
				break;
			}
			case 'shift': {
				const shift: Shift = { kind: op.kind, at: op.at, count: op.count };
				this.engine.shift(shift);
				this.#shiftSizes(shift);
				break;
			}
			case 'title':
				this.title = op.title;
				break;
			case 'size':
				(op.axis === 'column' ? this.columns : this.rows).set(op.index, op.size);
				break;
			default:
				op satisfies never;
		}
		this.#sync();
	}

	/* ---------------------------------------------------------------- */
	/* Internals                                                         */
	/* ---------------------------------------------------------------- */

	/** `12%` typed into a general cell makes it a percent cell; typed into a currency cell, it stays currency. */
	#withImpliedFormat(edit: Edit): Edit {
		if (edit.format || !edit.input || edit.input.startsWith('=')) return edit;
		const current = this.engine.get(edit.row, edit.col)?.format ?? GENERAL;
		if (current.kind !== 'general') return edit;
		const implied = parseInput(edit.input, this.locale).format;
		return implied ? { ...edit, format: implied } : edit;
	}

	#snapshot(edits: Edit[]): Edit[] {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local bookkeeping
		const seen = new Set<number>();
		const before: Edit[] = [];
		for (const edit of edits) {
			const k = key(edit.row, edit.col);
			if (seen.has(k)) continue;
			seen.add(k);
			const cell = this.engine.get(edit.row, edit.col);
			before.push({
				row: edit.row,
				col: edit.col,
				input: cell?.input ?? null,
				format: cell?.format ?? GENERAL
			});
		}
		return before;
	}

	#applyLocal(edits: Edit[]): void {
		this.engine.apply(edits);
		this.#emit({
			type: 'cells',
			cells: edits.map((e) => ({ r: e.row, c: e.col, i: e.input ?? null, f: e.format }))
		});
		this.#sync();
	}

	#emit(op: Op): void {
		this.onop?.(op);
	}

	#sync(): void {
		this.version = this.engine.version;
		this.dirty = true;
	}

	markSaved(): void {
		this.dirty = false;
	}
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * If the values are an arithmetic series — 1, 2, 3 or 10, 20 or a run of
 * dates a week apart — a function from offset to the next input; else `null`.
 * A single number is not a series (it repeats), which is what the fill
 * handle does everywhere.
 */
export function detectSeries(values: Scalar[]): ((offset: number) => string) | null {
	if (values.length < 2 || !values.every((v) => typeof v === 'number')) return null;
	const numbers = values as number[];
	const step = numbers[1]! - numbers[0]!;
	for (let i = 2; i < numbers.length; i += 1) {
		if (Math.abs(numbers[i]! - numbers[i - 1]! - step) > 1e-9) return null;
	}
	const first = numbers[0]!;
	return (offset) => String(Number((first + step * offset).toPrecision(15)));
}

/** A date series in whole months: the 1st of each month stays the 1st. Exposed for the tests. */
export function monthSeries(serial: number, months: number): number {
	const { year, month, day } = partsFromSerial(serial);
	return serialFromParts(year, month + months, day);
}

function toPattern(
	query: string,
	options: { matchCase?: boolean; regex?: boolean; global?: boolean }
): RegExp {
	const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const flags = `${options.matchCase ? '' : 'i'}${options.global ? 'g' : ''}`;
	try {
		return new RegExp(source, flags);
	} catch {
		return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
	}
}
