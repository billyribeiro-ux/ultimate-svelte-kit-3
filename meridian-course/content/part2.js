/**
 * PART 2 — The domain
 * (chapters 09–13)
 *
 * Everything the trip planner *knows* with no framework in it: identifiers,
 * dates, money, fair splits, the itinerary, the schemas that every input is
 * checked against, and the database those schemas are stored in. Plain
 * TypeScript, tested in Node, imported by the server and the browser alike.
 */

import { code } from './quote.js';

const DOMAIN = 'src/lib/domain';

export const part2 = [
	{
		slug: 'ids-dates-and-money',
		title: 'Ids, dates and money',
		summary:
			'Three small modules that decide three things most apps get wrong: an unguessable slug you can read aloud, a date that is a date and not an instant, and an amount that is an integer of minor units formatted by `Intl`.',
		goal: 'Choose the representation for an identifier, a calendar date and an amount of money, and say what goes wrong with the obvious alternatives.',
		blocks: [
			{
				type: 'p',
				text: 'The domain layer starts with representations. Get them right and every later file is shorter; get them wrong and every later file carries a workaround. These three are short enough to read whole.'
			},
			code(`${DOMAIN}/ids.ts`, 1, 29),
			{
				type: 'p',
				text: 'Two kinds of id for two audiences. A row id is a UUID and nobody ever sees it. A *slug* is what goes in the share link — `meridian.app/t/kx7m4p2q9w` — and it is read aloud across a table and typed from a photo, so its alphabet drops the characters people confuse: no `0` and `o`, no `1`, `l` and `i`. Ten characters from thirty-one is about forty-nine bits, which nobody guesses; the comment is honest that `% 31` has a tiny bias, and honest that a share link is not a password. `SLUG` is the regular expression the route matcher and the schema both use, so there is one definition of “looks like one of ours”.'
			},

			{ type: 'h3', id: 'dates', text: 'A date is not an instant' },
			code(`${DOMAIN}/dates.ts`, 1, 17),
			{
				type: 'p',
				text: 'This is the paragraph to reread before any project with dates in it. A trip runs from the 10th to the 17th — the *dates*, not midnight in one time zone to midnight in another. JavaScript’s `Date` is an instant, and the moment you format an instant you have a time zone, which is how a trip that starts on the 10th shows as the 9th to somebody reading it in California. So a trip date is a `YYYY-MM-DD` string in the database and on the wire, and a `CalendarDate` from `@internationalized/date` when it needs arithmetic — the same library Bits UI’s pickers speak, so the value a person picks is the value that is stored.'
			},
			code(`${DOMAIN}/dates.ts`, 27, 76),
			{
				type: 'p',
				text: 'The helpers are what the itinerary needs: `eachDay` produces the days of the trip in order, `dayCount` is inclusive because the 10th to the 10th is one day, and `compareIso` is the reminder that ISO strings sort like dates — which is the whole reason for the format. `isIsoDate` checks the shape *and* parses it, because `2026-02-30` is four-two-two digits and not a date.'
			},
			code(`${DOMAIN}/dates.ts`, 78, 121),
			{
				type: 'p',
				text: 'Two decisions in the formatting. First, formatters are cached by locale *and* options, because building an `Intl.DateTimeFormat` loads locale data and an itinerary formats forty dates a render; the comment records a bug from project 5 where caching by options alone served German dates to an English page. Second, `toDate("UTC")` and a UTC formatter together: the calendar date becomes midnight UTC and is formatted as UTC, so it comes out as the same date wherever the code runs — on the server in one time zone, in the browser in another. `formatRange` is the `Intl` method most people have not met: it collapses the shared parts, so May 10–17 is “10 – 17 May 2026” rather than the month twice.'
			},

			{ type: 'h3', id: 'money', text: 'Money is an integer' },
			code(`${DOMAIN}/money.ts`, 1, 37),
			{
				type: 'p',
				text: '`0.1 + 0.2` is not `0.3`, and a settle-up that is a cent off is a settle-up nobody trusts. So an amount is an integer of minor units and a currency code, and the only places a decimal exists are the input box and the screen. The trick worth stealing is `fractionDigits`: rather than a table saying that yen have no cents and dinars have three, it asks `Intl.NumberFormat` for the currency’s `maximumFractionDigits` and caches the answer. A currency the code has never heard of still comes out right.'
			},
			code(`${DOMAIN}/money.ts`, 39, 73),
			{
				type: 'p',
				text: '`parseAmount` is the other direction, and it is the part that usually gets a regular expression and a bug report from Germany. The separators are *discovered* by formatting a known number in the locale and reading the parts back — `formatToParts` says which character is the group separator and which the decimal — so `1.234,50` parses in German and `1,234.50` in English with no table of locales. Chapter 21 shows both directions in the interface.'
			},
			{
				type: 'why',
				title: 'Why `Intl` and not a library',
				text: 'Because `Intl` is the library, and it is already in every browser and every Node. It knows more locales than any package you could install, it is maintained by the people who maintain the locale data, and it costs zero bytes. Every earlier project reached for it somewhere; this one uses it for dates, ranges, distances, currencies, units and country names, and the only string table in the whole app is the translated interface text in `messages/`.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why a trip date is a string and what goes wrong with a `Date`.',
					'You can explain the two decisions in `formatDate` — the cache key and the UTC round trip.',
					'You know where `fractionDigits` gets its answer and why that beats a table.'
				]
			}
		]
	},

	{
		slug: 'splitting-fairly',
		title: 'Splitting fairly, to the cent',
		summary:
			'One expense split by weight with the leftover cents handed out by largest remainder; balances per person; and the greedy settlement that pairs the biggest debtor with the biggest creditor. All integers, all deterministic, all tested.',
		goal: 'Split an amount so the parts always sum to the whole, and turn a set of balances into the transfers that clear them — the same way on every machine.',
		blocks: [
			{
				type: 'p',
				text: '€10 between three people is €3.33 each and a cent left over, and somebody has to get it. Naive code either loses the cent, or gives it to “whoever came first” — which depends on the order the database returned the rows, which means two people looking at the same trip can see different settle-ups. This module makes both things impossible.'
			},
			code(`${DOMAIN}/split.ts`, 1, 25),
			code(`${DOMAIN}/split.ts`, 27, 57),
			{
				type: 'p',
				text: '**Largest remainder.** Compute each person’s exact share as a fraction, take the floor of each, and count how many cents are left. Then hand the leftover cents, one each, to the people who were rounded down the most. Ties are broken on user id, so two servers agree and so the test can assert exactly who gets the extra cent. The parts always sum to the whole, by construction — that is the property the first test checks, and the one that matters.'
			},
			code(`${DOMAIN}/split.ts`, 59, 78),
			{
				type: 'p',
				text: '`balances` is bookkeeping: everything you paid, minus every share you owe, per person. It calls `shares` for each expense rather than trusting a stored share amount, so the balances on screen are always computed from the raw rows — the cents the server would compute are the cents the browser shows, because both run this function on the same integers.'
			},
			code(`${DOMAIN}/split.ts`, 80, 115),
			{
				type: 'p',
				text: '`settle` is the greedy algorithm: sort the debtors and the creditors by size, and pay the biggest debt into the biggest credit, moving on whichever side hits zero. It produces at most one fewer transfer than there are people. The comment is honest that this is not always the *minimum* number of transfers — that problem is NP-hard in general — and honest that for six friends it is the answer a person would write down. Determinism matters more than optimality here, and the tie-break on id is what provides it.'
			},
			code(`${DOMAIN}/split.spec.ts`, 1, 42),
			{
				type: 'p',
				text: 'The tests say what the properties are: even splits are even, the leftover goes by largest remainder and the parts sum to the whole, the recipient of the extra cent does not depend on input order, weights work, and nonsense is refused with a `RangeError` rather than a `NaN` that surfaces on screen. They run in Node in the `server` project in a few milliseconds.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain largest-remainder apportionment and why the tie-break is on id.',
					'You can say why balances are recomputed from raw rows rather than stored.',
					'You know what the greedy settlement guarantees and what it does not.'
				]
			}
		]
	},

	{
		slug: 'the-itinerary-as-data',
		title: 'The itinerary as data',
		summary:
			'A stop has a day (or none) and a position within it. `groupByDay` turns the flat list into the days of the trip plus an ideas bucket; `place` moves one stop and returns exactly the rows that changed, for the server to write and the browser to apply first.',
		goal: 'Model an ordered list inside a set of days with plain integers, and write a move function whose output is a list of changes rather than a new list.',
		blocks: [
			{
				type: 'p',
				text: 'Drag a stop from Tuesday to Thursday and three things change: the stop’s day, its position on Thursday, and the positions of everything after it on Tuesday. The question is what shape the “move” function should have, and the answer decides how the optimistic update and the server write stay in step.'
			},
			code(`${DOMAIN}/itinerary.ts`, 1, 30),
			{
				type: 'p',
				text: 'Integers, renumbered from zero, rather than fractional keys. Fractional indexing is the right tool when a list is long and edited concurrently by many people — project 4 used it for that. An itinerary day has a dozen stops, one person drags at a time, and an integer is what a person expects to see in the database. `byPosition` breaks ties on id so a sort is stable across machines, which the live query relies on: two browsers sorting the same rows must draw them in the same order.'
			},
			code(`${DOMAIN}/itinerary.ts`, 32, 52),
			{
				type: 'p',
				text: '`groupByDay` builds one group per day of the trip — empty days included, because a day with nothing planned is still a day on the page — plus one group keyed `null` for the ideas. A stop whose date is outside the trip (the trip was shortened after it was planned) lands with the ideas rather than vanishing, which is the kind of edge a real product has and a demo does not.'
			},
			code(`${DOMAIN}/itinerary.ts`, 54, 95),
			{
				type: 'p',
				text: 'The shape of `place` is the lesson. It returns **the placements that changed**, not the new list. On the server, `moveStop` writes exactly those rows in one transaction and nothing else. In the browser, chapter 25 applies the same list optimistically before the server answers, so the card lands where it was dropped and lands in the same spot when the answer arrives — because both sides ran this function on the same input. A move onto its own spot returns `[]` and nothing is written, which the itinerary relies on when a drag ends where it began.'
			},
			code(`${DOMAIN}/itinerary.ts`, 97, 102),
			{
				type: 'note',
				text: 'Read `renumber` twice. It compares each stop’s *new* position and day against its *old* ones and records only the differences — the moved stop’s old values are looked up from `moving`, because in `reordered` it already carries the new date. That comparison is what keeps the change list minimal.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why positions are integers here and when fractional keys would be right instead.',
					'You can explain why `place` returns changes and how that keeps the optimistic update and the server write identical.',
					'You know where a stop dated outside the trip ends up.'
				]
			}
		]
	},

	{
		slug: 'schemas-with-valibot',
		title: 'Schemas with valibot, and who may do what',
		summary:
			'Every remote function takes one of these as its first argument, and SvelteKit validates before the function runs. valibot because it tree-shakes; `forward` for cross-field checks; picklists that double as the source of truth for the union types; and the two-line roles module.',
		goal: 'Write a schema that validates, transforms and types an input in one place, and put a cross-field rule where the error lands on the right field.',
		blocks: [
			{
				type: 'p',
				text: 'A remote function is an HTTP endpoint, whatever it looks like in a component, and anybody can call it with anything. SvelteKit’s answer is that the first argument to `query`, `form` and `command` is a Standard Schema, and the function body never runs on input that failed it. These schemas are the contract, and they live in `domain/` rather than `server/` because the browser runs them too — to disable a button before a request is sent.'
			},
			code(`${DOMAIN}/schemas.ts`, 1, 36),
			{
				type: 'p',
				text: 'valibot over zod because valibot is a set of small functions the bundler can shake: the browser bundle contains the eight validators it uses, not a schema runtime. The primitives at the top are the vocabulary — an id is a UUID, a slug matches `SLUG`, a date is an ISO string that `isIsoDate` accepts, a longitude is a number in range. `shortText` and `optionalText` are the two shapes of a text field, with `trim()` built in so `"  Lisbon "` is stored as `"Lisbon"` without every form remembering to do it.'
			},
			code(`${DOMAIN}/schemas.ts`, 38, 65),
			{
				type: 'p',
				text: '`TripInputSchema` has the pattern for a rule that involves two fields. `v.check` on the object can say “the end is not before the start”, but an error on the *object* would have nowhere to appear in a form. `v.forward(..., ["endDate"])` moves the issue onto the `endDate` field, so `createTrip.fields.endDate.issues()` shows it under the picker. The type on the line after is the other half of the contract: `InferOutput` gives the *validated* type — trimmed strings, the currency as a union — so the function body and the component agree on exactly what arrives.'
			},
			code(`${DOMAIN}/schemas.ts`, 67, 111),
			{
				type: 'p',
				text: 'Look at `STOP_KINDS`: an `as const` array, a `picklist` built from it, and a type inferred from the picklist. One list drives the validation, the TypeScript union, the `<select>` options and the icon table in `kinds.ts`. Add a kind and every one of those follows or fails to compile. `PlacementSchema` and `MoveStopSchema` are chapter 11’s `place()` at the wire: what a drop sends is a day and an index, and what comes back is a list of placements.'
			},
			code(`${DOMAIN}/schemas.ts`, 113, 150),
			{
				type: 'p',
				text: 'The messages on the expense schema are the ones a person sees — `Enter an amount`, `Somebody has to share it` — because a form field shows the first issue it has. `NoteDocSchema` is deliberately loose: Tiptap validates its own document tree when it loads, so this only insists on the root node and on a size, because a note is a page and not a book and two hundred kilobytes of JSON is where a page stops.'
			},
			code(`${DOMAIN}/schemas.ts`, 152, 208),
			{
				type: 'p',
				text: '`EmailSchema` lowercases and trims before it validates, so `Ana@Example.com ` and `ana@example.com` are one account. `PasswordSchema` has a minimum and a maximum and no rule about symbols, because length is the one password rule that reliably helps — Better Auth is configured to agree in chapter 15. `TripPatchSchema` is the update shape: every field optional, and the cross-field check written so it only fires when both dates are present.'
			},
			code(`${DOMAIN}/roles.ts`, 1, 12),
			{
				type: 'p',
				text: 'Twelve lines that the whole interface consults. `ViewerRole` adds `link` to the three membership roles — what a stranger with the share link is — and the two predicates are the only two questions a component ever asks. There is no permission matrix, because there are only two capabilities, and a matrix for two rows is a comment.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can write a two-field rule with `forward` and say where its error appears.',
					'You can trace `STOP_KINDS` from the array to the type to the select to the icons.',
					'You know why `trim()` and `toLowerCase()` live in the schema and not in the components.'
				]
			}
		]
	},

	{
		slug: 'the-database',
		title: 'The database: seven tables and Better Auth’s four',
		summary:
			'The Drizzle schema for trips, members, invites, stops, expenses, shares and notes, with three conventions; Better Auth’s tables kept by hand; one libSQL connection in WAL mode; drizzle-kit for migrations; and a seed that is idempotent.',
		goal: 'Read a Drizzle schema and know what each convention is protecting against, and set up a SQLite database that several readers and one writer can share.',
		blocks: [
			{
				type: 'p',
				text: 'Seven tables around one idea: a trip that several people plan together. The doc comment at the top of the schema is the map, and the three conventions under it are the decisions of chapters 09 and 10 written into column types.'
			},
			code('src/lib/server/db/schema.ts', 1, 25),
			code('src/lib/server/db/schema.ts', 42, 62),
			{
				type: 'p',
				text: 'Four helpers so that every table gets the same primary key, the same timestamps and the same trip reference. `nowMs` spells out SQLite’s “now in milliseconds” once, because SQLite has no `now()` Drizzle can default to. `$onUpdate` on `updatedAt` makes Drizzle set it on every update without any query having to remember. `tripRef` cascades: delete a trip and its stops, members, expenses and note go with it, in the database, where a forgotten cleanup cannot leave orphans.'
			},
			code('src/lib/server/db/schema.ts', 68, 132),
			{
				type: 'p',
				text: 'The `trip` row carries a `version` that goes up by one on every change to anything under it; chapter 18 shows the live query watching that one number. `member` has a composite primary key — one row per person per trip — and `invite` is keyed by its token, which is the secret in the link: unguessable, single-use through `usedAt`, expiring through `expiresAt`, so a link pasted into the wrong chat is a bounded mistake.'
			},
			code('src/lib/server/db/schema.ts', 138, 160),
			code('src/lib/server/db/schema.ts', 166, 214),
			{
				type: 'p',
				text: 'A stop’s `date` is nullable — `null` is an idea with no day yet — and the index on `(trip, date, position)` exists for exactly one query: the itinerary page reading one trip’s stops in day-then-position order. `expense.amountMinor` is an integer with the comment “never a float” beside it, and `expense_share` is a weight per participant. The note is one row per trip, keyed by the trip, holding Tiptap’s JSON in a `text` column with `mode: "json"` so Drizzle parses it on the way out.'
			},
			code('src/lib/server/db/schema.ts', 220, 259),
			{
				type: 'p',
				text: 'Relations are what make `db.query.trip.findFirst({ with: { stops: true } })` possible, and `loadDocument` in chapter 16 uses every one of them. The `$inferSelect` types at the bottom are the row types the whole app uses — `Stop`, `Trip`, `Expense` — so a column added here changes a type everywhere it is read.'
			},

			{ type: 'h3', id: 'auth-tables', text: 'Better Auth’s tables, kept by hand' },
			code('src/lib/server/db/auth.schema.ts', 1, 25),
			code('src/lib/server/db/auth.schema.ts', 46, 80),
			{
				type: 'p',
				text: 'Better Auth can generate this file. It is kept by hand so the column names follow the same `snake_case` as the rest of the schema, and so that the one column Better Auth 1.7 added — `issuer` — carries a comment saying what it is for. Sign-in filters on it, so an `account` row without it is a person who exists and can never log in; the seed sets it with `createLocalAccountIssuer("credential")` from Better Auth itself for exactly that reason.'
			},

			{ type: 'h3', id: 'connection', text: 'One connection, two pragmas' },
			code('src/lib/server/db/index.ts', 1, 33),
			{
				type: 'p',
				text: '`DATABASE_URL` comes from `$app/env/private`, a module that exists only on the server — a component that imported this file by mistake fails to build rather than shipping a connection string. `intMode: "number"` stops libSQL handing back `BigInt`s for columns that hold timestamps and cents. And the two pragmas are the difference between a shared trip working and not: WAL lets readers proceed while a writer appends, and the busy timeout makes a second writer wait five seconds instead of failing at once. This file has top-level `await`, which is why it is imported and never re-exported by a `.svelte` file.'
			},
			code('drizzle.config.ts', 1, 20),
			code('scripts/migrate.ts', 1, 39),
			{
				type: 'p',
				text: 'drizzle-kit runs outside SvelteKit, so it reads `process.env` — the only file that does. `migrate.ts` applies whatever SQL in `drizzle/` has not been applied yet, and its comment gives the two ways to run it: on its own before the server, or as `node --import ./scripts/migrate.ts build`, which the Dockerfile uses so that migration and server share one process and `node` stays PID 1 to receive SIGTERM. `process.loadEnvFile` is Node’s built-in `.env` reader; no `dotenv` dependency.'
			},
			code('scripts/seed.ts', 1, 53),
			{
				type: 'p',
				text: '`seedId()` deserves its comment. Fixed ids make the seed idempotent and the tests readable, and the first version wrote them by hand, one character short of a UUID in the last group. Nothing complained: the database does not check the format, the pages rendered, and every *command* that named a seeded row — remove this stop, edit that expense, “I am looking at Alfama” — failed the `IdSchema` check on the server, where a fire-and-forget `.catch(() => {})` swallowed it (it warns in development now — `fireAndForget()` in chapter 31). Building the ids *through* the schema the app validates with turns that into a throw at seed time. The rule generalises: the data you seed must pass the validation you run, and the cheapest way to guarantee it is to run the validation on the seed.'
			},
			code('scripts/seed.ts', 96, 116),
			{
				type: 'p',
				text: 'The seed is idempotent — fixed ids, deleted before written — so running it twice gives one trip. The people are created the way Better Auth would create them: a `user` row and an `account` row with `providerId: "credential"`, the password hashed by Better Auth’s own `hashPassword`. A hand-rolled scrypt that differs by one parameter produces a person who cannot log in and no error saying why, and the comment says so, because that is the bug the first version had.'
			},
			{
				type: 'terminal',
				code: `
$ node scripts/migrate.ts
Migrations applied in 31 ms
$ node scripts/seed.ts
· clearing seeded rows
· people
· Iberia by rail
· Japan in autumn

Seeded. Sign in as any of these with the password "meridian-demo-2026":

  ana@meridian.test   owner of "Iberia by rail"        /t/seediberia
  ben@meridian.test   editor of it, owner of "Japan in autumn"  /t/seedjapan2
  cal@meridian.test   viewer of "Iberia by rail"`
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the three schema conventions and the chapter each one comes from.',
					'You can say what WAL mode and the busy timeout change for a shared trip.',
					'You know why the seed uses Better Auth’s own password hash and issuer helpers.'
				]
			}
		]
	}
];
