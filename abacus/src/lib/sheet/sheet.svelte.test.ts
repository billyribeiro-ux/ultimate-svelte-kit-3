import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { ErrorValue } from '#lib/formula/values.ts';
import { applyOps } from './apply.ts';
import { rect } from './address.ts';
import type { Op } from './ops.ts';
import { Sheet } from './sheet.svelte.ts';

/**
 * The sheet model is `$state` in a class, tested without a component: the
 * file is `.svelte.test.ts`, so runes compile in it and `SvelteMap` works.
 */

const fresh = () => new Sheet({ now: () => new Date(Date.UTC(2026, 8, 2)) });

describe('editing and undo', () => {
	it('edits, undoes and redoes with commands', () => {
		const sheet = fresh();
		sheet.setCell(0, 0, '5');
		sheet.setCell(0, 1, '=A1*2');
		expect(sheet.value(0, 1)).toBe(10);
		expect(sheet.canUndo).toBe(true);

		sheet.undo();
		expect(sheet.input(0, 1)).toBe('');
		expect(sheet.canRedo).toBe(true);
		sheet.redo();
		expect(sheet.value(0, 1)).toBe(10);

		sheet.undo();
		sheet.undo();
		expect(sheet.engine.size).toBe(0);
		expect(sheet.canUndo).toBe(false);
	});

	it('implies a format from what was typed, and keeps an explicit one', () => {
		const sheet = fresh();
		sheet.setCell(0, 0, '12%');
		expect(sheet.value(0, 0)).toBe(0.12);
		expect(sheet.format(0, 0)).toEqual({ kind: 'percent', decimals: 0 });
		expect(sheet.display(0, 0)).toBe('12%');

		sheet.setFormat(
			{ kind: 'currency', currency: 'EUR', decimals: 2 },
			rect({ row: 1, col: 0 }, { row: 1, col: 0 })
		);
		sheet.setCell(1, 0, '12%');
		expect(sheet.format(1, 0).kind).toBe('currency');
	});

	it('reads literals in the sheet locale', () => {
		const sheet = new Sheet({ locale: 'de-DE' });
		sheet.setCell(0, 0, '1.234,5');
		expect(sheet.value(0, 0)).toBe(1234.5);
		expect(sheet.display(0, 0)).toBe('1234,5');
	});

	it('bumps the version once per command and marks the sheet dirty', () => {
		const sheet = fresh();
		const before = sheet.version;
		sheet.edit(
			[
				{ row: 0, col: 0, input: '1' },
				{ row: 0, col: 1, input: '2' }
			],
			'Two cells'
		);
		flushSync();
		expect(sheet.version).toBe(before + 1);
		expect(sheet.dirty).toBe(true);
	});
});

describe('structure', () => {
	it('undoes a deleted row, cells and all', () => {
		const sheet = fresh();
		sheet.setCell(0, 0, '1');
		sheet.setCell(1, 0, '2');
		sheet.setCell(2, 0, '=SUM(A1:A2)');
		sheet.resizeRow(1, 60);
		sheet.deleteRows(1);
		expect(sheet.input(1, 0)).toBe('=SUM(A1:A1)');
		expect(sheet.rowHeight(1)).toBe(28);

		sheet.undo();
		expect(sheet.input(1, 0)).toBe('2');
		expect(sheet.input(2, 0)).toBe('=SUM(A1:A2)');
		expect(sheet.value(2, 0)).toBe(3);
		expect(sheet.rowHeight(1)).toBe(60);
	});
});

describe('clipboard', () => {
	it('copies displayed text and pastes formulas moved', () => {
		const sheet = fresh();
		sheet.setCell(0, 0, '1');
		sheet.setCell(1, 0, '2');
		sheet.setCell(2, 0, '=SUM(A1:A2)');
		sheet.setFormat(
			{ kind: 'number', decimals: 2, grouping: false },
			rect({ row: 2, col: 0 }, { row: 2, col: 0 })
		);

		const payload = sheet.copy(rect({ row: 0, col: 0 }, { row: 2, col: 0 }));
		expect(payload.text).toBe('1\n2\n3.00');

		sheet.paste(payload, { row: 0, col: 2 });
		expect(sheet.input(2, 2)).toBe('=SUM(C1:C2)');
		expect(sheet.value(2, 2)).toBe(3);
		expect(sheet.selection).toEqual({ top: 0, left: 2, bottom: 2, right: 2 });
	});

	it('pastes tab-separated text from elsewhere', () => {
		const sheet = fresh();
		sheet.pasteText('a\tb\n1\t"x\ty"', { row: 0, col: 0 });
		expect(sheet.value(0, 1)).toBe('b');
		expect(sheet.value(1, 0)).toBe(1);
		expect(sheet.value(1, 1)).toBe('x\ty');
	});
});

describe('the fill handle', () => {
	it('continues a series, counts text up, translates formulas, repeats the rest', () => {
		const sheet = fresh();
		sheet.setCell(0, 0, '1');
		sheet.setCell(1, 0, '3');
		sheet.fill(
			rect({ row: 0, col: 0 }, { row: 1, col: 0 }),
			rect({ row: 0, col: 0 }, { row: 4, col: 0 })
		);
		expect([2, 3, 4].map((r) => sheet.value(r, 0))).toEqual([5, 7, 9]);

		sheet.setCell(0, 1, 'Item 1');
		sheet.fill(
			rect({ row: 0, col: 1 }, { row: 0, col: 1 }),
			rect({ row: 0, col: 1 }, { row: 2, col: 1 })
		);
		expect(sheet.value(2, 1)).toBe('Item 3');

		sheet.setCell(0, 2, '=A1*10');
		sheet.fill(
			rect({ row: 0, col: 2 }, { row: 0, col: 2 }),
			rect({ row: 0, col: 2 }, { row: 2, col: 2 })
		);
		expect(sheet.input(2, 2)).toBe('=A3*10');
		expect(sheet.value(2, 2)).toBe(50);

		sheet.setCell(0, 3, 'x');
		sheet.fill(
			rect({ row: 0, col: 3 }, { row: 0, col: 3 }),
			rect({ row: 0, col: 3 }, { row: 1, col: 3 })
		);
		expect(sheet.value(1, 3)).toBe('x');
	});
});

describe('sorting, finding, replacing', () => {
	it('sorts rows by a column with empties last', () => {
		const sheet = fresh();
		[
			['pear', 5],
			['apple', 3],
			['', null],
			['plum', 8]
		].forEach(([name, n], r) => {
			sheet.setCell(r, 0, String(name));
			if (n !== null) sheet.setCell(r, 1, String(n));
		});
		sheet.sort(rect({ row: 0, col: 0 }, { row: 3, col: 1 }), 1, 'desc');
		expect([0, 1, 2].map((r) => sheet.value(r, 0))).toEqual(['plum', 'pear', 'apple']);
		expect(sheet.value(3, 1)).toBeNull();
	});

	it('finds by input or display and replaces in inputs', () => {
		const sheet = fresh();
		sheet.setCell(0, 0, 'Total cost');
		sheet.setCell(1, 0, '=SUM(B1:B2)');
		sheet.setCell(0, 1, '0.5');
		sheet.setFormat({ kind: 'percent', decimals: 0 }, rect({ row: 0, col: 1 }, { row: 0, col: 1 }));
		expect(sheet.find('cost')).toEqual([{ row: 0, col: 0 }]);
		expect(sheet.find('50%')).toEqual([{ row: 0, col: 1 }]);
		expect(sheet.replace('SUM', 'MAX')).toBe(1);
		expect(sheet.input(1, 0)).toBe('=MAX(B1:B2)');
	});
});

describe('documents and remote operations', () => {
	it('round-trips through a document', () => {
		const sheet = fresh();
		sheet.rename('Budget');
		sheet.setCell(0, 0, '=1/0');
		sheet.resizeColumn(0, 150);
		sheet.frozen = { rows: 1, cols: 0 };
		const doc = sheet.toDocument();

		const other = fresh();
		other.load(doc);
		expect(other.title).toBe('Budget');
		expect(other.value(0, 0)).toBeInstanceOf(ErrorValue);
		expect(other.columnWidth(0)).toBe(150);
		expect(other.frozen).toEqual({ rows: 1, cols: 0 });
		expect(other.dirty).toBe(false);
		expect(other.canUndo).toBe(false);
	});

	it('applies remote operations without an undo entry, and flashes them', () => {
		const sheet = fresh();
		const op: Op = { type: 'cells', cells: [{ r: 0, c: 0, i: '42' }] };
		sheet.applyRemote(op);
		expect(sheet.value(0, 0)).toBe(42);
		expect(sheet.canUndo).toBe(false);
		expect(sheet.flashes.size).toBe(1);
	});

	it('emits operations that the server-side applier agrees with', () => {
		const sheet = fresh();
		const ops: Op[] = [];
		sheet.onop = (op) => ops.push(op);
		sheet.setCell(0, 0, '1');
		sheet.setCell(1, 0, '=A1+1');
		sheet.insertRows(0, 1);
		sheet.rename('Ops');
		sheet.resizeColumn(0, 200);

		const replayed = applyOps(
			{ version: 1, title: 'x', columns: {}, rows: {}, frozen: { rows: 0, cols: 0 }, cells: [] },
			ops
		);
		expect(replayed).toEqual(sheet.toDocument());
	});
});
