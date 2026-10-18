/**
 * PART 4 — Three languages
 * (chapters {{three-languages-with-paraglide}}–{{dates-and-money-in-a-locale}})
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
			code('vite.config.ts', 279, 301),
			{
				type: 'terminal',
				code: `
$ pnpm run i18n
> paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide \\
    --emit-ts-declarations --strategy url cookie preferredLanguage baseLocale

$ ls src/lib/paraglide
README.md  messages/  messages.d.ts  messages.js  registry.d.ts  registry.js
runtime.d.ts  runtime.js  server.d.ts  server.js`
			},
			{
				type: 'p',
				text: 'The Vite plugin compiles on every change during development and in the build; the CLI in `package.json` compiles before `svelte-check` and in `prepare`, because the type-checker and a fresh clone both need `src/lib/paraglide` to exist before Vite has run. The `strategy` list is the same in both places, and it is the order the locale is decided in: the URL first — `/de/trips` is German, `/trips` is the base locale — then the cookie the switcher sets, then the browser’s `Accept-Language`, then English. The generated folder is git-ignored; the JSON is the source of truth.'
			},

			{ type: 'h3', id: 'two-halves', text: 'The two halves of a localised URL' },
			code('src/hooks.ts', 23, 27),
			code('src/hooks.server.ts', 40, 83),
			{
				type: 'p',
				text: 'There is one `trips` route, not three. `reroute` — universal, so it runs on the server for the first request and in the browser for every navigation after — tells the router that `/de/trips` is served by `src/routes/trips`. The server middleware does the other half: decide the locale for the request, store it in an `AsyncLocalStorage` so every `m.*()` call in the request speaks it, and fill `%paraglide.lang%` in `app.html`. The middleware *offers* a rewritten request too, and it is not used: `event.request` is read-only in SvelteKit 3, and two mechanisms for one rewrite is how a redirect loop starts.'
			},
			{
				type: 'p',
				text: 'The third argument, `effectiveRequestUrl`, is what makes the server speak the page’s language and not just render it. A remote form posts to `/_app/remote/…`, not to the page it sits on, so the request’s own URL never has `/de` in it; SvelteKit reads the calling page from a header and gives it back as `event.url`. Read from the request instead, every sentence produced *inside* a form or command — a schema’s “Enter an email address”, an `error(422, …)`, the message `handleError` returns — came out in English on a German page. Not because the middleware fell through to the cookie: the URL strategy’s answer for a URL with no prefix is the base locale, so the cookie was never consulted at all.'
			},
			code('src/lib/server/locale-url.ts', 1, 41),
			{
				type: 'p',
				text: '`localeUrl()` is what the hook passes. For a page and for a form or command it is `event.url`, which is the page. A `query` called from the browser is the case that is left: it sends no page header — SvelteKit’s own source says so — so its `event.url` is still the endpoint, and SvelteKit has nothing to put back. The test for that case is a comparison the public API allows: a remote request whose `event.url` has the same path as the request itself is one SvelteKit could not place. For it the language comes from what the browser does send — the cookie, which Paraglide’s client runtime writes as soon as a page reads its locale from its own URL, then `Accept-Language`, then English — through `extractLocaleFromRequestWithStrategies`, and `localizeUrl()` puts that locale into the URL, where the middleware’s URL strategy finds it first. A German page’s queries now fail in German; `locale-url.spec.ts` asks for all four cases.'
			},
			{
				type: 'why',
				title: 'Why not Paraglide’s per-route strategies',
				text: 'Paraglide can be told to use a different strategy order for some routes — `routeStrategies`, cookie first for `/_app/remote/*` — and it is the more declarative answer. It is also a URL-pattern match at runtime, and the compiler adds a `URLPattern` polyfill to the runtime to do it, in the browser bundle as well as the server’s: every page would carry eighteen kilobytes of minified polyfill, and the URL-pattern matching that goes with it, to settle a question only the server asks. Twenty lines in a server module answer it for nothing on the client.'
			},
			{
				type: 'p',
				text: 'Those sentences are messages like any other. A schema’s message is written as a function, `() => m.issue_email()`, so valibot calls it when the check fails — inside the request, where the middleware has stored the locale — rather than once, in English, when the module loaded (chapter {{schemas-with-valibot}} has the schemas). So is every sentence in an `error()` that a person can see: `m.stop_limit({ limit })`, a message with a parameter, when a trip is full; `m.error_no_stop()` when a companion removed the stop a moment ago; `m.error_owner_only()` on the settings page; `m.join_expired()` for an invite that ran out. A toast prints `body.message` as it is, and so does the error page, so an English literal there is an English sentence on a German page that looks deliberate. So the rule for this app is short: *no sentence a person reads is a string literal in a `.ts` file*. The one `error()` with English in it is the route API’s 404, and it says why: a program reads it, on somebody else’s page, with no language of ours to answer in (chapter {{embedding-a-trip}}). The end-to-end suite holds the rule to account in chapter {{end-to-end}} — a bad address typed into `/de/signin` must come back in German, and a refused save must show the server’s sentence, whole.'
			},
			{
				type: 'why',
				title: 'Why a function, and not the message itself',
				text: '`v.email(m.issue_email())` would call the message function once, when `schemas.ts` is first imported — on the server that is boot, before any request has a locale, so every schema would speak the base language for the life of the process. Passing the function defers the call to the moment of failure. Valibot accepts either; the difference only shows on the second language, which is why it is easy to get wrong and worth a test.'
			},
			code('src/app.html', 1, 8),

			{ type: 'h3', id: 'switching', text: 'Switching: three links' },
			code('src/lib/ui/LocaleSwitcher.svelte', 1, 46),
			code('src/lib/ui/LocaleSwitcher.svelte', 48, 71),
			{
				type: 'p',
				text: 'Links, not a `<select>`. A link to `/de/trips` works before JavaScript loads, opens in a new tab, and is how a crawler finds the German site. `localizeHref(here, { locale })` is Paraglide’s: it prefixes the current path with the locale — or removes the prefix for the base locale. `data-sveltekit-reload` makes the switch a full navigation, so the middleware runs again, sets the cookie, and writes `lang="de"` on the document. A client-side navigation would swap the message functions and leave `<html lang>` saying the wrong thing, which a screen reader would read in the wrong voice. It is also the one link in the app that does not go through `href()` from chapter {{the-shell}}: `here` is a pathname, not a route id, and there is nothing for `resolve()` to check — so the component says that to the linter in a comment around the loop, rather than loosening the rule for everybody.'
			},
			{
				type: 'p',
				text: 'The `keepSearch` prop is a prerendering scar worth keeping: a prerendered page is one file served for every request and has no query string, and SvelteKit says so loudly — reading `url.search` while prerendering throws. The guides layout passes `keepSearch={false}`; the site header keeps `?tab=map` across a switch. `compact` is for a header that has a nav beside it: below 64em — a phone, a tablet — the links show EN, DE and PT, and from 64em the full names, where there is room. With the full names on a phone, the guides header had wrapped to three rows. A compact link is *named* with both — `aria-label="Português (PT)"` — and that is an accessibility rule, not a nicety: WCAG’s “label in name” says a control’s accessible name contains the words drawn on it, because a person using speech input says what they see. Named “Português” while it showed “PT”, the link could not be found by “click PT”; English and German only passed because their names happen to begin with their codes. The full name comes first, so the link is still “Deutsch” to a screen reader and to the end-to-end suite.'
			},
			{
				type: 'why',
				title: 'Why Paraglide and not svelte-i18n, or paraglide-sveltekit',
				text: 'svelte-i18n is a runtime dictionary with stores; it works, and it ships every string of every loaded language and offers no type for the keys. `@inlang/paraglide-sveltekit` was the framework-specific wrapper, and it has been folded into Paraglide 2’s own `strategy` plus the `reroute` hook — there is nothing left for a SvelteKit-specific package to do, which is why the ecosystem survey in chapter {{choosing-libraries}} lists it as “not needed” rather than “rejected”. The pieces here are Paraglide 2.26, one universal hook, one server handler, and a component of links.'
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
				text: 'Chapter {{ids-dates-and-money}} explained the cache and the UTC round trip. What it did not show is the result. `formatDate("2026-05-10", "de", "day")` is “Sa., 10.”; in English it is “Sat 10”; in Portuguese “sáb., 10”. `formatRange` for the tenth to the seventeenth gives “10 – 17 May 2026”, “10.–17. Mai 2026” and “10 – 17 de mai. de 2026”. Nobody wrote any of those; the `DateFormatter` from `@internationalized/date` is `Intl.DateTimeFormat` with a fix for a Safari bug, and it knows.'
			},
			code('src/routes/(site)/(app)/trips/+page.svelte', 113, 121),
			{
				type: 'p',
				text: 'The trips page puts them together with the plural messages from the last chapter: a date range from `Intl`, three counts through Paraglide’s plural rules, and a distance through the library’s `formatDistance`. Four sources of locale-awareness in one paragraph, and the component knows about none of them.'
			},

			{ type: 'h3', id: 'the-picker', text: 'A date range picker that speaks the domain’s type' },
			code('src/lib/ui/DateRangeField.svelte', 1, 56),
			{
				type: 'p',
				text: 'Bits UI is headless: it renders the markup, the ARIA and the keyboard model of a date range picker — segmented inputs you can type into, arrow keys between segments, a calendar grid — and nothing visible. Its value is a pair of `CalendarDate`s from `@internationalized/date`, the type chapter {{ids-dates-and-money}} chose for the domain, so there is no conversion to get wrong. The `name` on each input renders a hidden `<input>` with the ISO date, which is how the value reaches a remote `form` and how it would reach a plain HTML form with JavaScript off.'
			},
			code('src/lib/ui/DateRangeField.svelte', 58, 134, { partial: true }),
			{
				type: 'p',
				text: 'The `locale` prop is Paraglide’s current locale, so the segments come out in the locale’s order — month, day, year for English; day, month, year for German — and the weekday names in the calendar follow. `untrack` around the initial value says out loud that the props are the starting point and the picker owns the value from then on; without it, the compiler asks whether you meant to track the prop, and here the answer is no. Every visible pixel — the field’s border, the segments, the popover, the calendar — is in `src/lib/styles/dates.css` rather than the component’s `<style>`, because an expense’s single date (chapter {{expenses-with-tanstack-and-layerchart}}) wears the same look through a sibling component, and a component’s CSS ships only with the pages that import it.'
			},
			{
				type: 'p',
				text: '`calendarLabel={label}` names the calendar grid; without it Bits UI calls every calendar in the app “Event”, in English. The two dates sit in one `datefield__dates` group that may wrap, and the calendar button stays outside it: at 360px “mm/dd/yyyy – mm/dd/yyyy” and a 36px button are wider than a card’s column, and a field that cannot shrink pokes out of the card. And each segment is rendered through the `child` snippet, which is the part worth slowing down for.'
			},
			code('src/lib/ui/date-segments.ts', 1, 31),
			code('src/lib/ui/date-segments.ts', 57, 71),
			{
				type: 'p',
				text: 'Bits UI writes two English words into every segment, with no prop to change them: `aria-label="day, "` and, until something is typed, `aria-valuetext="Empty"`. A German screen-reader user heard “day, Datum, Empty”. A headless library usually leaves a door for this, and here it is the `child` snippet — Bits computes the props, hands them over, and lets us render the element. `segmentAttributes` is spread *after* Bits’ props, so its values win: the part’s name from `Intl.DisplayNames` with `type: \'dateTimeField\'`, which is the browser’s own locale data (“Tag”, “mês”), “Empty” from the messages, a `data-empty` attribute so the stylesheet can grey a placeholder without matching an English word, and `aria-invalid` plus `aria-describedby` pointing at the issue line when the form has one — Bits only knows invalidity from its own `validate`, and nothing of the server’s. The calendar’s two month buttons had the same English, “Previous” and “Next”, written after any `aria-label` passed to them; the same `child` snippet renders each button with the page’s “Vorheriger Monat” after Bits’ props, so ours is the one that lands.'
			},
			{
				type: 'why',
				text: 'Why not patch the library, or post-process the DOM? A patch is a fork you maintain at every upgrade, and a script that rewrites attributes after render fights the library’s own updates. The `child` snippet is Bits’ documented extension point: when Bits renders those strings differently, or adds a prop for them, this function is the one place to change. Two tests hold it. `date-segments.spec.ts` pins the function — a German day is “Tag”, a typed value is left alone, the separators are untouched — fed a hand-written stand-in for Bits’ props, which by itself would pass forever: if a Bits release renamed “Empty”, the stub would still say “Empty”. So `DateField.svelte.test.ts` renders both fields in a real browser with Bits doing the computing, on a German and a Brazilian page, and asks the segments and the month buttons what they say (chapter {{unit-and-browser-tests}}).'
			},

			{ type: 'h3', id: 'transport', text: 'A `CalendarDate` across the wire' },
			code('src/hooks.ts', 29, 35),
			{
				type: 'p',
				text: 'Load results and remote function arguments cross the wire through devalue, which knows `Map`, `Set`, `Date`, typed arrays — and nothing about a class from `@internationalized/date`. The `transport` hook teaches it: `encode` returns something falsy for “not mine” and the ISO string for a `CalendarDate`; `decode` parses it back. With this, a value that leaves the browser as a `CalendarDate` arrives on the server as one, with `.compare()` and `.add()` working, rather than as a string somebody has to remember to parse. It is small; it is also the difference between a type that holds across the boundary and one that does not.'
			},

			{ type: 'h3', id: 'money', text: 'Money in and out' },
			code('src/lib/domain/money.ts', 39, 71),
			code('src/lib/trip/Expenses.svelte', 563, 580),
			{
				type: 'p',
				text: 'The amount field is `type="number"` with `inputmode="decimal"`, so a phone shows a numeric keyboard with the locale’s decimal separator, the currency sits inside the field as a trailing adornment, so the number is what is typed and the unit is what is read, and the browser hands the form a plain number — which is why the remote form’s schema takes `v.number()` and the server converts to minor units with the trip’s currency. `formatMoney` on the way out uses `Intl.NumberFormat` with `style: "currency"`: “€12.60”, “12,60 €”, “R$ 12,60”. `parseAmount` exists for the one place a free-text amount is typed, and it discovers the separators from `Intl` rather than knowing them — once per locale, then kept.'
			},

			{ type: 'h3', id: 'distances-and-countries', text: 'Distances, and a hundred country names for free' },
			code('packages/waypoint/src/lib/geo/index.ts', 284, 330),
			code('src/routes/(site)/explore/+page.svelte', 33, 35),
			{
				type: 'p',
				text: 'Two more `Intl` APIs. `style: "unit"` formats a kilometre or a mile with the right abbreviation and spacing for the locale; a unit the code has never seen still comes out right. `Intl.DisplayNames` with `type: "region"` turns `PT` into “Portugal” and `JP` into “Japan”, “Japan” or “Japão” — a hundred country names in three languages that nobody translated, from the browser’s own locale data. The gazetteer stores a two-letter code and nothing else.'
			},
			{
				type: 'note',
				text: 'Every `Intl` object here is built once and kept — a `DateTimeFormat` or `NumberFormat` loads locale data when it is built, and an itinerary formats forty dates a render. The shared helpers keep theirs in a module-level map: `formatter()` in `dates.ts`, `formatMoney` and the separators `parseAmount` discovers, and the library’s `distanceFormat()` above. A component that needs one builds it once, at the top of its script, as the explore page does with `DisplayNames`. The cache keys always include the locale. That sentence is the whole of project 5’s i18n bug, and it is why `formatter()` in `dates.ts` exists. The distance formatter was the last to join: the first version built a new `NumberFormat` on every call, and the trips list formats a distance per card on every render.'
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
