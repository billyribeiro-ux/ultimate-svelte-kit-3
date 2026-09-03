/**
 * PART 4 — Three languages
 * (chapters 20–21)
 *
 * Paraglide compiles the messages; the hooks route the URLs; `Intl` does
 * every date, distance, amount and country name. Two chapters, because
 * "translated interface text" and "locale-aware values" are different
 * problems with different tools.
 */

import { code } from './quote.js';

export const part4 = [
	{
		slug: 'three-languages-with-paraglide',
		title: 'Three languages with Paraglide',
		summary:
			'Messages as JSON, compiled into one typed function each; plural rules in the message format; a strategy list that decides the locale; `reroute` and the middleware doing the two halves of `/de/trips`; and a language switcher that is three links.',
		goal: 'Internationalise a SvelteKit 3 app so that every string is typed, every URL is localised, and `<html lang>` is always right — without a dictionary at runtime.',
		blocks: [
			{
				type: 'p',
				text: 'Most internationalisation libraries ship a dictionary and a `t("key")` function, and the two failure modes are a key that does not exist and a page that loads every language. Paraglide is a compiler. `messages/en.json` becomes `m.trip_created({ name })` — one exported function per message — and the bundler tree-shakes the ones a page does not use, in every language the page might need. A misspelled key is a type error, and there is no dictionary at runtime.'
			},
			code('messages/en.json', 1, 12, { partial: true }),
			code('messages/en.json', 45, 54),
			{
				type: 'p',
				text: 'The message format is inlang’s, and the plural block is the part worth reading twice. A message can *declare* an input and a local derived from it — here `countPlural` is `count` passed through the locale’s plural rules — and *match* on it. English has `one` and `other`; German the same; Portuguese the same for these; a language with `few` and `many` would add them in its own file, and the compiled function would do the right thing for that locale without the calling code changing. `m.trips_days({ count: 8 })` is “8 days”, “8 Tage”, “8 dias”.'
			},
			code('project.inlang/settings.json', 1, 12),
			{
				type: 'p',
				text: 'The project file names the locales and the plugin that reads the JSON; the `m-function-matcher` plugin is what lets the inlang editor and the IDE extension find `m.trips_days` in code. `pt-br` is a lowercase tag on purpose — it becomes a URL prefix, and `/pt-br/trips` is what a person types.'
			},

			{ type: 'h3', id: 'compiling', text: 'Compiling, twice' },
			code('vite.config.ts', 230, 252),
			{
				type: 'terminal',
				code: `
$ pnpm run i18n
> paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide \\
    --emit-ts-declarations --strategy url cookie preferredLanguage baseLocale

$ ls src/lib/paraglide
messages/  messages.js  messages.d.ts  runtime.js  runtime.d.ts  server.js  server.d.ts`
			},
			{
				type: 'p',
				text: 'The Vite plugin compiles on every change during development and in the build; the CLI in `package.json` compiles before `svelte-check` and in `prepare`, because the type-checker and a fresh clone both need `src/lib/paraglide` to exist before Vite has run. The `strategy` list is the same in both places, and it is the order the locale is decided in: the URL first — `/de/trips` is German, `/trips` is the base locale — then the cookie the switcher sets, then the browser’s `Accept-Language`, then English. The generated folder is git-ignored; the JSON is the source of truth.'
			},

			{ type: 'h3', id: 'two-halves', text: 'The two halves of a localised URL' },
			code('src/hooks.ts', 23, 27),
			code('src/hooks.server.ts', 38, 66),
			{
				type: 'p',
				text: 'There is one `trips` route, not three. `reroute` — universal, so it runs on the server for the first request and in the browser for every navigation after — tells the router that `/de/trips` is served by `src/routes/trips`. The server middleware does the other half: decide the locale for the request, store it in an `AsyncLocalStorage` so every `m.*()` call in the request speaks it, and fill `%paraglide.lang%` in `app.html`. The middleware *offers* a rewritten request too, and it is not used: `event.request` is read-only in SvelteKit 3, and two mechanisms for one rewrite is how a redirect loop starts.'
			},
			code('src/app.html', 1, 8),

			{ type: 'h3', id: 'switching', text: 'Switching: three links' },
			code('src/lib/ui/LocaleSwitcher.svelte', 1, 32),
			code('src/lib/ui/LocaleSwitcher.svelte', 34, 47),
			{
				type: 'p',
				text: 'Links, not a `<select>`. A link to `/de/trips` works before JavaScript loads, opens in a new tab, and is how a crawler finds the German site. `localizeHref(here, { locale })` is Paraglide’s: it prefixes the current path with the locale — or removes the prefix for the base locale. `data-sveltekit-reload` makes the switch a full navigation, so the middleware runs again, sets the cookie, and writes `lang="de"` on the document. A client-side navigation would swap the message functions and leave `<html lang>` saying the wrong thing, which a screen reader would read in the wrong voice.'
			},
			{
				type: 'p',
				text: 'The `keepSearch` prop is a prerendering scar worth keeping: a prerendered page is one file served for every request and has no query string, and SvelteKit says so loudly — reading `url.search` while prerendering throws. The guides layout passes `keepSearch={false}`; the site header keeps `?tab=map` across a switch.'
			},
			{
				type: 'why',
				title: 'Why Paraglide and not svelte-i18n, or paraglide-sveltekit',
				text: 'svelte-i18n is a runtime dictionary with stores; it works, and it ships every string of every loaded language and offers no type for the keys. `@inlang/paraglide-sveltekit` was the framework-specific wrapper, and it has been folded into Paraglide 2’s own `strategy` plus the `reroute` hook — there is nothing left for a SvelteKit-specific package to do, which is why the ecosystem survey in chapter 37 lists it as “not needed” rather than “rejected”. The pieces here are Paraglide 2.25, one universal hook, one server handler, and a component of links.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what Paraglide compiles a message into and why that beats a dictionary.',
					'You can name the two halves of a localised URL and which file does each.',
					'You know why the switcher is links with `data-sveltekit-reload`, and what `keepSearch` protects against.'
				]
			}
		]
	},

	{
		slug: 'dates-and-money-in-a-locale',
		title: 'Dates, money and distances in a locale',
		summary:
			'Everything that is not interface text: dates and ranges through cached `Intl` formatters, a headless date range picker that speaks `CalendarDate`, a `transport` hook that carries one across the wire, amounts in and out of minor units, and distances in kilometres or miles.',
		goal: 'Format and parse locale-dependent values with `Intl` and `@internationalized/date`, and move a calendar date from a picker to the server without turning it into a string by accident.',
		blocks: [
			{
				type: 'p',
				text: 'The translated strings are a few hundred keys. The values around them — every date, every amount, every distance, every country name — are not strings anybody wrote; they are computed, and the locale changes the computation. This chapter is about the three places a value crosses from data to a person’s eyes and back.'
			},

			{ type: 'h3', id: 'dates', text: 'Dates and ranges' },
			code('src/lib/domain/dates.ts', 78, 121),
			{
				type: 'p',
				text: 'Chapter 09 explained the cache and the UTC round trip. What it did not show is the result. `formatDate("2026-05-10", "de", "day")` is “Sa., 10.”; in English it is “Sat 10”; in Portuguese “sáb., 10”. `formatRange` for the tenth to the seventeenth gives “10 – 17 May 2026”, “10.–17. Mai 2026” and “10 – 17 de mai. de 2026”. Nobody wrote any of those; the `DateFormatter` from `@internationalized/date` is `Intl.DateTimeFormat` with a fix for a Safari bug, and it knows.'
			},
			code('src/routes/(site)/(app)/trips/+page.svelte', 67, 79),
			{
				type: 'p',
				text: 'The trips page puts them together with the plural messages from the last chapter: a date range from `Intl`, three counts through Paraglide’s plural rules, and a distance through the library’s `formatDistance`. Four sources of locale-awareness in one paragraph, and the component knows about none of them.'
			},

			{ type: 'h3', id: 'the-picker', text: 'A date range picker that speaks the domain’s type' },
			code('src/lib/ui/DateRangeField.svelte', 1, 49),
			{
				type: 'p',
				text: 'Bits UI is headless: it renders the markup, the ARIA and the keyboard model of a date range picker — segmented inputs you can type into, arrow keys between segments, a calendar grid — and nothing visible. Its value is a pair of `CalendarDate`s from `@internationalized/date`, the type chapter 09 chose for the domain, so there is no conversion to get wrong. The `name` on each input renders a hidden `<input>` with the ISO date, which is how the value reaches a remote `form` and how it would reach a plain HTML form with JavaScript off.'
			},
			code('src/lib/ui/DateRangeField.svelte', 51, 86, { partial: true }),
			{
				type: 'p',
				text: 'The `locale` prop is Paraglide’s current locale, so the segments come out in the locale’s order — month, day, year for English; day, month, year for German — and the weekday names in the calendar follow. `untrack` around the initial value says out loud that the props are the starting point and the picker owns the value from then on; without it, the compiler asks whether you meant to track the prop, and here the answer is no.'
			},

			{ type: 'h3', id: 'transport', text: 'A `CalendarDate` across the wire' },
			code('src/hooks.ts', 29, 35),
			{
				type: 'p',
				text: 'Load results and remote function arguments cross the wire through devalue, which knows `Map`, `Set`, `Date`, typed arrays — and nothing about a class from `@internationalized/date`. The `transport` hook teaches it: `encode` returns something falsy for “not mine” and the ISO string for a `CalendarDate`; `decode` parses it back. With this, a value that leaves the browser as a `CalendarDate` arrives on the server as one, with `.compare()` and `.add()` working, rather than as a string somebody has to remember to parse. It is small; it is also the difference between a type that holds across the boundary and one that does not.'
			},

			{ type: 'h3', id: 'money', text: 'Money in and out' },
			code('src/lib/domain/money.ts', 39, 73),
			code('src/lib/trip/Expenses.svelte', 348, 361, { partial: true }),
			{
				type: 'p',
				text: 'The amount field is `type="number"` with `inputmode="decimal"`, so a phone shows a numeric keyboard with the locale’s decimal separator, and the browser hands the form a plain number — which is why the remote form’s schema takes `v.number()` and the server converts to minor units with the trip’s currency. `formatMoney` on the way out uses `Intl.NumberFormat` with `style: "currency"`: “€12.60”, “12,60 €”, “R$ 12,60”. `parseAmount` exists for the one place a free-text amount is typed, and it discovers the separators from `Intl` rather than knowing them.'
			},

			{ type: 'h3', id: 'distances-and-countries', text: 'Distances, and a hundred country names for free' },
			code('packages/waypoint/src/lib/geo/index.ts', 291, 326),
			code('src/routes/(site)/explore/+page.svelte', 28, 30),
			{
				type: 'p',
				text: 'Two more `Intl` APIs. `style: "unit"` formats a kilometre or a mile with the right abbreviation and spacing for the locale; a unit the code has never seen still comes out right. `Intl.DisplayNames` with `type: "region"` turns `PT` into “Portugal” and `JP` into “Japan”, “Japan” or “Japão” — a hundred country names in three languages that nobody translated, from the browser’s own locale data. The gazetteer stores a two-letter code and nothing else.'
			},
			{
				type: 'note',
				text: 'Every `Intl` object here is created once and cached — a `DateTimeFormat` or `NumberFormat` loads locale data when it is built, and an itinerary formats forty dates a render. The cache keys always include the locale. That sentence is the whole of project 5’s i18n bug, and it is why `formatter()` in `dates.ts` exists.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `formatRange` does that two `formatDate` calls do not.',
					'You can explain the `transport` hook’s encode/decode contract and what devalue does without it.',
					'You can name the four `Intl` APIs this chapter uses and what each replaces.'
				]
			}
		]
	}
];
