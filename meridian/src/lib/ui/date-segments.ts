/**
 * WHAT A DATE SEGMENT SAYS TO A SCREEN READER
 * ===========================================
 *
 * Bits UI's date fields render each part of a date — the day, the month,
 * the year — as its own `role="spinbutton"`, and name it in English whatever
 * the page's language: `aria-label="day, "`, and `aria-valuetext="Empty"`
 * until something is typed (bits-ui 2.19, `date-field.svelte.js`, both
 * written as literals with no prop to change them). A German page announced
 * "day, Datum, Empty".
 *
 * Bits does offer the way round it: a `child` snippet on `Segment` hands
 * over the props it computed and lets us render the element ourselves. This
 * function is what the two date components spread *after* those props, so
 * these win:
 *
 *   - the part's name from the browser's own locale data
 *     (`Intl.DisplayNames` with `type: 'dateTimeField'` — "Tag", "dia");
 *   - "Empty" in the page's language;
 *   - `data-empty`, so the stylesheet can grey a placeholder without
 *     matching on an English word;
 *   - `aria-invalid` and `aria-describedby` when the form has an issue for
 *     the field, pointing at the issue line under it — Bits only computes
 *     invalidity from its own `validate`, and knows nothing of the server.
 *
 * The literal segments (the `/` and `.` between parts) are not spinbuttons
 * and are left alone. The calendar's two month buttons have the same
 * problem — Bits names them "Previous" and "Next" — and the same cure, in
 * the components themselves. `DateField.svelte.test.ts` renders the real
 * fields, so a Bits release that changes any of these words fails a test.
 */

const names = new Map<string, Intl.DisplayNames>();

function fieldName(part: string, locale: string): string {
	let display = names.get(locale);
	if (!display) {
		display = new Intl.DisplayNames(locale, { type: 'dateTimeField' });
		names.set(locale, display);
	}
	try {
		return display.of(part) ?? part;
	} catch {
		// Not a field the browser knows a name for: the part's own name will do.
		return part;
	}
}

export interface SegmentOptions {
	readonly locale: string;
	/** "Empty", in the page's language. */
	readonly empty: string;
	/** The id of the issue line under the field, when there is an issue. */
	readonly issueId?: string | undefined;
}

export function segmentAttributes(
	props: Record<string, unknown>,
	part: string,
	{ locale, empty, issueId }: SegmentOptions
): Record<string, string | undefined> {
	if (part === 'literal') return {};
	const blank = props['aria-valuetext'] === 'Empty';
	return {
		'aria-label': `${fieldName(part, locale)}, `,
		'aria-valuetext': blank ? empty : (props['aria-valuetext'] as string | undefined),
		'data-empty': blank ? '' : undefined,
		'aria-invalid': issueId ? 'true' : (props['aria-invalid'] as string | undefined),
		'aria-describedby': issueId ?? (props['aria-describedby'] as string | undefined)
	};
}
