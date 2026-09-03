/**
 * PART 7 — SvelteKit 3 in anger
 * (chapters 31–35)
 *
 * Remote functions, live queries, progressive forms, the two universal hooks,
 * and an i18n layer with no library in it. This is the part of the course that
 * is most specifically about the framework — and the running theme is that the
 * new APIs mostly let you delete a category of bug rather than write less code.
 */

export const part7 = [
	{
		slug: 'remote-functions',
		title: 'Remote functions',
		summary:
			'`query`, `command` and `form` from `$app/server` — what replaces most of an API, and the one job left for a real endpoint.',
		goal: 'Call the server as if it were a function, with validation, CSRF and types for free.',
		blocks: [
			{
				type: 'p',
				text: 'Tessera has exactly two API routes. Everything else that would have been an endpoint is a **remote function**: an `async` function you export from a `.remote.ts` file and *import into a component*, where calling it performs a typed, validated, CSRF-protected request.'
			},
			{
				type: 'code',
				file: 'src/lib/remote/sync.remote.ts',
				lang: 'ts',
				code: `
/**
 * SYNC
 * ====
 *
 * The client's two outbound calls. Everything inbound arrives on the SSE stream
 * in \`routes/api/boards/[board]/stream/+server.ts\`.
 *
 * Both are \`command()\` rather than \`form()\` or a hand-written endpoint, which
 * buys three things without any code: the payload is validated by the same
 * valibot schema the client imports, the CSRF origin check runs, and the call is
 * typed end to end so a change to \`PushSchema\` breaks the caller at build time.
 */`
			},
			{
				type: 'p',
				text: 'Three things without any code: the payload is validated by the same valibot schema the client imports, the CSRF origin check runs, and the call is typed end to end — so a change to `PushSchema` breaks the caller at build time rather than at runtime in production.'
			},
			{
				type: 'code',
				file: 'src/lib/remote/sync.remote.ts',
				lang: 'ts',
				code: `
/**
 * Push a batch of operations.
 *
 * Returns the board's watermark, which is the *only* thing the client advances
 * its cursor to. Advancing per operation is how a gap gets skipped — see the
 * note in \`crdt/version.ts\`, which cost an afternoon.
 */
export const pushOps = command(PushSchema, async ({ boardId, actor, ops }) => {
	const user = requireUser();

	const access = await requireAccess(boardId, user.id, 'editor').catch((thrown: unknown) => {
		if (thrown instanceof AccessError) error(thrown.status, thrown.message);
		throw thrown;
	});

	try {
		return await ingest({ boardId, userId: user.id, role: access.role, actor, ops });
	} catch (thrown) {
		/*
		 * A refusal is data, not a crash.
		 *
		 * The client has already applied these operations locally — that is what
		 * local-first means — so it needs a status it can act on: 403 means "stop
		 * and reload", 422 means "your clock is wrong and this will keep happening".
		 * A 500 would tell it to retry forever.
		 */
		if (thrown instanceof IngestError) error(thrown.status, thrown.message);
		throw thrown;
	}
});`
			},
			{
				type: 'why',
				title: 'A refusal is data, not a crash',
				text: 'The client has already applied these operations locally — that is what local-first means — so it needs a status it can *act on*. 403 means "stop and reload". 422 means "your clock is wrong and this will keep happening". A 500 would tell it to retry forever, which for a permanent failure is a client that hammers the server until the tab closes. The `IngestError` → `error(status, message)` translation is three lines and it is what makes `#onPushFailure` in chapter 24 able to distinguish retryable from not.'
			},

			{ type: 'h3', id: 'query', text: '`query`' },
			{
				type: 'code',
				file: 'src/lib/remote/boards.remote.ts',
				lang: 'ts',
				code: `
/**
 * Open a board.
 *
 * Returns a \`LoadedBoard\`, which is a class registered with the \`transport\`
 * hook — so the browser gets an object that can \`hydrate()\` itself into a
 * reactive document rather than a bag of fields plus a convention.
 */
export const openBoard = query(boardId, async (id) => {
	const user = requireUser();

	const access = await requireAccess(id, user.id, 'viewer').catch(rethrow);

	const rows = await db
		.select({ title: board.title, snapshot: board.snapshot, snapshotSeq: board.snapshotSeq })
		.from(board)
		.where(eq(board.id, id))
		.limit(1);

	const found = rows[0];
	if (!found) error(404, 'No such board.');

	return new LoadedBoard(
		id,
		found.title,
		found.snapshot ? parseSnapshot(JSON.parse(found.snapshot)) : emptySnapshot(),
		found.snapshotSeq,
		access.role
	);
});`
			},
			{
				type: 'p',
				text: 'Note how little it does. It reads a row and returns it. It does **not** replay operations, build a document, or hold a CRDT in memory — the client streams everything after that sequence and applies it itself, which it has to be able to do anyway because that is the same path every subsequent edit takes.'
			},
			{
				type: 'code',
				file: 'src/lib/remote/boards.remote.ts',
				lang: 'ts',
				code: `
/**
 * BOARDS
 * ======
 *
 * Opening a board deliberately does almost nothing.
 *
 * The server returns the stored snapshot and the sequence it is current to, and
 * stops. It does not replay operations, does not build a document, does not hold
 * a CRDT in memory. The client streams everything after that sequence from
 * \`/api/boards/[board]/stream\` and applies it itself — which it has to be able
 * to do anyway, because that is the same path every subsequent edit takes.
 *
 * The alternative is a server that materialises the current state on every open.
 * It looks tidier and it means the server now has an opinion about the document,
 * which has to agree with the client's opinion forever. When two authorities
 * disagree about a CRDT, the one with the database usually wins, and the user's
 * unsynced work is what loses.
 */`
			},
			{
				type: 'warn',
				text: 'The alternative — a server that materialises the current state on every open — looks tidier and gives the server an **opinion about the document**, which then has to agree with the client’s opinion forever. When two authorities disagree about a CRDT, the one with the database usually wins, and the user’s unsynced work is what loses.'
			},

			{ type: 'h3', id: 'transport', text: 'Returning something with behaviour' },
			{
				type: 'p',
				text: '`openBoard` returns a `LoadedBoard`, which is a *class*. That works because of the `transport` hook, and it is worth seeing what it buys.'
			},
			{
				type: 'code',
				file: 'src/lib/board/loaded.ts',
				lang: 'ts',
				code: `
/**
 * What the server hands over when a board is opened.
 *
 * A class rather than a plain object, and registered with the \`transport\` hook,
 * so that the thing arriving in the browser knows how to turn itself into a
 * working document. The alternative is every call site doing
 * \`BoardDocument.fromSnapshot(actorId(), result.snapshot)\` and one of them
 * eventually forgetting the actor.
 */

import type { ActorId } from '#lib/crdt/index.ts';
import type { Role } from '#lib/server/roles.ts';
import { BoardDocument } from './document.svelte';
import { parseSnapshot, type BoardSnapshot } from './snapshot.ts';

export class LoadedBoard {
	readonly id: string;
	readonly title: string;
	readonly snapshot: BoardSnapshot;
	/**
	 * The sequence the snapshot is current to.
	 *
	 * The client streams from here. Getting it wrong in the safe direction (too
	 * low) costs a few redundant operations; wrong in the other direction silently
	 * loses everything in between, which is the kind of bug that shows up as
	 * "sometimes a box I definitely drew is missing".
	 */
	readonly watermark: number;
	readonly role: Role;

	constructor(id: string, title: string, snapshot: BoardSnapshot, watermark: number, role: Role) {
		this.id = id;
		this.title = title;
		this.snapshot = snapshot;
		this.watermark = watermark;
		this.role = role;
	}

	get readOnly(): boolean {
		return this.role === 'viewer' || this.role === 'commenter';
	}

	/** Build the reactive document for this replica. */
	hydrate(actor: ActorId): BoardDocument {
		return BoardDocument.fromSnapshot(actor, this.snapshot);
	}`
			},
			{
				type: 'code',
				file: 'src/hooks.ts',
				lang: 'ts',
				code: `
/**
 * Custom types that survive the server/client boundary.
 *
 * **Read this before adding an entry.** SvelteKit serialises with devalue, which
 * already handles \`Date\`, \`Map\`, \`Set\`, \`RegExp\`, \`BigInt\`, \`URL\`, \`Infinity\`,
 * \`NaN\`, \`-0\` and cyclic references. Most reaching for \`transport\` is
 * unnecessary, and every unnecessary entry is a pair of functions that can drift
 * apart. Both entries below carry *behaviour*, which is the thing devalue
 * genuinely cannot reconstruct.
 *
 * \`encode\` returns a falsy value for anything it does not recognise, so the
 * order of these checks does not matter and a value only ever matches one.
 */
export const transport: Transport = {
	/**
	 * The board itself. \`decode\` gives the browser an object that knows how to
	 * build a reactive document from the snapshot it is carrying, so no component
	 * has to remember the actor id.
	 */
	LoadedBoard: {
		encode: (value) => value instanceof LoadedBoard && value.toTuple(),
		decode: (tuple) => LoadedBoard.fromTuple(tuple)
	},

	/**
	 * One entry in the version history. It arrives with \`describe()\` attached, so
	 * the list component formats a revision by asking it rather than by
	 * re-implementing the rules next to the markup.
	 */
	BoardRevision: {
		encode: (value) => value instanceof BoardRevision && value.toTuple(),
		decode: (tuple) => BoardRevision.fromTuple(tuple)
	}
};`
			},
			{
				type: 'note',
				text: 'Read the warning at the top of that block before adding an entry of your own. SvelteKit serialises with devalue, which already handles `Date`, `Map`, `Set`, `RegExp`, `BigInt`, `URL`, `Infinity`, `NaN`, `-0` and cyclic references. Most reaching for `transport` is unnecessary, and every unnecessary entry is a pair of functions that can drift apart. Both entries here carry **behaviour**, which is the thing devalue genuinely cannot reconstruct.'
			},
			{
				type: 'p',
				text: 'The payoff: the browser gets an object that can `hydrate()` itself into a reactive document. The alternative is every call site doing `BoardDocument.fromSnapshot(actorId(), result.snapshot)` and one of them eventually forgetting the actor — which, per chapter 21, is a bug that presents as typing occasionally vanishing.'
			},

			{ type: 'h3', id: 'the-two-endpoints', text: 'What is left for a real endpoint' },
			{
				type: 'ul',
				items: [
					'**`/api/boards/[board]/stream`** — a `GET` that never ends. A remote function returns a value; this returns a `ReadableStream` that stays open for hours.',
					'**`/api/boards/[board]/snapshot`** — a document, fetched by an embedded custom element on somebody else’s page, which has no SvelteKit client to call a remote function with.'
				]
			},
			{
				type: 'p',
				text: 'That is a useful rule of thumb for the whole feature: **a remote function replaces a request/response endpoint. It does not replace a stream or a public document.**'
			},

			{
				type: 'checkpoint',
				items: [
					'You can call the server from a component with no `fetch`, no route and no manual types.',
					'Changing a schema breaks the caller at build time.',
					'You can name the two things a remote function is not for.'
				]
			}
		]
	},

	{
		slug: 'live-queries-and-forms',
		title: 'Live queries, and forms that work without JavaScript',
		summary:
			'`query.live` as an async generator, `form()` versus `command()`, and the asymmetry that keeps the person who pressed the button fast.',
		goal: 'Push data without a socket where a query fits, and make creation work before the bundle has loaded.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/remote/boards.remote.ts',
				lang: 'ts',
				code: `
/**
 * Every board this person can see, most recently touched first.
 *
 * A live query: creating a board in one tab makes it appear in another, and an
 * invitation accepted elsewhere adds the whole workspace without a reload. The
 * generator wakes on a poll rather than on a database notification because
 * libSQL has no \`LISTEN\`, and the list is cheap; the *operation* stream is where
 * push matters, and it has its own channel.
 */
export const myBoards = query.live(async function* () {
	const user = requireUser();

	const read = async () =>
		db
			.select({
				id: board.id,
				title: board.title,
				updatedAt: board.updatedAt,
				workspaceName: workspace.name,
				role: membership.role
			})
			.from(board)
			.innerJoin(workspace, eq(workspace.id, board.workspaceId))
			.innerJoin(membership, eq(membership.workspaceId, board.workspaceId))
			.where(eq(membership.userId, user.id))
			.orderBy(desc(board.updatedAt))
			.limit(200);

	yield await read();

	/*
	 * A five-second poll, and an honest one.
	 *
	 * \`query.live\` streams whatever the generator yields, so this could be driven
	 * by an event just as easily. It is not, because the board list is a page
	 * people leave open in a background tab: an event bus for it would be
	 * infrastructure serving a list that changes a few times an hour.
	 */
	while (true) {
		await new Promise((resolve) => setTimeout(resolve, 5_000));
		yield await read();
	}
});`
			},
			{
				type: 'p',
				text: '`query.live` takes an **async generator**. Whatever it yields is streamed to every subscribed client. Creating a board in one tab makes it appear in another; an invitation accepted elsewhere adds the whole workspace without a reload.'
			},
			{
				type: 'why',
				title: 'A five-second poll, said out loud',
				text: 'The generator could just as easily be driven by an event. It is not, and the comment says why: the board list is a page people leave open in a background tab, and it changes a few times an hour. An event bus for it would be infrastructure serving a list nobody is watching. **The operation stream is where push matters, and it has its own channel** — which is the honest way to make this trade rather than reaching for the same mechanism everywhere.'
			},

			{ type: 'h3', id: 'reconnect', text: 'Refreshing a live query' },
			{
				type: 'code',
				file: 'src/lib/remote/boards.remote.ts',
				lang: 'ts',
				code: `
/**
 * Create a board.
 *
 * A \`form()\`, not a \`command()\`, for one reason: it works with JavaScript
 * switched off. The markup is a real \`<form>\` with a real submit button, so a
 * browser that has not run — or has failed to run — the client bundle still
 * creates the board and follows the redirect. With JavaScript, SvelteKit
 * intercepts the submission and there is no page load.
 *
 * That is not a hypothetical audience. It is every visitor during the seconds
 * before hydration finishes, which on a slow connection is the whole of their
 * first impression.
 */
export const createBoard = form(
	v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)), title }),
	async ({ workspaceId, title: name }) => {
		const user = requireUser();

		const rows = await db
			.select({ role: membership.role })
			.from(membership)
			.where(and(eq(membership.workspaceId, workspaceId), eq(membership.userId, user.id)))
			.limit(1);

		const role = rows[0]?.role;
		if (!role) error(404, 'No such workspace.');
		if (role === 'viewer' || role === 'commenter') error(403, 'You cannot create boards here.');

		const id = crypto.randomUUID();
		await db.insert(board).values({ id, workspaceId, title: name });

		/*
		 * Refresh the list for this client only, in the same round trip.
		 *
		 * Everybody else finds out from their own live query on its next tick. That
		 * asymmetry is deliberate: the person who pressed the button should never
		 * see a delay, and everybody else can wait five seconds for a board that did
		 * not exist a moment ago.
		 */
		await myBoards().reconnect();

		/*
		 * Redirect from the server rather than returning the id for the client to
		 * navigate with. It is what the form does with JavaScript switched off, and
		 * making the enhanced path do something different is how two code paths
		 * drift until only one of them is ever exercised.
		 */
		redirect(303, \`/boards/\${id}\`);
	}
);`
			},
			{
				type: 'p',
				text: '`await myBoards().reconnect()` refreshes the live query **for this client only, in the same round trip**. Everybody else finds out from their own generator on its next tick. That asymmetry is deliberate: the person who pressed the button should never see a delay, and everybody else can wait five seconds for a board that did not exist a moment ago.'
			},
			{
				type: 'note',
				text: 'In SvelteKit 3 this is `reconnect()`. If you have written `refresh()` on a live query before, that is the name that changed, and the error is a runtime `is not a function` rather than a type error, because the object is created dynamically.'
			},

			{ type: 'h3', id: 'form-vs-command', text: '`form()` versus `command()`' },
			{
				type: 'p',
				text: '`createBoard` above is a `form()`, and `renameBoard` next to it is a `command()`. The difference is one sentence: **a `form()` works with JavaScript switched off.**'
			},
			{
				type: 'ul',
				items: [
					'The markup is a real `<form>` with a real submit button, so a browser that has not run — or has failed to run — the client bundle still creates the board and follows the redirect.',
					'With JavaScript, SvelteKit intercepts the submission and there is no page load.',
					'Spread it into the element (`<form {...createBoard}>`) and the action, method and enhancement are all set for you.'
				]
			},
			{
				type: 'p',
				text: 'That is not a hypothetical audience. It is every visitor during the seconds before hydration finishes, which on a slow connection is the whole of their first impression.'
			},
			{
				type: 'warn',
				text: 'Note the `redirect(303, …)` from the server rather than returning the id for the client to navigate with. It is what the form does with JavaScript switched off, and making the enhanced path do something *different* is how two code paths drift until only one of them is ever exercised — and it is always the enhanced one, because that is the one you test in.'
			},

			{ type: 'h3', id: 'form-for', text: 'One definition, many instances' },
			{
				type: 'code',
				lang: 'svelte',
				code: `
{#each open as thread (thread.id)}
	{@const reply = postComment.for(thread.id)}
	<form {...reply} class="thread__reply-form">
		<input {...reply.fields.boardId.as('hidden', boardId)} />
		<input {...reply.fields.parentId.as('hidden', thread.id)} />
		<input id="reply-{thread.id}" {...reply.fields.body.as('text')} placeholder="Reply…" />
		<Button size="sm" type="submit">{t.comments.post}</Button>
	</form>
{/each}`
			},
			{
				type: 'p',
				text: '`postComment.for(thread.id)` gives every thread its own form instance from one definition. Each keeps its own pending state and its own validation issues, so a failed reply in one thread does not put an error message under every other one. Spreading the bare `postComment` into a loop gives every thread the same instance and exactly that bug — which chapter 36 shows in full.'
			},
			{
				type: 'p',
				text: 'And `fields.x.as(\'hidden\', value)` spreads name, value and type together, so a renamed field is a build error rather than a silently missing parameter.'
			},

			{
				type: 'checkpoint',
				items: [
					'A board created in one tab appears in another without a reload.',
					'Creating a board works with JavaScript disabled.',
					'Two forms rendered from one definition have independent error state.'
				]
			}
		]
	},

	{
		slug: 'hooks-and-routing',
		title: 'The hooks, and a URL that is three things',
		summary:
			'`reroute` on both sides, `params.ts` with Standard Schema matchers, `+page@.svelte`, and a three-letter route segment that broke every board.',
		goal: 'Make `/b/x`, `/fr/boards` and `/boards` all resolve correctly, before the router sees them.',
		blocks: [
			{
				type: 'code',
				file: 'src/hooks.ts',
				lang: 'ts',
				code: `
/**
 * UNIVERSAL HOOKS
 * ===============
 *
 * \`hooks.server.ts\` runs on the server. \`hooks.client.ts\` runs in the browser.
 * This one runs in **both**, which is exactly what its two exports need: a URL
 * must resolve to the same route whether the navigation was rendered on the
 * server or handled by the client router, and a value must be encoded and
 * decoded by the same pair of functions on either side of the wire.
 */`
			},
			{
				type: 'p',
				text: '`hooks.server.ts` runs on the server. `hooks.client.ts` runs in the browser. This one runs in **both** — which is exactly what its two exports need. A URL must resolve to the same route whether the navigation was rendered on the server or handled by the client router, and a value must be encoded and decoded by the same pair of functions on either side of the wire.'
			},
			{
				type: 'code',
				file: 'src/hooks.ts',
				lang: 'ts',
				code: `
/**
 * Rewrite the URL before the router looks at it.
 *
 * Two jobs, and neither could be done by the route tree:
 *
 * **Short links.** \`/b/<id>\` is what gets pasted into chat, and it resolves to
 * the same page as \`/boards/<id>\` without a redirect — so the address bar keeps
 * the short form and there is no extra round trip. A \`+page.server.ts\` that
 * threw a \`redirect()\` would cost both.
 *
 * **Unsupported languages.** \`[[lang=locale]]\` is matched by \`params.ts\`, so
 * \`/de/boards\` matches nothing and 404s. A German speaker whose browser sent them
 * there deserves the application in English rather than an error page, so
 * anything that *looks* like a language tag and is not one gets stripped —
 * except this application's own top-level segments, which is a distinction that
 * cost an afternoon (see \`RESERVED\`).
 *
 * The function is pure and synchronous. It is allowed to be async, and making it
 * so would put a network round trip in front of every navigation on both sides —
 * a tempting place to put a lookup table, and a very expensive one.
 */
export const reroute: Reroute = ({ url }) => {
	if (url.pathname === '/b' || url.pathname.startsWith('/b/')) {
		return \`/boards\${url.pathname.slice(2)}\`;
	}

	const language = LANGUAGE_LIKE.exec(url.pathname);
	if (
		language &&
		!RESERVED.has(language[1]!) &&
		!(LOCALES as readonly string[]).includes(language[1]!)
	) {
		const rest = url.pathname.slice(language[0].length - (language[2] === '/' ? 1 : 0));
		return rest === '' ? '/' : rest;
	}

	// \`void\` — the URL is fine as it is. Returning \`url.pathname\` would work and
	// would make every navigation look like a rewrite in the devtools.
	return;
};`
			},
			{
				type: 'p',
				text: 'Two jobs, neither of which the route tree can do. **Short links**: `/b/<id>` is what gets pasted into chat, and it resolves to the same page as `/boards/<id>` without a redirect — so the address bar keeps the short form and there is no extra round trip. **Unsupported languages**: `/de/boards` matches nothing and would 404, and a German speaker whose browser sent them there deserves the application in English rather than an error page.'
			},

			{ type: 'h3', id: 'the-api-bug', text: 'Three lowercase letters' },
			{
				type: 'code',
				file: 'src/hooks.ts',
				lang: 'ts',
				code: `
/** Matches a two-or-three letter first segment that looks like a language tag. */
const LANGUAGE_LIKE = /^\\/([a-z]{2,3})(?:-[A-Za-z]{2,4})?(\\/|$)/;

/**
 * First segments that are this application's own, and must never be mistaken for
 * a language.
 *
 * This list exists because of a real bug. The fallback below strips anything
 * that *looks* like a language tag and is not one — and \`api\` is three lowercase
 * letters. Every request to \`/api/boards/…/stream\` was quietly rewritten to
 * \`/boards/…/stream\` and answered 404, so boards loaded, rendered their chrome,
 * and then sat empty while the browser retried a stream that could never exist.
 * Nothing logged an error; the reroute was doing exactly what it was told.
 *
 * Deriving this from the route manifest would be tidier and is not possible: the
 * universal hook runs in the browser too, where the manifest is not available.
 * A short explicit list, next to the code that needs it, is the honest version.
 */
const RESERVED = new Set(['api', 'b', 'embed']);`
			},
			{
				type: 'warn',
				text: 'This is the best bug in the project, because the code was doing exactly what it was told. `api` is three lowercase letters, which is what a language tag looks like. Every request to `/api/boards/…/stream` was quietly rewritten to `/boards/…/stream` and answered 404 — so boards loaded, rendered their chrome, and then sat empty while the browser retried a stream that could never exist. Nothing logged an error anywhere.'
			},
			{
				type: 'p',
				text: 'The tidier fix — derive the list from the route manifest — is not possible: the universal hook runs in the browser too, where the manifest is not available. A short explicit list next to the code that needs it is the honest version.'
			},
			{
				type: 'note',
				text: '`reroute` is allowed to be `async`. Resist it. Making it so puts a network round trip in front of **every navigation on both sides** — it is a tempting place for a lookup table and a very expensive one. And returning `void` rather than `url.pathname` when nothing changes keeps the devtools from showing every navigation as a rewrite.'
			},

			{ type: 'h3', id: 'params', text: 'Matchers are one file now' },
			{
				type: 'code',
				file: 'src/params.ts',
				lang: 'ts',
				code: `
import { defineParams } from '@sveltejs/kit/params';
import * as v from 'valibot';
import { LOCALES } from '#lib/i18n/index.ts';

/**
 * PARAMETER MATCHERS
 * ==================
 *
 * One file, not a folder.
 *
 * SvelteKit 2 had \`src/params/locale.js\`, each matcher its own module exporting
 * \`match(param) { return … }\`. SvelteKit 3 replaced that with a single
 * \`src/params.ts\` exporting \`params\` from \`defineParams\`, and the failure if you
 * bring the old layout forward is \`No matcher found for parameter 'locale'\` at
 * build time — from a directory that looks exactly right.
 *
 * The change is worth more than tidiness. A definition here is a **Standard
 * Schema**, so it can *transform*: \`params.lang\` reaches a load function typed
 * as \`Locale\` rather than \`string\`, and there is no second validation step for
 * anybody to forget. A plain predicate still works — \`defineParams\` accepts a
 * function too — but only a schema carries the type through.
 */
export const params = defineParams({
	/**
	 * The optional language segment at the front of every route.
	 *
	 * The route is \`[[lang=locale]]\`, so \`/fr/boards\` gives \`params.lang === 'fr'\`
	 * and \`/boards\` gives \`undefined\`. Without the matcher the optional parameter
	 * would swallow the first segment of every URL — \`/boards\` would parse as the
	 * language "boards" and then 404 at the second segment, which is a genuinely
	 * baffling half-hour.
	 *
	 * It also means the *router* enforces the language list, so no page has to
	 * defend against an unsupported one. \`hooks.ts\` catches those first and
	 * rewrites them away, turning a 404 into the application in English.
	 */
	locale: v.picklist(LOCALES)
});`
			},
			{
				type: 'warn',
				text: 'SvelteKit 2 had `src/params/locale.js`, each matcher its own module exporting `match(param)`. SvelteKit 3 replaced that with a single `src/params.ts` exporting `params` from `defineParams`. Bring the old layout forward and the failure is `No matcher found for parameter \'locale\'` at build time — from a directory that looks exactly right.'
			},
			{
				type: 'why',
				title: 'The change is worth more than tidiness',
				text: 'A definition here is a **Standard Schema**, so it can *transform*. `params.lang` reaches a load function typed as `Locale` rather than `string`, and there is no second validation step for anybody to forget. A plain predicate still works — `defineParams` accepts a function too — but only a schema carries the type through.'
			},
			{
				type: 'p',
				text: 'And note the second-order effect: the **router** enforces the language list, so no page has to defend against an unsupported one. Without the matcher, the optional parameter would swallow the first segment of every URL — `/boards` would parse as the language "boards" and then 404 at the second segment, which is a genuinely baffling half-hour.'
			},

			{ type: 'h3', id: 'layout-reset', text: 'The bare `@`' },
			{
				type: 'terminal',
				code: `
routes/
  +layout.svelte                        site chrome: header, footer, nav
  [[lang=locale]]/
    +layout.svelte                      language context
    boards/+page.svelte                 ← inherits both layouts
    boards/[board]/+page@.svelte        ← inherits NEITHER`
			},
			{
				type: 'p',
				text: '`+page@.svelte` with a bare `@` resets layout inheritance to the root. The editor is a full-viewport application: it does not want a site header taking sixty pixels off the top of a canvas, and it does not want the footer at all. Its siblings do.'
			},
			{
				type: 'p',
				text: 'The alternative — a `hideChrome` prop threaded through two layouts — works and puts one route’s special case into the code every other route runs. The `@` is one character in a filename.'
			},

			{ type: 'h3', id: 'server-hooks', text: 'The server side' },
			{
				type: 'code',
				file: 'src/hooks.server.ts',
				lang: 'ts',
				code: `
/**
 * SERVER HOOKS
 * ============
 *
 * Four handlers, composed with \`sequence\`, in an order that matters:
 *
 *   1. locale    — needed by everything that renders text, including errors
 *   2. auth      — populates \`locals.user\`, and owns \`/api/auth/*\`
 *   3. security  — headers, including the two the export worker cannot run without
 *   4. resolve   — the rest of the app
 *
 * Getting (1) after (2) would mean an unauthenticated error page renders in
 * English for a French visitor, which is a small thing that reads as carelessness.
 */

import { building } from '$app/env';
/*
 * SvelteKit 3 moved every hook type into \`@sveltejs/kit/hooks\`. Importing them
 * from \`@sveltejs/kit\` compiles to \`any\` for each destructured argument — which
 * is not an error, so the file keeps working and every parameter silently loses
 * its type.
 */
import {
	sequence,
	type Handle,
	type HandleServerError,
	type ServerInit
} from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '#lib/server/auth.ts';
import { DEFAULT_LOCALE, HTML_LANG, isLocale, negotiate, type Locale } from '#lib/i18n/index.ts';`
			},
			{
				type: 'warn',
				text: 'SvelteKit 3 moved every hook type into `@sveltejs/kit/hooks`. Importing them from `@sveltejs/kit` compiles to `any` for each destructured argument — which is **not an error**, so the file keeps working and every parameter silently loses its type. That is worth a grep in any project you migrate.'
			},
			{
				type: 'p',
				text: 'The order in that comment is the content of the block. Locale first, because everything that renders text needs it — *including error pages*. Get it after auth and an unauthenticated error page renders in English for a French visitor, which is a small thing that reads as carelessness.'
			},
			{
				type: 'code',
				file: 'src/hooks.server.ts',
				lang: 'ts',
				code: `
/**
 * Turn an unexpected throw into something a person can quote back to us.
 *
 * The \`id\` is the only part shown to the user; the rest goes to the log. Sending
 * a stack trace to the browser tells an attacker the shape of the codebase, and
 * tells everybody else nothing.
 */
export const handleError: HandleServerError = ({ error, event, kind }) => {
	/*
	 * \`kind\` rather than a status code.
	 *
	 * SvelteKit 3 discriminates the three cases that used to be inferred from a
	 * number: \`app\` is a deliberate \`error(...)\` call and already says what it
	 * means, \`framework\` is a 404 or a malformed request, and \`unknown\` is
	 * something genuinely broken. Only the last is worth a log line and an id —
	 * writing a correlation id for every 404 buries the one that matters.
	 */
	if (kind !== 'unknown') return;

	const id = crypto.randomUUID();
	console.error(\`[\${id}] \${event.request.method} \${event.url.pathname}\`, error);

	// Only the overrides. Anything omitted keeps SvelteKit's default, so there is
	// no need to restate the status or invent a message for a case we did not
	// mean to handle.
	return { message: 'Something went wrong on our side.', id };
};
`
			},
			{
				type: 'p',
				text: '`handleError` takes `{ error, event, kind }` in SvelteKit 3, and `kind` discriminates the three cases that used to be inferred from a status code. `app` is a deliberate `error(...)` call and already says what it means. `framework` is a 404 or a malformed request. `unknown` is something genuinely broken — and only that one is worth a log line and a correlation id, because writing an id for every 404 buries the one that matters.'
			},

			{
				type: 'checkpoint',
				items: [
					'`/b/abc` and `/boards/abc` render the same page, and the address bar keeps what was typed.',
					'`/de/boards` shows the application in English rather than a 404.',
					'The editor route has no site chrome and its siblings do.'
				]
			}
		]
	},

	{
		slug: 'i18n',
		title: 'Three languages, no library',
		summary:
			'A catalogue is an object, a message is a value or a function, and the one keyword that would collapse the whole scheme.',
		goal: 'Type-check every message and every argument, and express a language that has no plurals.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/i18n/index.ts',
				lang: 'ts',
				code: `
/**
 * TRANSLATION
 * ===========
 *
 * No library, no message compiler, no ICU parser. A catalogue is an object, a
 * message is a value or a function, and \`t\` is the catalogue for the current
 * language.
 *
 * That is not minimalism for its own sake — it buys three things a runtime
 * interpolator cannot:
 *
 *   - \`t.board.nodes(3)\` is checked. Passing a string, or forgetting the
 *     argument, is a build error rather than \`{count}\` on somebody's screen.
 *   - Renaming a key is a rename, across every catalogue, with the compiler
 *     listing what is left.
 *   - Plurals are expressed in the language's own terms. Japanese has none, and
 *     its catalogue simply does not branch — which no \`one{}/other{}\` scheme can
 *     represent without lying.
 *
 * The cost is that translators edit TypeScript. For an application with three
 * languages maintained by the team that writes the code, that is the right
 * trade. It stops being right the moment translation is outsourced, and at that
 * point these files export to JSON and the accessors stay identical.
 */`
			},
			{
				type: 'p',
				text: 'No message compiler, no ICU parser, no runtime interpolator. That is not minimalism for its own sake — it buys three things a runtime interpolator cannot, and the third is the one people underestimate.'
			},
			{
				type: 'code',
				file: 'src/lib/i18n/messages/en.ts',
				lang: 'ts',
				code: `
/**
 * The source language.
 *
 * Its type *is* the contract: every other catalogue is checked against it with
 * \`satisfies\`, so a key added here and forgotten in French is a build error
 * rather than the word \`board.untitled\` appearing in somebody's interface.
 *
 * Values are functions where they take arguments. That is deliberate — the
 * alternative is \`"{count} selected"\` and a runtime interpolator, which cannot
 * be type-checked, cannot express Japanese having no plural, and turns a missing
 * argument into a literal \`{count}\` on screen.
 *
 * Note the absence of \`as const\`. It is tempting, and it makes the whole scheme
 * collapse: with it, \`Messages\` says \`boards: 'Boards'\` — the *literal* — and
 * \`satisfies Messages\` then demands that the French catalogue also say
 * \`'Boards'\`. Every translated line becomes a type error. Without it the strings
 * widen to \`string\`, the function signatures are kept, and the shape is what is
 * checked. Which is what we wanted to check.
 */
export const en = {
	app: {
		name: 'Tessera',
		tagline: 'Diagrams that stay in step'
	},

	nav: {
		boards: 'Boards',
		signIn: 'Sign in',
		signOut: 'Sign out',
		language: 'Language'
	},

	board: {
		untitled: 'Untitled board',
		create: 'New board',
		open: 'Open',
		empty: 'Nothing here yet. Press N to add your first box.',
		nodes: (count: number) => (count === 1 ? '1 shape' : \`\${count} shapes\`),
		lastEdited: (when: string) => \`Edited \${when}\`
	},`
			},
			{
				type: 'warn',
				text: 'The absence of `as const` is the most important line in that comment. With it, `Messages` says `boards: \'Boards\'` — the **literal** — and `satisfies Messages` then demands that the French catalogue also say `\'Boards\'`. Every translated line becomes a type error. Without it the strings widen to `string`, the function signatures are kept, and the *shape* is what is checked. Which is what we wanted to check.'
			},
			{
				type: 'why',
				title: 'Plurals in the language’s own terms',
				text: '`nodes: (count) => count === 1 ? \'1 shape\' : `${count} shapes`` is not a workaround for a missing plural system. Japanese has no plural forms, and its catalogue simply does not branch — which no `one{}/other{}` scheme can represent without lying, because it forces you to write the same string twice and pretend they are different cases. A function is the general form; ICU is a special case of it that happens to be data.'
			},
			{
				type: 'p',
				text: 'And the honest limit is stated too: **the cost is that translators edit TypeScript.** For three languages maintained by the team that writes the code, that is the right trade. It stops being right the moment translation is outsourced, and at that point these files export to JSON and the accessors stay identical.'
			},

			{ type: 'h3', id: 'the-three-languages', text: 'Why these three' },
			{
				type: 'code',
				file: 'src/lib/i18n/locales.ts',
				lang: 'ts',
				code: `
/**
 * The languages Tessera ships.
 *
 * Three, chosen to cover the three shapes that break a naive interface: English
 * as the source, French because its words are reliably longer than the English
 * ones and burst any layout that was measured against them, and Japanese because
 * it has no spaces to wrap at and no plural forms at all.
 *
 * A fourth would be a data change. That is the test of an i18n layer: adding a
 * language should touch one folder.
 */
export const LOCALES = ['en', 'fr', 'ja'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string | undefined): value is Locale {
	return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/** The \`lang\` and \`dir\` attributes for \`<html>\`. */
export const HTML_LANG: Record<Locale, string> = { en: 'en-GB', fr: 'fr-FR', ja: 'ja-JP' };

/** What each language calls itself. Never translated — a language picker in a
 * language you cannot read is useless. */
export const ENDONYM: Record<Locale, string> = { en: 'English', fr: 'Français', ja: '日本語' };`
			},
			{
				type: 'p',
				text: 'Chosen to cover the three shapes that break a naive interface: English as the source, French because its words are reliably longer and burst any layout measured against English, and Japanese because it has no spaces to wrap at and no plural forms at all. A fourth would be a data change — and *that* is the test of an i18n layer.'
			},
			{
				type: 'note',
				text: '`ENDONYM` is never translated. A language picker in a language you cannot read is useless — somebody looking for Japanese is looking for 日本語, not for the word "Japanese" written in French.'
			},
			{
				type: 'code',
				file: 'src/lib/i18n/locales.ts',
				lang: 'ts',
				code: `
/**
 * Pick the best supported language from an \`Accept-Language\` header.
 *
 * Quality values are honoured, and a bare tag matches a regional one, so
 * \`fr-CA\` finds \`fr\`. Anything unrecognised falls through to the default rather
 * than erroring: a visitor with an exotic locale should get the app in English,
 * not a 406.
 */
export function negotiate(header: string | null): Locale {
	if (!header) return DEFAULT_LOCALE;

	const ranked = header
		.split(',')
		.map((part) => {
			const [tag = '', ...parameters] = part.trim().split(';');
			const quality = parameters
				.map((parameter) => parameter.trim())
				.find((parameter) => parameter.startsWith('q='));
			return { tag: tag.toLowerCase(), quality: quality ? Number(quality.slice(2)) : 1 };
		})
		.filter((entry) => entry.tag.length > 0 && Number.isFinite(entry.quality))
		.sort((a, b) => b.quality - a.quality);

	for (const { tag } of ranked) {
		const base = tag.split('-')[0];
		if (isLocale(base)) return base;
	}

	return DEFAULT_LOCALE;
}`
			},
			{
				type: 'p',
				text: 'Quality values honoured, a bare tag matching a regional one so `fr-CA` finds `fr`, and anything unrecognised falling through to the default rather than erroring. A visitor with an exotic locale should get the app in English, not a 406.'
			},


			{ type: 'h3', id: 'context', text: '`createContext`, and the third function it returns' },
			{
				type: 'p',
				text: '`t` was a prop. It was declared on eight components and written out at seventeen call sites, and every one of them said the same thing: *whatever my parent has*. A prop that is only ever forwarded is not a prop — it is a global with extra steps and a rename that touches eight files.'
			},
			{
				type: 'p',
				text: 'Svelte 5.57 added `createContext`, and it is not sugar for `getContext`. `getContext(\'messages\')` is a string key and an `any`: two components can disagree about what is under it, a typo is a runtime `undefined`, and the type has to be re-asserted at every call. `createContext` hands back the accessors instead, so the key is a closure nobody can misspell and the type is written down once.'
			},
			{
				type: 'code',
				file: 'src/lib/i18n/context.ts',
				lang: 'ts',
				code: `
import { createContext } from 'svelte';
import { en, type Messages } from './messages/en.ts';

const [read, provide, has] = createContext<() => Messages>();

/**
 * Provide the catalogue to everything below. Called once, in \`Workspace.svelte\`.
 *
 * Takes a getter rather than a value — see the note above. Must run during
 * component initialisation, the same rule as \`setContext\`, because it *is*
 * \`setContext\` with the key and the type already decided.
 */
export function setMessages(catalogue: () => Messages): void {
	provide(catalogue);
}

/**
 * The catalogue getter, for a component that is only ever inside the workspace.
 * Throws during initialisation if no ancestor provided one, which is the point.
 *
 *     const catalogue = requireMessages();
 *     const t = $derived(catalogue());
 */
export const requireMessages = read;

/**
 * The catalogue getter, or the default one.
 *
 * The fallback is not laziness. Two trees render translated strings: the
 * application, which always provides, and the embedded custom element, which
 * cannot. Throwing is correct for the first and wrong for the second, and
 * \`has()\` is what tells them apart — at initialisation, before anything has a
 * chance to throw.
 *
 * \`en\` directly rather than \`messages(DEFAULT_LOCALE)\`: importing the barrel
 * would pull French and Japanese into the embed bundle, and the embed's whole
 * argument for existing is that it is small.
 */
export function useMessages(): () => Messages {
	return has() ? read() : () => en;
}

/** Whether an ancestor provided a catalogue. Exported so tests can assert it. */
export const hasMessages = has;`
			},
			{
				type: 'p',
				text: 'Three functions, and the third is the new one. `read()` returns the value **or throws** when no ancestor provided it — which is right, because a component that needs messages and cannot find them is broken, and a silent `undefined` surfaces as `Cannot read properties of undefined` three frames later in a component that is not the problem. `provide(value)` sets it. `has()` answers *without* throwing, which is the only way to ask whether you are inside a provider at all.'
			},
			{
				type: 'why',
				title: 'Why the context value is a function',
				text: 'Context is set once, at initialisation, and never again — but the catalogue is `$derived(messages(data.locale))`, and SvelteKit **reuses** a component across navigations that match the same route. Going from `/boards/abc` to `/fr/boards/abc` updates the prop in place on the component that is already mounted. Storing the catalogue would pin English forever; storing `() => t` stores something that genuinely never changes, and consumers wrap the call in `$derived`. `svelte-check` says so out loud if you get it wrong — "This reference only captures the initial value of `t`" — and it was right.'
			},
			{ type: 'h3', id: 'has', text: 'Where `has` earns its place' },
			{
				type: 'p',
				text: 'The embeddable viewer. `TesseraBoard.svelte` is a custom element: its own Svelte root, mounted by a page we do not control, with no ancestor of ours above it. It had three English literals in its markup — a loading line, a failure line and an `aria-label` — sitting outside the catalogue entirely, which is how a string stays untranslated for two years without anybody filing it.'
			},
			{
				type: 'p',
				text: 'The strict accessor cannot be used there: it throws during initialisation, and a custom element whose setup throws never defines itself at all. `useMessages()` asks `has()` first and falls back to the English catalogue — imported directly rather than through the barrel, because pulling French and Japanese into the embed bundle would undo the reason the embed exists.'
			},
			{
				type: 'terminal',
				code: `
$ # swap useMessages() for requireMessages() in the custom element
$ pnpm exec playwright test e2e/features.e2e.ts -g "catalogue with no provider"

  Error: expect(locator).toHaveAttribute(expected) failed
  Error: element(s) not found          ← it never mounted at all

  1 failed`
			},
			{
				type: 'note',
				text: 'That is the whole argument for `has` in one command. Without it the element does not render a fallback — it does not render.'
			},

			{ type: 'h3', id: 'formatters', text: 'The `Intl` cache' },
			{
				type: 'code',
				file: 'src/lib/i18n/index.ts',
				lang: 'ts',
				code: `
/**
 * Read, or build and remember.
 *
 * Svelte 5.57 added exactly this to \`SvelteMap\`, as \`getOrInsertComputed\`, and
 * these two caches are *not* SvelteMaps on purpose: a formatter cache is not
 * state anything should re-render for, and reading one inside a \`$derived\` must
 * not make that derived depend on which languages have been formatted so far.
 * So the shape is borrowed and the reactivity is not.
 *
 * It replaces a \`get(…) ?? new …\` followed by an unconditional \`set\`, which put
 * a write on the hot path of every timestamp on the page to re-store a value
 * that was already there. Nobody would have noticed; that is rather the point of
 * having a name for the pattern.
 */
function cached<K, V>(store: Map<K, V>, key: K, build: () => V): V {
	const existing = store.get(key);
	if (existing !== undefined) return existing;

	const built = build();
	store.set(key, built);
	return built;
}

const relative = new Map<Locale, Intl.RelativeTimeFormat>();
const dates = new Map<Locale, Intl.DateTimeFormat>();

const UNITS: [limit: number, divisor: number, unit: Intl.RelativeTimeFormatUnit][] = [
	[60_000, 1_000, 'second'],
	[3_600_000, 60_000, 'minute'],
	[86_400_000, 3_600_000, 'hour'],
	[604_800_000, 86_400_000, 'day']
];

/**
 * "3 minutes ago", in the viewer's language.
 *
 * Anything older than a week becomes an absolute date. "47 weeks ago" is a
 * number people have to convert; "12 October" is one they can read.
 */
export function ago(locale: Locale, when: Date, now: Date = new Date()): string {
	const elapsed = when.getTime() - now.getTime();
	const magnitude = Math.abs(elapsed);

	for (const [limit, divisor, unit] of UNITS) {
		if (magnitude < limit) {
			return cached(
				relative,
				locale,
				() => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
			).format(Math.round(elapsed / divisor), unit);
		}
	}

	return cached(
		dates,
		locale,
		() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })
	).format(when);
}`
			},
			{
				type: 'p',
				text: '`Intl.DateTimeFormat` is expensive to construct and cheap to reuse, and a board list rebuilding one per row per render is a measurable cost on a slow phone. The cache is keyed by locale and never invalidated, because the set of locales is fixed at build time.'
			},
			{
				type: 'why',
				title: '`getOrInsertComputed`, borrowed rather than called',
				text: 'Svelte 5.57 added exactly this shape to `SvelteMap`: `getOrInsertComputed(key, build)` reads, or builds and remembers. These two caches are deliberately **not** `SvelteMap`s, so `cached` is a local four-line version of it. A formatter cache is not state anything should re-render for, and reading one inside a `$derived` must not make that derived depend on which languages have been formatted so far — which is precisely what a reactive map would do. The name is worth having anyway: what it replaced was a `get(…) ?? new …` followed by an *unconditional* `set`, putting a write on the hot path of every timestamp on the page to re-store a value that was already there. Nobody would have noticed, which is rather the point of giving the pattern a name.'
			},
			{
				type: 'p',
				text: 'And the cut-off is a product decision worth copying: anything older than a week becomes an absolute date, because "47 weeks ago" is a number people have to convert and "12 October" is one they can read.'
			},

			{
				type: 'checkpoint',
				items: [
					'A key added to English and forgotten in French fails the build.',
					'Passing a string where a message wants a number fails the build.',
					'Adding a fourth language touches one folder.'
				]
			}
		]
	},

	{
		slug: 'presence',
		title: 'Seeing each other',
		summary:
			'Cursors, selections and viewports on a channel with no guarantees at all — and the one place in this project where losing data is correct.',
		goal: 'Show where everybody is, at sixty updates a second, storing nothing.',
		blocks: [
			{
				type: 'p',
				text: 'Presence is the feature that makes a collaborative tool *feel* collaborative, and it is the only part of this system where the correct behaviour on failure is to forget.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/client.svelte.ts',
				lang: 'ts',
				code: `
/**
 * Tell everybody where this replica is looking.
 *
 * Fire and forget, and deliberately not awaited by the caller: a pointer move
 * handler that awaits a network call is a pointer move handler that drops
 * frames.
 */
present(update: Omit<PresenceUpdate, 'boardId' | 'actor'>): void {
	this.#lastPresence = { ...update, boardId: this.boardId, actor: this.actor };
	void this.#sendPresence(this.#lastPresence);
}

async #sendPresence(update: PresenceUpdate): Promise<void> {
	try {
		await announcePresence(update);
	} catch {
		// Presence is disposable by definition. A failure is the next heartbeat's
		// problem, and showing an error for a cursor position would be absurd.
	}
}`
			},
			{
				type: 'p',
				text: 'Fire and forget, and deliberately not awaited by the caller: a pointer-move handler that awaits a network call is a pointer-move handler that drops frames. And the `catch` is empty on purpose — showing an error for a cursor position would be absurd.'
			},
			{
				type: 'code',
				file: 'src/lib/remote/sync.remote.ts',
				lang: 'ts',
				code: `
/**
 * Say where this replica's cursor, selection and viewport are.
 *
 * Writes nothing. The roster lives in memory in \`server/presence.ts\`, and the
 * result is broadcast to everybody watching the board and then forgotten. A
 * dropped presence packet is not an error, it is the next one arriving.
 *
 * \`viewer\` is enough. Somebody with read-only access is still *present*, and
 * hiding their cursor from the people they are talking to on a call is a worse
 * outcome than showing it.
 */
export const announcePresence = command(PresenceSchema, async (update) => {
	const user = requireUser();

	await requireAccess(update.boardId, user.id, 'viewer').catch((thrown: unknown) => {
		if (thrown instanceof AccessError) error(thrown.status, thrown.message);
		throw thrown;
	});

	const peers = announce(update, { userId: user.id, name: user.name });
	publish(update.boardId, { type: 'presence', peers });
});`
			},
			{
				type: 'p',
				text: '`viewer` is enough. Somebody with read-only access is still *present*, and hiding their cursor from the people they are talking to on a call is a worse outcome than showing it. Permission questions are about what you may *change*, not about whether you exist.'
			},

			{ type: 'h3', id: 'the-roster', text: 'The roster' },
			{
				type: 'code',
				file: 'src/lib/server/presence.ts',
				lang: 'ts',
				code: `
export function announce(
	update: PresenceUpdate,
	who: { userId: string; name: string },
	now = Date.now()
): Peer[] {
	const peers = boards.get(update.boardId) ?? new Map<string, Peer>();

	peers.set(update.actor, {
		actor: update.actor,
		userId: who.userId,
		name: who.name,
		hue: hueFor(who.userId),
		cursor: update.cursor,
		selection: update.selection,
		viewport: update.viewport,
		at: now
	});

	boards.set(update.boardId, peers);`
			},
			{
				type: 'p',
				text: 'A `Map` of `Map`s, one entry per open tab, expired by comparison rather than by a cleanup job. A server restart drops the roster and every client re-announces within a heartbeat, which is the whole recovery story.'
			},
			{
				type: 'code',
				file: 'src/lib/sync/protocol.ts',
				lang: 'ts',
				code: `
/**
 * How long a peer may go unheard-from before they are dropped from the roster.
 *
 * A browser that is closed mid-drag sends no goodbye, and the disconnect is only
 * noticed when the stream's \`cancel\` fires — which for a machine that went to
 * sleep can be minutes. Without an expiry, a board accumulates ghosts.
 */
export const PRESENCE_TIMEOUT_MS = 15_000;

/** How often a client re-sends its presence even if nothing moved, to stay alive. */
export const PRESENCE_HEARTBEAT_MS = 5_000;

/** The keep-alive interval on the server's side of the stream. */
export const STREAM_PING_MS = 20_000;`
			},
			{
				type: 'p',
				text: 'Two numbers that have to relate: a heartbeat of five seconds against a timeout of fifteen means a peer has to miss three in a row before they vanish. Set them closer together and people flicker off the roster on a bad connection; set them further apart and a closed tab lingers as a ghost.'
			},

			{ type: 'h3', id: 'colour', text: 'A colour you can refer to' },
			{
				type: 'code',
				file: 'src/lib/server/presence.ts',
				lang: 'ts',
				code: `
/**
 * A stable colour per person, derived rather than assigned.
 *
 * Assigning from a pool means the same colleague is amber today and cyan
 * tomorrow, and two people can swap between reloads — which makes "the green
 * cursor" useless as a way of referring to somebody mid-conversation. Hashing
 * the user id gives everybody one colour forever, at the cost of the occasional
 * collision, which is a much smaller problem than instability.
 */
export function hueFor(userId: string): number {
	let hash = 2166136261;
	for (let i = 0; i < userId.length; i += 1) {
		hash ^= userId.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 360;
}`
			},
			{
				type: 'why',
				title: 'Derived rather than assigned',
				text: 'Assigning colours from a pool means the same colleague is amber today and cyan tomorrow, and two people can swap between reloads — which makes "the green cursor" useless as a way of referring to somebody mid-conversation. Hashing the user id gives everybody one colour forever, at the cost of the occasional collision. **Stability is worth more than uniqueness here**, and noticing which of the two a feature actually needs is the general skill.'
			},

			{
				type: 'checkpoint',
				items: [
					'Cursors move at sixty frames a second and nothing is written to disk.',
					'Closing a tab removes the avatar immediately; killing the browser removes it within fifteen seconds.',
					'The same person is the same colour on every board, forever.'
				]
			}
		]
	}
];
