/**
 * PART 1 — Time (chapters 05–09)
 *
 * The hardest third of the app, done first and on its own, with no database and
 * no user interface anywhere near it. Everything here is a pure function, which
 * is what makes it testable — and what makes the twice-yearly clock changes
 * something you can run in a fifth of a second instead of waiting six months.
 */

export const part1 = [
	{
		slug: 'three-kinds-of-time',
		title: 'Three kinds of time',
		summary:
			'Instants, calendar dates and wall-clock readings are three different things. Mixing them up is the source of nearly every scheduling bug.',
		goal: 'Be able to say, for any value in the app, which of the three it is — and know why `Date` alone cannot express two of them.',
		blocks: [
			{
				type: 'p',
				text: 'Before we write a line of the time layer, we need three words to mean three different things. Programmers usually let all three collapse into "a date", and that collapse is where booking software goes wrong.'
			},

			{ type: 'h3', id: 'instant', text: '1. An instant' },
			{
				type: 'p',
				text: 'An **instant** is a moment in the history of the universe. When your appointment actually starts. Everyone alive experiences it at the same time, whatever their clock says.'
			},
			{
				type: 'p',
				text: 'We store instants as a single number: milliseconds since midnight on 1 January 1970, UTC. That number is the same everywhere on Earth. `Date.now()` gives you one. `new Date(1786000000000)` wraps one.'
			},
			{
				type: 'ul',
				items: [
					'An appointment starting — **instant**',
					'An appointment ending — **instant**',
					'When a booking was made — **instant**',
					'A holiday running from Friday evening to Monday morning — a pair of **instants**'
				]
			},

			{ type: 'h3', id: 'calendar-date', text: '2. A calendar date' },
			{
				type: 'p',
				text: 'A **calendar date** is a page in a diary: `2026-08-14`. It is not a moment. It does not have a length until you say where you are. Thursday the 14th begins in Auckland eleven hours before it begins in London, and by the time it starts in Los Angeles it is nearly over in Tokyo.'
			},
			{
				type: 'p',
				text: 'It is also not always 24 hours long. In a zone that puts its clocks forward, one calendar date a year is 23 hours; the one that puts them back is 25.'
			},

			{ type: 'h3', id: 'wall-clock', text: '3. A wall-clock time' },
			{
				type: 'p',
				text: 'A **wall-clock time** is a reading on a clock: `09:00`. Also not a moment — "nine in the morning" happens more than twenty times a day as the planet turns.'
			},
			{
				type: 'p',
				text: 'This is what opening hours are made of. When a salon owner says "we open at nine", they do not mean an instant. They mean: whatever moment it is when the clock on our wall reads nine. On the Sunday the clocks change, that is a different amount of elapsed time from the day before — and they are entirely comfortable with that, because they are looking at the clock, not at a stopwatch.'
			},

			{
				type: 'why',
				title: 'Why this distinction is the whole ball game',
				text: 'Opening hours are wall-clock. Appointments are instants. Every screen in the app has to convert between them, and the conversion needs a time zone and — twice a year — a decision about what to do when the conversion has **no answer** or **two**.'
			},

			{ type: 'h3', id: 'no-answer', text: 'When the conversion has no answer' },
			{
				type: 'p',
				text: 'In London, on the last Sunday of March, the clocks go from 00:59:59 straight to 02:00:00. The hour from 01:00 to 01:59 does not happen. It is not "skipped over quickly" — it does not exist.'
			},
			{
				type: 'p',
				text: 'So "01:30 on 29 March 2026 in Europe/London" is not a time. There is no instant that matches it. If a rule in your database says a shift starts at 01:30 and that Sunday comes around, something has to decide what to do.'
			},
			{
				type: 'p',
				text: 'In October the opposite happens: 01:00 to 01:59 occurs **twice**, once on summer time and once on winter time. "01:30" now names two instants an hour apart.'
			},

			{ type: 'h3', id: 'why-date-fails', text: 'Why `Date` cannot do this' },
			{
				type: 'p',
				text: "JavaScript's `Date` is exactly one of the three things above: an instant. It has no notion of a calendar date on its own, and it has no notion of a wall-clock reading in a place that isn't the machine it is running on."
			},
			{
				type: 'code',
				file: 'the trap',
				lang: 'ts',
				code: `
// This does NOT mean "9am in London".
// It means "9am wherever this computer thinks it is".
const nine = new Date('2026-08-14T09:00:00');

// On your laptop in Bristol: 09:00 London.
// On the server in a data centre set to UTC: 09:00 UTC.
// In August those are an hour apart, and the salon opens at the wrong time.`
			},
			{
				type: 'warn',
				text: 'This is the number one cause of "it worked on my machine" in scheduling code. Your laptop is in the same zone as the business you are testing with; the server is in UTC; the bug appears only after deployment, only in summer, and only for some customers.'
			},
			{
				type: 'p',
				text: 'You can force UTC by appending `Z` — `new Date(\'2026-08-14T09:00:00Z\')` — but now you have the opposite problem: it always means 09:00 UTC, which is 10:00 in London in August and 09:00 in December. The salon appears to open an hour later for half the year.'
			},
			{
				type: 'p',
				text: '`Date` has no way to say "nine in the morning in `Europe/London`, on this particular day, and please tell me if that time does not exist". That sentence is the one we need, so we need a different tool.'
			},

			{ type: 'h3', id: 'the-rule', text: 'The rule we will follow everywhere' },
			{
				type: 'ol',
				items: [
					'**Store instants.** Every appointment start, end, buffer boundary and holiday edge is a number of milliseconds. Databases store them as integers.',
					'**Store rules as wall-clock.** Opening hours are "weekday 1, minute 540, minute 1020" plus the business\'s time zone. Never as instants — the whole point is that they repeat.',
					'**Convert at the edges.** Wall-clock becomes an instant on the way in; an instant becomes a formatted string on the way out. The middle of the app only ever deals in instants.'
				]
			},
			{
				type: 'note',
				text: 'The business has a time zone and so does the visitor, and they are frequently different. A customer in Dubai booking a video consultation with a clinic in Manchester must see their own clock, and the clinic must see theirs. Because both screens render from the same instant, both are right at the same time.'
			},

			{
				type: 'checkpoint',
				text: 'You can classify each of these: "the salon opens at 9" (wall-clock), "Priya\'s cut starts at 1786... " (instant), "Thursday the 14th" (calendar date). And you can explain why `new Date(\'2026-03-29T01:30:00\')` in London is a trick question.'
			}
		]
	},

	{
		slug: 'a-date-library-that-knows-places',
		title: 'A date library that knows about places',
		summary:
			'Installing @internationalized/date, and the four types that map onto the three kinds of time.',
		goal: 'Convert a wall-clock reading in a named zone to an instant and back, and choose deliberately what happens on the two awkward Sundays.',
		blocks: [
			{
				type: 'p',
				text: 'We need a library. There is a native answer coming — `Temporal` — and it is worth knowing why we are not using it yet.'
			},

			{ type: 'h3', id: 'temporal', text: 'A word about Temporal' },
			{
				type: 'p',
				text: '`Temporal` is the built-in replacement for `Date` that the language has been growing for years. It has exactly the types we want. As of August 2026 it ships in Chromium-based browsers and Firefox — but **not in Node 24**, which is the runtime our server code runs on.'
			},
			{
				type: 'p',
				text: 'Our availability engine runs on the server. A feature that exists in the browser and not on the server is not a feature we can use in shared code, and polyfilling it costs more than the library we are about to install. So: `Temporal` for a hobby project in a year or two; `@internationalized/date` today.'
			},
			{
				type: 'terminal',
				code: 'pnpm add @internationalized/date'
			},
			{
				type: 'note',
				text: 'This is the date library behind React Aria and several design systems. It is about 8 kB, has no dependencies, and — importantly — it does not ship its own copy of the world\'s time zone rules. It asks the runtime, through `Intl`, which means it is automatically correct when a country changes its mind about daylight saving.'
			},

			{ type: 'h3', id: 'the-types', text: 'The four types' },
			{
				type: 'ul',
				items: [
					'`CalendarDate` — a page in the diary. Year, month, day. No time, no zone.',
					'`CalendarDateTime` — a page plus a clock reading. Still no zone, so still not a moment.',
					'`ZonedDateTime` — a clock reading in a named place. This one **is** a moment, and it knows its own offset.',
					'`Time` — a clock reading with no date. We barely use it.'
				]
			},
			{
				type: 'p',
				text: 'Compare that list with the three kinds of time from the last chapter. `CalendarDate` is a calendar date, `CalendarDateTime` is a wall-clock reading, and `ZonedDateTime` is an instant with its context attached. The library makes the distinction impossible to blur, because the types are genuinely different and will not compare with each other.'
			},

			{ type: 'h3', id: 'the-conversion', text: 'The one function that matters' },
			{
				type: 'p',
				text: 'Here is the core of our whole time layer. Read the signature first, then the body.'
			},
			{
				type: 'code',
				file: 'src/lib/time/zone.ts',
				lang: 'ts',
				code: `
export function wallClockToInstant(
	day: IsoDate,
	minuteOfDay: number,
	zone: TimeZone,
	disambiguation: Disambiguation = 'compatible'
): number {
	const dayOffset = Math.floor(minuteOfDay / MINUTES_PER_DAY);
	const minute = minuteOfDay - dayOffset * MINUTES_PER_DAY;

	const date = parseDate(day).add({ days: dayOffset });
	const local = new CalendarDateTime(
		date.year,
		date.month,
		date.day,
		Math.floor(minute / 60),
		minute % 60
	);

	return toZoned(local, zone, disambiguation).toDate().getTime();
}`
			},
			{
				type: 'p',
				text: 'Line by line:'
			},
			{
				type: 'ul',
				items: [
					'`parseDate(day)` turns `"2026-08-14"` into a `CalendarDate`. It will not accept a time, which is the point.',
					'`minuteOfDay` is minutes past local midnight. 09:00 is 540. It is allowed to exceed 1440 — see below.',
					'`new CalendarDateTime(...)` glues the page and the clock reading together. Still not a moment.',
					'`toZoned(local, zone, disambiguation)` is the conversion. It takes the wall-clock reading, the place, and a policy for the awkward Sundays, and produces a `ZonedDateTime`.',
					'`.toDate().getTime()` drops out to a plain number, because that is what the rest of the app speaks.'
				]
			},

			{ type: 'h3', id: 'past-midnight', text: 'Minutes past 1440' },
			{
				type: 'p',
				text: 'Why allow `minuteOfDay` to be bigger than a day? Because a bar open until 2am closes on **Friday**, not on Saturday. Storing that as "Friday, minute 1560" keeps Friday night as one row. The alternative — two rows, Friday 20:00–24:00 and Saturday 00:00–02:00 — means every piece of code downstream has to know how to stitch them back together, and one of them eventually will not.'
			},
			{
				type: 'p',
				text: 'The first two lines handle it: `Math.floor(1560 / 1440)` is 1, so we add a day to the calendar date and take minute 120 of it. The rule stays one row; the maths comes out right.'
			},

			{ type: 'h3', id: 'disambiguation', text: 'The four policies' },
			{
				type: 'p',
				text: 'Here is the decision the last chapter promised. `toZoned` takes a fourth argument saying what to do when the wall-clock reading has no instant or two.'
			},
			{
				type: 'code',
				file: 'src/lib/time/zone.ts',
				lang: 'ts',
				code: `
export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';`
			},
			{
				type: 'ul',
				items: [
					'`compatible` — skip forward past a gap; take the first of a repeat. This is what every operating system and every other date library settled on.',
					'`earlier` / `later` — pick a side of an ambiguous time deliberately.',
					'`reject` — throw an error.'
				]
			},
			{
				type: 'p',
				text: 'We default to `compatible`, and the reason is worth stating plainly: opening hours are the machine\'s problem, not the customer\'s. If a shift rule says 01:30 and that morning has no 01:30, the shift should start at 02:00 and the customer should never learn that anything unusual happened. Throwing would turn a calendar quirk into a 500 error on somebody\'s booking page.'
			},
			{
				type: 'note',
				text: '`reject` still has a place: a time a human has just typed into a form and can be asked about. "You have entered 01:30 on 29 March, which does not exist that morning — did you mean 00:30 or 02:30?" is a good question to ask a shop owner and a terrible one to ask a customer.'
			},

			{ type: 'h3', id: 'weekday', text: 'One more trap: which day is day 1?' },
			{
				type: 'code',
				file: 'src/lib/time/zone.ts',
				lang: 'ts',
				code: `
export function weekdayOf(date: IsoDate | CalendarDate): Weekday {
	const calendar = typeof date === 'string' ? parseDate(date) : date;
	return getDayOfWeek(calendar, 'en-US') as Weekday;
}`
			},
			{
				type: 'p',
				text: 'That `\'en-US\'` is pinned on purpose and must never become the visitor\'s locale. `getDayOfWeek` returns a number **relative to whichever day that locale treats as the first of the week** — Sunday in the US, Monday in most of Europe, Saturday in much of the Middle East.'
			},
			{
				type: 'warn',
				text: 'Left to the visitor\'s locale, a rule stored as "weekday 1" would mean Monday for a customer in London and Tuesday for one in Riyadh. The salon\'s Monday hours would appear on Tuesday for some visitors and nobody would be able to reproduce it. Pinning the locale makes the stored number mean exactly one thing forever.'
			},

			{
				type: 'checkpoint',
				text: 'You can explain what `toZoned(local, "Europe/London", "compatible")` does on 29 March 2026 at 01:30, and why our stored weekday numbers use a locale that has nothing to do with the visitor.'
			}
		]
	},

	{
		slug: 'the-five-minute-grid',
		title: 'The five-minute grid',
		summary:
			'Turning "do these two appointments overlap?" — a question with a dozen edge cases — into "is this cell taken?", which has none.',
		goal: 'Write `src/lib/time/grid.ts` and understand why half-open intervals remove an entire class of bug.',
		blocks: [
			{
				type: 'p',
				text: 'Here is the naive way to ask whether a new appointment clashes with an existing one:'
			},
			{
				type: 'code',
				file: 'the overlap test everybody writes',
				lang: 'ts',
				code: `
const clashes = newStart < existingEnd && newEnd > existingStart;`
			},
			{
				type: 'p',
				text: 'That line is actually correct. The problem is not the line — it is that you need it in six places, and one of them will be written with `<=`, and the bug it produces is "occasionally two customers are booked back to back with no gap, but only when one of them booked a service with a buffer". Good luck.'
			},

			{ type: 'h3', id: 'the-idea', text: 'The idea' },
			{
				type: 'p',
				text: 'Stop treating the diary as continuous. Treat it as a row of **five-minute cells**. Every appointment is a run of consecutive cells. "Is this time free?" becomes "are all of these cells empty?", which is a set lookup and cannot be got subtly wrong.'
			},
			{
				type: 'code',
				file: 'src/lib/time/grid.ts',
				lang: 'ts',
				code: `
/** Occupancy granularity. Every duration, buffer and interval must divide by it. */
export const SLOT_MINUTES = 5;

/** The same number, in milliseconds, because that is the unit instants use. */
export const SLOT_MS = SLOT_MINUTES * 60 * 1000;`
			},
			{
				type: 'why',
				title: 'Why five minutes, and why it is safe everywhere',
				text: 'A cell is identified by the instant it starts. Because 5 divides evenly into 60, and epoch zero falls exactly on the hour, every cell boundary is a clean multiple of `SLOT_MS` in **every** time zone on Earth — including the ones offset by 30 minutes (India) or 45 (Nepal, the Chatham Islands). The grid needs to know nothing about time zones at all, which is precisely why it is trustworthy.'
			},

			{ type: 'h3', id: 'half-open', text: 'Half-open intervals' },
			{
				type: 'p',
				text: 'An interval in this app is **half-open**: the start instant is inside it, the end instant is not.'
			},
			{
				type: 'code',
				file: 'src/lib/time/grid.ts',
				lang: 'ts',
				code: `
/** A half-open span of real time: \`start\` is inside it, \`end\` is not. */
export interface Interval {
	readonly start: number;
	readonly end: number;
}`
			},
			{
				type: 'p',
				text: 'This is not fussiness. An appointment that ends at 09:45 and one that starts at 09:45 do **not** clash. Expressing that with inclusive bounds means writing `end - 1` somewhere, and `end - 1` is a millisecond, and one day somebody will write `end - 1` in minutes instead and lose an hour.'
			},

			{ type: 'h3', id: 'slots-in', text: 'Which cells does an interval touch?' },
			{
				type: 'code',
				file: 'src/lib/time/grid.ts',
				lang: 'ts',
				code: `
export function floorToSlot(instant: number): number {
	return Math.floor(instant / SLOT_MS) * SLOT_MS;
}

export function ceilToSlot(instant: number): number {
	return Math.ceil(instant / SLOT_MS) * SLOT_MS;
}

export function slotsIn({ start, end }: Interval): number[] {
	if (!(end > start)) return [];

	const first = floorToSlot(start);
	const last = ceilToSlot(end);
	const cells: number[] = [];

	for (let cell = first; cell < last; cell += SLOT_MS) cells.push(cell);

	return cells;
}`
			},
			{
				type: 'p',
				text: 'Notice the widening. The start is **floored** and the end is **ceiled**, so an appointment running 09:02–09:38 consumes the cells from 09:00 to 09:40. That is deliberate: half of the 09:00 cell is genuinely unusable, so the grid marks it taken rather than pretending somebody could squeeze in.'
			},
			{
				type: 'note',
				text: '`Math.floor` rather than `Math.trunc` matters for instants before 1970, which are negative. `trunc` rounds those towards zero — i.e. *forwards* in time — and the grid would silently misalign. Nobody will book a haircut in 1969, but the day a bad input produces a negative number, flooring keeps the behaviour consistent instead of interesting.'
			},

			{ type: 'h3', id: 'is-free', text: 'The check itself' },
			{
				type: 'code',
				file: 'src/lib/time/grid.ts',
				lang: 'ts',
				code: `
export function isFree(interval: Interval, occupied: ReadonlySet<number>): boolean {
	const last = ceilToSlot(interval.end);
	for (let cell = floorToSlot(interval.start); cell < last; cell += SLOT_MS) {
		if (occupied.has(cell)) return false;
	}
	return true;
}`
			},
			{
				type: 'p',
				text: '`occupied` is a `Set` of cell start instants — which is exactly the shape a database query against our claims table produces. `Set.has` is O(1), so checking a 60-minute appointment is twelve hash lookups. Checking every candidate start time across a fortnight is a few thousand, which is nothing.'
			},
			{
				type: 'p',
				text: 'It walks the cells directly rather than calling `slotsIn` and testing the array, because it can stop at the first collision and never allocates.'
			},

			{ type: 'h3', id: 'merge', text: 'Merging windows' },
			{
				type: 'p',
				text: 'One more function, needed the moment an owner writes two overlapping shifts by accident.'
			},
			{
				type: 'code',
				file: 'src/lib/time/grid.ts',
				lang: 'ts',
				code: `
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
	const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);

	const merged: Interval[] = [];
	for (const next of sorted) {
		const current = merged[merged.length - 1];
		if (current && next.start <= current.end) {
			merged[merged.length - 1] = { start: current.start, end: Math.max(current.end, next.end) };
		} else {
			merged.push({ start: next.start, end: next.end });
		}
	}

	return merged;
}`
			},
			{
				type: 'ul',
				items: [
					'`<=` rather than `<` means **touching** windows merge too: 09:00–12:00 and 12:00–17:00 become one 09:00–17:00. That matters, because an appointment is allowed to straddle the seam.',
					'`Math.max` is needed because the next interval may sit entirely inside the one being held. Without it, a short window swallowed by a long one would shorten the long one.',
					'`[...intervals]` copies before sorting, because `sort` mutates and the caller did not ask for that.'
				]
			},

			{
				type: 'checkpoint',
				text: '`src/lib/time/grid.ts` exists and exports `SLOT_MS`, `floorToSlot`, `ceilToSlot`, `slotsIn`, `isFree` and `mergeIntervals`. You can say out loud why an appointment ending at 09:45 does not clash with one starting at 09:45.'
			}
		]
	},

	{
		slug: 'the-availability-engine',
		title: 'The availability engine',
		summary:
			'Recurring rules plus a full diary plus the shape of a service, in — every bookable start time, out. No database, no clock.',
		goal: 'Write `availableSlots`, and understand why `now` is an argument rather than something the function looks up.',
		blocks: [
			{
				type: 'p',
				text: 'This is the largest pure function in the app and the one everything else leans on. Its job: given a person\'s recurring hours, what is already in their diary, and the shape of the thing being booked, produce every start time a customer may actually pick.'
			},
			{
				type: 'p',
				text: 'It touches no database, no network, and — importantly — no clock.'
			},
			{
				type: 'code',
				file: 'src/lib/time/availability.ts',
				lang: 'ts',
				code: `
export interface AvailabilityQuery {
	/** The zone the rules' wall-clock times are written in: the business's own. */
	readonly timeZone: TimeZone;
	/** Inclusive range of local calendar days to compute. */
	readonly from: IsoDate;
	readonly to: IsoDate;
	readonly rules: readonly WeeklyRule[];
	readonly service: ServiceShape;
	/** Occupied grid cells, as start instants. */
	readonly occupied: ReadonlySet<number>;
	/** Now, as an instant. Passed in so tests can choose it. */
	readonly now: number;
	/** Minutes of notice required before an appointment may be booked. */
	readonly minNoticeMinutes: number;
	/** How far ahead the diary is open, in days. */
	readonly maxAdvanceDays: number;
}`
			},
			{
				type: 'why',
				title: 'Why `now` is an argument',
				text: 'A function that calls `Date.now()` inside itself can only be tested at the moment you run the test. Passing the clock in means a test can say "it is 08:55 on the morning the clocks go back" and get an answer in a fifth of a second. This one decision is why the DST tests later in this course exist at all — the alternative is waiting until October and hoping.'
			},

			{ type: 'h3', id: 'shape', text: 'The shape of a service' },
			{
				type: 'code',
				file: 'src/lib/time/availability.ts',
				lang: 'ts',
				code: `
export interface ServiceShape {
	readonly durationMinutes: number;
	readonly bufferBeforeMinutes: number;
	readonly bufferAfterMinutes: number;
	/** How often a start time is offered. Merchandising, not physics. */
	readonly slotIntervalMinutes: number;
}`
			},
			{
				type: 'p',
				text: 'Four numbers, and the difference between them is worth being clear about:'
			},
			{
				type: 'ul',
				items: [
					'**duration** — what the customer experiences. A 45-minute cut is 45 minutes on their calendar.',
					'**buffers** — what the diary loses either side. Ten minutes to sweep up and make a coffee. The customer never sees them; the grid absolutely does.',
					'**slotInterval** — how often a start time is *offered*. A 45-minute service offered every 30 minutes gives 09:00, 09:30, 10:00. Offered every 15 it gives four times as many options and a diary full of unusable 15-minute gaps. This is a merchandising decision, not a physical constraint.'
				]
			},
			{
				type: 'note',
				text: 'That distinction is why a `Slot` carries four numbers: `start`/`end` for the customer, `blockStart`/`blockEnd` for the diary. Show the wrong pair on the confirmation email and your customer arrives ten minutes early every time.'
			},

			{ type: 'h3', id: 'windows', text: 'Step one: rules become windows' },
			{
				type: 'code',
				file: 'src/lib/time/availability.ts',
				lang: 'ts',
				code: `
export function windowsForDay(
	day: IsoDate,
	rules: readonly WeeklyRule[],
	zone: TimeZone
): Interval[] {
	const weekday = weekdayOf(day);

	const windows = rules
		.filter((rule) => rule.weekday === weekday && ruleAppliesOn(rule, day))
		.map((rule) => ({
			start: wallClockToInstant(day, rule.startMinute, zone),
			end: wallClockToInstant(day, rule.endMinute, zone)
		}));

	return mergeIntervals(windows);
}`
			},
			{
				type: 'p',
				text: 'Look closely at the `.map`. The two ends of the window are converted to instants **independently**. Nobody computes "start plus 480 minutes".'
			},
			{
				type: 'p',
				text: 'On an ordinary Monday, 09:00–17:00 is eight hours. On the Sunday the clocks go forward it is seven; on the Sunday they go back, nine. **That is correct**, and it is the answer the shop owner would give you: the door opens when the clock says nine and closes when it says five, and one Sunday a year they are genuinely there an hour longer.'
			},
			{
				type: 'warn',
				text: 'The tempting alternative — "the window is 480 minutes long" — produces a salon that closes at four in the afternoon on one day a year and six on another. That arrives as a support ticket reading "the last appointment disappeared" and takes a fortnight to decode.'
			},

			{ type: 'h3', id: 'string-compare', text: 'A place where string comparison is safe' },
			{
				type: 'code',
				file: 'src/lib/time/availability.ts',
				lang: 'ts',
				code: `
function ruleAppliesOn(rule: WeeklyRule, day: IsoDate): boolean {
	if (rule.effectiveFrom && day < rule.effectiveFrom) return false;
	if (rule.effectiveTo && day > rule.effectiveTo) return false;
	return true;
}`
			},
			{
				type: 'p',
				text: 'Comparing dates with `<` on strings looks like a mistake. Here it is not, and only here: `YYYY-MM-DD` is fixed width, zero padded, and ordered most-significant-first, so lexicographic order and chronological order are the same thing. That property is the entire reason ISO 8601 is written that way round.'
			},

			{ type: 'h3', id: 'slots', text: 'Step two: windows become slots' },
			{
				type: 'p',
				text: 'The rest is a walk. For each day in range, for each window, step forward by `slotIntervalMinutes` and keep the candidates that survive four filters:'
			},
			{
				type: 'ol',
				items: [
					'The appointment plus its buffers fits **inside** the window. Not "starts inside" — fits.',
					'Every grid cell it needs is free.',
					'It starts at least `minNoticeMinutes` from now. A salon cannot honour a booking made ninety seconds ago.',
					'It is no further ahead than `maxAdvanceDays`. Nobody wants a diary open in 2029.'
				]
			},
			{
				type: 'note',
				text: 'Filter 1 is where buffers earn their keep. A 45-minute service with a 10-minute buffer after it needs 55 minutes of window, so the last offered start on a 09:00–17:00 day is 16:05 — not 16:15. Getting this wrong overbooks the end of every single day.'
			},

			{ type: 'h3', id: 'guard', text: 'A guard against silent nonsense' },
			{
				type: 'p',
				text: 'One more thing lives in this file: a check that a service actually fits the grid.'
			},
			{
				type: 'code',
				file: 'src/lib/time/availability.ts',
				lang: 'ts',
				code: `
export function assertServiceFitsGrid(service: ServiceShape): void {
	for (const [name, minutes] of [
		['duration', service.durationMinutes],
		['buffer before', service.bufferBeforeMinutes],
		['buffer after', service.bufferAfterMinutes],
		['slot interval', service.slotIntervalMinutes]
	] as const) {
		if (!isWholeSlots(minutes)) {
			throw new Error(\`\${name} must be a multiple of \${SLOT_MINUTES} minutes, got \${minutes}\`);
		}
	}
}`
			},
			{
				type: 'p',
				text: 'A 47-minute service would end in the middle of a cell. The grid would round it outwards, so the diary would lose 50 minutes while the customer was told 47 — and the confirmation email and the calendar would disagree by three minutes forever. Refusing at the door is kinder than rounding silently.'
			},

			{
				type: 'checkpoint',
				text: 'Calling `availableSlots` with a week of rules, an empty `occupied` set and a fixed `now` returns a list of start instants, and moving `now` forward removes the ones inside the notice period.'
			}
		]
	},

	{
		slug: 'testing-time-with-vitest',
		title: 'Testing time with Vitest',
		summary:
			'Setting up Vitest properly, then writing the tests that would otherwise take six months to run.',
		goal: 'A green test run that includes both clock changes, a half-hour-offset zone, and a window that runs past midnight.',
		blocks: [
			{
				type: 'p',
				text: 'The whole reason the last two chapters were pure functions is so this chapter can exist. We are about to test both daylight-saving transitions, in two hemispheres, in under a second.'
			},

			{ type: 'h3', id: 'setup', text: 'Two test environments, one config' },
			{
				type: 'p',
				text: 'Our project needs two kinds of unit test: server-side ones that run in Node, and component ones that need a browser DOM. Vitest calls these **projects**, and one config file describes both.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
test: {
	// A test with no assertions is a test that passes by accident.
	expect: { requireAssertions: true },
	projects: [
		{
			extends: './vite.config.ts',
			test: {
				name: 'client',
				environment: 'browser',
				browser: { enabled: true, provider: 'playwright', instances: [{ browser: 'chromium' }] },
				include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
				setupFiles: ['./vitest-setup-client.ts']
			}
		},
		{
			extends: './vite.config.ts',
			test: {
				name: 'server',
				environment: 'node',
				include: ['src/**/*.{test,spec}.{js,ts}'],
				exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
			}
		}
	]
}`
			},
			{
				type: 'ul',
				items: [
					'The **client** project runs in a real Chromium via Playwright, not a simulated DOM. Component tests that pass in jsdom and fail in a browser are a genuine waste of a morning.',
					'The **server** project is plain Node and starts instantly. All our time tests live here.',
					'The naming convention does the routing: `foo.svelte.spec.ts` is a component test, `foo.spec.ts` is a server one.'
				]
			},
			{
				type: 'why',
				title: 'requireAssertions',
				text: 'A test body that throws before reaching its assertions still "passes" in most runners if it swallows the error. Turning this on makes a test with zero assertions a failure. It has caught a genuine bug in this project — a test that was asserting inside a callback that never ran.'
			},

			{ type: 'h3', id: 'first-test', text: 'The grid tests' },
			{
				type: 'p',
				text: 'Start with the boring one, because the boring one is where the off-by-ones live.'
			},
			{
				type: 'code',
				file: 'src/lib/time/grid.spec.ts',
				lang: 'ts',
				code: `
import { describe, expect, it } from 'vitest';
import { SLOT_MS, isFree, slotsIn } from './grid.ts';

describe('slotsIn', () => {
	it('is half-open: an interval ending on a boundary does not claim the next cell', () => {
		const start = 0;
		const end = 3 * SLOT_MS;

		expect(slotsIn({ start, end })).toEqual([0, SLOT_MS, 2 * SLOT_MS]);
	});

	it('widens outwards, because half a cell is unusable', () => {
		// 09:02 to 09:38, on a grid anchored at 09:00.
		const start = 2 * 60_000;
		const end = 38 * 60_000;

		const cells = slotsIn({ start, end });

		expect(cells[0]).toBe(0);                    // the 09:00 cell is consumed
		expect(cells.at(-1)).toBe(35 * 60_000);      // and the 09:35 one
	});

	it('returns nothing for an empty or backwards interval', () => {
		expect(slotsIn({ start: 100, end: 100 })).toEqual([]);
		expect(slotsIn({ start: 500, end: 100 })).toEqual([]);
	});
});

describe('isFree', () => {
	it('rejects an interval touching a single taken cell', () => {
		const occupied = new Set([5 * SLOT_MS]);

		expect(isFree({ start: 0, end: 5 * SLOT_MS }, occupied)).toBe(true);
		expect(isFree({ start: 0, end: 5 * SLOT_MS + 1 }, occupied)).toBe(false);
	});
});`
			},
			{
				type: 'p',
				text: 'That last test is the half-open rule stated as an executable sentence. An interval ending exactly on the boundary of a taken cell is fine; one millisecond further and it is not.'
			},

			{ type: 'h3', id: 'dst', text: 'The tests that matter' },
			{
				type: 'p',
				text: 'Now the ones you cannot write without a pure function.'
			},
			{
				type: 'code',
				file: 'src/lib/time/zone.spec.ts',
				lang: 'ts',
				code: `
import { describe, expect, it } from 'vitest';
import {
	hoursInLocalDay,
	instantToMinuteOfDay,
	wallClockToInstant,
	zoneAbbreviation
} from './zone.ts';

const LONDON = 'Europe/London';
const iso = (instant: number) => new Date(instant).toISOString();

describe('wallClockToInstant — the mornings clocks move', () => {
	/*
	 * UK 2026: clocks go forward at 01:00 GMT on Sunday 29 March (01:00 becomes
	 * 02:00) and back at 02:00 BST on Sunday 25 October (02:00 becomes 01:00).
	 */

	it('reports the day clocks go forward as 23 hours long', () => {
		expect(hoursInLocalDay('2026-03-29', LONDON)).toBe(23);
	});

	it('reports the day clocks go back as 25 hours long', () => {
		expect(hoursInLocalDay('2026-10-25', LONDON)).toBe(25);
	});

	it('pushes a wall-clock time that does not exist forward to one that does', () => {
		// 01:30 never happens on 29 March: the hour is deleted. \`compatible\`
		// disambiguation shifts it to 02:30 BST rather than throwing at a customer.
		const skipped = wallClockToInstant('2026-03-29', 90, LONDON);
		expect(iso(skipped)).toBe('2026-03-29T01:30:00.000Z');
		expect(instantToMinuteOfDay(skipped, LONDON)).toBe(150); // 02:30 local
	});

	it('takes the first of two identical wall-clock times', () => {
		// 01:30 happens twice on 25 October. The default picks the earlier — BST.
		const ambiguous = wallClockToInstant('2026-10-25', 90, LONDON);
		expect(iso(ambiguous)).toBe('2026-10-25T00:30:00.000Z');
		expect(zoneAbbreviation(ambiguous, LONDON)).toBe('BST');
	});

	it('can be asked for the second one instead', () => {
		const later = wallClockToInstant('2026-10-25', 90, LONDON, 'later');
		expect(iso(later)).toBe('2026-10-25T01:30:00.000Z');
		expect(zoneAbbreviation(later, LONDON)).toBe('GMT');
	});

	it('can refuse an ambiguous time outright when a human must decide', () => {
		expect(() => wallClockToInstant('2026-10-25', 90, LONDON, 'reject')).toThrow();
	});
});`
			},
			{
				type: 'p',
				text: 'Read the third test carefully, because it is the sharpest one. `01:30` on 29 March does not exist, and the function does not throw and does not return `01:30` — it returns the instant that reads **02:30** on a London clock. The assertion checks both the instant and the local reading, so a change in policy cannot slip past.'
			},
			{
				type: 'p',
				text: 'The fourth and fifth are the same wall-clock reading resolving to two instants an hour apart, distinguished by the abbreviation the zone was using at the time: BST for the first pass through 01:30, GMT for the second. The sixth proves `reject` really does refuse, so the option is available when a human ought to be asked.'
			},
			{
				type: 'note',
				text: 'Not every country changes clocks on the same day, and some have stopped entirely. Because the library asks the runtime through `Intl` rather than shipping its own copy of the rules, these tests keep working when a government changes its mind — you update Node and the answers update with it.'
			},

			{ type: 'h3', id: 'other-zones', text: 'The zone that breaks assumptions' },
			{
				type: 'code',
				file: 'src/lib/time/zone.spec.ts',
				lang: 'ts',
				code: `
const KATHMANDU = 'Asia/Kathmandu'; // UTC+05:45, and no DST — a useful oddity.

it('handles a zone with a 45-minute offset', () => {
	expect(iso(wallClockToInstant('2026-08-14', 9 * 60, KATHMANDU))).toBe(
		'2026-08-14T03:15:00.000Z'
	);
});

it('rolls past midnight when given a minute beyond 1440', () => {
	// A bar open until 2am on Friday closes at minute 1560 of Friday, not at
	// minute 120 of Saturday. Same instant, one row instead of two.
	const lateFriday = wallClockToInstant('2026-08-14', 26 * 60, LONDON);
	expect(iso(lateFriday)).toBe('2026-08-15T01:00:00.000Z');
	expect(instantToIsoDate(lateFriday, LONDON)).toBe('2026-08-15');
});`
			},
			{
				type: 'p',
				text: 'The Kathmandu test is the one that catches lazy maths. If any part of the code had rounded to the hour, or assumed offsets were whole numbers, `03:15` would come out as `03:00` or `04:00` and this line would go red. It is a two-line test that guards an assumption nobody would think to write down.'
			},
			{
				type: 'p',
				text: 'The past-midnight test proves both halves of that design: the instant lands at 01:00 UTC on the Saturday, and asking which **local day** it belongs to also says Saturday — while the rule that produced it still lives on Friday.'
			},

			{ type: 'h3', id: 'running', text: 'Running them' },
			{
				type: 'terminal',
				code: 'pnpm test:unit -- --run'
			},
			{
				type: 'p',
				text: 'The `--run` matters: without it Vitest stays in watch mode, which is what you want while writing and exactly not what you want in a script that is supposed to finish.'
			},
			{
				type: 'terminal',
				code: `✓ |server| src/lib/time/grid.spec.ts (20 tests) 12ms
✓ |server| src/lib/time/zone.spec.ts (29 tests) 42ms
✓ |server| src/lib/time/availability.spec.ts (23 tests) 57ms

Test Files  3 passed (3)
     Tests  72 passed (72)`
			},

			{
				type: 'checkpoint',
				text: 'Both daylight-saving transitions, a 45-minute-offset zone and a past-midnight window are all covered by passing tests, and the whole file runs in well under a second.'
			}
		]
	}
];
