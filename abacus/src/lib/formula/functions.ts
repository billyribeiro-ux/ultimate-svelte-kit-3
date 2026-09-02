/**
 * THE FUNCTION LIBRARY
 * ====================
 *
 * Fifty-odd functions, each a few lines, registered by name in one `Map`. The
 * evaluator looks a name up here and hands the function its arguments as
 * *thunks* — functions that evaluate the argument when called — so that `IF`
 * evaluates only the branch it takes and `IFERROR` can catch an error
 * instead of receiving it.
 *
 * Each entry carries a `signature` and a `description` because the formula
 * bar's autocomplete reads this table too. A function that exists but is not
 * documented is a function nobody finds.
 *
 * THE RULES ARGUMENTS FOLLOW
 * --------------------------
 *   - An error in any argument is the result, unless the function exists to
 *     handle errors (IFERROR, ISERROR).
 *   - In a *range*, only numbers count for arithmetic: `SUM(A1:A3)` skips the
 *     text and the empties. A scalar argument is coerced: `SUM("3")` is 3.
 *   - Comparisons use `compare()` from values.ts, so "b" > "a" and 2 < "a".
 */

import { partsFromSerial, serialFromParts, todaySerial, nowSerial } from '#lib/sheet/dates.ts';
import { formatFromPattern, formatScalar } from '#lib/sheet/format.ts';
import type { Context } from './evaluate.ts';
import {
	compare,
	DIV0,
	ErrorValue,
	flatten,
	isError,
	isRange,
	NA,
	NUM,
	plainNumber,
	RangeValue,
	toBoolean,
	toNumber,
	toText,
	VALUE,
	type Scalar,
	type Value
} from './values.ts';

export type Thunk = () => Value;

export interface FunctionSpec {
	name: string;
	minArgs: number;
	maxArgs: number;
	/** Recalculated on every recalculation, whether or not anything it reads changed. */
	volatile?: boolean;
	signature: string;
	description: string;
	call(args: Thunk[], ctx: Context): Value;
}

export const FUNCTIONS = new Map<string, FunctionSpec>();

function define(spec: FunctionSpec): void {
	FUNCTIONS.set(spec.name, spec);
}

/* ------------------------------------------------------------------ */
/* Argument helpers                                                    */
/* ------------------------------------------------------------------ */

/** Evaluate every thunk; the first error wins. */
function all(args: Thunk[]): Value[] | ErrorValue {
	const values: Value[] = [];
	for (const arg of args) {
		const v = arg();
		if (isError(v)) return v;
		values.push(v);
	}
	return values;
}

/**
 * The numbers among the arguments: scalars coerced, range cells filtered.
 * This is the rule that makes `SUM(A1:A3)` ignore a heading in A1 and
 * `SUM("3", TRUE)` equal 4.
 */
function numbers(values: Value[]): number[] | ErrorValue {
	const out: number[] = [];
	for (const v of values) {
		if (isRange(v)) {
			for (const cell of v.cells) {
				if (typeof cell === 'number') out.push(cell);
				else if (cell instanceof ErrorValue) return cell;
			}
		} else {
			const n = toNumber(v);
			if (isError(n)) return n;
			out.push(n);
		}
	}
	return out;
}

function scalar(v: Value, what = 'a value'): Scalar | ErrorValue {
	if (isRange(v)) {
		if (v.size === 1) return v.get(0, 0);
		return VALUE(`Expected ${what}, not a range`);
	}
	return v;
}

function num(v: Value): number | ErrorValue {
	const s = scalar(v);
	return isError(s) ? s : toNumber(s);
}

function text(v: Value): string | ErrorValue {
	const s = scalar(v);
	return isError(s) ? s : toText(s);
}

function int(v: Value): number | ErrorValue {
	const n = num(v);
	return isError(n) ? n : Math.trunc(n);
}

/** A helper for functions of numbers only, with error propagation done once. */
function numeric(
	name: string,
	signature: string,
	description: string,
	min: number,
	max: number,
	fn: (ns: number[]) => Value
) {
	define({
		name,
		signature,
		description,
		minArgs: min,
		maxArgs: max,
		call(args) {
			const values = all(args);
			if (isError(values)) return values;
			const ns: number[] = [];
			for (const v of values) {
				const n = num(v);
				if (isError(n)) return n;
				ns.push(n);
			}
			return fn(ns);
		}
	});
}

/* ------------------------------------------------------------------ */
/* Criteria: ">5", "<>done", "a*"                                      */
/* ------------------------------------------------------------------ */

/** A predicate from a criterion, as COUNTIF and SUMIF read it. */
export function criterion(raw: Scalar): (cell: Scalar) => boolean {
	if (raw instanceof ErrorValue) return () => false;
	if (typeof raw === 'boolean') return (cell) => cell === raw;
	if (raw === null) return (cell) => cell === null || cell === '';

	let op = '=';
	let target: Scalar = raw;
	if (typeof raw === 'string') {
		const match = /^(<>|<=|>=|=|<|>)?(.*)$/s.exec(raw)!;
		op = match[1] ?? '=';
		const rest = match[2] ?? '';
		const asNumber = rest.trim() === '' ? NaN : Number(rest);
		target = Number.isFinite(asNumber) ? asNumber : rest;
	}

	/*
	 * A numeric criterion sees only numbers — and text that is a number, which
	 * is what a person pasting "12" from a web page has. Text never satisfies
	 * ">6": in a column of prices with a heading, the heading is not "greater
	 * than six", it is a heading.
	 */
	if (typeof target === 'number') {
		const wanted = target;
		return (cell) => {
			const n =
				typeof cell === 'number'
					? cell
					: typeof cell === 'string' && cell.trim() !== '' && Number.isFinite(Number(cell))
						? Number(cell)
						: null;
			if (n === null) return op === '<>';
			return holds(op, n - wanted);
		};
	}

	const text = target;
	if ((op === '=' || op === '<>') && /[*?]/.test(text)) {
		const pattern = new RegExp(
			`^${text
				.replace(/[.+^${}()|[\]\\]/g, '\\$&')
				.replaceAll('*', '.*')
				.replaceAll('?', '.')}$`,
			'i'
		);
		return (cell) => pattern.test(cellText(cell)) === (op === '=');
	}

	const lower = text.toLowerCase();
	return (cell) => {
		if (op === '=') return cellText(cell).toLowerCase() === lower;
		if (op === '<>') return cellText(cell).toLowerCase() !== lower;
		// "<m" orders text against text; a number is never "less than m".
		if (typeof cell !== 'string') return false;
		const c = cell.toLowerCase();
		return holds(op, c < lower ? -1 : c > lower ? 1 : 0);
	};
}

function cellText(cell: Scalar): string {
	if (cell === null) return '';
	if (cell instanceof ErrorValue) return cell.code;
	return typeof cell === 'string' ? cell : plainNumber(Number(cell));
}

function holds(op: string, sign: number): boolean {
	switch (op) {
		case '=':
			return sign === 0;
		case '<>':
			return sign !== 0;
		case '<':
			return sign < 0;
		case '>':
			return sign > 0;
		case '<=':
			return sign <= 0;
		default:
			return sign >= 0;
	}
}

/* ------------------------------------------------------------------ */
/* Maths and statistics                                                */
/* ------------------------------------------------------------------ */

define({
	name: 'SUM',
	signature: 'SUM(value1, [value2, …])',
	description: 'Adds numbers; text and empty cells in ranges are skipped.',
	minArgs: 1,
	maxArgs: Infinity,
	call(args) {
		const values = all(args);
		if (isError(values)) return values;
		const ns = numbers(values);
		return isError(ns) ? ns : ns.reduce((a, b) => a + b, 0);
	}
});

define({
	name: 'PRODUCT',
	signature: 'PRODUCT(value1, [value2, …])',
	description: 'Multiplies numbers.',
	minArgs: 1,
	maxArgs: Infinity,
	call(args) {
		const values = all(args);
		if (isError(values)) return values;
		const ns = numbers(values);
		return isError(ns) ? ns : ns.reduce((a, b) => a * b, 1);
	}
});

define({
	name: 'AVERAGE',
	signature: 'AVERAGE(value1, [value2, …])',
	description: 'The mean of the numbers.',
	minArgs: 1,
	maxArgs: Infinity,
	call(args) {
		const values = all(args);
		if (isError(values)) return values;
		const ns = numbers(values);
		if (isError(ns)) return ns;
		return ns.length === 0 ? DIV0() : ns.reduce((a, b) => a + b, 0) / ns.length;
	}
});

define({
	name: 'MEDIAN',
	signature: 'MEDIAN(value1, [value2, …])',
	description: 'The middle number, or the mean of the two middle numbers.',
	minArgs: 1,
	maxArgs: Infinity,
	call(args) {
		const values = all(args);
		if (isError(values)) return values;
		const ns = numbers(values);
		if (isError(ns)) return ns;
		if (ns.length === 0) return NUM('No numbers to take the median of');
		const sorted = [...ns].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
	}
});

for (const [name, pick, description] of [
	['MIN', Math.min, 'The smallest number.'],
	['MAX', Math.max, 'The largest number.']
] as const) {
	define({
		name,
		signature: `${name}(value1, [value2, …])`,
		description,
		minArgs: 1,
		maxArgs: Infinity,
		call(args) {
			const values = all(args);
			if (isError(values)) return values;
			const ns = numbers(values);
			if (isError(ns)) return ns;
			return ns.length === 0 ? 0 : pick(...ns);
		}
	});
}

define({
	name: 'COUNT',
	signature: 'COUNT(value1, [value2, …])',
	description: 'How many cells hold numbers.',
	minArgs: 1,
	maxArgs: Infinity,
	call(args) {
		const values = all(args);
		if (isError(values)) return values;
		return values.flatMap(flatten).filter((c) => typeof c === 'number').length;
	}
});

define({
	name: 'COUNTA',
	signature: 'COUNTA(value1, [value2, …])',
	description: 'How many cells are not empty.',
	minArgs: 1,
	maxArgs: Infinity,
	call(args) {
		const values = all(args);
		if (isError(values)) return values;
		return values.flatMap(flatten).filter((c) => c !== null && c !== '').length;
	}
});

define({
	name: 'COUNTBLANK',
	signature: 'COUNTBLANK(range)',
	description: 'How many cells are empty.',
	minArgs: 1,
	maxArgs: 1,
	call(args) {
		const v = args[0]!();
		if (isError(v)) return v;
		return flatten(v).filter((c) => c === null || c === '').length;
	}
});

define({
	name: 'COUNTIF',
	signature: 'COUNTIF(range, criterion)',
	description: 'How many cells meet a criterion such as ">5", "done" or "a*".',
	minArgs: 2,
	maxArgs: 2,
	call(args) {
		const range = args[0]!();
		if (isError(range)) return range;
		const crit = scalar(args[1]!(), 'a criterion');
		if (isError(crit)) return crit;
		const test = criterion(crit);
		return flatten(range).filter(test).length;
	}
});

define({
	name: 'SUMIF',
	signature: 'SUMIF(range, criterion, [sum_range])',
	description: 'Adds the cells that meet a criterion — or the matching cells of a second range.',
	minArgs: 2,
	maxArgs: 3,
	call(args) {
		const range = args[0]!();
		if (isError(range)) return range;
		const crit = scalar(args[1]!(), 'a criterion');
		if (isError(crit)) return crit;
		const sumRange = args[2] ? args[2]() : range;
		if (isError(sumRange)) return sumRange;
		const test = criterion(crit);
		const keys = flatten(range);
		const sums = flatten(sumRange);
		let total = 0;
		for (let i = 0; i < keys.length; i += 1) {
			if (test(keys[i]!)) {
				const s = sums[i];
				if (typeof s === 'number') total += s;
			}
		}
		return total;
	}
});

numeric('ABS', 'ABS(number)', 'The number without its sign.', 1, 1, ([n]) => Math.abs(n!));
numeric('SQRT', 'SQRT(number)', 'The square root.', 1, 1, ([n]) =>
	n! < 0 ? NUM('Cannot take the square root of a negative number') : Math.sqrt(n!)
);
numeric('POWER', 'POWER(base, exponent)', 'base raised to exponent.', 2, 2, ([a, b]) => {
	const r = a! ** b!;
	return Number.isFinite(r) ? r : NUM();
});
numeric(
	'MOD',
	'MOD(number, divisor)',
	'The remainder, with the sign of the divisor.',
	2,
	2,
	([a, b]) => (b === 0 ? DIV0() : a! - b! * Math.floor(a! / b!))
);
numeric('INT', 'INT(number)', 'Rounds down to the nearest whole number.', 1, 1, ([n]) =>
	Math.floor(n!)
);
numeric('PI', 'PI()', 'The number π.', 0, 0, () => Math.PI);

/**
 * Rounding in decimal, not in binary. `1.005 * 100` is `100.49999999999999`
 * in floating point, so `Math.round` gives 100 and a person who typed 1.005
 * and asked for two places sees 1.00 and stops trusting the sheet. Shifting
 * the decimal point *as text* — `Number("1.005e2")` is exactly 100.5 —
 * moves the point before the binary error can, which is what every
 * spreadsheet does under the hood.
 */
function shift(n: number, places: number): number {
	const [mantissa, exponent = '0'] = n.toExponential().split('e');
	return Number(`${mantissa}e${Number(exponent) + places}`);
}

function roundTo(n: number, places: number, mode: 'nearest' | 'up' | 'down'): number {
	const p = Math.trunc(places);
	const scaled = shift(Math.abs(n), p);
	const whole =
		mode === 'nearest'
			? Math.round(scaled)
			: mode === 'up'
				? Math.ceil(scaled)
				: Math.floor(scaled);
	const result = shift(whole, -p);
	return n < 0 ? -result : result;
}

numeric(
	'ROUND',
	'ROUND(number, [places])',
	'Rounds to a number of decimal places; half rounds away from zero.',
	1,
	2,
	([n, p]) => roundTo(n!, p ?? 0, 'nearest')
);
numeric('ROUNDUP', 'ROUNDUP(number, [places])', 'Rounds away from zero.', 1, 2, ([n, p]) =>
	roundTo(n!, p ?? 0, 'up')
);
numeric('ROUNDDOWN', 'ROUNDDOWN(number, [places])', 'Rounds towards zero.', 1, 2, ([n, p]) =>
	roundTo(n!, p ?? 0, 'down')
);

define({
	name: 'RAND',
	signature: 'RAND()',
	description: 'A random number between 0 and 1. Changes on every recalculation.',
	minArgs: 0,
	maxArgs: 0,
	volatile: true,
	call: (_, ctx) => ctx.random()
});

define({
	name: 'RANDBETWEEN',
	signature: 'RANDBETWEEN(low, high)',
	description: 'A random whole number between low and high, inclusive.',
	minArgs: 2,
	maxArgs: 2,
	volatile: true,
	call(args, ctx) {
		const lo = int(args[0]!());
		if (isError(lo)) return lo;
		const hi = int(args[1]!());
		if (isError(hi)) return hi;
		if (hi < lo) return NUM('high is below low');
		return lo + Math.floor(ctx.random() * (hi - lo + 1));
	}
});

/* ------------------------------------------------------------------ */
/* Logic                                                               */
/* ------------------------------------------------------------------ */

define({
	name: 'IF',
	signature: 'IF(condition, value_if_true, [value_if_false])',
	description:
		'One value if the condition holds, another if not. Only the chosen branch is evaluated.',
	minArgs: 2,
	maxArgs: 3,
	call(args) {
		const cond = toBoolean(scalarOrError(args[0]!()));
		if (isError(cond)) return cond;
		if (cond) return args[1]!();
		return args[2] ? args[2]() : false;
	}
});

function scalarOrError(v: Value): Scalar {
	const s = scalar(v, 'a condition');
	return s;
}

define({
	name: 'IFERROR',
	signature: 'IFERROR(value, value_if_error)',
	description: 'The value, or the fallback if the value is an error.',
	minArgs: 2,
	maxArgs: 2,
	call(args) {
		const v = args[0]!();
		return isError(v) ? args[1]!() : v;
	}
});

for (const [name, every, description] of [
	['AND', true, 'TRUE if every argument is true.'],
	['OR', false, 'TRUE if any argument is true.']
] as const) {
	define({
		name,
		signature: `${name}(condition1, [condition2, …])`,
		description,
		minArgs: 1,
		maxArgs: Infinity,
		call(args) {
			const values = all(args);
			if (isError(values)) return values;
			let result = every;
			for (const cell of values.flatMap(flatten)) {
				if (cell === null || cell === '') continue;
				const b = toBoolean(cell);
				if (isError(b)) return b;
				result = every ? result && b : result || b;
			}
			return result;
		}
	});
}

define({
	name: 'NOT',
	signature: 'NOT(condition)',
	description: 'The opposite.',
	minArgs: 1,
	maxArgs: 1,
	call(args) {
		const b = toBoolean(scalarOrError(args[0]!()));
		return isError(b) ? b : !b;
	}
});

define({
	name: 'CHOOSE',
	signature: 'CHOOSE(index, value1, [value2, …])',
	description: 'The value at the given position, counting from 1.',
	minArgs: 2,
	maxArgs: Infinity,
	call(args) {
		const i = int(args[0]!());
		if (isError(i)) return i;
		const chosen = args[i];
		return i >= 1 && chosen ? chosen() : VALUE(`CHOOSE has no value ${i}`);
	}
});

for (const [name, test, description] of [
	['ISBLANK', (v: Scalar) => v === null, 'TRUE if the cell is empty.'],
	['ISNUMBER', (v: Scalar) => typeof v === 'number', 'TRUE if the value is a number.'],
	['ISTEXT', (v: Scalar) => typeof v === 'string', 'TRUE if the value is text.'],
	['ISERROR', (v: Scalar) => v instanceof ErrorValue, 'TRUE if the value is an error.']
] as const) {
	define({
		name,
		signature: `${name}(value)`,
		description,
		minArgs: 1,
		maxArgs: 1,
		call(args) {
			const v = args[0]!();
			const s = isRange(v) ? v.get(0, 0) : v;
			return test(s);
		}
	});
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

function textual(
	name: string,
	signature: string,
	description: string,
	min: number,
	max: number,
	fn: (parts: Value[]) => Value
) {
	define({
		name,
		signature,
		description,
		minArgs: min,
		maxArgs: max,
		call(args) {
			const values = all(args);
			return isError(values) ? values : fn(values);
		}
	});
}

textual('LEN', 'LEN(text)', 'How many characters.', 1, 1, ([v]) => {
	const t = text(v!);
	return isError(t) ? t : [...t].length;
});
textual('UPPER', 'UPPER(text)', 'In capitals.', 1, 1, ([v]) => {
	const t = text(v!);
	return isError(t) ? t : t.toUpperCase();
});
textual('LOWER', 'LOWER(text)', 'In lower case.', 1, 1, ([v]) => {
	const t = text(v!);
	return isError(t) ? t : t.toLowerCase();
});
textual('TRIM', 'TRIM(text)', 'Without leading, trailing or doubled spaces.', 1, 1, ([v]) => {
	const t = text(v!);
	return isError(t) ? t : t.trim().replace(/\s+/g, ' ');
});
textual('LEFT', 'LEFT(text, [count])', 'The first characters.', 1, 2, ([v, c]) => {
	const t = text(v!);
	if (isError(t)) return t;
	const n = c === undefined ? 1 : int(c);
	if (isError(n)) return n;
	return n < 0 ? VALUE('count must not be negative') : [...t].slice(0, n).join('');
});
textual('RIGHT', 'RIGHT(text, [count])', 'The last characters.', 1, 2, ([v, c]) => {
	const t = text(v!);
	if (isError(t)) return t;
	const n = c === undefined ? 1 : int(c);
	if (isError(n)) return n;
	if (n < 0) return VALUE('count must not be negative');
	const chars = [...t];
	return chars.slice(Math.max(0, chars.length - n)).join('');
});
textual(
	'MID',
	'MID(text, start, count)',
	'Characters from a position, counting from 1.',
	3,
	3,
	([v, s, c]) => {
		const t = text(v!);
		if (isError(t)) return t;
		const start = int(s!);
		if (isError(start)) return start;
		const n = int(c!);
		if (isError(n)) return n;
		if (start < 1 || n < 0) return VALUE('start must be 1 or more and count must not be negative');
		return [...t].slice(start - 1, start - 1 + n).join('');
	}
);
textual('REPT', 'REPT(text, times)', 'The text repeated.', 2, 2, ([v, c]) => {
	const t = text(v!);
	if (isError(t)) return t;
	const n = int(c!);
	if (isError(n)) return n;
	if (n < 0 || n * t.length > 32_767) return VALUE('Too many repetitions');
	return t.repeat(n);
});
textual(
	'FIND',
	'FIND(needle, haystack, [start])',
	'Where the needle first appears, counting from 1, case-sensitive; #VALUE! if absent.',
	2,
	3,
	([n, h, s]) => {
		const needle = text(n!);
		if (isError(needle)) return needle;
		const hay = text(h!);
		if (isError(hay)) return hay;
		const start = s === undefined ? 1 : int(s);
		if (isError(start)) return start;
		const at = hay.indexOf(needle, Math.max(0, start - 1));
		return at === -1 ? VALUE(`"${needle}" was not found`) : at + 1;
	}
);
textual(
	'SUBSTITUTE',
	'SUBSTITUTE(text, old, new)',
	'Every occurrence of old replaced with new.',
	3,
	3,
	([v, o, n]) => {
		const t = text(v!);
		if (isError(t)) return t;
		const from = text(o!);
		if (isError(from)) return from;
		const to = text(n!);
		if (isError(to)) return to;
		return from === '' ? t : t.replaceAll(from, to);
	}
);

for (const name of ['CONCAT', 'CONCATENATE']) {
	define({
		name,
		signature: `${name}(text1, [text2, …])`,
		description: 'Joins text together; ranges are joined cell by cell.',
		minArgs: 1,
		maxArgs: Infinity,
		call(args) {
			const values = all(args);
			if (isError(values)) return values;
			let out = '';
			for (const cell of values.flatMap(flatten)) {
				const t = toText(cell);
				if (isError(t)) return t;
				out += t;
			}
			return out;
		}
	});
}

define({
	name: 'VALUE',
	signature: 'VALUE(text)',
	description: 'The number a piece of text holds.',
	minArgs: 1,
	maxArgs: 1,
	call: (args) => num(args[0]!())
});

define({
	name: 'TEXT',
	signature: 'TEXT(value, format)',
	description: 'A number as text in a format such as "0.00", "#,##0", "0%" or "yyyy-mm-dd".',
	minArgs: 2,
	maxArgs: 2,
	call(args, ctx) {
		const v = scalar(args[0]!());
		if (isError(v)) return v;
		const pattern = text(args[1]!());
		if (isError(pattern)) return pattern;
		const format = formatFromPattern(pattern);
		if (!format) return VALUE(`Unknown format "${pattern}"`);
		return formatScalar(v, format, ctx.locale);
	}
});

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

numeric(
	'DATE',
	'DATE(year, month, day)',
	'The serial number of a date; months and days may overflow.',
	3,
	3,
	([y, m, d]) => serialFromParts(Math.trunc(y!), Math.trunc(m!), Math.trunc(d!))
);

define({
	name: 'TODAY',
	signature: 'TODAY()',
	description: "Today's date as a serial number. Changes on every recalculation.",
	minArgs: 0,
	maxArgs: 0,
	volatile: true,
	call: (_, ctx) => todaySerial(ctx.now())
});

define({
	name: 'NOW',
	signature: 'NOW()',
	description: 'The current date and time as a serial number. Changes on every recalculation.',
	minArgs: 0,
	maxArgs: 0,
	volatile: true,
	call: (_, ctx) => nowSerial(ctx.now())
});

for (const [name, part, description] of [
	['YEAR', 'year', 'The year of a date.'],
	['MONTH', 'month', 'The month of a date, 1 to 12.'],
	['DAY', 'day', 'The day of the month.']
] as const) {
	numeric(name, `${name}(date)`, description, 1, 1, ([serial]) => partsFromSerial(serial!)[part]);
}

numeric(
	'WEEKDAY',
	'WEEKDAY(date)',
	'The day of the week, 1 for Sunday to 7 for Saturday.',
	1,
	1,
	([serial]) => {
		const { year, month, day } = partsFromSerial(serial!);
		return new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 1;
	}
);

numeric(
	'DAYS',
	'DAYS(end, start)',
	'The number of days from start to end.',
	2,
	2,
	([end, start]) => Math.trunc(end!) - Math.trunc(start!)
);

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

function asRange(v: Value): RangeValue {
	return isRange(v) ? v : new RangeValue(1, 1, [v as Scalar]);
}

define({
	name: 'INDEX',
	signature: 'INDEX(range, row, [column])',
	description: 'The cell at a row and column of a range, counting from 1.',
	minArgs: 2,
	maxArgs: 3,
	call(args) {
		const range = args[0]!();
		if (isError(range)) return range;
		const table = asRange(range);
		const row = int(args[1]!());
		if (isError(row)) return row;
		const col = args[2] ? int(args[2]()) : 1;
		if (isError(col)) return col;
		if (row < 1 || row > table.rows || col < 1 || col > table.cols) {
			return new ErrorValue('#REF!', 'INDEX is outside the range');
		}
		return table.get(row - 1, col - 1);
	}
});

define({
	name: 'MATCH',
	signature: 'MATCH(value, range, [0])',
	description: 'The position of a value in a row or column, counting from 1. Exact matches only.',
	minArgs: 2,
	maxArgs: 3,
	call(args) {
		const needle = scalar(args[0]!());
		if (isError(needle)) return needle;
		const range = args[1]!();
		if (isError(range)) return range;
		const cells = flatten(range);
		const at = cells.findIndex((cell) => compare(cell, needle) === 0);
		return at === -1 ? NA(`${plainValue(needle)} was not found`) : at + 1;
	}
});

for (const [name, vertical] of [
	['VLOOKUP', true],
	['HLOOKUP', false]
] as const) {
	define({
		name,
		signature: `${name}(value, table, index, [FALSE])`,
		description: vertical
			? 'Finds a value in the first column of a table and returns the cell in the given column. Exact matches only.'
			: 'Finds a value in the first row of a table and returns the cell in the given row. Exact matches only.',
		minArgs: 3,
		maxArgs: 4,
		call(args) {
			const needle = scalar(args[0]!());
			if (isError(needle)) return needle;
			const tableValue = args[1]!();
			if (isError(tableValue)) return tableValue;
			const table = asRange(tableValue);
			const index = int(args[2]!());
			if (isError(index)) return index;
			const limit = vertical ? table.cols : table.rows;
			if (index < 1 || index > limit)
				return new ErrorValue('#REF!', `The table has no ${vertical ? 'column' : 'row'} ${index}`);
			const count = vertical ? table.rows : table.cols;
			for (let i = 0; i < count; i += 1) {
				const key = vertical ? table.get(i, 0) : table.get(0, i);
				if (compare(key, needle) === 0)
					return vertical ? table.get(i, index - 1) : table.get(index - 1, i);
			}
			return NA(`${plainValue(needle)} was not found`);
		}
	});
}

function plainValue(v: Scalar): string {
	if (typeof v === 'number') return plainNumber(v);
	if (typeof v === 'string') return `"${v}"`;
	return String(v);
}

/** Names, for autocomplete, sorted. */
export const FUNCTION_NAMES = [...FUNCTIONS.keys()].sort();
