/**
 * OPERATIONS
 * ==========
 *
 * The unit of change that leaves a browser: a batch of cell edits, a
 * structural shift, or a new title. Local commands produce them, the server
 * validates and numbers them, and the live query replays them to every
 * other browser on the sheet — where `Sheet.applyRemote` turns them back
 * into engine edits with no undo entry, because you cannot undo somebody
 * else's typing.
 *
 * Same schema on both sides, as with `document.ts`.
 */

import * as v from 'valibot';
import { MAX_COLS, MAX_ROWS } from './address.ts';
import { CellFormatSchema } from './document.ts';

const index = (max: number) => v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(max - 1));

export const CellEditSchema = v.object({
	r: index(MAX_ROWS),
	c: index(MAX_COLS),
	/** `null` clears the cell. */
	i: v.nullable(v.pipe(v.string(), v.maxLength(8192))),
	f: v.optional(CellFormatSchema)
});

export const OpSchema = v.variant('type', [
	v.object({
		type: v.literal('cells'),
		cells: v.pipe(v.array(CellEditSchema), v.minLength(1), v.maxLength(20_000))
	}),
	v.object({
		type: v.literal('shift'),
		kind: v.picklist(['insert-rows', 'delete-rows', 'insert-cols', 'delete-cols']),
		at: index(MAX_ROWS),
		count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000))
	}),
	v.object({
		type: v.literal('title'),
		title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))
	}),
	v.object({
		type: v.literal('size'),
		axis: v.picklist(['column', 'row']),
		index: index(MAX_ROWS),
		size: v.pipe(v.number(), v.minValue(16), v.maxValue(2000))
	})
]);

export type CellEdit = v.InferOutput<typeof CellEditSchema>;
export type Op = v.InferOutput<typeof OpSchema>;
