/**
 * THE SHAPES THAT CROSS THE WIRE
 * ==============================
 *
 * Every remote function takes one of these as its first argument, and
 * SvelteKit validates the argument against it before the function runs — a
 * bad request is a `validation` error in `handleError`, never a stack trace
 * from inside the function. The same schemas run in the browser to disable a
 * button before the request is sent, which is why they live in `domain/` and
 * not under `server/`.
 *
 * valibot, because it is a set of small functions the bundler can shake:
 * the browser gets the eight it uses, not a schema runtime.
 */

import * as v from 'valibot';
import { isIsoDate } from './dates.ts';
import { CURRENCIES } from './money.ts';
import { SLUG } from './ids.ts';

export const IdSchema = v.pipe(v.string(), v.uuid('Expected an id'));
export const SlugSchema = v.pipe(v.string(), v.regex(SLUG, 'Expected a trip link'));

export const IsoDateSchema = v.pipe(
	v.string(),
	v.check(isIsoDate, 'Expected a date like 2026-05-10')
);

export const LngSchema = v.pipe(v.number(), v.minValue(-180), v.maxValue(180));
export const LatSchema = v.pipe(v.number(), v.minValue(-90), v.maxValue(90));

const shortText = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const optionalText = (max: number) =>
	v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)), '');

export const CurrencySchema = v.picklist(CURRENCIES, 'Pick a currency');

/* ---------------------------------------------------------------------- */
/* Trips                                                                   */
/* ---------------------------------------------------------------------- */

export const TripInputSchema = v.pipe(
	v.object({
		name: shortText(80),
		description: optionalText(500),
		startDate: IsoDateSchema,
		endDate: IsoDateSchema,
		currency: CurrencySchema
	}),
	v.forward(
		v.check((trip) => trip.endDate >= trip.startDate, 'The trip cannot end before it starts'),
		['endDate']
	),
	v.forward(
		v.check(
			(trip) => new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime() < 366 * 864e5,
			'A trip is at most a year'
		),
		['endDate']
	)
);
export type TripInput = v.InferOutput<typeof TripInputSchema>;

export const VisibilitySchema = v.picklist(['private', 'link']);
export type Visibility = v.InferOutput<typeof VisibilitySchema>;

/* ---------------------------------------------------------------------- */
/* Stops                                                                   */
/* ---------------------------------------------------------------------- */

export const STOP_KINDS = ['place', 'lodging', 'food', 'transport', 'activity', 'idea'] as const;
export const StopKindSchema = v.picklist(STOP_KINDS);
export type StopKind = v.InferOutput<typeof StopKindSchema>;

export const StopInputSchema = v.object({
	tripId: IdSchema,
	name: shortText(120),
	kind: StopKindSchema,
	lng: LngSchema,
	lat: LatSchema,
	date: v.nullable(IsoDateSchema),
	notes: optionalText(1000),
	placeId: v.optional(v.pipe(v.string(), v.maxLength(64)))
});
export type StopInput = v.InferOutput<typeof StopInputSchema>;

export const StopPatchSchema = v.object({
	id: IdSchema,
	name: v.optional(shortText(120)),
	kind: v.optional(StopKindSchema),
	lng: v.optional(LngSchema),
	lat: v.optional(LatSchema),
	notes: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(1000)))
});
export type StopPatch = v.InferOutput<typeof StopPatchSchema>;

export const PlacementSchema = v.object({
	id: IdSchema,
	date: v.nullable(IsoDateSchema),
	position: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000))
});
export type Placement = v.InferOutput<typeof PlacementSchema>;

/** A drag ended: this stop, on this day, at this index. */
export const MoveStopSchema = v.object({
	tripId: IdSchema,
	id: IdSchema,
	date: v.nullable(IsoDateSchema),
	index: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000))
});
export type MoveStop = v.InferOutput<typeof MoveStopSchema>;

/* ---------------------------------------------------------------------- */
/* Expenses                                                                */
/* ---------------------------------------------------------------------- */

export const EXPENSE_CATEGORIES = ['food', 'lodging', 'transport', 'activity', 'other'] as const;
export const ExpenseCategorySchema = v.picklist(EXPENSE_CATEGORIES);
export type ExpenseCategory = v.InferOutput<typeof ExpenseCategorySchema>;

export const ExpenseInputSchema = v.object({
	tripId: IdSchema,
	title: shortText(120),
	amountMinor: v.pipe(
		v.number(),
		v.integer('Amounts are whole minor units'),
		v.minValue(1, 'Enter an amount'),
		v.maxValue(1_000_000_000, 'That is more than a trip costs')
	),
	category: ExpenseCategorySchema,
	date: IsoDateSchema,
	paidBy: v.string(),
	participants: v.pipe(v.array(v.string()), v.minLength(1, 'Somebody has to share it'))
});
export type ExpenseInput = v.InferOutput<typeof ExpenseInputSchema>;

/* ---------------------------------------------------------------------- */
/* Notes                                                                   */
/* ---------------------------------------------------------------------- */

/**
 * A Tiptap document is a tree of nodes with a `doc` at the root. The tree is
 * validated by Tiptap's own schema when it is loaded, so this only insists
 * on the root and on a size: a note is a page, not a book.
 */
export const NoteDocSchema = v.pipe(
	v.object({ type: v.literal('doc'), content: v.optional(v.array(v.unknown())) }),
	v.check((doc) => JSON.stringify(doc).length <= 200_000, 'The note is too long')
);
export type NoteDoc = v.InferOutput<typeof NoteDocSchema>;

/* ---------------------------------------------------------------------- */
/* Members and invites                                                     */
/* ---------------------------------------------------------------------- */

export const ROLES = ['owner', 'editor', 'viewer'] as const;
export const RoleSchema = v.picklist(ROLES);
export type Role = v.InferOutput<typeof RoleSchema>;

export const InviteInputSchema = v.object({
	tripId: IdSchema,
	role: v.picklist(['editor', 'viewer'])
});

export const PresenceSchema = v.object({
	tripId: IdSchema,
	/** The stop under the person's pointer, or nothing. */
	stopId: v.nullable(IdSchema)
});
export type Presence = v.InferOutput<typeof PresenceSchema>;

/* ---------------------------------------------------------------------- */
/* Identity                                                                */
/* ---------------------------------------------------------------------- */

export const EmailSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.email('Enter an email address')
);

export const PasswordSchema = v.pipe(
	v.string(),
	v.minLength(12, 'Use at least twelve characters'),
	v.maxLength(256)
);

/** What the owner may change after the fact. Every field optional; the same checks when both dates are present. */
export const TripPatchSchema = v.pipe(
	v.object({
		id: IdSchema,
		name: v.optional(shortText(80)),
		description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500))),
		startDate: v.optional(IsoDateSchema),
		endDate: v.optional(IsoDateSchema),
		currency: v.optional(CurrencySchema),
		visibility: v.optional(VisibilitySchema)
	}),
	v.forward(
		v.check(
			(patch) => !patch.startDate || !patch.endDate || patch.endDate >= patch.startDate,
			'The trip cannot end before it starts'
		),
		['endDate']
	)
);
export type TripPatch = v.InferOutput<typeof TripPatchSchema>;
