/**
 * PART 3 — The server
 * (chapters {{environment-and-hooks}}–{{invites-and-membership}})
 *
 * Environment and hooks, identity, the remote functions that read, the ones
 * that write, the live query that keeps a shared trip shared, and invites.
 * Everything the browser talks to, and the order in which a request passes
 * through it.
 */

import { code } from './quote.js';

const REMOTE = 'src/lib/remote';
const SERVER = 'src/lib/server';

export const part3 = [
	{
		slug: 'environment-and-hooks',
		title: 'Environment and hooks',
		summary:
			'`src/env.ts` declares every variable with a schema; `hooks.server.ts` composes three handlers with `sequence` — locale, identity, security — and adds `handleFetch`, `handleError` told apart by `kind`, and `init`; `hooks.client.ts` gives the browser’s own failures words; `hooks.ts` carries `reroute` and `transport` to the browser; `params.ts` matches the slug.',
		goal: 'Read a request’s whole path through SvelteKit 3 — from environment validation at boot to the response headers — and know which hook owns which decision.',
		blocks: [
			{
				type: 'p',
				text: 'SvelteKit 3 replaced the `$env/*` magic modules with a file you write. A variable not declared in it cannot be imported, `public` is a word you have to type, and the schema runs once at boot against the real environment — so a missing secret is a process that refuses to start, not an `undefined` three weeks later.'
			},
			code('src/env.ts', 1, 70, { partial: true }),
			{
				type: 'p',
				text: '`neededAtRuntime` is the documentation’s own opt-out, wrapped once. SvelteKit validates this file during `vite build` too, because it analyses the app by running it — the docs say it plainly, “if a value is invalid, the app will fail to start (or build)”, and give the answer in the next sentence: `building` from `$app/env`, “along with a validator that accepts an optional value”, `building ? v.optional(v.string()) : v.string()`. The database URL and the auth secret are dynamic and private: nothing inlines them, and nothing at build time reads them. So the build may be run knowing neither — by a CI job, or by the Dockerfile in chapter {{deploying}}, which used to invent a value for each — and the server still refuses to start without them, because when it starts `building` is `false`. The cost is honest and visible in the types: both import as `string | undefined`, and the two modules that read them, the database client and Better Auth, check `building` themselves and say so.'
			},
			{
				type: 'p',
				text: '`PUBLIC_ORIGIN` is the interesting one: `public`, so the browser may see it, and `static`, so it is inlined at build time. It has to be static, because `vite.config.ts` reads the same variable for `paths.origin` during the build, and a value that could differ between build and run would make the CSRF check compare two different origins. Better Auth reads it too, as its base URL, and the Dockerfile in chapter {{deploying}} takes it as a build argument for the same reason.'
			},
			code('src/env.ts', 72, 91, { partial: true }),
			{
				type: 'p',
				text: '`STOP_LIMIT` shows the other thing the schema is for: environment variables are strings, and the place to turn one into a number — once, with bounds — is here. Every file that imports `STOP_LIMIT` from `$app/env/private` gets a `number` between ten and ten thousand, and none of them has a `Number()` with a hopeful default. Every variable also carries a `description` — `EnvVarConfig.description` — which the editor shows on hover wherever the variable is imported, so the sentence that says what a value is for travels with it.'
			},

			{ type: 'h3', id: 'the-sequence', text: 'Three handlers, in order' },
			code('src/hooks.server.ts', 1, 38, { partial: true }),
			{
				type: 'p',
				text: 'The types come from `@sveltejs/kit/hooks`, and the comment says why it matters: importing them from `@sveltejs/kit` compiles to `any` for every destructured argument, which is not an error, so the file keeps working and every parameter silently loses its type. That is a SvelteKit 3 change worth knowing by heart.'
			},
			code('src/hooks.server.ts', 40, 83),
			{
				type: 'p',
				text: 'Paraglide first, because everything after it — a redirect message, an error page, a remote function, a schema that refuses a field — may speak. The middleware decides the locale from the URL, the cookie or `Accept-Language` in the order the config gave, stores it in an `AsyncLocalStorage` so `m.some_message()` anywhere in this request speaks the right language, and fills the two placeholders in `app.html` through `transformPageChunk`. The comment about `replaceAll` records a real bug: with a string pattern, `replace` swaps the first match, and the first match was in a comment above the `<html>` tag.'
			},
			{
				type: 'p',
				text: 'The third argument records another. A remote form is not posted to its page: the browser sends it to `/_app/remote/…`, a URL with no `/de` in it, and tells the server which page it came from in a header that SvelteKit turns back into `event.url`. The middleware reads the request’s own URL unless it is told otherwise, and the URL strategy does not answer “I cannot tell” for a URL with no prefix — it answers English, the base locale, and the cookie is never asked. So a German sign-in page answered a malformed email in English, because the schema’s message was the one sentence produced inside that request. `effectiveRequestUrl` is Paraglide’s documented option for exactly this, the URL the person is on rather than the one the bytes went to, and `localeUrl()` works out what to give it: the calling page for a form or a command, and for a `query` — which sends no such header, so SvelteKit has no page to put back — the endpoint under the cookie’s language. Chapter {{three-languages-with-paraglide}} quotes it; chapter {{end-to-end}} has the test that types a bad address into `/de/signin` and expects German back.'
			},
			{
				type: 'why',
				text: 'Why not leave the cookie to decide? Because the cookie is the language of the last page someone *chose*, and the URL is the language of the page they are *on*. They differ the moment a German link is opened in a browser that last visited the English site — and a form that answers in a different language from the page it sits on reads as broken, whichever language is right.'
			},
			code('src/hooks.server.ts', 85, 102),
			{
				type: 'p',
				text: 'Identity second: read the session once onto `locals`, so no page has to ask and — more importantly — no page has to remember to ask. `svelteKitHandler` wraps `resolve` because Better Auth owns `/api/auth/*`; those are not SvelteKit routes, and the handler answers them and passes everything else on. `building` is passed so it stays quiet during prerendering.'
			},
			code('src/hooks.server.ts', 104, 174),
			{
				type: 'p',
				text: 'Security last, because it acts on the *response*. The `preload` callback is new in SvelteKit 3.0: a `font` input carries its source `filename`, so the two latin subsets the first paint needs can be named exactly, rather than guessed at from a hashed URL. Then the headers, and the one route that may be framed: the embed route gets `frame-ancestors *` by replacing the directive SvelteKit built, because the CSP in the config is the right default for every other page. “The embed route” is `event.route.id === \'/embed/[slug=slug]\'`, the route the router matched — not `event.url.pathname`, which is what was typed: `reroute` serves `/de/embed/<slug>` from the same route, and a pathname test sent the German frame out with `frame-ancestors \'none\'`, refusing every page that framed it. `Vary: Cookie` is there because the header shows a name and the locale cookie changes the language, and a shared cache must not serve one person’s page to another; it is decided the same way, by route and by request kind (`event.isRemoteRequest`), not by a path prefix that `/de/api/…` would slip past (chapter {{security-headers-and-csp}}).'
			},

			{ type: 'h3', id: 'fetch-errors-init', text: 'Fetch, errors, boot' },
			code('src/hooks.server.ts', 176, 232),
			{
				type: 'p',
				text: '`handleError`, typed `HandleServerError`, is told apart by `kind`, which SvelteKit 3 added: `app` is a deliberate `error(404, m.error_no_trip())` — its sentence a Paraglide message like every other, worked out inside the request and so already in the page’s language, which is why the hook leaves it alone — `framework` is SvelteKit’s own, `validation` is a remote function argument that failed its schema — with the `issues` handed over, so the log can say which field — and `unknown` is the only kind worth an id. The id goes into the log and into the message a person sees, so a support conversation can find the stack trace. The two messages are Paraglide’s, `m.error_bad_request()` and `m.error_server()`: `handleError` runs inside the request the middleware wrapped, so they come out in that request’s language. `init` runs once before the first request and reaches the database, so a broken deploy never claims to be healthy.'
			},
			code('src/hooks.client.ts', 1, 28),
			{
				type: 'p',
				text: 'The browser has a `handleError` of its own — typed `HandleClientError`, from `@sveltejs/kit/hooks` like the server’s — for what goes wrong *in the tab*: a boundary whose content threw, a chunk that never arrived, a component that broke while hydrating. It looks at `kind` the same way, and only `unknown` needs words, because SvelteKit’s default for it is `\'Internal Error\'`, in English, on a page that may be German. A remote function’s refusal never comes here — it went through the server’s hook and arrives finished, in the request’s language — so this file is short on purpose. Short is not the same as untested: chapter {{end-to-end}} drops the globe’s chunk on its way to a German page and expects the German sentence in the boundary, which SvelteKit’s English default would fail.'
			},
			{
				type: 'why',
				text: 'Why does the shape matter? Because a `failed` snippet, and `+error.svelte` through `page.error`, are handed the *result* of `handleError`: an `App.Error`, `{ status, message }`, a plain object and not an `Error`. The first versions of four boundaries tested `error instanceof Error`, which is never true here, so they printed the fallback every time — or, in the trips list, `String(error)`, which is `[object Object]`. A boundary reads its `message` — through `boundaryMessage` in `#lib/ui/errors.ts`, a guard rather than a type annotation, for a reason chapter {{the-itinerary}} gives — and this hook decides what that says when the failure was nobody’s message. Awaiting a command is the other case, and chapter {{the-itinerary}} shows it: there the rejection is an `HttpError`, with the server’s words on `body.message`.'
			},
			code('src/hooks.ts', 1, 35),
			{
				type: 'p',
				text: 'The universal hooks run in the browser too, and both of these have to. `reroute` tells the router that `/de/trips` is served by `src/routes/trips` — one line, Paraglide’s `deLocalizeUrl` taking the language off the pathname — on the server for the first request, in the browser for every navigation after it. `transport` teaches devalue about `CalendarDate`, so a date range that leaves the picker as a `CalendarDate` arrives on the server as one; chapter {{dates-and-money-in-a-locale}} shows the value crossing.'
			},
			code('src/params.ts', 1, 21),
			{
				type: 'p',
				text: 'One file rather than a folder of matchers, and each entry is a Standard Schema — so a matcher can transform as well as accept, and `params.slug` arrives typed — in a page, as the `params` prop that `PageProps` describes (chapter {{the-trip-page}}). Anything that does not look like one of our slugs is a 404 before any route code runs and before the database is asked.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why `PUBLIC_ORIGIN` is both `public` and `static`, and what breaks if it were not.',
					'You can give the order of the three handlers and one reason for each position.',
					'You can name the four `kind`s in `handleError` and say which one gets an id.',
					'You can say what a `failed` snippet is handed in a SvelteKit app, and what the browser’s `handleError` adds to it.'
				]
			}
		]
	},

	{
		slug: 'identity-with-better-auth',
		title: 'Identity with Better Auth',
		summary:
			'The `minimal` entry point, configured for email and password with a session cookie cache; `sveltekitCookies` so a cookie set inside a remote function reaches the response; and `access.ts`, the three questions every trip function asks and the status codes that give away the least.',
		goal: 'Configure Better Auth for SvelteKit 3 and write the authorisation helpers a remote function calls first, choosing 302, 404 or 403 for the right reason.',
		blocks: [
			{
				type: 'p',
				text: 'Better Auth is the identity library the ecosystem has settled on since Lucia deprecated itself, and 1.7 is the version this project pins. It is a server library with adapters — one for Drizzle, one for SvelteKit — and the configuration is short because the app needs one thing: email and password, with sessions in the database.'
			},
			code(`${SERVER}/auth.ts`, 1, 21),
			code(`${SERVER}/auth.ts`, 23, 79),
			{
				type: 'p',
				text: 'Three things are SvelteKit-specific, and a fourth is about building. `baseURL` is `PUBLIC_ORIGIN`, the same value the config bakes into `paths.origin`. `drizzleAdapter(db)` puts Better Auth’s four tables in the same SQLite file as the trips, in the same migrations. And `sveltekitCookies(getRequestEvent)` is the plugin that lets a session cookie set *inside a remote function* reach the response SvelteKit is building — it must be last in the list, as the comment says, because it acts after every other plugin has decided the cookies. The `cookieCache` is worth a sentence: a signed copy of the session rides in the cookie for five minutes, so most requests need no database read, and revocation still lands within five minutes. And `secret` is the real one whenever the server runs, and a random throwaway — `build-` and a UUID — while SvelteKit builds: `src/env.ts` lets the secret be missing then (chapter {{environment-and-hooks}}), and Better Auth will not even initialise without one, so the build’s analysis gets a value that signs nothing and dies with it.'
			},

			{ type: 'h3', id: 'who-may-do-what', text: 'Who may do what' },
			code(`${SERVER}/access.ts`, 1, 37),
			{
				type: 'p',
				text: 'Every remote function that touches a trip begins with one of these, and they answer three questions in a fixed order: is anybody signed in, may they see this trip, may they change it. The status codes are chosen to give away the least. A 403 for “not yours” would tell a stranger that the slug they guessed is real; a 404 for “yours, but read-only” would leave a viewer wondering where the trip went. So a stranger gets 404 and a viewer gets 403, and the doc comment is the whole policy.'
			},
			code(`${SERVER}/access.ts`, 39, 72),
			{
				type: 'p',
				text: '`requireUser` throws a redirect — a real 303 — carrying the current URL in `redirectTo`, localised, so a person sent to sign in comes back where they were going in their language. `requireMember` is one query with the trip joined, and a rank table turns three roles into one comparison. Both use `getRequestEvent()` from `$app/server`, which is how a plain function reaches the request without being passed it.'
			},
			code(`${SERVER}/access.ts`, 74, 110),
			{
				type: 'p',
				text: '`readableTrip` is the read-side question with the `link` case: a member gets their role, and a stranger gets `role: "link"` if and only if the owner made the trip visible by link — otherwise the same 404 a nonexistent trip gives. `bump` is the last line of every write: increment the trip’s version in one `UPDATE … RETURNING` and wake the room. Chapter {{live-collaboration}} shows who is listening.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `sveltekitCookies(getRequestEvent)` does and why it is last.',
					'You can give the three questions `access.ts` asks and the status code each “no” gets, with the reason.',
					'You know what `bump` does and why every write ends with it.'
				]
			}
		]
	},

	{
		slug: 'remote-functions-the-reads',
		title: 'Remote functions: the reads',
		summary:
			'`query` for the trips list and the trip document, `query.batch` for one preview per card in one request, `prerender` for a gazetteer written to disk at build time, and the prerendered endpoint that serves the world — with the reason it is an endpoint and not a remote function.',
		goal: 'Choose between `query`, `query.batch`, `prerender` and a prerendered endpoint for a read, and know what each costs at build time and at run time.',
		blocks: [
			{
				type: 'p',
				text: 'A remote function is exported from a `.remote.ts` file, called anywhere, and always runs on the server. On the client the export becomes a `fetch` wrapper; on the server it is the function. Four flavours exist and this chapter is about the two that read — `query` and `prerender` — plus `query.batch`, which is `query` for the n+1 problem.'
			},
			code(`${REMOTE}/trips.remote.ts`, 1, 37),
			{
				type: 'p',
				text: '`myTrips` takes no argument and reads who is asking from the request. `tripBySlug` takes a slug — validated by `SlugSchema` before the function runs — and returns the first paint of the trip page: the whole document plus what the viewer may do with it. After that first paint the live query takes over; this query is called once per page. Notice that authorisation is the first line, and the work is a call into `server/trips.ts`, which knows nothing about requests.'
			},
			code(`${SERVER}/trips.ts`, 52, 84),
			{
				type: 'p',
				text: '`loadDocument` is the read that matters, because the live query calls it after every change. One Drizzle relational query assembles the trip, its companions with their names, its stops in itinerary order, its expenses with their shares, and its note. The indexes in the schema exist for this function. The destructuring at the end separates the trip’s own columns from the relations, so the `Trip` type on the wire is the row and nothing more.'
			},

			{ type: 'h3', id: 'batch', text: 'One request for a page of cards' },
			code(`${REMOTE}/geo.remote.ts`, 1, 37),
			code(`${REMOTE}/geo.remote.ts`, 56, 96),
			{
				type: 'p',
				text: 'The trips page renders one card per trip, and each card asks for its own route preview. Without `query.batch` that is one request per card. With it, every call made in the same tick is collected into one request; the server function receives the *array* of ids, answers with one database query, and returns a lookup function that SvelteKit calls per id. The authorisation is per person, not per id: the function fetches only the trips this person belongs to, and any other id answers as an empty route rather than an error — a stranger poking the endpoint learns nothing.'
			},

			{ type: 'h3', id: 'prerender', text: 'Data that never changes between deploys' },
			code(`${REMOTE}/geo.remote.ts`, 39, 54),
			{
				type: 'p',
				text: '`places` is a `prerender`: it runs once, at build time, and its result is written to disk as a static JSON asset. The client’s first call is a GET of a file a CDN can cache forever, and the browser keeps it in the Cache API across reloads. The explore page, the place search and the new-trip form all read the same copy. It is the right flavour for a hundred cities in a JSON module, and the wrong flavour for anything a person can change.'
			},
			{
				type: 'why',
				text: 'Why `{ dynamic: true }` on a function whose answer never changes? Because of the other side of the call. A server rendering `/explore` or the new-trip form for a request does not open the prerendered file off its disk: it *fetches* it, over the network, from the request’s own origin — which, with `paths.origin` set, is `PUBLIC_ORIGIN`, the public address in front of the proxy. If that fetch fails, SvelteKit runs the function instead, and a `prerender` function is left out of the server bundle unless it is dynamic, so the fallback threw `remote_prerender_not_dynamic` and the page was a 500. A container behind a proxy that terminates TLS often cannot reach its own public hostname, and every explore page failed that way. The option keeps the function in the server bundle, so the fallback runs in-process, from the same JSON module, and the browser still gets its cacheable file. The end-to-end suite could not have caught it: its server listens on `PUBLIC_ORIGIN` itself, so the fetch always succeeds. When a test environment is kinder than production, the kindness is worth writing down next to the code it hides.'
			},
			{
				type: 'warn',
				text: 'On a page that is *itself* prerendered, `query` cannot be used at all — SvelteKit throws “Cannot call query while prerendering”. The guides in chapter {{guides-prerendered-with-mdsvex}} are prerendered and read nothing dynamic; the explore page in chapter {{explore-and-diagnostics}} is dynamic and reads a `prerender`. Choosing which side of that line a page is on is a design decision, and the root layout in chapter {{the-shell}} is arranged around it.'
			},
			code('src/routes/api/world.json/+server.ts', 1, 39),
			{
				type: 'p',
				text: 'And the one that is not a remote function, with the reason written above it. The world’s coastlines are read from the `world-atlas` package with `read()` from `$app/server`, the API for opening a file that was imported through Vite. The first version was a `prerender()` remote function and failed at build time with `Asset does not exist`, because SvelteKit registers the assets `read()` may open by walking the server modules of routes and hooks, and — still true in 3.0.1; `find_server_assets.js` in Kit’s source visits endpoints, page nodes and the two hooks files, nothing else — not the `.remote.ts` modules. An endpoint is walked, so this is one — prerendered, so it is a file in the output that the server never runs again. That is exactly the kind of thing a course should record: the constraint, the version, and the workaround.'
			},
			code(`${SERVER}/geodata.ts`, 1, 34),
			{
				type: 'checkpoint',
				items: [
					'You can say which read flavour each of `myTrips`, `tripPreview`, `places` and `world.json` uses, and why.',
					'You know what `query.batch` receives and what it must return.',
					'You can explain why `world.json` is an endpoint and where `read()` looks for its assets.'
				]
			}
		]
	},

	{
		slug: 'remote-functions-the-writes',
		title: 'Remote functions: the writes',
		summary:
			'`form` where a page has a button and must work without JavaScript, `command` where the action only exists once JavaScript is running; `requested().refreshAll()` for single-flight updates; `invalid()` with a field-bound issue; and how a form’s field names carry their types.',
		goal: 'Decide between `form` and `command` for a write, refresh the queries a mutation affects in the same round trip, and return a validation error to the field it belongs to.',
		blocks: [
			{
				type: 'p',
				text: 'Two flavours write. `form` returns an object you spread onto a `<form>`: it has `method` and `action`, so it works with JavaScript off, and an attachment that enhances it when JavaScript is on. `command` is a function you call from anywhere JavaScript is running. The rule this project follows is in the doc comment of `trips.remote.ts`: a page with a button is a `form`; a drag, a map click or a settings control is a `command`.'
			},
			code(`${REMOTE}/trips.remote.ts`, 39, 64),
			{
				type: 'p',
				text: '`createTrip` and `deleteTrip` redirect, because after them the person should be somewhere else — and a `redirect` thrown inside a `form` is followed by the browser whether or not JavaScript ran. `updateTrip` is a `command`, and its last line is the single-flight idea: the client that sends the command asks, in the same request, for `tripBySlug` to be refreshed, and `requested(tripBySlug, 1).refreshAll()` refreshes exactly the instances that client is holding — at most one here, and the limit is required because the list is client-controlled. The settings form in chapter {{companions-presence-and-settings}} is the other half: `updateTrip(patch).updates(tripBySlug(slug))`.'
			},
			code(`${REMOTE}/stops.remote.ts`, 1, 43),
			{
				type: 'p',
				text: '`addStop` reads `STOP_LIMIT` — a number, by chapter {{environment-and-hooks}} — and answers 422 when a trip is full, with a sentence the toast can show as it is: `m.stop_limit({ limit: STOP_LIMIT })` is a Paraglide message with a parameter, so the limit reads “Eine Reise hat höchstens 500 Halte” on a German page. `nextPosition` from the domain puts the new stop after the last one on its day. `returning()` gives the row back so the client can select it immediately. And `bump` wakes the room, so everybody else’s itinerary shows the stop before the person who added it has looked up.'
			},
			code(`${REMOTE}/stops.remote.ts`, 45, 82),
			{
				type: 'p',
				text: '`moveStop` is chapter {{the-itinerary-as-data}} at the wire. It takes where the card was dropped, asks `place()` what has to change, writes exactly those rows in one transaction, and returns the changes — the same list the browser applied optimistically. `updateStop` looks the stop up first because the *trip* is what authorisation is about, and a stop id alone does not say which trip. When the stop is gone — a companion removed it a moment ago — the 404 carries a sentence, `m.error_no_stop()`, and not the words `Not found`, because a toast is going to print it to a person, in their language (chapter {{the-itinerary}} shows the toast). There is no command for “who am I”: the trip page learns whose presence chip is its own from the `viewerId` that `tripBySlug` returns with the document (chapter {{the-trip-page}}), because asking the server who you are, a moment after it rendered the page for you, is a round trip with nothing in it.'
			},

			{ type: 'h3', id: 'forms-and-fields', text: 'A form whose fields carry their types' },
			code(`${REMOTE}/expenses.remote.ts`, 1, 31, { partial: true }),
			{
				type: 'p',
				text: 'The doc comment is the lesson. A form sends strings, unless a field was rendered with `fields.amount.as("number")`, in which case its name carries a prefix and SvelteKit coerces the value before the schema runs; a set of checkboxes rendered with `fields.participants.as("checkbox", id)` arrives as a `string[]`. So the schema is typed by the form, and the component’s `as()` calls are checked against it — a checkbox for a field the schema says is a number is a compile error. The amount is a decimal *here*, and becomes minor units once, with the trip’s currency, on the way into the database.'
			},
			{
				type: 'p',
				text: 'The schema itself is not in this file. `ExpenseFormSchema` lives in `domain/schemas.ts` (chapter {{schemas-with-valibot}}), because the form in the browser runs the very same object as a *preflight* before it sends anything (chapter {{expenses-with-tanstack-and-layerchart}}) — and a `.remote.ts` module may export remote functions and nothing else, so a schema defined here could not be imported there. One schema, two places it runs, no copy to drift.'
			},
			code(`${REMOTE}/expenses.remote.ts`, 32, 67, { partial: true }),
			{
				type: 'p',
				text: '`invalid(issue.participants(m.issue_participants_member()))` is programmatic validation: the schema cannot know whether an id belongs to a companion, the handler can, and `invalid` with a field-bound issue lands the message under that field in the form as if the schema had produced it — in the request’s language, because `m` reads the locale the middleware stored. A payer who is not on the trip is the same kind of answer, `issue.paidBy(…)`, rather than a bare 400 that would have thrown the whole form away. The transaction writes the expense and its shares together, `bump` wakes the room, and `watchTrip(trip.slug).reconnect()` ends the handler. That last line matters: this form’s client never calls `submit().updates(...)`, and a form handler that refreshes nothing gets SvelteKit’s default — invalidating every query and load function — which re-ran the trip page’s `await tripBySlug(slug)` and, now and then, held the live stream’s new document behind an await that never settled. Reconnecting the live query is the docs’ pattern for a mutation that changes what a live query shows, and because it counts as the handler’s own refresh it replaces that default.'
			},
			code(`${REMOTE}/notes.remote.ts`, 13, 34),
			{
				type: 'p',
				text: 'The note is one `command` and one upsert — `onConflictDoUpdate` on the trip id — because a note is a page and last-writer-wins on a page two people rarely edit at the same moment is the honest trade against a CRDT nobody asked for. The doc comment says so and points at project 4, which built the CRDT.'
			},
			code(`${REMOTE}/auth.remote.ts`, 29, 49),
			code(`${REMOTE}/auth.remote.ts`, 51, 79),
			{
				type: 'p',
				text: 'The sign-in form is the one to study for error handling. One message for both “no such account” and “wrong password”, on purpose, because distinguishing them turns the form into a tool for discovering which emails have accounts. The redirect target is *sanitised* rather than rejected: it lives in a hidden field the person cannot see, so a crafted link would otherwise strand them at “invalid redirect”, and the regular expression refuses `//evil.example` — a protocol-relative URL that starts with a slash and still leaves the site. The password’s messages are functions, `() => m.issue_password_missing()`, for the reason chapter {{schemas-with-valibot}} gave: valibot calls a message function when the check fails, which is inside the request, where Paraglide knows the language.'
			},
			{ type: 'h3', id: 'from-form-actions', text: 'If you know form actions' },
			{
				type: 'p',
				text: 'SvelteKit 2 had one way for a page to write: form actions — an `actions` export in `+page.server.ts`, `fail()` for a refusal, `use:enhance` from `$app/forms` on the `<form>`, and the result in `page.form`. They are still in SvelteKit 3 — `$app/forms` still exports `applyAction`, `deserialize` and `enhance` — and this project has none. If you are coming from them, this is the map.'
			},
			{
				type: 'table',
				caption: 'Form actions (SvelteKit 2) and remote forms (SvelteKit 3)',
				head: ['Form actions', 'A remote `form`', 'In Meridian'],
				rows: [
					['`export const actions` in `+page.server.ts`, one per `?/name`', '`form(schema, handler)` in a `.remote.ts` module, spread onto the `<form>`', '`createTrip`, `signIn`, `acceptInvite`'],
					['`fail(400, { … })`', '`invalid(issue.field(message))`, landing under that field', '`addExpense`, for a participant who is not on the trip'],
					['`use:enhance` from `$app/forms`', 'nothing — the spread enhances the form; `form.enhance(callback)` to take over', '`DeleteTrip.svelte`'],
					['`applyAction(result)` and `update()`', '`submit().updates(query)`, or the handler’s own `refresh()` / `reconnect()`', 'the settings form; `addExpense`'],
					['`ActionData` and `page.form`', '`fields` — values and issues, typed by the schema — and `result`', 'every form’s `issues()`'],
					['`formData.get(\'amount\')` and a cast', '`fields.amount.as(\'number\')`: the name carries the type', '`Expenses.svelte`']
				]
			},
			{
				type: 'p',
				text: 'Underneath, both are the same request — a `POST` of `FormData`, which is why both work with JavaScript off. The difference is where it goes and what knows its shape. An enhanced action posts back to the page’s own URL, with an `x-sveltekit-action: true` header — the header SvelteKit reads to tell an action apart from a `POST` to a `+server.ts` on the same path. A remote form posts to its own endpoint under `/_app/remote/`, so there is nothing to tell apart. And the field names are SvelteKit’s to make: they carry the field’s type and the form’s id — `name/1blflfo/createTrip`, as a failing test’s call log prints it — so every input takes its attributes from `fields.name.as(\'text\')` rather than a `name` written by hand.'
			},
			{
				type: 'why',
				title: 'Why this project has no form actions',
				text: 'Because a remote form is typed from one end to the other, and an action is typed at one end. The schema types the handler’s input and every `as()` call in the component, so a checkbox for a number field is a compile error; an action’s `ActionData` is typed from what it returns, and its inputs are strings that nobody checks until the action reads them. A remote form also lives beside the queries it refreshes, which is what makes a single-flight update one line. Form actions are not wrong — a project with a dozen of them gains nothing by rewriting them — but a new project in SvelteKit 3 starts here.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say when a write is a `form` and when it is a `command`, and what each gives up.',
					'You can explain single-flight mutations from both ends: `requested()` on the server and `.updates()` on the client.',
					'You know how a form field’s `as()` type reaches the schema, and what `invalid()` is for.'
				]
			}
		]
	},

	{
		slug: 'live-collaboration',
		title: 'Live collaboration: a room, a mailbox and a generator',
		summary:
			'`watchTrip` is a `query.live` — an async generator on the server, a `.current` in the browser — that yields the whole trip and who is looking at it whenever the room is woken. In-process rooms, a one-slot mailbox so a burst becomes one send, presence with a time-to-live, access asked again on every wake, and the two things that end a stream: the abort signal, and a refusal.',
		goal: 'Write a live query as an async generator that ends cleanly, and build the small in-process broadcaster it listens to — knowing what would change to span instances.',
		blocks: [
			{
				type: 'p',
				text: 'Two people planning one trip is the normal case, so the trip is a live query. `query.live` takes an async generator; on the server it runs for as long as the browser is listening, and every `yield` is a value the browser sees as `.current`. During server-side rendering it takes the first value and closes, which is how the trip page has content before any JavaScript runs.'
			},
			code(`${SERVER}/live.ts`, 1, 49),
			{
				type: 'p',
				text: 'The broadcaster is a `Map` of rooms, one per trip, and two functions: `subscribe` and `publish`. It is in-process on purpose — a single container is the deployment this project ships — and the doc comment names the two ways to make it span instances, Postgres `NOTIFY` or a Redis stream, neither of which changes the shape. `liveRooms` exists for the diagnostics page.'
			},
			code(`${SERVER}/live.ts`, 51, 83),
			{
				type: 'p',
				text: '`Mailbox` is the piece that keeps a slow reader from being buried. If ten changes land while the generator is still serialising the last snapshot, it should send the current state once, not ten stale states in a row — so the box holds one pending signal, and `put` coalesces. `next` resolves with `true` for a signal and `null` once the box is closed, which is how the generator learns that the request went away.'
			},
			code(`${REMOTE}/live.remote.ts`, 1, 40),
			code(`${REMOTE}/live.remote.ts`, 42, 82),
			{
				type: 'p',
				text: 'Read the generator as a loop with two exits. Authorise; subscribe, with the room’s listener putting a signal in the mailbox; then forever: load the document, yield it with the presence list, wait on the mailbox — and, woken, authorise again before reading anything. The first exit is the abort signal on the request — the tab closed, the person navigated away — which closes the mailbox, which makes `next()` return `null`, which breaks the loop, which runs `finally`, which unsubscribes. Without that chain every visitor who ever opened the trip would be a listener forever. The second exit is a refusal: `readableTrip` throws the same 404 it throws at the door, the generator ends with it, and `finally` unsubscribes just the same.'
			},
			{
				type: 'why',
				title: 'Why access is asked on every wake, and not once',
				text: 'Because a connection is not a permission. The first version asked once, when the stream opened, and the two people that missed were real: a companion the owner removed while their tab stayed open, and somebody reading the trip by its link after the owner made it private. Both went on receiving every snapshot — every stop, every expense — for as long as the tab lived, and a reload was the only thing that would have shown them the 404. Asking again costs two indexed reads per wake per watcher, on a room of a handful of people; it is the same function, `readableTrip`, so there is one answer to “may this person read this trip”, given the same way at the door and on every wake. The obvious alternative — have `removeMember` call `watchTrip(slug).reconnect()` — cannot work: a `reconnect()` in a command is a single-flight update for the client that *sent the command*, the owner, and never reaches the removed person’s stream.'
			},
			{
				type: 'p',
				text: 'It works after a `yield`, which is not obvious. `getRequestEvent()` — and so `locals.user` behind `currentUser()` — reads the request from an `AsyncLocalStorage`, and the documentation’s caveat is about runtimes without one: there it “must be called synchronously (i.e. not after an `await`)”. A generator is worse than an `await`: its body is cut at every `yield`, and each piece runs when the *consumer* calls `next()`, from wherever the consumer is. SvelteKit covers exactly that — its `run_remote_generator` calls every `iterator.next()` inside `with_request_store`, with a comment saying the generator is “chopped apart at each yield” and needs the request context in each piece. A probe in the generator confirmed it before anything was built on it: on every wake, the signed-in person on `locals` was the right one — Ana, Ben, the companion about to be removed — and after the removal the same call answered with the refusal. What a refusal does in the browser is SvelteKit’s too: the server sends it down the stream as an error and closes it, and the browser’s live query treats an `HttpError` as final — it keeps the last snapshot, sets `.error`, and stops instead of reconnecting with backoff. The live chip in chapter {{the-trip-page}} then offers “Reconnect”, which asks the server again and is refused again, unless the owner has let the person back in. The end-to-end proof is in chapter {{end-to-end}}.'
			},
			{
				type: 'why',
				title: 'Why the whole document and not a diff',
				text: 'A trip is a few hundred rows at most, the serialisation is a millisecond, and “the client holds exactly what the server holds” is a property worth more than the bytes it costs. There is no client-side cache to invalidate and no merge to get wrong, because there is no client-side copy of the truth — only the last snapshot. Project 4 sent operations and merged them, because a whiteboard has thousands of objects and dozens of editors; a trip does not, and choosing the simpler design where it fits is the skill.'
			},
			code(`${SERVER}/presence.ts`, 1, 46),
			code(`${REMOTE}/live.remote.ts`, 84, 94),
			{
				type: 'p',
				text: 'Presence is not data: not stored, not migrated, gone on restart. A `Map` per trip with a thirty-second time-to-live; a browser touches its entry every fifteen seconds and says goodbye from `beforeunload`. `touch` publishes only when something *visible* changed — a new arrival, a pointer on a different stop — because a heartbeat that changes nothing should not wake every watcher. The page-side effects that send these are in chapter {{the-trip-page}}, along with the loop they must not create.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can trace the chain from the abort signal to `unsubscribe`, and say what breaks if one link is missing.',
					'You can say why the stream asks for access on every wake, why `getRequestEvent()` still answers after a `yield`, and why a `reconnect()` in `removeMember` could not have done the job.',
					'You can explain what the mailbox coalesces and why a plain queue would be wrong.',
					'You know why presence lives in memory and when `touch` publishes.'
				]
			}
		]
	},

	{
		slug: 'invites-and-membership',
		title: 'Invites and membership',
		summary:
			'An owner makes a single-use, expiring link; a stranger who opens it signs in on the way and joins with the role the link carries — in a transaction, through a `form`, ending in a redirect. Roles change and members leave the same way.',
		goal: 'Build an invitation that is unguessable, single-use and time-limited, and make joining a form that works from a phone with a flaky connection.',
		blocks: [
			{
				type: 'p',
				text: 'An invite link is a secret that turns a stranger into a companion. Everything about its design follows from what happens when it is pasted into the wrong chat: it should be useless after one use, useless after a week, and useless to somebody who is not signed in.'
			},
			code(`${REMOTE}/invites.remote.ts`, 1, 48),
			{
				type: 'p',
				text: 'The token is twenty-four characters from the slug alphabet — about a hundred and eighteen bits — and the schema that accepts it is as strict as the one that made it, so a malformed link is a validation error before the database is asked. Only the owner may create one; the URL that comes back uses `PUBLIC_ORIGIN` and `localizeHref`, so the link is absolute and in the owner’s language.'
			},
			code(`${REMOTE}/invites.remote.ts`, 50, 70),
			{
				type: 'p',
				text: '`inviteByToken` is what the join page shows before the button: which trip, which role, and whether the link still works. It requires a signed-in person — `requireUser` redirects to sign in with the join page as the way back — so the page never renders a trip’s name to somebody with nothing but a link. `alreadyMember` lets the page offer “open the trip” instead of a button that would fail.'
			},
			code(`${REMOTE}/invites.remote.ts`, 72, 105),
			{
				type: 'p',
				text: 'Accepting is a `form`, because the join page is a page: a person arrives from a link in a message, possibly on a phone with a flaky connection, and a button that works without JavaScript is the one that works. The transaction is the important part. Read the invite, refuse it if used or expired, add the membership unless one exists, mark the invite used — all or nothing, so two taps on the button cannot produce two memberships or one membership and an unused link. The two refusals are `m.join_used()` and `m.join_expired()`, the very messages the join page shows before the button is pressed, so a link that expired between reading the page and pressing the button says the same thing in the same language either way. The explicit return type on the transaction callback is there because Drizzle’s inference needs a hand when the callback throws in some branches.'
			},
			code(`${REMOTE}/invites.remote.ts`, 107, 154),
			{
				type: 'p',
				text: 'The rest of membership is three small functions with the same shape — authorise as owner, refuse the one case that must never happen (the owner losing ownership), write, `bump`. `leaveTrip` is a `form` for the same reason `acceptInvite` is, and it refuses the owner too: an owner can delete the trip but not leave it, because a trip with no owner is a trip nobody can delete. Removal is immediate in all three senses. The row goes. The presence chip goes with it, through `presence.leave`, rather than lingering for its thirty seconds — the removed person’s heartbeats are refused from here on, and so is the goodbye a leaving person’s page sends on its way out, so the server says goodbye for them. And `bump` wakes the room, where the live query asks every watcher again whether they may read the trip and ends the removed person’s stream (chapter {{live-collaboration}}).'
			},
			code(`${SERVER}/trips.ts`, 101, 141),
			{
				type: 'p',
				text: 'And the store functions the trip functions call. `createTrip` loops for the one-in-a-quadrillion slug collision, because “retry once” is cheaper to write than to explain in an incident. `deleteTrip` is one statement, because the schema cascades. Nothing in this file checks a session — which is what makes it testable with a database and no request.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can list the three properties an invite link has and where each one is enforced.',
					'You can say why `acceptInvite` is a form and why its body is a transaction.',
					'You know which two operations refuse the owner and why.'
				]
			}
		]
	}
];
