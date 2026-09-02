/**
 * THE DOCUMENT
 * ============
 *
 * What a sheet looks like at rest: in the database, in the Origin Private
 * File System, in a template, on the wire. Cells are a list rather than a
 * grid because a sheet is sparse — forty cells in a million-row grid is a
 * list of forty — and each cell carries its *input*, never its value. Values
 * are recomputed on load; storing them would store something that can
 * disagree with the formula that produced it.
 *
 * The schema is valibot, and it is the same schema on both sides: the server
 * validates what a browser sends, and the browser validates what it reads
 * back from local storage, which may have been written by an older build.
 */

import * as v from 'valibot';
import { MAX_COLS, MAX_ROWS } from './address.ts';
import type { CellFormat } from './format.ts';

const index = (max: number) => v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(max - 1));

export const CellFormatSchema: v.GenericSchema<CellFormat> = v.variant('kind', [
	v.object({ kind: v.literal('general') }),
	v.object({
		kind: v.literal('number'),
		decimals: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10)),
		grouping: v.boolean()
	}),
	v.object({
		kind: v.literal('percent'),
		decimals: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10))
	}),
	v.object({
		kind: v.literal('currency'),
		currency: v.pipe(v.string(), v.regex(/^[A-Z]{3}$/)),
		decimals: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(4))
	}),
	v.object({ kind: v.literal('date'), style: v.picklist(['short', 'medium', 'long', 'iso']) }),
	v.object({ kind: v.literal('datetime') }),
	v.object({ kind: v.literal('time') }),
	v.object({ kind: v.literal('text') })
]);

export const CellEntrySchema = v.object({
	r: index(MAX_ROWS),
	c: index(MAX_COLS),
	/** The input as typed. Bounded: a formula longer than this is a paste gone wrong. */
	i: v.pipe(v.string(), v.maxLength(8192)),
	f: v.optional(CellFormatSchema)
});

export const DocumentSchema = v.object({
	version: v.literal(1),
	title: v.pipe(v.string(), v.trim(), v.maxLength(120)),
	/** Column widths and row heights that differ from the default, in pixels. */
	columns: v.record(v.string(), v.pipe(v.number(), v.minValue(24), v.maxValue(2000))),
	rows: v.record(v.string(), v.pipe(v.number(), v.minValue(16), v.maxValue(1000))),
	frozen: v.object({
		rows: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10)),
		cols: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10))
	}),
	cells: v.array(CellEntrySchema)
});

export type CellEntry = v.InferOutput<typeof CellEntrySchema>;
export type Document = v.InferOutput<typeof DocumentSchema>;

export function emptyDocument(title = 'Untitled sheet'): Document {
	return { version: 1, title, columns: {}, rows: {}, frozen: { rows: 0, cols: 0 }, cells: [] };
}

/** Parse stored JSON, or throw with a message a person can read. */
export function parseDocument(json: string): Document {
	return v.parse(DocumentSchema, JSON.parse(json));
}

export const DEFAULT_COLUMN_WIDTH = 100;
export const DEFAULT_ROW_HEIGHT = 28;
