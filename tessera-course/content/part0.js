/**
 * PART 0 — What we are building, and the one question everything answers
 * (chapters 01–05)
 *
 * The first two chapters have almost no code in them. That is on purpose. A
 * collaborative editor makes exactly one architectural decision, very early, and
 * every file after it is a consequence: *who decides who wins?* Start typing
 * before you have answered that and you will write a chat application with
 * rectangles in it.
 */

export const part0 = [
	{
		slug: 'what-we-are-building',
		title: 'What we are building',
		summary:
			'Tessera: a collaborative canvas for system diagrams that keeps working with the network off, and merges everything back without asking anybody to choose.',
		goal: 'Understand what the finished application does, and why each hard part of it is unavoidable rather than chosen.',
		blocks: [
			{
				type: 'p',
				text: 'We are going to build **Tessera**: a real-time collaborative canvas. Two people open the same board, draw boxes, connect them with arrows, rename things, leave comments — at the same moment, on the same shapes — and both of them end up looking at the same board. One goes into a tunnel, keeps drawing for ten minutes, and everything they did arrives intact when the signal comes back.'
			},
			{
				type: 'p',
				text: 'That last sentence is the whole project. It is easy to say and it rules out almost every design you would reach for first.'
			},

			{ type: 'h3', id: 'the-tour', text: 'The tour' },
			{
				type: 'ul',
				items: [
					'**A canvas** you can pan, zoom, marquee-select, drag, resize and snap on — with a mouse, with a finger, and with only the keyboard.',
					'**Live collaboration**: other people’s cursors, their selections, their viewports, and their edits, arriving as they happen.',
					'**Offline**: the board lives in IndexedDB. Close the laptop mid-edit, reopen it on a plane, keep working.',
					'**Collaborative text**: two people typing into the same shape’s label at once, character by character, without either one clobbering the other.',
					'**Comments** anchored to shapes, with threaded replies and resolve.',
					'**Version history**: named checkpoints, time travel, and restore — where restoring is itself a collaborative edit rather than a rollback.',
					'**Export** to SVG and PNG, rendered in a Web Worker so the canvas never stutters.',
					'**An embeddable viewer** — a read-only board on somebody else’s page, as a custom element, with no framework on the host.',
					'**Three languages**, resolved by a hook before anything renders.'
				]
			},
			{
				type: 'p',
				text: 'Roughly sixteen thousand lines when it is finished. About two thousand of them are the part that makes the rest possible, and we write those first.'
			},

			{ type: 'h3', id: 'why-a-canvas', text: 'Why a canvas, specifically' },
			{
				type: 'p',
				text: 'Because it is the honest hard case. Collaborative *text* is a famous problem with famous solutions you can install. A canvas is worse in a way that is easy to miss: it has **several kinds of state at once**, and they need different merge rules.'
			},
			{
				type: 'ol',
				items: [
					'**A set of shapes.** Two people add different shapes; both should exist. One adds while another deletes; there is a right answer and it is not "last one wins".',
					'**Fields on a shape.** Two people move the same box; one position must win, deterministically, on every replica, forever. Two people change *different* fields of the same box; both changes must survive.',
					'**Ordered text.** Two people type into the same label; the result must be a sensible interleaving, not one person’s sentence.',
					'**An ordering.** Shapes stack. Two people both send something to the front, at the same moment, and the stack must not end up different on the two screens.'
				]
			},
			{
				type: 'why',
				title: 'Why this is worth your time even if you never build a canvas',
				text: 'Every technique here transfers to anything where two copies of the truth can disagree: an offline-first mobile app, a mobile client with a flaky connection, a multi-region database, a desktop app that syncs. The vocabulary — happens-before, convergence, idempotence, causal delivery — is the vocabulary of distributed systems, and a canvas is simply the place where getting it wrong is *visible on screen* instead of hidden in a report nobody reconciles.'
			},

			{ type: 'h3', id: 'the-shape', text: 'The shape of it' },
			{
				type: 'terminal',
				code: `
  ┌──────────────────────────── the browser ───────────────────────────┐
  │                                                                    │
  │   pointer ──▶ editor ──▶ operation ──▶ document ──▶ projection ──┐ │
  │                                           │                      │ │
  │                                           │                 canvas │
  │                                           ▼                      │ │
  │                                     IndexedDB outbox               │
  │                                           │                        │
  └───────────────────────────────────────────┼────────────────────────┘
                                              │  batches, when there is
                                              ▼  a network to send them on
                                     ┌──────────────────┐
                                     │  POST /sync      │  ← per-op RBAC,
                                     │  ingest.ts       │     one transaction
                                     └──────────────────┘
                                              │
                                     ┌────────┴─────────┐
                                     │  operation log   │  ← append only,
                                     └────────┬─────────┘     server-sequenced
                                              │
                                     ┌────────▼─────────┐
                                     │  hub → SSE       │──▶ every other tab
                                     └──────────────────┘`
			},
			{
				type: 'p',
				text: 'Read the top box left to right and notice what is *missing*: there is no request in it. A pointer event becomes an operation, the operation is applied to the document, and the screen updates. The network appears afterwards, on a different line, as somewhere the operation eventually goes.'
			},
			{
				type: 'p',
				text: 'That ordering is the design. It is why the application works on a plane, and it is also why the merge problem is unavoidable: if the screen updates before the server has seen the edit, the server does not get to arbitrate.'
			},

			{ type: 'h3', id: 'what-the-server-is-for', text: 'What the server is for, then' },
			{
				type: 'p',
				text: 'Three things, and none of them is "deciding what the board looks like".'
			},
			{
				type: 'ul',
				items: [
					'**Durability.** It keeps the log so a board outlives the tab that made it.',
					'**Fan-out.** It is the meeting point. Replicas post operations to it and read everybody else’s back.',
					'**Authority over permission.** Whether you *may* write is a decision no client can be trusted with. Whether your write *wins* is a decision no server needs to make.'
				]
			},
			{
				type: 'note',
				text: 'That split — the server owns permission, the data structure owns merging — is the single most useful sentence in this course. Nearly every design question later resolves to "which of those two is this?"'
			},

			{ type: 'h3', id: 'the-stack', text: 'The stack' },
			{
				type: 'ul',
				items: [
					'**SvelteKit 3** with **Svelte 5** — runes, remote functions, universal hooks, `defineParams`, and no `svelte.config.js`.',
					'**TypeScript**, strict, with `noUncheckedIndexedAccess` on. In a codebase full of array indexing into shared state, that flag earns its keep on the first day.',
					'**Vite 8** and **Vitest 4** — unit tests in Node, component tests in a real Chromium.',
					'**valibot** for every schema: environment variables, route parameters, form fields, and the sync wire format.',
					'**Drizzle** over **libSQL**, and **Better Auth** for sessions.',
					'**Playwright** for the end-to-end suite, which runs two browser contexts against one board because that is the only way to test the thing this application is *for*.',
					'**Vanilla CSS**, mobile-first, with `min-width` breakpoints. No framework.'
				]
			},
			{
				type: 'p',
				text: 'No CRDT library. We write the data types ourselves — about eleven hundred lines — because using one here would be like taking a course on databases that starts with "install Postgres". The whole point is that you will know what is inside it.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can say in one sentence what makes a collaborative canvas hard: several kinds of state, each needing a different merge rule.',
					'You can explain why the server cannot decide who wins, given that the screen updates before the server is asked.',
					'You know the three jobs the server does have.'
				]
			}
		]
	},

	{
		slug: 'who-decides',
		title: 'Who decides who wins',
		summary:
			'Three designs for two people editing one thing, why the first two are the ones everybody builds, and what a conflict-free type actually promises.',
		goal: 'Be able to argue for local-first from first principles, and know precisely what has to be true for it to work.',
		blocks: [
			{
				type: 'p',
				text: 'Two people drag the same box at the same moment. Ada moves it left; Mo moves it up. What should the board look like afterwards?'
			},
			{
				type: 'p',
				text: 'There is no universally right answer, and that is the point. What matters is that **both screens agree**, and that neither person loses work they would be surprised to lose. There are three ways to get there.'
			},

			{ type: 'h3', id: 'design-one', text: 'Design one: ask the server' },
			{
				type: 'p',
				text: 'The obvious one. A drag sends a request; the server writes the new position; the response comes back; the screen updates. The server is the truth, so the two screens cannot disagree.'
			},
			{
				type: 'p',
				text: 'It works, and it is what most applications should do. It fails here for one reason: **the drag has to feel instant**, and a round trip is not instant. At 60fps you have 16 milliseconds per frame; a good network round trip is thirty to eighty. The box would trail your finger by three to five frames, forever, and no amount of engineering elsewhere would hide it.'
			},
			{
				type: 'p',
				text: 'And with the network down, there is no application at all.'
			},

			{ type: 'h3', id: 'design-two', text: 'Design two: ask the server, but lie in the meantime' },
			{
				type: 'p',
				text: 'The one everybody builds second. Move the box immediately, send the request, and if the server disagrees, put it back. Optimistic updates. It feels instant and it works offline for about ninety seconds.'
			},
			{
				type: 'p',
				text: 'Then the trouble starts, and it is worth being specific about what kind of trouble, because "it gets complicated" is not an argument.'
			},
			{
				type: 'ul',
				items: [
					'**Rollback is visible.** The box snaps back to where it was while you are still looking at it. Twice in a session, people stop trusting the tool.',
					'**Rollback is not local.** By the time the server disagrees, you have made four more edits *on top of* the one being undone. Undoing the first without undoing the others requires knowing which of them depended on it — which is a dependency graph you did not build.',
					'**Offline is unbounded.** Ten minutes offline is six hundred queued mutations, applied in an order the server has never seen, against a board that moved on without you. "Retry the queue" is not a merge strategy.',
					'**Every conflict becomes a product decision.** Ada moved it left and Mo moved it up: does somebody get a dialog? Does the last write win? Does the *first*? You will answer this question separately for every field of every object, and you will get some of them wrong.'
				]
			},
			{
				type: 'note',
				text: 'None of this makes optimistic updates a bad pattern. Halfpast, the booking application earlier in this series, uses them heavily and is right to: bookings are *transactional* — the server genuinely must arbitrate, and a rejection is meaningful information. The difference is that a rejected booking is a real answer, and a rejected box-drag is a bug.'
			},

			{ type: 'h3', id: 'design-three', text: 'Design three: do not ask' },
			{
				type: 'p',
				text: 'Make the data structure itself have the property that concurrent edits merge. Not "merge with a strategy" — merge, unconditionally, arriving at the same result on every replica regardless of what order the edits show up in.'
			},
			{
				type: 'p',
				text: 'A structure with that property is a **conflict-free replicated data type**, and the property is precise:'
			},
			{
				type: 'ol',
				items: [
					'**Commutative** — applying edit A then edit B gives the same result as B then A.',
					'**Associative** — how you group them into batches does not matter.',
					'**Idempotent** — applying the same edit twice is the same as applying it once.'
				]
			},
			{
				type: 'p',
				text: 'Those three together buy something enormous: **the network can do anything at all**. Reorder messages, duplicate them, deliver them in batches, deliver them a week late, deliver them to one replica and not another — and as long as every replica eventually sees every edit, every replica ends up identical. No acknowledgements, no ordering guarantees, no retry-with-idempotency-key ceremony. The transport can be sloppy because the data does not care.'
			},
			{
				type: 'why',
				title: 'Why this is not free',
				text: 'CRDTs trade *space* and *design work* for that guarantee. A deleted shape usually cannot be forgotten immediately — something has to remember it was deleted, or a late-arriving "add" resurrects it. Every field needs a rule chosen deliberately. And "both edits survive" is not always what a human wants: two people typing into one label produce a correct interleaving that may still read as nonsense. The structure guarantees *convergence*, not *good taste*. Knowing exactly where that line is is most of what this course teaches.'
			},

			{ type: 'h3', id: 'so-what-do-we-need', text: 'What that means we have to build' },
			{
				type: 'p',
				text: 'Work backwards from "the same result in any order" and the rest of the project falls out of it.'
			},
			{
				type: 'ul',
				items: [
					'To decide a winner without asking anybody, every edit needs a **timestamp that is comparable across machines** and never ties. Wall clocks are not that. Chapter 06.',
					'To know what a replica already has, we need a compact summary of "everything I have seen". Chapter 07.',
					'To keep an ordering stable when two people insert in the same gap, positions must be **densely orderable** — there must always be a value between any two. Chapter 08.',
					'Each kind of state needs its own type: a set for shapes, registers for fields, a sequence for text. Chapters 10 to 12.',
					'And all of it needs to be tested against a network that behaves as badly as a real one, which turns out to be a *property* test rather than an example. Chapter 09.'
				]
			},
			{
				type: 'p',
				text: 'That is the next two parts of this course, and none of it mentions Svelte. That is deliberate too: the interesting half of a local-first application is framework-independent, and you should be able to lift it out.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can explain why optimistic updates are right for a booking system and wrong for a canvas.',
					'You can state the three algebraic properties a CRDT needs, and say what each one buys.',
					'You can name what a CRDT does *not* promise.'
				]
			}
		]
	},

	{
		slug: 'setting-up',
		title: 'Setting up: a SvelteKit 3 project',
		summary:
			'Node, pnpm, the folder, and the single biggest change in SvelteKit 3 — there is no svelte.config.js any more.',
		goal: 'Have an empty application that runs, with every framework option in one place and each one understood.',
		blocks: [
			{
				type: 'p',
				text: 'Check your Node. This project needs 24.20 or newer, which is the current LTS at the time of writing.'
			},
			{
				type: 'terminal',
				code: `
node --version
# v24.20.0

npm install -g pnpm
pnpm --version
# 11.24.0`
			},
			{
				type: 'note',
				text: 'pnpm rather than npm for one concrete reason: it refuses to let a package import something it did not declare. That sounds pedantic until a dependency of a dependency disappears in a minor release and your application stops building on a machine that is not yours.'
			},

			{ type: 'h3', id: 'creating-it', text: 'Creating the project' },
			{
				type: 'terminal',
				code: `
pnpm create svelte@next tessera
cd tessera
pnpm install`
			},
			{
				type: 'p',
				text: 'Open the folder and look at what is *not* there.'
			},
			{
				type: 'warn',
				text: 'There is no `svelte.config.js`. In SvelteKit 3 every framework option moved into the `sveltekit()` plugin inside `vite.config.ts`. If you have written SvelteKit before, this is the change that will trip you the most: the adapter, `prerender`, `alias`, `paths`, compiler options — all of it is now one object, in one file, next to the rest of the build configuration.'
			},

			{ type: 'h3', id: 'the-vite-config', text: 'The whole configuration, in one file' },
			{
				type: 'p',
				text: 'Here is Tessera’s, in full. It is long, and every line in it is load-bearing — several of them were added *after* a failure, and those comments are the failures.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
// \`defineConfig\` comes from \`vitest/config\` so the \`test\` block below type-checks;
// \`loadEnv\` is not re-exported from there, so it comes straight from Vite.
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';

/*
 * SvelteKit 3 keeps ALL framework configuration here, inside the \`sveltekit()\`
 * plugin. There is no \`svelte.config.js\`.
 *
 * The config is a *function* because it has to read the environment before the
 * build starts — \`paths.origin\` below is substituted into the output.
 */
export default defineConfig(({ mode }) => {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

	return {
		plugins: [
			sveltekit({`
			},
			{
				type: 'p',
				text: 'A function, not an object. `loadEnv` reads `.env` files before the build starts, because one of the values below is substituted *into the output* rather than read at runtime.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
sveltekit({
	/*
	 * The trusted origin for CSRF checks on form submissions and remote
	 * function calls, and — since adapter-node v6 — a BUILD-time value
	 * rather than a runtime \`ORIGIN\` variable.
	 *
	 * Leave it unset and the adapter reconstructs the origin from request
	 * headers, where with no \`PROTOCOL_HEADER\` configured it assumes
	 * \`https\`. A server on plain HTTP then computes \`https://localhost:4173\`,
	 * the browser sends \`http://localhost:4173\`, and every POST comes back
	 * \`403 {"message":"Cross-site remote requests are forbidden"}\` from an
	 * app whose GET requests all work perfectly.
	 */
	paths: { origin: env.PUBLIC_ORIGIN },`
			},
			{
				type: 'why',
				title: 'The 403 that looks like a bug in your form',
				text: 'That comment is a scar. `adapter-node` v6 moved the trusted origin from a runtime `ORIGIN` variable to build-time `paths.origin`. Leave it unset and the adapter reconstructs the origin from request headers, assuming `https` unless told otherwise. Your server on plain HTTP computes `https://localhost:4173`, the browser sends `http://localhost:4173`, and every POST — every form, every remote command — comes back `403 Cross-site remote requests are forbidden`, in an application whose GET requests all work perfectly.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
compilerOptions: {
	// Runes everywhere except node_modules, where a dependency may still be
	// written in legacy Svelte 4 style. Removable in Svelte 6.
	runes: ({ filename }) =>
		filename.split(/[/\\\\]/).includes('node_modules') ? undefined : true,

	/*
	 * \`await\` at the top level of \`<script>\`, inside \`$derived\`, and
	 * directly in markup.
	 *
	 * Tessera leans on this harder than a CRUD app would. Opening a board
	 * means awaiting IndexedDB, and the honest way to express "this board
	 * is still coming out of local storage" is an \`await\` inside a
	 * \`<svelte:boundary>\` with a \`pending\` snippet — not a \`loading\`
	 * boolean threaded through four components.
	 */
	experimental: { async: true }
},`
			},
			{
				type: 'p',
				text: '`runes` as a *function* rather than `true`. Your own code is runes-only; a dependency in `node_modules` might still be written in Svelte 4 style, and forcing runes on it breaks it. The distinction goes away in Svelte 6.'
			},
			{
				type: 'p',
				text: '`experimental.async` turns on `await` at the top level of `<script>`, inside `$derived`, and directly in markup. Tessera uses it more than most applications would, because opening a board means awaiting IndexedDB and the honest way to say "still loading from local storage" is an `await` inside a boundary rather than a `loading` flag threaded through four components.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
adapter: adapter(),

experimental: {
	// \`query()\`, \`query.batch()\`, \`query.live()\`, \`command()\` and \`form()\`
	// from \`$app/server\`.
	remoteFunctions: true,

	/*
	 * Preload the next route inside a Svelte *fork*: the framework
	 * speculatively runs the new page's state without committing it, then
	 * either adopts the result or throws it away.
	 *
	 * Worth having here because the board list preloads boards on hover,
	 * and a board's \`load\` opens an IndexedDB transaction. Without forking,
	 * an abandoned preload leaves that transaction's effects behind.
	 */
	forkPreloads: true
},

prerender: {
	// A broken internal link fails the build instead of shipping a 404.
	handleHttpError: 'fail',
	handleMissingId: 'fail'
},`
			},
			{
				type: 'p',
				text: '`remoteFunctions` enables `query`, `command` and `form` from `$app/server` — the mechanism that replaces most of this application’s API routes. `forkPreloads` is subtler: preloading a route on hover speculatively runs the next page’s state in a Svelte *fork*, then adopts it or throws it away. It matters here because a board’s load opens an IndexedDB transaction, and without forking an abandoned preload leaves that transaction’s effects behind.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `
	},

	/*
	 * ONE COMPONENT COMPILED AS A CUSTOM ELEMENT
	 * =========================================
	 *
	 * \`<svelte:options customElement>\` describes the element, but the
	 * compiler only *emits* one when \`customElement: true\` is set — and
	 * setting it globally would wrap every component in the application in
	 * custom-element machinery it does not need.
	 *
	 * \`dynamicCompileOptions\` is the seam: it is called per file, so the
	 * embeddable viewer compiles one way and everything else compiles the
	 * other. Without it the build succeeds and \`svelte-check\` warns
	 * "the customElement option is used when generating a custom element" —
	 * which is easy to read as noise and is in fact "your element does not
	 * exist".
	 */
	dynamicCompileOptions({ filename }) {
		if (filename.split(/[/\\\\]/).includes('embed')) return { customElement: true };
		return {};
	}
}),`
			},
			{
				type: 'p',
				text: '`dynamicCompileOptions` is the seam that lets exactly one component in the codebase compile to a custom element. We will come back to it in chapter 40; note for now that it is called per file, so the embeddable viewer compiles one way and the other sixty components compile the other.'
			},

			{ type: 'h3', id: 'strictness', text: 'TypeScript, on hard mode' },
			{
				type: 'code',
				file: 'tsconfig.json',
				lang: 'json',
				code: `
{
	// SvelteKit regenerates a base config into \`node_modules/$app/tsconfig\` on every
	// \`svelte-kit sync\`. It sets module resolution, the DOM libs and the generated
	// route types, so we only add what is specific to this project.
	"extends": "$app/tsconfig",
	"compilerOptions": {
		"sourceMap": true,

		// strictNullChecks, noImplicitAny and friends.
		"strict": true,

		// \`array[0]\` is typed \`T | undefined\` rather than \`T\`. In a CRDT this is the
		// difference between a merge that handles a missing element and one that
		// reads a property of undefined on a replica that has not seen the insert
		// yet — which is the single most common way a convergence bug is written.
		"noUncheckedIndexedAccess": true,

		// An overriding method must say \`override\`.
		"noImplicitOverride": true,

		// A \`case\` that falls through to the next must be deliberate. The op
		// dispatcher is one big switch, and a missing \`break\` there silently applies
		// two operations for one.
		"noFallthroughCasesInSwitch": true,

		// Every path through a value-returning function must return.
		"noImplicitReturns": true,

		// Unused locals and parameters are errors. Dead code in a merge function is
		// usually half of a case somebody stopped writing.
		"noUnusedLocals": true,
		"noUnusedParameters": true
	},

	// SvelteKit 3 requires these to be explicit. Without them \`svelte-check\` will
	// happily type-check the minified output in \`build/\` and report thousands of
	// meaningless errors.
	"include": [
		"src/**/*.ts",
		"src/**/*.js",
		"src/**/*.svelte",
		"e2e/**/*.ts",
		"scripts/**/*.js",
		"*.config.ts",
		"*.config.js"
	],
	/*
	 * The service worker is excluded here and checked by \`tsconfig.service-worker.json\`.
	 *
	 * It runs in a \`ServiceWorkerGlobalScope\`, not a window: \`self\` is a different
	 * type, \`document\` does not exist, and the DOM lib actively lies about both.
	 * SvelteKit says so on every \`sync\` — "src/service-worker should be added to
	 * the exclude array" — and the cost of ignoring it is a file that type-checks
	 * against an environment it will never run in.
	 */
	"exclude": ["node_modules", "build", ".svelte-kit", "static", "drizzle", "src/service-worker.ts"]
}`
			},
			{
				type: 'p',
				text: 'Two of those flags do most of the work. `noUncheckedIndexedAccess` makes `array[i]` have type `T | undefined`, which is *true* and which most codebases turn off within a week. Keep it: this project indexes into shared, concurrently-modified state constantly, and the one place it is genuinely annoying — array access you have just bounds-checked — is exactly the place a future edit will break.'
			},
			{
				type: 'p',
				text: '`verbatimModuleSyntax` forces `import type` where you mean a type. That matters because the runtime here is Node’s type-stripping mode, which erases annotations without understanding them: it cannot know that an import is only used as a type, so it leaves the import in, and you get a runtime error importing a module that only exists at compile time.'
			},
			{
				type: 'warn',
				text: 'Node’s strip-only TypeScript has a second consequence that will bite you within an hour: **no parameter properties**. `constructor(private readonly db: Client) {}` is a syntax error at runtime, because stripping the types leaves a constructor that assigns nothing. Declare the field and assign it. Relative imports also need their file extensions — `./clock.ts`, not `./clock`.'
			},

			{
				type: 'checkpoint',
				items: [
					'`pnpm dev` serves a page.',
					'You can find every framework option without opening more than one file.',
					'You know why `paths.origin` exists, and what its absence looks like from the outside.'
				]
			}
		]
	},

	{
		slug: 'the-environment',
		title: 'Environment variables that cannot be wrong',
		summary:
			'`src/env.ts` and `defineEnvVars` — declaring every variable once, validating at boot, and making a secret in the browser something you have to type on purpose.',
		goal: 'Set up configuration that fails at start-up with a clear message rather than at 3am with a missing value.',
		blocks: [
			{
				type: 'p',
				text: 'SvelteKit 2 had four magic modules: `$env/static/private`, `$env/dynamic/private`, and public versions of both. They worked, and they had two rough edges — a typo in a variable name was `undefined` rather than an error, and whether a value was allowed in the browser depended on remembering a naming convention.'
			},
			{
				type: 'p',
				text: 'SvelteKit 3 replaced all four with one file.'
			},
			{
				type: 'code',
				file: 'src/env.ts',
				lang: 'ts',
				code: `
/**
 * Every environment variable this app reads, declared once.
 *
 * SvelteKit 3 replaced the \`$env/*\` magic modules with this file. A variable not
 * declared here cannot be imported — a type error at build time rather than an
 * \`undefined\` that surfaces in production three weeks later — and \`public: true\`
 * is something you have to type, so a secret cannot reach the browser by
 * accident.
 *
 * The schemas are valibot. They run once, at boot, against the real environment.
 * A malformed \`PUBLIC_ORIGIN\` stops the server starting instead of producing a
 * fleet of 403s that look like a CSRF bug.
 */
import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

const required = v.pipe(v.string(), v.trim(), v.minLength(1));

export const variables = defineEnvVars({
	DATABASE_URL: {`
			},
			{
				type: 'p',
				text: 'A variable not in this file **cannot be imported**. Not "imports as nothing" — the import does not typecheck. That single change moves a whole category of production incident to the moment you type the wrong name.'
			},

			{ type: 'h3', id: 'the-flags', text: 'What you declare, and why' },
			{
				type: 'code',
				file: 'src/env.ts',
				lang: 'ts',
				code: `
	description: 'libSQL connection string. \`file:local.db\` in development.',
	schema: required
},

PUBLIC_ORIGIN: {
	description: 'Where the app is served from, with no trailing slash. Used for CSRF checks.',
	public: true,

	/*
	 * \`static: true\` means the value is inlined at build time rather than read
	 * from the environment at runtime. It has to be: \`paths.origin\` in
	 * \`vite.config.ts\` reads the same variable during the build, and a value
	 * that could differ between build and run would make the CSRF check compare
	 * two different origins.
	 */
	static: true,
	schema: v.pipe(
		required,
		v.url('Must be an absolute URL'),
		// A trailing slash makes \`\${PUBLIC_ORIGIN}/b/\${id}\` produce a double slash,
		// which most servers tolerate and canonical-URL checks do not.
		v.transform((value) => value.replace(/\\/+$/, ''))
	)
},

BETTER_AUTH_SECRET: {`
			},
			{
				type: 'ul',
				items: [
					'**`schema`** — a valibot schema, run once at boot against the real environment. `DATABASE_URL=""` stops the server starting with a clear message instead of producing an unopenable database three layers down.',
					'**`public: true`** — allowed in the browser. Absent by default, so a secret reaching the client requires somebody to *type the word public*. That is a much better failure surface than a naming convention.',
					'**`static: true`** — inlined at build time rather than read from `process.env` per request. `PUBLIC_ORIGIN` has to be static: `vite.config.ts` reads the same variable during the build, and a value that could differ between build and run would make the CSRF check compare two different origins.'
				]
			},
			{
				type: 'p',
				text: 'Notice the schema does more than check. `v.transform` strips trailing slashes, because `https://tessera.app/` and `https://tessera.app` are the same origin to a person and different strings to a comparison — and this value is compared against an `Origin` header on every state-changing request. Normalise once, here, rather than remembering to normalise at every use.'
			},
			{
				type: 'code',
				file: 'src/env.ts',
				lang: 'ts',
				code: `

		/*
		 * Thirty-two characters is not a style preference. Better Auth derives its
		 * signing key from this string; a short one is a short key, and the failure
		 * mode of a short key is silent — everything works, and forging a session
		 * is cheap.
		 */
		schema: v.pipe(required, v.minLength(32, 'Use at least 32 characters'))
	},

	BOARD_LOG_RETENTION_DAYS: {
		description: 'How long a board keeps individual operations before compaction.',
		schema: v.optional(
			v.pipe(
				v.string(),
				v.transform(Number),
				v.number(),
				v.integer(),
				v.minValue(1, 'Compacting away today’s own edits would lose work')
			),
			'30'
		)
	}
});`
			},
			{
				type: 'why',
				title: 'A minimum length is not a style preference',
				text: 'Better Auth derives its signing key from `BETTER_AUTH_SECRET`. A short string is a short key, and the failure mode of a short key is *silent*: everything works, nothing logs, and forging a session cookie is cheap. A schema is the only place that check can live where it is impossible to skip.'
			},
			{
				type: 'p',
				text: 'And the last one shows the shape of a validated optional: a string from the environment, transformed to a number, checked to be an integer of at least 1, defaulting to `\'30\'`. The minimum has a reason written next to it — compacting away today’s own edits would lose work — which is the sort of thing that is obvious when you write it and mysterious six months later.'
			},

			{ type: 'h3', id: 'using-them', text: 'Reading them' },
			{
				type: 'code',
				lang: 'ts',
				code: `
import { DATABASE_URL } from '$env/private';
import { PUBLIC_ORIGIN } from '$env/public';`
			},
			{
				type: 'p',
				text: 'Two modules, typed from your declarations. Import a private variable in a file that reaches the browser and the build fails, naming the file and the import chain that got it there.'
			},
			{
				type: 'terminal',
				code: `
# .env — never committed
DATABASE_URL=file:local.db
PUBLIC_ORIGIN=http://localhost:5173
BETTER_AUTH_SECRET=$(openssl rand -base64 32)`
			},

			{
				type: 'checkpoint',
				items: [
					'Every variable the app reads is declared in one file with a description.',
					'Deleting a variable from `.env` fails at boot with a message naming it.',
					'You can say why `PUBLIC_ORIGIN` must be `static: true` specifically.'
				]
			}
		]
	},

	{
		slug: 'the-map',
		title: 'The map of the project',
		summary:
			'Every folder, what lives in it, and the rule that decides which folder a new file goes in.',
		goal: 'Know where to put things, and be able to predict where something is before looking for it.',
		blocks: [
			{
				type: 'p',
				text: 'Before we write anything substantial, here is the whole thing. You will not remember it yet; the point is that when a later chapter says "this goes in `lib/board`", you already know why it is not in `lib/crdt`.'
			},
			{
				type: 'terminal',
				code: `
src/
  lib/
    crdt/        the data types. no Svelte, no DOM, no app concepts.
    board/       what a board IS: shapes, edges, operations, snapshots.
    sync/        getting operations to and from other replicas.
    canvas/      camera, gestures, hit-testing, editing.
    server/      everything that must not reach the browser.
    remote/      remote functions — the seam between the two.
    components/  the interface.
    i18n/        messages and locale resolution.
    export/      SVG and PNG, in a worker.
    embed/       the one component that compiles to a custom element.
    history/     undo, and version-history value objects.
    motion/      GSAP timelines, honouring reduced motion.
    styles/      tokens, reset, base, utilities.
  routes/        the URL structure.
  hooks.ts       reroute + transport. runs on both sides.
  hooks.server.ts
  hooks.client.ts
  params.ts      route parameter matchers.
  env.ts         environment variables.
  service-worker.ts`
			},

			{ type: 'h3', id: 'the-layers', text: 'Four layers, and the rule' },
			{
				type: 'p',
				text: 'The folders fall into four layers, and the rule is that **a layer may only import from layers above it**.'
			},
			{
				type: 'ol',
				items: [
					'**`crdt/`** — pure algebra. Knows about stamps and sets and sequences. Does not know what a "shape" is, and could be published as a standalone package tomorrow.',
					'**`board/`** — the domain. Knows a board has shapes with positions and labels. Does not know about networks, storage, or Svelte components.',
					'**`sync/`, `server/`, `canvas/`** — machinery. Each knows about `board/` and about one piece of the outside world: the network, the database, the pointer.',
					'**`components/`, `routes/`** — the interface. Knows about everything, and is known by nothing.'
				]
			},
			{
				type: 'why',
				title: 'Why the rule earns its keep here specifically',
				text: 'The CRDT is the part that has to be *right*, and the only way to be confident it is right is to test it exhaustively — thousands of randomised schedules, in milliseconds, in plain Node. That is only possible while it has no dependencies. The first import of a Svelte rune into `crdt/` would make its test suite need a browser, and a test suite that needs a browser is a test suite you run less often.'
			},

			{ type: 'h3', id: 'imports', text: 'The import style' },
			{
				type: 'code',
				lang: 'ts',
				code: `
// package.json
"imports": {
	"#lib": "./src/lib/index.js",
	"#lib/*": "./src/lib/*"
}`
			},
			{
				type: 'p',
				text: 'Node subpath imports rather than a bundler alias, so the same specifier works in Vite, in Vitest, and in a plain `node` process running a script. Every import carries its extension:'
			},
			{
				type: 'code',
				lang: 'ts',
				code: `
import { Clock } from '#lib/crdt/clock.ts';
import Board from '#lib/components/Board.svelte';
import { boardOps } from '#lib/board/index.ts';`
			},
			{
				type: 'warn',
				text: 'The extensions are not optional. Node’s ESM resolver does not guess, and the type-stripping runtime resolves `.ts` specifiers directly. Omit one and you get `ERR_MODULE_NOT_FOUND` naming a file that is plainly there. Ask anybody who has spent twenty minutes on it.'
			},

			{ type: 'h3', id: 'routes', text: 'The routes' },
			{
				type: 'terminal',
				code: `
routes/
  +layout.svelte               shell: fonts, theme, styles
  [[lang=locale]]/             optional language segment
    +page.svelte               the landing page
    sign-in/+page.svelte
    boards/+page.svelte        your boards
    boards/[board]/+page@.svelte   the editor — note the @
  embed/[board]/+page.svelte   the read-only viewer
  api/boards/[board]/
    stream/+server.ts          SSE: operations and presence
    snapshot/+server.ts        a board as JSON, for the embed`
			},
			{
				type: 'p',
				text: 'Two things to notice. `[[lang=locale]]` is an *optional* parameter with a matcher — `/fr/boards` and `/boards` are the same route. And `+page@.svelte`, with a bare `@`, resets the layout inheritance: the editor is a full-viewport application and does not want the site chrome its siblings share.'
			},
			{
				type: 'p',
				text: 'There are exactly two API routes, and both exist because they are *streams or documents*, not function calls. Everything else that would have been an endpoint is a remote function, which we get to in part 6.'
			},

			{
				type: 'checkpoint',
				items: [
					'You can name the four layers and the direction imports are allowed to flow.',
					'You know why `crdt/` must not import anything.',
					'You can explain what `+page@.svelte` does differently from `+page.svelte`.'
				]
			}
		]
	}
];
