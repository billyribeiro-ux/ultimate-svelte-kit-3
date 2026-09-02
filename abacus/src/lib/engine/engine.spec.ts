import { describe, expect, it } from 'vitest';
import { ErrorValue } from '#lib/formula/values.ts';
import { key, parseA1 } from '#lib/sheet/address.ts';
import { Engine } from './engine.ts';
import { shiftFormula, translateFormula } from './rewrite.ts';

/** A little A1 sugar over the engine, for tests that read like a person typing. */
function sheet(initial: Record<string, string> = {}) {
	const engine = new Engine({ now: () => new Date(Date.UTC(2026, 8, 2)), random: () => 0.5 });
	const at = (a1: string) => parseA1(a1)!;
	const api = {
		engine,
		set: (a1: string, input: string | null) => {
			const { row, col } = at(a1);
			return engine.set(row, col, input);
		},
		value: (a1: string) => {
			const { row, col } = at(a1);
			return engine.value(row, col);
		},
		code: (a1: string) => {
			const v = api.value(a1);
			return v instanceof ErrorValue ? v.code : null;
		},
		input: (a1: string) => {
			const { row, col } = at(a1);
			return engine.get(row, col)?.input ?? '';
		}
	};
	for (const [a1, input] of Object.entries(initial)) api.set(a1, input);
	return api;
}

describe('literals', () => {
	it('reads numbers, booleans, text and quoted text', () => {
		const s = sheet({ A1: '12.5', A2: 'TRUE', A3: 'hello', A4: "'123", A5: '' });
		expect(s.value('A1')).toBe(12.5);
		expect(s.value('A2')).toBe(true);
		expect(s.value('A3')).toBe('hello');
		expect(s.value('A4')).toBe('123');
		expect(s.value('A5')).toBeNull();
		expect(s.engine.size).toBe(4);
	});

	it('forgets a cleared cell entirely', () => {
		const s = sheet({ A1: '1' });
		s.set('A1', null);
		expect(s.engine.size).toBe(0);
		expect(s.value('A1')).toBeNull();
	});
});

describe('formulas', () => {
	it('evaluates and follows edits', () => {
		const s = sheet({ A1: '2', A2: '3', A3: '=A1*A2' });
		expect(s.value('A3')).toBe(6);
		s.set('A1', '10');
		expect(s.value('A3')).toBe(30);
	});

	it('keeps a syntax error as a value with a message', () => {
		const s = sheet({ A1: '=1 +' });
		expect(s.code('A1')).toBe('#ERROR!');
		expect(s.engine.get(0, 0)?.error).toMatch(/ended/);
		s.set('A1', '=1 + 1');
		expect(s.value('A1')).toBe(2);
	});

	it('recomputes only what depends on the change', () => {
		const s = sheet({ A1: '1', A2: '=A1+1', A3: '=A2+1', B1: '5', B2: '=B1*2' });
		const result = s.set('A1', '2');
		expect(result.evaluated).toBe(2); // A2 and A3, not B2
		expect(s.value('A3')).toBe(4);
		expect(s.value('B2')).toBe(10);
		expect(s.set('B1', '6').evaluated).toBe(1);
	});

	it('evaluates in dependency order, whatever the order of entry', () => {
		const s = sheet({ C1: '=B1+1', B1: '=A1+1', A1: '1' });
		expect(s.value('C1')).toBe(3);
		const result = s.set('A1', '10');
		expect(s.value('B1')).toBe(11);
		expect(s.value('C1')).toBe(12);
		expect(result.changed.length).toBe(3);
	});

	it('watches ranges', () => {
		const s = sheet({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)', C1: '=SUM(A1:A2)' });
		expect(s.value('B1')).toBe(6);
		expect(s.value('C1')).toBe(3);
		const inside = s.set('A3', '30');
		expect(inside.evaluated).toBe(1); // only B1 reads A3
		expect(s.value('B1')).toBe(33);
		const outside = s.set('A9', '99');
		expect(outside.evaluated).toBe(0);
		const fresh = s.set('A2', '20');
		expect(fresh.evaluated).toBe(2);
		expect(s.value('C1')).toBe(21);
	});

	it('reports which cells changed and bumps the version once per batch', () => {
		const s = sheet({ A1: '1', A2: '=A1', A3: '=A1*0' });
		const before = s.engine.version;
		const result = s.engine.apply([
			{ row: 0, col: 0, input: '2' },
			{ row: 0, col: 4, input: 'x' }
		]);
		expect(s.engine.version).toBe(before + 1);
		expect(result.changed.sort()).toEqual([key(0, 0), key(0, 4), key(1, 0)].sort()); // A3 stayed 0
	});
});

describe('cycles', () => {
	it('marks a direct cycle and recovers when it is broken', () => {
		const s = sheet({ A1: '=A1+1' });
		expect(s.code('A1')).toBe('#CYCLE!');
		s.set('A1', '5');
		expect(s.value('A1')).toBe(5);
	});

	it('marks every member of an indirect cycle, and what is downstream', () => {
		const s = sheet({ A1: '=B1', B1: '=C1', C1: '=A1', D1: '=C1+1', E1: '7' });
		const result = s.set('A1', '=B1+0');
		expect(s.code('A1')).toBe('#CYCLE!');
		expect(s.code('B1')).toBe('#CYCLE!');
		expect(s.code('C1')).toBe('#CYCLE!');
		expect(s.code('D1')).toBe('#CYCLE!');
		expect(result.cycles).toHaveLength(3); // the members; D1 is downstream
		expect(s.value('E1')).toBe(7);

		s.set('C1', '1');
		expect(s.value('A1')).toBe(1);
		expect(s.value('D1')).toBe(2);
	});

	it('lets a cell downstream of a cycle handle the error like any other', () => {
		const s = sheet({ A1: '=B1', B1: '=A1', C1: '=IFERROR(A1, "broken")', D1: '=COUNT(A1:B1)' });
		expect(s.value('C1')).toBe('broken');
		expect(s.value('D1')).toBe(0);
	});

	it('does not confuse a diamond with a cycle', () => {
		const s = sheet({ A1: '1', B1: '=A1+1', C1: '=A1+2', D1: '=B1+C1' });
		expect(s.value('D1')).toBe(5);
		const result = s.set('A1', '2');
		expect(result.evaluated).toBe(3); // each formula exactly once
		expect(s.value('D1')).toBe(7);
	});
});

describe('volatile cells', () => {
	it('recalculates RAND and NOW on every pass, and their dependents', () => {
		let n = 0;
		const engine = new Engine({ random: () => (n += 1) / 10 });
		engine.set(0, 0, '=RAND()');
		expect(engine.value(0, 0)).toBe(0.1);
		// Every recalculation re-rolls, including the one this edit causes.
		engine.set(1, 0, '=A1*10');
		expect(engine.value(0, 0)).toBe(0.2);
		expect(engine.value(1, 0)).toBe(2);
		engine.set(5, 5, 'unrelated');
		expect(engine.value(0, 0)).toBe(0.3);
		expect(engine.value(1, 0)).toBe(3);
	});
});

describe('structure', () => {
	it('inserting rows moves cells and rewrites formulas', () => {
		const s = sheet({ A1: '1', A2: '2', A3: '=SUM(A1:A2)', B1: '=A2*10' });
		s.engine.shift({ kind: 'insert-rows', at: 1, count: 2 });
		expect(s.value('A1')).toBe(1);
		expect(s.value('A2')).toBeNull();
		expect(s.value('A4')).toBe(2);
		expect(s.input('A5')).toBe('=SUM(A1:A4)');
		expect(s.value('A5')).toBe(3);
		expect(s.input('B1')).toBe('=A4*10');
		expect(s.value('B1')).toBe(20);
	});

	it('deleting a row shrinks ranges and breaks references', () => {
		const s = sheet({ A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)', C1: '=A2', D1: '=A3' });
		s.engine.shift({ kind: 'delete-rows', at: 1, count: 1 });
		expect(s.input('B1')).toBe('=SUM(A1:A2)');
		expect(s.value('B1')).toBe(4);
		expect(s.input('C1')).toBe('=#REF!');
		expect(s.code('C1')).toBe('#REF!');
		expect(s.input('D1')).toBe('=A2');
		expect(s.value('D1')).toBe(3);
	});

	it('inserting and deleting columns is symmetrical', () => {
		const s = sheet({ A1: '=B1+C1', B1: '1', C1: '2' });
		s.engine.shift({ kind: 'insert-cols', at: 1, count: 1 });
		expect(s.input('A1')).toBe('=C1+D1');
		expect(s.value('A1')).toBe(3);
		s.engine.shift({ kind: 'delete-cols', at: 1, count: 1 });
		expect(s.input('A1')).toBe('=B1+C1');
		expect(s.value('A1')).toBe(3);
	});
});

describe('rewriting', () => {
	it('translates relative parts and keeps absolute ones', () => {
		expect(translateFormula('A1 + $B$2 + C$3 + $D4', 1, 1)).toBe('B2 + $B$2 + D$3 + $D5');
		expect(translateFormula('SUM(A1:B2)', 2, 0)).toBe('SUM(A3:B4)');
		expect(translateFormula('A1', -1, 0)).toBe('#REF!');
		expect(translateFormula('1 +', 1, 1)).toBe('1 +'); // unparseable: untouched
	});

	it('preserves spacing and casing while shifting', () => {
		expect(shiftFormula('sum( A1 : A3 )*2', { kind: 'insert-rows', at: 0, count: 1 })).toBe(
			'sum( A2:A4 )*2'
		);
	});

	it('handles every way a range can meet a deletion', () => {
		const del = { kind: 'delete-rows', at: 2, count: 2 } as const; // rows 3 and 4
		expect(shiftFormula('SUM(A1:A2)', del)).toBe('SUM(A1:A2)'); // above
		expect(shiftFormula('SUM(A5:A6)', del)).toBe('SUM(A3:A4)'); // below
		expect(shiftFormula('SUM(A1:A6)', del)).toBe('SUM(A1:A4)'); // spanning
		expect(shiftFormula('SUM(A2:A3)', del)).toBe('SUM(A2:A2)'); // overlapping the top
		expect(shiftFormula('SUM(A4:A5)', del)).toBe('SUM(A3:A3)'); // overlapping the bottom
		expect(shiftFormula('SUM(A3:A4)', del)).toBe('SUM(#REF!)'); // wholly inside
	});
});

describe('introspection', () => {
	it('answers precedents and dependents', () => {
		const s = sheet({ A1: '1', A2: '2', B1: '=SUM(A1:A2)', C1: '=B1' });
		expect(s.engine.precedentsOf(0, 1)).toEqual([key(0, 0), key(1, 0)]);
		expect(s.engine.dependentsOf(0, 0)).toEqual([key(0, 1)]);
		expect(s.engine.dependentsOf(0, 1)).toEqual([key(0, 2)]);
		expect(s.engine.extent()).toEqual({ row: 1, col: 2 });
	});
});
