/**
 * PART 4 — Remote functions and async Svelte (chapters 20–23)
 *
 * The part of SvelteKit 3 that changes how you write everything else. Load
 * functions and form actions still exist, but this app keeps its load functions
 * to two small jobs (finding who is signed in, guarding the owner's pages) and
 * has no form actions at all. The data layer is typed functions you import into
 * a component and call.
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
// …
import { form, getRequestEvent, query } from '$app/server';
// …

export const getBookingPage = query(slugSchema, async (slug): Promise<BookingPageData> => {
	const found = await db.query.business.findFirst({ where: eq(business.slug, slug) });
	if (!found) error(404, 'We could not find that business.');

	// …
});`
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<script lang="ts">
	// …
	import { book, getAvailability, getBookingPage } from './booking.remote.ts';
	import type { PageProps } from './$types';

	// …
	let { params }: PageProps = $props();

	// …
	const shop = $derived(await getBookingPage(params.slug));
	// …
</script>

<!-- … -->
<h1>{shop.business.name}</h1>`
			},
			{
				type: 'p',
				text: 'That is it. No endpoint to name, no `fetch` to write, no load function at all, no response type to keep in sync. The component imports a function and awaits it. SvelteKit puts an HTTP request in the middle and neither side has to know.'
			},
			{
				type: 'p',
				text: 'The slug comes from the page\'s own props. Every page receives `params`, the route\'s parameters, and `PageProps` from the generated `./$types` types them from the folder name: this page lives in `book/[slug]`, so `params.slug` is a `string`, and a typo is a compile error. The page hands it to the query as an argument, because a remote function cannot read the URL for itself — more on that in a moment.'
			},
			{
				type: 'why',
				title: 'Why params, and not a load function',
				text: 'This page used to have a `+page.ts` whose whole body was `return { slug: params.slug }`, and the page typed its props by hand as `{ data: { slug: string } }`. Both were wrong in a way that compiled. The load was a moving part that renamed a value the router already hands every page — SvelteKit 2.24 added the `params` prop for exactly this, "particularly useful alongside remote functions" in the docs\' words — and the hand-written type was not connected to the load at all: rename the key it returned, and the page still type-checked and rendered `undefined`. `PageProps` and `LayoutProps` are generated from the files that actually feed the component, so they cannot drift. Every page and layout in the app now takes its props that way.'
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

	const member = await db.query.staff.findFirst({
		where: and(eq(staff.id, data.staffId), eq(staff.businessId, context.business.id))
	});
	if (!member) error(404, 'No such staff member.');

	if (data.endMinute <= data.startMinute) {
		error(400, 'A shift has to end after it starts.');
	}

	await db.insert(availabilityRule).values({
		staffId: data.staffId,
		weekday: data.weekday,
		startMinute: data.startMinute,
		endMinute: data.endMinute
	});

	void getHours({ slug: data.slug }).refresh();
	publishDiaryChange(context.business.id);

	return { added: true };
});`
			},
			{
				type: 'p',
				text: '`query` reads, `command` writes. The split is not cosmetic: queries are cached and de-duplicated by their arguments, and commands are not, because "add this shift" twice is two shifts.'
			},
			{
				type: 'note',
				text: 'One thing a `command` cannot do is send the browser somewhere else. The docs allow `redirect(...)` in `query`, `form` and `prerender` handlers, "It is *not* possible inside `command` functions", and the browser throws if one tries. Anything that ends in a redirect — signing out, for one — is a `form`. Chapter 21 shows the sign-out button that learned this the hard way.'
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
				file: 'the client-side spelling of the same idea — both halves',
				lang: 'ts',
				code: `
// In the component, when it knows better than the server which query
// instances are on screen:
await setServiceActive({ slug, serviceId, isActive }).updates(getServices(slug));

// …and in the command handler, which must *accept* that request. An
// unhandled client-requested refresh is an error: the query lands in an error
// state in the browser. \`requested\` comes from '$app/server'; the second
// argument caps how many instances one request may ask for.
for (const { query } of requested(getServices, 1)) {
	void query.refresh();
}
// Shorthand for the same loop: await requested(getServices, 1).refreshAll();`
			},
			{
				type: 'p',
				text: 'This app never actually writes those lines — its commands call `.refresh()` on the server, the way `addHours` does above, so every caller gets the fresh data without asking. `.updates()` is for the day only the calling component knows which queries are on screen — a filtered list, say — and it is a two-sided contract: the server must refresh, `set` or deliberately `ignore()` every instance the client asked for (`refreshAll()` and `ignoreAll()` are the bulk spellings), or that query errors on the client. The `limit` argument is not optional because the list comes from the browser, and each entry costs the server a validation and a re-fetch; an unbounded one would be a denial-of-service lever.'
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
import { isHttpError } from '@sveltejs/kit';

// …

export function messageFrom(thrown: unknown, fallback: string): string {
	if (isHttpError(thrown) && thrown.status < 500) {
		const message = thrown.body.message.trim();
		if (message) return message;
	}

	return fallback;
}`
			},
			{
				type: 'p',
				text: '`isHttpError` is SvelteKit\'s own test, exported from `@sveltejs/kit` right beside `error`. What the browser receives is an instance of the very `HttpError` class that `error()` throws on the server (strictly, of a subclass SvelteKit uses for errors that have already been through `handleError`), so the test is an `instanceof`, and once it passes TypeScript knows that `thrown.body` is your `App.Error`.'
			},
			{
				type: 'p',
				text: 'The `status < 500` is there because `instanceof` is not quite the guarantee it looks like. One more thing arrives as an `HttpError`: a response that never reached SvelteKit at all, such as a proxy\'s 502 page. The browser builds it from the same class, with the HTTP status text as its message, so `isHttpError` cannot tell it apart, and without the status check a customer\'s alert said "Bad Gateway". Every sentence this app writes on purpose is a 4xx — the shift that ends before it starts is a 400 — and the only 5xx sentence it ever sends is `handleError`\'s generic apology, which the caller\'s own fallback says better. So a 5xx gets the fallback, whoever sent it. The `trim()` is the same idea for the 4xx a proxy might send: over HTTP/2 there is no status text at all, and an alert with nothing in it is worse than the fallback.'
			},
			{
				type: 'why',
				title: 'Why not check the shape by hand',
				text: 'An earlier version of this helper did: an object with a numeric `status` and a `body`, spelled out longhand, because SvelteKit does not export the `HttpError` class to test against. It does export the test, though, and the hand-made one is worse in a way that matters. It accepts any object of the right shape, so a unit test built on a literal `{ status, body }` passes against something the browser never produces, and the helper would put a sentence nobody vetted on a customer\'s screen. `instanceof` accepts only what SvelteKit made.'
			},
			{
				type: 'p',
				text: 'Notice what else is not there: a second branch for `thrown instanceof Error`. That branch looks like a kindness, and the earlier version had it too. The other things a remote call rejects with are a dropped connection, which arrives as the browser\'s own `TypeError: Failed to fetch`, and a bug in our code, which arrives as whatever the bug said. Neither has been through `handleError`, so neither is a sentence anybody vetted for a customer\'s screen. The fallback is for exactly those, so the helper reads a 4xx\'s `body.message` and nothing else.'
			},
			{
				type: 'p',
				text: 'Both halves are pinned by end-to-end tests in a real browser. One opens the same booking in two windows and cancels it in both, so the second cancellation is refused with "That booking is already cancelled."; run against the `instanceof Error` catch at the top of this section, its alert shows the fallback instead. The other switches the network off before pressing Cancel; run against the earlier helper with the extra branch, its alert reads "Failed to fetch". We ran each test against the bug it names and watched it fail, which is the only way to know a test can.'
			},
			{
				type: 'code',
				file: 'e2e/booking.e2e.ts',
				lang: 'ts',
				code: `
await page.context().setOffline(true);
page.once('dialog', (dialog) => void dialog.accept());
await page.getByRole('button', { name: 'Cancel this appointment' }).click();

const alert = page.getByRole('alert');
await expect(alert.getByText('We could not cancel that.', { exact: true })).toBeVisible();
await expect(alert).not.toContainText('Failed to fetch');`
			},
			{
				type: 'p',
				text: '`setOffline` is Playwright cutting the browser\'s network, not a mock, so the command\'s real `fetch` really fails, the way it does for a customer on a train. The two assertions together make the test fail for the right reason: the fallback has to be on screen, and the browser\'s wording has to be absent. Either one alone could pass with the bug still in place.'
			},
			{
				type: 'note',
				text: 'Write it once, in `src/lib/errors.ts`, and use it in every `catch` around a remote call. Six places in this app catch a remote rejection; all six had the same bug, because all six were written from the same reasonable instinct.'
			},
			{
				type: 'warn',
				title: 'A catch is not a boundary',
				text: 'This helper is for the value a `catch` receives. A `<svelte:boundary>`\'s `failed` snippet and `+error.svelte` are handed something else: an `App.Error`, `{ status, message }`, with no `body` at all. Pass one of those to `messageFrom` and the fallback wins every time. Chapter 23 shows the boundary side, and how this project got it wrong.'
			},

			{
				type: 'checkpoint',
				text: 'The booking page renders from a `query`, and a `command` that calls `error(400, …)` shows *your* message in the browser, not a generic one. Open the same booking in two windows, cancel it in one, then press Cancel in the other: the alert says "That booking is already cancelled.", the server\'s sentence. Switch the network off in your browser\'s developer tools and try again, and you get the fallback, not "Failed to fetch". `pnpm test:e2e` checks both on every run.'
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
<form {...book} class="booking stack stack-lg">
	<!-- … -->
	<input {...book.fields.slug.as('hidden', params.slug)} />
	<input {...book.fields.serviceId.as('hidden', service.id)} />
	<input {...book.fields.viewerTimeZone.as('hidden', viewerZone)} />

	<!-- … -->

	<Field label="Your name" required error={book.fields.name.issues()?.[0]?.message}>
		{#snippet children({ id, describedBy, invalid })}
			<input
				{...book.fields.name.as('text')}
				{id}
				aria-describedby={describedBy}
				aria-invalid={invalid}
				autocomplete="name"
				placeholder="Sam Okafor"
			/>
		{/snippet}
	</Field>

	<!-- … -->

	<Button type="submit" size="lg" full loading={book.pending > 0}>Book this time</Button>

	<!-- … -->
</form>`
			},
			{
				type: 'p',
				text: 'With JavaScript off this is an ordinary HTML form: it posts, the server validates, and the page comes back with errors filled in. With JavaScript on, SvelteKit intercepts, posts in the background, and updates in place. Same code, same handler, same validation.'
			},
			{
				type: 'p',
				text: 'Every input is spread from `book.fields`, including the three hidden ones that say which studio, which service and which time zone the booking is for. `book.pending` counts the submissions still in flight, which is what lets the button show it is working without a `$state` flag of your own.'
			},

			{ type: 'h3', id: 'field', text: 'A field that wires itself' },
			{
				type: 'p',
				text: 'The name input sits inside `<Field>`, and the `{id}`, `describedBy` and `invalid` it uses come from there. `Field` is this app\'s one form-field component, and it exists because a usable field needs three invisible things to be right at once: a label joined to its control, an error that is part of the control\'s description, and the control saying it is invalid.'
			},
			{
				type: 'code',
				file: 'src/lib/components/Field.svelte',
				lang: 'svelte',
				code: `
<script lang="ts">
	import type { Snippet } from 'svelte';

	// …

	let {
		label,
		hint,
		error,
		required = false,
		children
	}: {
		label: string;
		hint?: string;
		/** A message from the server, or from client-side validation. */
		error?: string | undefined;
		required?: boolean;
		/** Receives the ids to wire onto the control. */
		children: Snippet<[{ id: string; describedBy: string | undefined; invalid: boolean }]>;
	} = $props();

	// \`$props.id()\` gives a stable, hydration-safe unique id — the same string on
	// the server and in the browser, which \`crypto.randomUUID()\` would not be.
	const uid = $props.id();
	const id = \`\${uid}-field\`;
	const hintId = \`\${uid}-hint\`;
	const errorId = \`\${uid}-error\`;

	const describedBy = $derived(
		[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="field">
	<label for={id}>
		{label}
		{#if !required}<span class="optional">(optional)</span>{/if}
	</label>

	{#if hint}
		<p id={hintId} class="hint">{hint}</p>
	{/if}

	{@render children({ id, describedBy, invalid: Boolean(error) })}

	{#if error}
		<!--
			The mark is a real element with \`aria-hidden\`, not CSS generated content.
			Generated text is part of the accessible name, so \`content: '!'\` had this
			read out as "exclamation mark, that does not look like an email address";
			the component test caught it by reading the field's accessible
			description.
		-->
		<p id={errorId} class="error" role="alert">
			<span class="mark" aria-hidden="true">!</span>{error}
		</p>
	{/if}
</div>`
			},
			{
				type: 'p',
				text: 'The control itself is passed in as a **snippet with parameters**. `children` is typed `Snippet<[{ id; describedBy; invalid }]>`, `Field` renders it with `{@render children({ id, describedBy, invalid: Boolean(error) })}`, and the page receives those values by destructuring them in `{#snippet children({ id, describedBy, invalid })}`. So `Field` decides the ids, and the page decides what the control is: an `<input>`, a `<textarea>`, a `<select>`, each spread from its own `fields.<name>.as(...)`.'
			},
			{
				type: 'why',
				title: 'Why a snippet, and why $props.id()',
				text: 'A snippet with parameters is Svelte 5\'s replacement for slot props — the `let:id` directive on a `<slot>` in Svelte 4 — and it is better in the way that matters here: it is typed. Destructure a name `Field` does not pass and TypeScript says so. The ids come from `$props.id()`, which gives each component instance a unique id that is the same on the server and in the browser. `crypto.randomUUID()` would produce one id in the server\'s HTML and another during hydration, and the label would end up pointing at nothing; a hard-coded id breaks the moment two fields on one page share it. Chapter 32 has the component test that holds all of this in place.'
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
{#if formIssues?.length}
	<Alert tone="error" title="We could not sign you in">
		<p>{formIssues[0]?.message}</p>
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
					'`fields.email.issues()` — problems with that one field, shown next to it by `Field`.',
					'`formIssues` — the problems that belong to the form as a whole rather than to any single input, such as a refused password. Worked out in the script, below.',
					'`aria-invalid` and `aria-describedby` are what make the error *readable* rather than merely visible. A screen reader announces "Email, invalid entry, that does not look like an email address" instead of "Email, edit text".'
				]
			},
			{
				type: 'code',
				file: 'src/routes/sign-in/+page.svelte',
				lang: 'ts',
				code: `
const formIssues = $derived(
	signIn.fields.allIssues()?.filter((issue) => issue.path.length === 0)
);`
			},
			{
				type: 'p',
				text: '`fields.allIssues()` is every issue in the form, the email\'s own included. The alert used to be built straight from it, so an email the schema rejected said "Enter the email address you signed up with" twice — once beside the field, once in the alert — in two `role="alert"` regions, both read aloud. Each issue carries a `path` to the field it belongs to, and an issue for the form as a whole has an empty one, so filtering on `path.length === 0` leaves exactly the refusals the alert is for.'
			},

			{ type: 'h3', id: 'refusals', text: 'A refusal that belongs to the form' },
			{
				type: 'p',
				text: 'Schema issues land in those slots by themselves. A wrong password is different: the schema cannot know it. Only Better Auth can, after the submission has passed validation, so the handler has to report it itself, and the way it reports it decides what the person sees next.'
			},
			{
				type: 'code',
				file: 'src/routes/sign-in/auth.remote.ts',
				lang: 'ts',
				code: `
export const signIn = form(signInSchema, async (data) => {
	const { request } = getRequestEvent();

	try {
		await auth.api.signInEmail({
			body: { email: data.email, password: data._password },
			headers: request.headers
		});
	} catch (thrown) {
		// …
		if (isAPIError(thrown) && thrown.statusCode === 401) {
			invalid('That email and password do not match an account.');
		}
		throw thrown;
	}

	redirect(303, data.redirectTo);
});`
			},
			{
				type: 'p',
				text: '`invalid` comes from `@sveltejs/kit` and throws, as `error` and `redirect` do. Given a plain string, it records an issue for the form as a whole — one with an empty `path` — which `formIssues` picks out for the "We could not sign you in" alert above, with the email still filled in. Given `issue.email(\'…\')`, built from the second argument every form handler receives, it attaches to that one field instead.'
			},
			{
				type: 'p',
				text: 'Only one failure is a refusal, though. Better Auth throws an `APIError` with status 401 for a wrong password and for an unknown email alike — one message for both, which is what stops the form from telling a stranger which addresses have accounts. Everything else is rethrown. An earlier version caught everything with a bare `catch {`, which turned a database outage into "that password is wrong": no log line, no reference id, and somebody retyping a correct password at a server that could not read it. Rethrown, the outage reaches `handleError` as `unknown`, which logs it and shows the generic sentence.'
			},
			{
				type: 'why',
				title: 'Why not error(401, …)',
				text: 'This handler used to call `error(401, \'That email and password do not match an account.\')`, and it looked fine, because the sentence appeared. But `error` inside a form handler sends the request to the nearest `+error.svelte`, which replaces the page. The form went, the email went with it, and somebody who had mistyped one character was looking at a failure screen. A wrong password is put right on the same form, a moment later, so the answer belongs on the form. The end-to-end test for a wrong password now checks that the form, and the email in it, are still there.'
			},
			{
				type: 'code',
				file: 'src/routes/sign-in/auth.remote.ts',
				lang: 'ts',
				code: `
_password: v.pipe(v.string(), v.minLength(1, 'Enter your password')),`
			},
			{
				type: 'p',
				text: 'The underscore is the other half, and it matters most with JavaScript off. A submission that fails comes back as a freshly rendered page with every field filled in again, so nobody retypes their email. For a field called `password`, that means the wrong guess travels back across the network inside the input\'s `value`, in the HTML. SvelteKit never sends back a field whose name begins with `_`. We tried both with scripting disabled: named `password`, the guess was in the page source; named `_password`, the box comes back empty.'
			},
			{
				type: 'code',
				file: 'e2e/dashboard.e2e.ts',
				lang: 'ts',
				code: `
test.describe('getting in without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('a refused sign-in comes back with the email and without the password', async ({ page }) => {
		await page.goto('/sign-in');
		await page.getByLabel('Email').fill(OWNER.email);
		await page.getByLabel('Password').fill('definitely-not-the-password');
		await page.getByRole('button', { name: 'Sign in' }).click();

		// …
		await expect(page.getByRole('alert')).toContainText(
			'That email and password do not match an account.'
		);
		await expect(page.getByLabel('Email')).toHaveValue(OWNER.email);
		await expect(page.getByLabel('Password')).toHaveValue('');
		expect(await page.content()).not.toContain('definitely-not-the-password');
	});

	// …
});`
			},
			{
				type: 'p',
				text: '`javaScriptEnabled: false` is the cheapest progressive-enhancement test there is: one line, and the browser behaves like a phone whose script never arrived. The last assertion reads the whole page source, not just the input: the input is only the most obvious place the guess could travel, and reading everything the server sent catches it wherever it went.'
			},

			{ type: 'h3', id: 'sign-out', text: 'Signing out is a form too' },
			{
				type: 'code',
				file: 'src/routes/sign-in/auth.remote.ts',
				lang: 'ts',
				code: `
export const signOut = form(async () => {
	const { request } = getRequestEvent();
	await auth.api.signOut({ headers: request.headers });
	redirect(303, '/');
});`
			},
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/+layout.svelte',
				lang: 'svelte',
				code: `
<form {...signOut}>
	<Button type="submit" variant="ghost" size="sm" loading={signOut.pending > 0}>
		Sign out
	</Button>
</form>`
			},
			{
				type: 'p',
				text: 'A `form` with no schema, because there is nothing to send: the button is the whole form. It is a real POST, so it signs you out with JavaScript off, and it ends in `redirect(303, \'/\')`, which a form is allowed to do. A successful submission with no refreshes of its own also re-runs every load function, so the header\'s "Ada Willow" turns into "Sign in" without anybody reloading.'
			},
			{
				type: 'warn',
				title: 'A command cannot redirect',
				text: 'This was a `command` — `onclick={() => void signOut()}` — and it was broken in a way no test noticed. The SvelteKit docs are plain about it: `redirect(...)` works inside `query`, `form` and `prerender`, and "It is *not* possible inside `command` functions". In the browser, a command whose response is a redirect throws `remote_command_redirect`. So the session was deleted and the cookie cleared, and then the page threw, leaving the dashboard on screen with the owner\'s name still in the header. Two end-to-end tests now press Sign out, with and without JavaScript, and the shared fixture fails any test whose page throws an error nothing caught.'
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
	<!--
		\`.for(id)\` gives each row its own form instance. Without it every row
		shares one set of fields, so typing in the third card fills the first,
		and a validation error appears on all of them at once.
	-->
	{const editForm = $derived(saveService.for(entry.id))}
	<li class={['card', { inactive: !entry.isActive }]}>
		<!-- … -->

		{#if editing === entry.id}
			<form {...editForm} class="edit stack">
				<input {...editForm.fields.slug.as('hidden', params.slug)} />
				<input {...editForm.fields.serviceId.as('hidden', entry.id)} />

				<Field label="Name" required error={editForm.fields.name.issues()?.[0]?.message}>
					{#snippet children({ id, describedBy, invalid })}
						<input
							{...editForm.fields.name.as('text', entry.name)}
							{id}
							aria-describedby={describedBy}
							aria-invalid={invalid}
						/>
					{/snippet}
				</Field>

				<!-- … -->

				{#if editForm.result?.saved}
					<Alert tone="success"><p>Saved.</p></Alert>
				{/if}

				<Button type="submit" loading={editForm.pending > 0}>Save changes</Button>
			</form>
		{/if}
	</li>
{/each}`
			},
			{
				type: 'p',
				text: '`form.for(id)` gives each row its own instance with its own fields, issues and pending count, all driving the same server handler. It is the difference between one spinner spinning and eleven.'
			},
			{
				type: 'note',
				text: '`{const editForm = $derived(saveService.for(entry.id))}` is a *declaration tag*: a `const` written straight into the markup. Declaration tags arrived in Svelte 5.56 and made the older `{@const}` legacy. The `$derived` keeps the reactivity `{@const}` had — the value is worked out again whenever something it reads changes — where a bare `{const editForm = saveService.for(entry.id)}` is worked out once, when the row is created, like a `const` in the script. A declaration tag is visible to its siblings and their children in the same lexical scope: here that is the body of the `{#each}`, so each row has its own `editForm`, the snippets inside its `<Field>`s can read it, and nothing outside the loop can.'
			},
			{
				type: 'note',
				text: '`class={[\'card\', { inactive: !entry.isActive }]}` is the other idiom in that block, and every conditional class in this app is written that way. Since Svelte 5.16 the `class` attribute takes an array or an object and joins it the way the `clsx` library does: strings are kept, falsy values dropped, and an object contributes each key whose value is truthy. The older spelling, `class="card" class:inactive={!entry.isActive}`, still works, and the Svelte docs now steer you away from it — the attribute "is more powerful and composable". One attribute can mix fixed names, props and conditions, as the `Button` component does with `class={[\'btn\', variant, size, { full, loading }]}`, where the directive needed a string template and two directives beside it.'
			},
			{
				type: 'p',
				text: 'Notice the second argument again, this time on a text input. `as(\'text\', entry.name)` renders each row\'s form already holding that row\'s current name, and it is also the value the field goes back to if the form is reset. `editForm.result` is whatever the handler returned, so `{ saved: true }` from the server becomes the "Saved." message on that one card and no other.'
			},

			{
				type: 'checkpoint',
				text: 'Disable JavaScript in your browser, book an appointment end to end, and get a real confirmation page — chapter 25 shows how every step before the time became a link, which is what makes that possible. Then submit a bad email and see the error come back attached to the right input. Still without JavaScript, sign in with the wrong password: the sign-in form comes back with the email filled in, the password box empty, and nothing you typed in the page source. Sign in properly and press Sign out: you land on the home page, signed out. `pnpm test:e2e` does all of it with scripting switched off.'
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

	const read = async (): Promise<AvailabilityResult> => {
		const result = await loadAvailability({
			businessSlug: args.slug,
			serviceId: args.serviceId,
			staffId: args.staffId,
			from: args.from,
			to: addDays(args.from, args.days - 1)
		});

		return {
			timeZone: result.business.timeZone,
			// …
			generatedAt: Date.now()
		};
	};

	yield await read();

	for await (const _ of watchDiary(found.id, { signal: request.signal, intervalMs: 60_000 })) {
		void _;
		yield await read();
	}
});`
			},
			{
				type: 'p',
				text: '`read` is the whole query in one closure. It calls `loadAvailability`, which loads this service and these dates from the database and runs chapter 8\'s pure availability engine over them, then reshapes the answer for the page, and stamps it with `generatedAt` so the interface can say how fresh it is. Because it closes over the validated `args`, every yield re-runs exactly the same read.'
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
const availabilityQuery = $derived(
	service
		? getAvailability({
				slug: params.slug,
				serviceId: service.id,
				staffId: staffId ?? undefined,
				from: weekFrom,
				days: 7
			})
		: null
);

// …
const availability = $derived(availabilityQuery ? await availabilityQuery : null);`
			},
			{
				type: 'p',
				text: 'Two `$derived`s, on purpose. `availabilityQuery` is the resource — recreated whenever a different service, week or person is chosen, which on this page means whenever the URL says so — and it carries `.connected`, which is how the page knows whether to show its "Live" badge. `availability` is the value, re-awaited every time the server pushes a new one down the stream. No subscription to manage, no cleanup to write, no `onDestroy` — the generator on the server and the `await` in the component are the entire API.'
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
			'`await` inside `$derived`, the boundary SvelteKit already wrote, boundaries of your own, and two traps that cost this project an afternoon each.',
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
	// …
	compilerOptions: {
		// Runes everywhere except node_modules, where a dependency may still be
		// written in legacy Svelte 4 style. Removable in Svelte 6.
		runes: ({ filename }) =>
			filename.split(/[/\\\\]/).includes('node_modules') ? undefined : true,

		// \`await\` at the top level of <script>, inside $derived, and directly in
		// markup. Remote functions are promises; this is what lets a component
		// await one without a load function in the middle. Default in Svelte 6.
		experimental: { async: true }
	},
	// …
}),`
			},

			{ type: 'h3', id: 'boundaries', text: 'Boundaries, and the one SvelteKit already wrote' },
			{
				type: 'p',
				text: 'An awaiting component needs somewhere for its loading and error states to live. That is `<svelte:boundary>`: an `await` that has not settled suspends the nearest boundary above it, and a promise that rejects puts that boundary into its failed state.'
			},
			{
				type: 'p',
				text: 'In a SvelteKit 3 app you do not write the outermost one. SvelteKit renders everything below the root layout inside a boundary of its own, and that boundary\'s failed state is the nearest `+error.svelte`. So the app-wide failure screen is a file, not a snippet:'
			},
			{
				type: 'code',
				file: 'src/routes/+error.svelte',
				lang: 'svelte',
				code: `
<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '#lib/components/Button.svelte';
	import type { ErrorProps } from './$types';

	// …
	let { error }: ErrorProps = $props();

	// …
	const heading = $derived(
		error.status === 404
			? 'Not found'
			: error.status < 500
				? 'That did not work'
				: 'Something went wrong'
	);
</script>

<!-- … -->

<div class="container-narrow section">
	<div class="failure" role="alert">
		<h1>{heading}</h1>
		<p>{error.message}</p>

		<!-- … -->
		{#if error.id}
			<p class="reference">Reference <code>{error.id}</code></p>
		{/if}

		<div class="actions">
			<Button href={resolve('/')} variant="secondary">Back to the start</Button>
		</div>
	</div>
</div>`
			},
			{
				type: 'p',
				text: '`error` is an `App.Error`: `{ status, message }`, plus the `id` this app declares in `app.d.ts`. It has already been through `handleError` (the server\'s, or the browser\'s for a bug that throws there), so `message` is either the sentence somebody wrote in `error(…)` or the hook\'s safe replacement, and the component shows it as it is. The `id` appears only for unknown failures, the ones the hook logged next to a stack trace. The heading is chosen from the status, because a 403 is the server refusing on purpose, and "Something went wrong" would tell somebody the app is broken when it is working exactly as designed.'
			},
			{
				type: 'why',
				title: 'Why error.message, and not messageFrom',
				text: 'Chapter 20\'s helper is for a `catch` around a remote call, which receives an `HttpError` with the words one level down, in `body`. A boundary receives the `App.Error` itself, with no `body`, because SvelteKit has already unwrapped it. Hand that to `messageFrom` and the fallback wins every time, while a plausible sentence sits on screen and nothing looks broken. We probed it rather than trusting it: on the server and after a client-side navigation alike, the failed state was handed a plain object, `{ status: 404, message: \'We could not find that booking.\' }`, neither an `Error` nor an `HttpError`.'
			},
			{
				type: 'code',
				file: 'src/routes/+layout.svelte',
				lang: 'svelte',
				code: `
<main id="main" class="main">
	<!--
		NO BOUNDARY HERE, AND THAT IS DELIBERATE
		========================================

		With Svelte's async mode, \`await\` inside a \`$derived\` — which is how
		every page in this app reads its data — suspends the nearest
		\`<svelte:boundary>\` above it, and a rejection lands in that boundary's
		failed state. The nearest one is never in this file. SvelteKit 3 renders
		\`children\` inside a boundary of its own, whose failed state is
		\`src/routes/+error.svelte\`, so a boundary written around \`children\` here
		would sit outside SvelteKit's and never see a single error. This project
		had one, and its friendly failure card never once rendered. The app's
		failure screen is \`+error.svelte\`.

		NO \`pending\` SNIPPET ABOVE A PAGE, EITHER, and this is the part worth
		knowing.

		A \`pending\` snippet is rendered *immediately* on the server and the
		awaits inside are not waited for. Put one on a boundary around the page
		and every page ships HTML whose entire body is the word "Loading…", with
		the real content arriving only after hydration. For a public booking page
		that is the difference between a search engine seeing a salon's services
		and seeing nothing, and between a slow phone showing prices at first
		paint or a second later.

		Without one, SvelteKit waits for the awaits to settle and sends complete
		HTML. On subsequent client-side navigations Svelte keeps the current page
		on screen until the next one is ready — which is better than a spinner
		anyway. Where a page needs a local "working…" state, it uses
		\`$effect.pending()\` or a form's own \`pending\` count instead.
	-->
	{@render children()}
</main>`
			},
			{
				type: 'p',
				text: 'That comment is a confession. This layout used to wrap `children` in a boundary of its own, with a `failed` snippet showing a "Something went wrong" card and a Try again button. It looked like the app\'s error handling, and it could never run: SvelteKit\'s boundary sits between the layout and the page and catches every error first. What visitors actually got was SvelteKit\'s bare default page, a status code above a sentence. The card hid a second bug behind the first, too. It passed `error` to `messageFrom`, so had it ever rendered, it would have shown the fallback.'
			},
			{
				type: 'code',
				file: 'e2e/booking.e2e.ts',
				lang: 'ts',
				code: `
test('an unknown token gets the server s own sentence, not a fallback', async ({ page }) => {
	// …
	const response = await page.goto('/booking/ZZZZZZZZZZZZZZZZZZZZZZZZZZ');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('alert')).toContainText('We could not find that booking.');
	// The heading names the kind of failure: a missing booking is not a broken app.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
});

test('the same failure after a client-side navigation shows the same sentence', async ({
	page
}) => {
	// …
	await arriveClientSide(page, '/booking/ZZZZZZZZZZZZZZZZZZZZZZZZZZ');
	await expect(page.getByRole('alert')).toContainText('We could not find that booking.');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
});`
			},
			{
				type: 'p',
				text: 'Two tests for one screen, because there are two roads to it. A fresh load renders the failure on the server. Following a link renders it in the browser, where the query\'s rejection arrives over the network and SvelteKit unwraps it into an `App.Error` before the boundary sees it. `arriveClientSide`, in `e2e/fixtures.ts`, gets there by clicking a link inside the running app and then checks that no page load happened on the way, so the second test cannot quietly turn into the first. Both fail against the old layout, which had no `alert` to find, and both fail if `+error.svelte` is changed to read `messageFrom(error, …)`; we made each change and watched.'
			},

			{ type: 'h3', id: 'your-own', text: 'A boundary of your own' },
			{
				type: 'p',
				text: 'Write `<svelte:boundary>` yourself when one region of a page can fail on its own while the rest stays useful: a chart, a feed, a panel of suggestions. Its `failed` snippet receives the same `App.Error` as `+error.svelte`, because SvelteKit passes every boundary\'s error through `handleError` on its way in, and so does `onerror`. The SvelteKit documentation shows the shape:'
			},
			{
				type: 'code',
				file: 'the shape, from the SvelteKit docs on error boundaries',
				lang: 'svelte',
				code: `
<svelte:boundary>
	...
	{#snippet failed(error: App.Error)}
		<!-- error went through the \`handleError\` hook and is of type \`App.Error\` -->
		{error.message}
	{/snippet}
</svelte:boundary>`
			},
			{
				type: 'p',
				text: 'The snippet takes a second argument, `reset`, which throws the failed content away and renders it afresh: the Try again button. A probe page with a boundary around an awaited query that rejects showed the same `{ status: 404, message: \'We could not find that booking.\' }` in both `failed` and `onerror`, on a fresh load and after a client-side navigation.'
			},
			{
				type: 'warn',
				text: 'A boundary only catches what renders inside it. An `await` in a component\'s `<script>` suspends the boundary *above* that component, so a boundary in the same component\'s markup never sees it. Put the `await` in the markup inside the boundary, or move the region into a child component. Every page in this app awaits in its script, which is exactly why its failures belong to `+error.svelte`.'
			},

			{
				type: 'warn',
				title: 'Trap one: pending on the server',
				text: 'A `pending` snippet renders **immediately during server rendering and does not wait for the awaits**. Put one on a boundary that wraps a whole page and every page in your app ships HTML whose entire body is the word "Loading…". The page looks fine in a browser — it hydrates a moment later — and is empty to a search engine, a link preview, and anybody on a slow connection. We shipped that for an hour before noticing.'
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
				file: 'nine lines that reproduce it',
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
				text: 'One more, because it produces a symptom that makes no sense — radio buttons that will not stay selected — and because the real fix turned out to be deleting the code.'
			},
			{
				type: 'p',
				text: 'The booking page used to forget the chosen time whenever the service, the person or the day changed, because a time picked for one of those means nothing for another. The obvious effect for that:'
			},
			{
				type: 'code',
				file: 'the bug',
				lang: 'ts',
				code: `
$effect(() => {
	void service?.id;
	void staffId;
	void selectedDay;
	// set() reads the field's current value internally, so this effect also
	// depends on the very thing it writes. Pick a time, the field changes, the
	// effect wakes up and clears it again: the selection never survives a frame.
	book.fields.slot.set('');
});`
			},
			{
				type: 'p',
				text: 'The first fix was `untrack`, which says "run this, but do not count what it reads as a dependency". Wrapped in it, the `set` no longer subscribed the effect to the field, and the three `void` lines were left as the only things that re-ran it:'
			},
			{
				type: 'code',
				file: 'the first fix — since deleted',
				lang: 'ts',
				code: `
$effect(() => {
	void service?.id;
	void staffId;
	void selectedDay;
	untrack(() => book.fields.slot.set(''));
});`
			},
			{
				type: 'p',
				text: 'It worked, and it was still the wrong shape. A second effect beside it cleared the field again when the live grid dropped the chosen time. Both were *state written in reaction to other state*, which is the one job the Svelte docs tell you not to give an effect: "Effects are an escape hatch and should mostly be avoided. In particular, avoid updating state inside effects." What the page actually needed to know was not "has something changed since the time was picked" but "is the picked time on screen right now" — and that is a value you can derive.'
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'ts',
				code: `
const selectedValue = $derived(book.fields.slot.value());
const selected = $derived(daySlots.find((slot) => slotValue(slot) === selectedValue) ?? null);`
			},
			{
				type: 'p',
				text: '`selected` is the chosen slot if it is one of the times on screen, and `null` otherwise. Look at another day, narrow to another person, or lose the time to somebody else, and it becomes `null` — no effect, no `untrack`, no clearing — and the summary, the time-zone note and the details form all follow it. Nothing writes state in response to anything, so nothing can wake itself up.'
			},
			{
				type: 'why',
				title: 'When untrack is still the answer',
				text: '`untrack` is not a smell; an effect writing state is. Keep it for an effect with a genuine side effect — talking to a library, the DOM, the network — that has to read something without subscribing to it. If the thing you are writing could be a `$derived` instead, make it one, and the trap disappears along with the effect.'
			},

			{ type: 'h3', id: 'why-worth-it', text: 'Why this is worth the sharp edges' },
			{
				type: 'p',
				text: 'In SvelteKit 2, data that arrived late came from a `load` function that returned a promise without awaiting it, and the page unwrapped it with `{#await}`. Even with runes, every component that wanted the value wrote its own three states:'
			},
			{
				type: 'code',
				file: 'before — SvelteKit 2',
				lang: 'svelte',
				code: `
<script>
	let { data } = $props();
</script>

{#await data.availability}
	<p>Loading…</p>
{:then availability}
	<TimesList {availability} />
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

<TimesList {availability} />`
			},
			{
				type: 'p',
				text: 'The loading and error states did not disappear — they moved to a boundary, where they are written once for a whole region instead of once per await. Multiply that across a dozen components and it is a different codebase. (`TimesList` is a stand-in for any component that takes the data, not a file in this project; the real slot grid takes one day\'s slots, a zone and a form field.)'
			},

			{
				type: 'checkpoint',
				text: 'Every page in the app server-renders its real content — view source and see the studio name, not "Loading…". Then open `/booking/ZZZZZZZZZZZZZZZZZZZZZZZZZZ`, once by typing it and once by following a link to it from inside the app: both times you get your own failure screen, headed "Not found", saying "We could not find that booking."'
			}
		]
	}
];
