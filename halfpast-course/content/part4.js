/**
 * PART 4 — Remote functions and async Svelte (chapters 20–24)
 *
 * The part of SvelteKit 3 that changes how you write everything else. Load
 * functions and form actions are gone; in their place are typed functions you
 * import into a component and call.
 */

export const part4 = [
	{
		slug: 'functions-that-cross-the-network',
		title: 'Functions that cross the network',
		summary:
			'`query` and `command`: server code you import into a component and call like any other function.',
		goal: 'A `.remote.ts` file whose exports run on the server, are typed end to end, and validate every argument.',
		blocks: [
			{
				type: 'p',
				text: 'Here is the whole idea, in one file and one component.'
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/booking.remote.ts',
				lang: 'ts',
				code: `
import * as v from 'valibot';
import { query } from '$app/server';

export const getBookingPage = query(slugSchema, async (slug): Promise<BookingPageData> => {
	const found = await db.query.business.findFirst({ where: eq(business.slug, slug) });
	if (!found) error(404, 'We could not find that business.');

	return { /* … */ };
});`
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<script lang="ts">
	import { getBookingPage } from './booking.remote.ts';

	const shop = $derived(await getBookingPage(data.slug));
</script>

<h1>{shop.business.name}</h1>`
			},
			{
				type: 'p',
				text: 'That is it. No endpoint to name, no `fetch` to write, no `+page.server.ts`, no response type to keep in sync. The component imports a function and awaits it. SvelteKit puts an HTTP request in the middle and neither side has to know.'
			},
			{
				type: 'note',
				text: 'The server code never reaches the browser. The import is replaced at build time with a small stub that makes the request. Your database credentials, your Drizzle queries and your `if (!found)` are all server-side, and the bundle is checked to make sure of it.'
			},

			{ type: 'h3', id: 'security', text: 'The security model is inverted' },
			{
				type: 'p',
				text: 'This is the part to take seriously, because it is the opposite of a load function.'
			},
			{
				type: 'ul',
				items: [
					'A **load function** runs for one URL. It can trust `params`, because the router produced them.',
					'A **remote function** is a public HTTP endpoint. Anybody can call it with anything, from anywhere, in any order.'
				]
			},
			{
				type: 'p',
				text: 'So every argument gets a schema, and — this is the important bit — the server must never look at `event.params` or `event.url` to decide what to return.'
			},
			{
				type: 'warn',
				text: 'SvelteKit enforces this: reading `event.params` or `event.url` inside a `query` **throws**. It is not a lint rule you can ignore. Everything the server needs must arrive as a validated argument, because the URL a remote call happens to be made from is not evidence of anything.'
			},

			{ type: 'h3', id: 'schemas', text: 'Schemas, with valibot' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/booking.remote.ts',
				lang: 'ts',
				code: `
const slugSchema = v.pipe(
	v.string(),
	v.trim(),
	v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Not a valid business address'),
	v.maxLength(64)
);

const idSchema = v.pipe(v.string(), v.uuid('Not a valid id'));

const isoDateSchema = v.pipe(v.string(), v.isoDate('Expected a YYYY-MM-DD date'));

const timeZoneSchema = v.pipe(
	v.string(),
	v.maxLength(64),
	v.check(isValidTimeZone, 'Not a time zone this server recognises')
);`
			},
			{
				type: 'p',
				text: 'SvelteKit accepts any **Standard Schema** library, which is a small shared interface that valibot, Zod, ArkType and others implement. We use valibot: it is a fraction of the size, and because every rule is a separate function, a bundler drops the ones you do not use.'
			},
			{
				type: 'p',
				text: 'A schema is not paperwork. It is the only thing standing between `serviceId` and somebody sending an object where a string was expected, to see what happens.'
			},

			{ type: 'h3', id: 'commands', text: 'Commands: the ones that change things' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/studio.remote.ts',
				lang: 'ts',
				code: `
export const addHours = command(hoursSchema, async (data) => {
	const context = await requireStaff(data.slug);
	assertCanManageDiaryOf(context, data.staffId);

	if (data.endMinute <= data.startMinute) {
		error(400, 'A shift has to end after it starts.');
	}

	await db.insert(availabilityRule).values({ /* … */ });

	// Tell every subscriber to this query to fetch again — in the same response.
	void getHours({ slug: data.slug }).refresh();
	publishDiaryChange(context.business.id);

	return { added: true };
});`
			},
			{
				type: 'p',
				text: '`query` reads, `command` writes. The split is not cosmetic: queries are cached and de-duplicated by their arguments, and commands are not, because "add this shift" twice is two shifts.'
			},

			{ type: 'h3', id: 'single-flight', text: 'Single-flight mutations' },
			{
				type: 'p',
				text: 'That `getHours(...).refresh()` line is worth stopping on. It runs **on the server, inside the command**, and it means the response to "add this shift" carries the new list of hours with it.'
			},
			{
				type: 'p',
				text: 'The usual pattern is: post the change, wait, then fetch the new state, wait again. Two round trips, and a visible flicker in between where the screen shows the old data. Refreshing inside the handler collapses that into one.'
			},
			{
				type: 'code',
				file: 'the client-side spelling of the same idea',
				lang: 'ts',
				code: `
// When the component knows better than the server which queries to update:
await setServiceActive({ id, isActive }).updates(getServices(slug));`
			},

			{ type: 'h3', id: 'errors', text: 'One trap on the way back' },
			{
				type: 'p',
				text: 'When a command calls `error(400, \'A shift has to end after it starts.\')`, the browser sees SvelteKit\'s `HttpError`. And `HttpError` **does not extend `Error`**.'
			},
			{
				type: 'code',
				file: 'looks right, silently wrong',
				lang: 'ts',
				code: `
catch (thrown) {
	// Takes the else branch for every deliberate server error, because
	// HttpError is a plain class with .status and .body — not an Error.
	lastError = thrown instanceof Error ? thrown.message : 'Could not add that shift.';
}`
			},
			{
				type: 'p',
				text: 'The message you wrote is discarded and the generic fallback appears instead. Nothing looks broken — a plausible sentence is still on screen — which is exactly why this survives review. We only found it because an end-to-end test asserted on the real wording.'
			},
			{
				type: 'code',
				file: 'src/lib/errors.ts',
				lang: 'ts',
				code: `
export function messageFrom(thrown: unknown, fallback: string): string {
	if (isHttpErrorShape(thrown) && typeof thrown.body.message === 'string') {
		const message = thrown.body.message.trim();
		if (message) return message;
	}

	if (thrown instanceof Error && thrown.message.trim()) {
		return thrown.message;
	}

	return fallback;
}`
			},
			{
				type: 'note',
				text: 'Write it once, in `src/lib/errors.ts`, and use it in every catch. Seven places in this app catch a remote rejection; all seven had the same bug, because all seven were written from the same reasonable instinct.'
			},

			{
				type: 'checkpoint',
				text: 'The booking page renders from a `query`, and a `command` that calls `error(400, …)` shows *your* message in the browser, not a generic one.'
			}
		]
	},

	{
		slug: 'forms-without-javascript',
		title: 'Forms that work without JavaScript',
		summary:
			'`form()`, `fields.<name>.as()`, and the rule that catches everybody once.',
		goal: 'A booking form that submits, validates and reports errors with scripting disabled — then gets better with it on.',
		blocks: [
			{
				type: 'p',
				text: '`form()` is the third kind of remote function. It takes a schema and a handler, and the object it returns is spread straight onto a `<form>` element.'
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<form {...book}>
	<input {...book.fields.name.as('text')} />
	<input {...book.fields.email.as('email')} />
	<button type="submit">Book this time</button>
</form>`
			},
			{
				type: 'p',
				text: 'With JavaScript off this is an ordinary HTML form: it posts, the server validates, and the page comes back with errors filled in. With JavaScript on, SvelteKit intercepts, posts in the background, and updates in place. Same code, same handler, same validation.'
			},

			{ type: 'h3', id: 'the-rule', text: 'The rule that catches everybody once' },
			{
				type: 'warn',
				text: 'Every control inside a remote form must come from `fields.<name>.as(...)`. A hand-written `<input type="hidden" name="slug">` throws **"Form contained a field that wasn\'t created with form.fields.as(...)"** the moment the form is submitted.'
			},
			{
				type: 'p',
				text: 'SvelteKit has to own the name and the value in order to construct the submitted object and match it against your schema. A field it did not create is a field it cannot account for, so it refuses rather than silently dropping it.'
			},
			{
				type: 'code',
				file: 'the fix',
				lang: 'svelte',
				code: `
<!-- Not <input type="hidden" name="redirectTo" value={redirectTo} /> -->
<input {...signIn.fields.redirectTo.as('hidden', redirectTo)} />`
			},
			{
				type: 'p',
				text: 'The second argument is the value. It caught us three times in this project: the booking page\'s service id, the slot grid\'s chosen time, and the sign-in page\'s `redirectTo`. The last one only broke sign-ins that arrived *with* a redirect, which meant every test that started at `/manage` failed and every test that started at `/sign-in` passed.'
			},

			{ type: 'h3', id: 'errors', text: 'Showing what went wrong' },
			{
				type: 'code',
				file: 'src/routes/sign-in/+page.svelte',
				lang: 'svelte',
				code: `
{#if signIn.fields.allIssues()?.length}
	<Alert tone="error" title="We could not sign you in">
		<p>{signIn.fields.allIssues()?.[0]?.message}</p>
	</Alert>
{/if}

<Field label="Email" required error={signIn.fields.email.issues()?.[0]?.message}>
	{#snippet children({ id, describedBy, invalid })}
		<input
			{...signIn.fields.email.as('email')}
			{id}
			aria-describedby={describedBy}
			aria-invalid={invalid}
			autocomplete="username"
		/>
	{/snippet}
</Field>`
			},
			{
				type: 'ul',
				items: [
					'`fields.email.issues()` — problems with that one field, shown next to it.',
					'`fields.allIssues()` — everything, including errors that belong to the form as a whole rather than any single input.',
					'`aria-invalid` and `aria-describedby` are what make the error *readable* rather than merely visible. A screen reader announces "Email, invalid entry, that does not look like an email address" instead of "Email, edit text".'
				]
			},

			{ type: 'h3', id: 'fusing', text: 'Fusing two answers into one field' },
			{
				type: 'p',
				text: 'The booking form has an interesting problem. The customer picks a **time**, but a time on its own is not bookable — it belongs to a particular staff member, and when the customer chose "anyone", the app picked for them.'
			},
			{
				type: 'p',
				text: 'The obvious design is a radio group of times plus a hidden `staffId`, updated by JavaScript when the selection changes. That design **needs** JavaScript. Without it the hidden field keeps whatever the server rendered — for "anyone", nothing — and the form fails validation for a reason the customer can neither see nor fix.'
			},
			{
				type: 'p',
				text: 'So the value carries both, and the schema splits it apart again:'
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/booking.remote.ts',
				lang: 'ts',
				code: `
const slotValueSchema = v.pipe(
	v.string('Please choose a time'),
	v.regex(
		/^\\d{10,16}\\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		'Please choose a time'
	),
	v.transform((raw) => {
		const separator = raw.indexOf('.');
		return {
			start: Number(raw.slice(0, separator)),
			staffId: raw.slice(separator + 1)
		};
	})
);`
			},
			{
				type: 'why',
				title: 'Why the regex before the transform',
				text: 'The pipe runs in order. Validate the shape first, then split — so the handler receives a proper `{ start: number, staffId: string }` and can never be reached with `NaN` or half a selection. Splitting first and validating the pieces afterwards means writing two error messages for one mistake.'
			},
			{
				type: 'p',
				text: 'The result: a customer with JavaScript disabled posts a complete, coherent choice using nothing but a radio button. Progressive enhancement that is genuinely progressive, rather than a fallback nobody ever tried.'
			},

			{ type: 'h3', id: 'form-for', text: 'One form per row' },
			{
				type: 'p',
				text: 'The services page renders an edit form for every service. They cannot share one `form()` instance — a pending state or an error on one would appear on all of them.'
			},
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/services/+page.svelte',
				lang: 'svelte',
				code: `
{#each services as entry (entry.id)}
	{@const editForm = saveService.for(entry.id)}

	<form {...editForm}>
		<input {...editForm.fields.durationMinutes.as('number', entry.durationMinutes)} />
		<Button type="submit" loading={editForm.pending > 0}>Save changes</Button>
	</form>
{/each}`
			},
			{
				type: 'p',
				text: '`form.for(id)` gives each row its own instance with its own fields, issues and pending count, all driving the same server handler. It is the difference between one spinner spinning and eleven.'
			},

			{
				type: 'checkpoint',
				text: 'Disable JavaScript in your browser, book an appointment end to end, and get a real confirmation page. Then submit a bad email and see the error come back attached to the right input.'
			}
		]
	},

	{
		slug: 'live-queries',
		title: 'Live queries',
		summary:
			'`query.live` takes an async generator. Three lines of shape, and the receptionist’s screen updates itself.',
		goal: 'Availability that disappears from every open booking page the instant somebody takes it.',
		blocks: [
			{
				type: 'p',
				text: 'A `query` returns a value. A `query.live` returns an **async generator**, and everything it yields is streamed to every browser subscribed with the same arguments.'
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/booking.remote.ts',
				lang: 'ts',
				code: `
export const getAvailability = query.live(availabilityArgs, async function* (args) {
	const { request } = getRequestEvent();

	const found = await db.query.business.findFirst({ where: eq(business.slug, args.slug) });
	if (!found) error(404, 'We could not find that business.');

	const read = async (): Promise<AvailabilityResult> => { /* … */ };

	yield await read();

	for await (const _ of watchDiary(found.id, { signal: request.signal, intervalMs: 60_000 })) {
		void _;
		yield await read();
	}
});`
			},
			{
				type: 'p',
				text: 'The shape is always the same three steps, and it is worth learning as a shape:'
			},
			{
				type: 'ol',
				items: [
					'**Yield the current answer immediately**, so the page has something to draw.',
					'**Wait for a reason to look again.**',
					'**Yield the new answer**, and go back to 2.'
				]
			},

			{ type: 'h3', id: 'not-polling', text: 'Step 2 is not a poll' },
			{
				type: 'p',
				text: '`watchDiary` blocks until somebody actually books or cancels. A booking page left open on a quiet Tuesday afternoon costs one open connection and no queries at all. Polling every five seconds would cost seventeen thousand queries a day per open tab, to discover nothing.'
			},
			{
				type: 'p',
				text: 'The one-minute heartbeat exists because **time passing is itself a change**. A slot two hours out disappears when the salon\'s notice period reaches it, and no database write announces that. Without the tick, a page left open would keep offering a time that had quietly become unbookable.'
			},

			{ type: 'h3', id: 'cleanup', text: 'The signal is not optional' },
			{
				type: 'p',
				text: '`request.signal` is what makes this safe to leave running. When the customer closes the tab, the signal aborts, the generator\'s `finally` runs, and the listener is removed.'
			},
			{
				type: 'warn',
				text: 'Leave it out and every abandoned booking page leaves a subscriber behind forever. The app works perfectly for a week and then falls over, and the stack trace points at whatever unlucky code was running when memory ran out.'
			},

			{ type: 'h3', id: 'choosing', text: 'What deserves to be live' },
			{
				type: 'p',
				text: 'Availability is live. The list of services on the same page is not — it is a plain `query`.'
			},
			{
				type: 'p',
				text: 'The rule: does it change **while somebody is looking at it**? Availability does, constantly, because of strangers. Services change when an owner edits them, which is roughly never during one customer\'s visit. Making everything live costs connections and complexity to solve a problem nobody has.'
			},

			{ type: 'h3', id: 'client', text: 'On the client, it is just a query' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
const availability = $derived(
	await getAvailability({ slug, serviceId, staffId, from: day, days: 14 })
);`
			},
			{
				type: 'p',
				text: 'No subscription to manage, no cleanup to write, no `onDestroy`. The `$derived` re-runs when the arguments change and the component re-renders when a new value arrives. The generator on the server and the `await` in the component are the entire API.'
			},

			{
				type: 'checkpoint',
				text: 'Two browser windows on the same booking page. Book a time in one; watch it vanish from the other without a reload.'
			}
		]
	},

	{
		slug: 'async-svelte',
		title: 'Async Svelte, and its sharp edges',
		summary:
			'`await` inside `$derived`, boundaries with pending and failed snippets, and two traps that cost this project an afternoon each.',
		goal: 'Components that await data directly, with sensible loading and error states — and no server-side crashes.',
		blocks: [
			{
				type: 'p',
				text: 'Svelte 5 with `experimental.async` lets you `await` inside `$derived` and directly in markup. It removes an entire category of code: no `{#await}` pyramids, no `loading` booleans, no `data.streamed.thing`.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
sveltekit({
	compilerOptions: {
		runes: true,
		experimental: { async: true }
	}
})`
			},

			{ type: 'h3', id: 'boundaries', text: 'Boundaries' },
			{
				type: 'p',
				text: 'An awaiting component needs somewhere for its loading and error states to live. That is `<svelte:boundary>`.'
			},
			{
				type: 'code',
				file: 'src/routes/+layout.svelte',
				lang: 'svelte',
				code: `
<svelte:boundary>
	{@render children()}

	{#snippet failed(error, reset)}
		<Alert tone="error" title="Something went wrong">
			<p>{messageFrom(error, 'We could not load this page.')}</p>
			<Button onclick={reset}>Try again</Button>
		</Alert>
	{/snippet}
</svelte:boundary>`
			},
			{
				type: 'p',
				text: 'The `reset` function re-runs the failed work. For a network hiccup that is genuinely all the recovery anybody needs, and it is one line.'
			},

			{
				type: 'warn',
				title: 'Trap one: pending on the server',
				text: 'A `pending` snippet renders **immediately during server rendering and does not wait for the awaits**. Put one on the root boundary and every page in your app ships HTML whose entire body is the word "Loading…". The page looks fine in a browser — it hydrates a moment later — and is empty to a search engine, a link preview, and anybody on a slow connection. We shipped that for an hour before noticing.'
			},
			{
				type: 'p',
				text: 'The fix is to put `pending` only where a client-side wait is genuinely expected — a panel that refetches when a filter changes — and never on the boundary that wraps a whole page.'
			},

			{
				type: 'warn',
				title: 'Trap two: declaration order with bound state',
				text: 'When a component binds to a **member** of a `$state` object — `bind:value={draft.weekday}` — the compiler emits a getter that runs before the part of the script following the first awaited `$derived`. Declare the state after those and it is still `undefined` when the getter runs. Server rendering dies with "Cannot read properties of undefined (reading \'weekday\')" and the page 500s before anybody sees it.'
			},
			{
				type: 'code',
				file: 'twelve lines that reproduce it',
				lang: 'svelte',
				code: `
<script lang="ts">
	const later = $derived(await Promise.resolve('ready'));

	let draft = $state({ weekday: 1 });   // ← declared after the await
</script>

<select bind:value={draft.weekday}>     <!-- 500: draft is undefined -->
	<option value={1}>Monday</option>
</select>`
			},
			{
				type: 'p',
				text: 'Move `let draft` above the `$derived` and it renders. Binding to a plain `$state` variable is unaffected, and so is reading `draft.weekday` in ordinary markup — which is exactly what makes it so easy to walk into, and so confusing when it happens.'
			},
			{
				type: 'note',
				text: 'The rule to remember: **declare any state you `bind:` to at the top of the script, above anything that awaits.** It costs nothing, and it is a good habit regardless.'
			},

			{ type: 'h3', id: 'untrack', text: 'Effects that trigger themselves' },
			{
				type: 'p',
				text: 'One more, because it produces a symptom that makes no sense: radio buttons that will not stay selected.'
			},
			{
				type: 'code',
				file: 'the bug',
				lang: 'ts',
				code: `
$effect(() => {
	// Reads book.fields.slot in order to write it. The write invalidates the
	// read, the effect runs again, and the selection never survives a frame.
	if (!isStillOffered(book.fields.slot.value())) book.fields.slot.set('');
});`
			},
			{
				type: 'code',
				file: 'the fix',
				lang: 'ts',
				code: `
import { untrack } from 'svelte';

$effect(() => {
	// Depend on the availability — the thing that should re-run this — and read
	// the field without subscribing to it.
	const offered = availability.staff.flatMap((entry) => entry.slots);

	untrack(() => {
		if (!offered.some((slot) => matches(slot, book.fields.slot.value()))) {
			book.fields.slot.set('');
		}
	});
});`
			},
			{
				type: 'p',
				text: '`untrack` says "read this, but do not treat it as a dependency". The effect now re-runs when availability changes, which is the only reason it should, and clearing the field does not wake it up again.'
			},

			{ type: 'h3', id: 'why-worth-it', text: 'Why this is worth the sharp edges' },
			{
				type: 'code',
				file: 'before — SvelteKit 2',
				lang: 'svelte',
				code: `
<script>
	export let data;
</script>

{#await data.availability}
	<p>Loading…</p>
{:then availability}
	<SlotGrid {availability} />
{:catch error}
	<p>{error.message}</p>
{/await}`
			},
			{
				type: 'code',
				file: 'after',
				lang: 'svelte',
				code: `
<script>
	const availability = $derived(await getAvailability(args));
</script>

<SlotGrid {availability} />`
			},
			{
				type: 'p',
				text: 'The loading and error states did not disappear — they moved to a boundary, where they are written once for a whole region instead of once per await. Multiply that across a dozen components and it is a different codebase.'
			},

			{
				type: 'checkpoint',
				text: 'Every page in the app server-renders its real content — view source and see the studio name, not "Loading…" — and a thrown query renders your boundary\'s `failed` snippet with a working Try again button.'
			}
		]
	}
];
