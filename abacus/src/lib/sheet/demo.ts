/**
 * THE LANDING PAGE'S DEMO
 * =======================
 *
 * The little budget the landing page shows before any JavaScript has loaded:
 * what was typed into each cell, and what each formula comes to. The page is
 * prerendered and draws these as text — it does not ship the engine to show
 * five rows — so the answers are written down here, beside the inputs, and
 * `demo.spec.ts` loads the same inputs into the engine and checks every one.
 */

import { toA1 } from './address.ts';

/** Each cell as a person would type it. */
export const DEMO_INPUTS: readonly (readonly string[])[] = [
	['Category', 'Budgeted', 'Actual', 'Difference'],
	['Rent', '1400', '1400', '=B2-C2'],
	['Groceries', '450', '512.4', '=B3-C3'],
	['Transport', '120', '96.5', '=B4-C4'],
	['Total', '=SUM(B2:B4)', '=SUM(C2:C4)', '=B5-C5']
];

/** What each formula above comes to, by address. */
export const DEMO_RESULTS: Readonly<Record<string, number>> = {
	D2: 0,
	D3: -62.4,
	D4: 23.5,
	B5: 1970,
	C5: 2008.9,
	D5: -38.9
};

const money = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

/** What the cell shows: a formula's answer or a typed number as money, a word as it is. */
export function demoText(row: number, col: number): string {
	const input = DEMO_INPUTS[row]?.[col] ?? '';
	if (input.startsWith('=')) return money.format(DEMO_RESULTS[toA1({ row, col })] ?? Number.NaN);
	return row > 0 && col > 0 ? money.format(Number(input)) : input;
}
