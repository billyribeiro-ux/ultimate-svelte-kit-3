/**
 * TEMPLATES
 * =========
 *
 * Three starting points, built from formulas the way a person would build
 * them: a budget, a loan schedule and a grade book. They are documents, so
 * the workspace can create a sheet from one, and they are also the pages
 * `/templates/[slug]` prerenders with `entries()`, so a person can look
 * before they sign in.
 *
 * Each is written as rows of inputs and converted to a `Document` by
 * `templateDocument`, which is the same function the tests use to check
 * that every template's formulas actually parse.
 */

import { emptyDocument, type Document } from './document.ts';
import type { CellFormat } from './format.ts';

export interface Template {
	slug: string;
	title: string;
	summary: string;
	/** Rows of inputs; `null` leaves a cell empty. */
	rows: (string | number | null)[][];
	/** Formats by column letter, applied to every row below the heading. */
	formats?: Record<string, CellFormat>;
	columns?: Record<string, number>;
	frozen?: { rows: number; cols: number };
}

const money: CellFormat = { kind: 'currency', currency: 'USD', decimals: 2 };
const percent: CellFormat = { kind: 'percent', decimals: 1 };

export const TEMPLATES: Record<string, Template> = {
	budget: {
		slug: 'budget',
		title: 'Monthly budget',
		summary: 'Income, expenses by category, and what is left — with the share each category takes.',
		rows: [
			['Category', 'Budgeted', 'Actual', 'Difference', 'Share of spend'],
			['Rent', 1400, 1400, '=B2-C2', '=C2/$C$9'],
			['Groceries', 450, 512.4, '=B3-C3', '=C3/$C$9'],
			['Transport', 120, 96.5, '=B4-C4', '=C4/$C$9'],
			['Utilities', 180, 174.2, '=B5-C5', '=C5/$C$9'],
			['Insurance', 95, 95, '=B6-C6', '=C6/$C$9'],
			['Going out', 200, 263.75, '=B7-C7', '=C7/$C$9'],
			['Savings', 400, 400, '=B8-C8', '=C8/$C$9'],
			['Total', '=SUM(B2:B8)', '=SUM(C2:C8)', '=B9-C9', '=SUM(E2:E8)'],
			[],
			['Income', 3400, null, null, null],
			['Left over', '=B11-C9', null, null, null],
			['Over budget?', '=IF(C9>B11, "Yes", "No")', null, null, null]
		],
		formats: { B: money, C: money, D: money, E: percent },
		columns: { '0': 140, '1': 110, '2': 110, '3': 110, '4': 120 },
		frozen: { rows: 1, cols: 1 }
	},

	loan: {
		slug: 'loan',
		title: 'Loan schedule',
		summary:
			'A fixed-rate loan month by month: payment, interest, principal and the balance that remains.',
		rows: [
			['Principal', 25000, null, null, null],
			['Annual rate', 0.064, null, null, null],
			['Months', 36, null, null, null],
			['Monthly payment', '=ROUND(B1*(B2/12)/(1-POWER(1+B2/12,-B3)),2)', null, null, null],
			[],
			['Month', 'Payment', 'Interest', 'Principal', 'Balance'],
			[0, null, null, null, '=B1'],
			...Array.from({ length: 36 }, (_, i) => {
				const r = 8 + i;
				return [
					i + 1,
					'=$B$4',
					`=ROUND(E${r - 1}*$B$2/12,2)`,
					`=B${r}-C${r}`,
					`=MAX(0,E${r - 1}-D${r})`
				];
			}),
			[],
			['Total interest', '=SUM(C8:C43)', null, null, null],
			['Total paid', '=SUM(B8:B43)', null, null, null]
		],
		formats: { B: money, C: money, D: money, E: money },
		columns: { '0': 90, '1': 110, '2': 110, '3': 110, '4': 120 },
		frozen: { rows: 6, cols: 0 }
	},

	grades: {
		slug: 'grades',
		title: 'Grade book',
		summary:
			'Scores across assignments, a weighted average, and a letter grade looked up from a table.',
		rows: [
			['Student', 'Homework', 'Midterm', 'Final', 'Average', 'Grade'],
			[
				'Ada',
				92,
				85,
				90,
				'=ROUND(B2*$B$10+C2*$C$10+D2*$D$10,1)',
				'=IF(E2>=90,"A",IF(E2>=80,"B",IF(E2>=70,"C",IF(E2>=60,"D","F"))))'
			],
			[
				'Grace',
				78,
				82,
				74,
				'=ROUND(B3*$B$10+C3*$C$10+D3*$D$10,1)',
				'=IF(E3>=90,"A",IF(E3>=80,"B",IF(E3>=70,"C",IF(E3>=60,"D","F"))))'
			],
			[
				'Linus',
				65,
				71,
				68,
				'=ROUND(B4*$B$10+C4*$C$10+D4*$D$10,1)',
				'=IF(E4>=90,"A",IF(E4>=80,"B",IF(E4>=70,"C",IF(E4>=60,"D","F"))))'
			],
			[
				'Margaret',
				99,
				94,
				97,
				'=ROUND(B5*$B$10+C5*$C$10+D5*$D$10,1)',
				'=IF(E5>=90,"A",IF(E5>=80,"B",IF(E5>=70,"C",IF(E5>=60,"D","F"))))'
			],
			[
				'Dennis',
				84,
				79,
				88,
				'=ROUND(B6*$B$10+C6*$C$10+D6*$D$10,1)',
				'=IF(E6>=90,"A",IF(E6>=80,"B",IF(E6>=70,"C",IF(E6>=60,"D","F"))))'
			],
			[
				'Class average',
				'=AVERAGE(B2:B6)',
				'=AVERAGE(C2:C6)',
				'=AVERAGE(D2:D6)',
				'=AVERAGE(E2:E6)',
				null
			],
			['Highest', '=MAX(B2:B6)', '=MAX(C2:C6)', '=MAX(D2:D6)', '=MAX(E2:E6)', null],
			[],
			['Weights', 0.3, 0.3, 0.4, '=SUM(B10:D10)', null],
			['Passing', '=COUNTIF(F2:F6,"<>F")', null, null, null, null]
		],
		formats: { B: { kind: 'number', decimals: 0, grouping: false } },
		columns: { '0': 130 },
		frozen: { rows: 1, cols: 1 }
	}
};

export const TEMPLATE_SLUGS = Object.keys(TEMPLATES);

export function templateDocument(slug: string): Document {
	const template = TEMPLATES[slug];
	if (!template) throw new Error(`No template "${slug}"`);
	const doc = emptyDocument(template.title);
	template.rows.forEach((row, r) => {
		row.forEach((value, c) => {
			if (value === null || value === undefined) return;
			const letter = String.fromCharCode(65 + c);
			const format = r > 0 ? template.formats?.[letter] : undefined;
			doc.cells.push({
				r,
				c,
				i: typeof value === 'number' ? String(value) : value,
				...(format ? { f: format } : {})
			});
		});
	});
	if (template.columns) doc.columns = { ...template.columns };
	if (template.frozen) doc.frozen = { ...template.frozen };
	return doc;
}
