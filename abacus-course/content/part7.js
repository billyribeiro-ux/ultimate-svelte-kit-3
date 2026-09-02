/**
 * PART 7 — Proving it and shipping it
 * (chapters 36–39)
 *
 * The unit and browser tests, the end-to-end suite with real passkeys and two
 * browsers on one sheet, the container and its CI, and where to go next.
 */

import { code } from './quote.js';

export const part7 = [
	{
		slug: 'unit-and-browser-tests',
		title: 'Unit and browser tests',
		summary:
			'Two Vitest projects: pure logic in Node, and the `$state` classes in a real Chromium. What each layer’s tests look like, and the one test that caught the bug the course is built around.',
		goal: 'Know which test runs where and why, and write a test for a runes class without rendering a component.',
		blocks: [
			code('vite.config.ts', 213, 258),
			{
				type: 'p',
				text: 'The `server` project is the fast loop: the formula language, the engine, the locale layer, the CSV parser, the identity code — pure TypeScript, deterministic, milliseconds. The `client` project is a real browser, because the sheet model uses runes and `flushSync`, and because a `.svelte.test.ts` file is the way to test a `$state` class without a component.'
			},
			code('src/lib/formula/formula.spec.ts', 10, 33),
			{
				type: 'p',
				text: 'The language is tested with a `Map` standing in for the grid, the clock fixed and `RAND` returning a constant. Every test is a formula and an expected value, which is the most readable kind of test there is.'
			},
			code('src/lib/formula/formula.spec.ts', 139, 168),
			code('src/lib/sheet/sheet.svelte.test.ts', 9, 34, { partial: true }),
			code('src/lib/sheet/sheet.svelte.test.ts', 58, 71),
			{
				type: 'p',
				text: '`flushSync` runs Svelte’s pending work now, so a test can assert on `$state` after an edit without rendering anything. The browser tests are what found the deletion-undo snapshot (ch. 16) and the `dirty` flag being set after a load.'
			},
			code('src/lib/sheet/sheet.svelte.test.ts', 122, 155),
			code('src/lib/sheet/locale.spec.ts', 68, 106),
			{
				type: 'terminal',
				code: `
$ pnpm run test:unit -- --run
 ✓ [server] src/lib/formula/formula.spec.ts (20 tests)
 ✓ [server] src/lib/engine/engine.spec.ts (20 tests)
 ✓ [server] src/lib/engine/engine.property.spec.ts (4 tests)
 ✓ [server] src/lib/sheet/locale.spec.ts, document.spec.ts, templates.spec.ts
 ✓ [server] src/lib/csv/parse.spec.ts, src/lib/grid/axis.spec.ts
 ✓ [server] src/lib/server/identity.spec.ts, src/routes/api/published/+server.test.ts
 ✓ [client] src/lib/sheet/sheet.svelte.test.ts (13 tests)  chromium`
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the sheet model’s tests run in a browser and the engine’s do not.',
					'You can explain what `flushSync` does in a test.',
					'You can write a test for `parseInput` in a locale you have never used, without knowing its separators.'
				]
			}
		]
	},

	{
		slug: 'end-to-end',
		title: 'End to end: two profiles, real passkeys, two browsers on one sheet',
		summary:
			'Playwright against the adapter’s own server on its own database, on a desktop and a phone profile. A virtual authenticator for the passkey ceremonies, two contexts for collaboration, and what the suite found.',
		goal: 'Run an end-to-end suite the way a deployment runs, test WebAuthn without a device, and read a failing test as a bug report.',
		blocks: [
			code('playwright.config.ts', 1, 32),
			code('playwright.config.ts', 33, 87),
			{
				type: 'p',
				text: 'Against `node build/index.js`, not `vite preview`, because the health endpoint, graceful shutdown and the Content Security Policy belong to the built server. Two projects, because the toolbar and the grid render differently at phone widths. One worker and no retries, because one SQLite file has one writer and a suite that passes on retry is a suite that hides races. `PUBLIC_ORIGIN` is identical in the build and in the server’s environment, and the config says why.'
			},
			code('e2e/passkeys.ts', 19, 52),

			{ type: 'h3', id: 'the-tests', text: 'The tests' },
			code('e2e/local.e2e.ts', 27, 44),
			code('e2e/local.e2e.ts', 122, 156),
			{
				type: 'p',
				text: 'The local sheet tests drive the grid the way a person does — click a cell, type, press Enter — and read back the cells, which is the only thing a person can read. The import test hands a file to the hidden input with `setInputFiles`, waits for the toast, and reads the exported file back through Playwright’s download API.'
			},
			code('e2e/account.e2e.ts', 25, 59),
			code('e2e/account.e2e.ts', 107, 146),
			{
				type: 'p',
				text: 'A real registration, a stored sheet that survives a reload, a stranger who cannot open it. Then settings: the same device refused for a second passkey, a second device accepted, one removed, sign out, and sign in again with nothing typed.'
			},
			code('e2e/collab.e2e.ts', 23, 82),
			{
				type: 'why',
				title: 'What the suite found',
				text: 'Five real bugs, none of which the unit tests could see. A cell that depended on another cell kept its old value on screen — the version subscription of chapter 15. The Unpublish button never appeared — the load snapshot of chapter 33. A person who closed their tab stayed in the room — the mailbox close of chapter 28. A Reconnect button flashed on every load and shifted the grid on a phone — chapter 33. And a tap on a phone landed one cell down and one across, because the pointer arrived in the frame between a scroll and its event, and the hit test used a stale scroll position — chapter 20’s `cellAt` now reads the element. Each one was a failing assertion with a screenshot, and each fix is a comment in the code that names the test.'
			},
			code('e2e/platform.e2e.ts', 45, 68),
			{
				type: 'terminal',
				code: `
$ pnpm exec playwright test
Running 46 tests using 1 worker
  ✓ [desktop] account · collab · lesson · local · platform  (23)
  ✓ [phone]   account · collab · lesson · local · platform  (23)
  46 passed`
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what a virtual authenticator does and does not fake.',
					'You can explain why the suite runs against the built server.',
					'You can pick one of the five bugs and say which assertion caught it.'
				]
			}
		]
	},

	{
		slug: 'deploying',
		title: 'Deploying: a container that migrates, listens and stops',
		summary:
			'A three-stage Dockerfile that bakes the origin in, runs as `node`, migrates before it listens and answers SIGTERM; a compose file; and a workflow that runs the suite, builds the image, probes the health check and stops the container cleanly.',
		goal: 'Ship a SvelteKit app with adapter-node the way it is actually deployed, and prove the image works in CI rather than assuming it.',
		blocks: [
			code('Dockerfile', 1, 33),
			{
				type: 'p',
				text: 'Three stages so the image that runs holds only what running needs. The origin is a *build* argument because SvelteKit bakes `paths.origin` into the server and the passkey relying-party id is derived from it: build one image per origin. `--frozen-lockfile` fails the build if the lockfile disagrees with `package.json` instead of resolving something newer.'
			},
			code('Dockerfile', 35, 51),
			code('Dockerfile', 53, 92),
			{
				type: 'why',
				title: 'Why the command is node --import ./scripts/migrate.ts build',
				text: 'The migration must run before the server listens, and the server must be PID 1 so that SIGTERM reaches it. A shell script would do the first and break the second — `sh -c "migrate && serve"` makes `sh` PID 1 and it does not forward the signal. `--import` runs the migration module to completion before the entry point starts, in one process, and Node 24 runs the TypeScript file directly. `SHUTDOWN_TIMEOUT` is what adapter-node gives in-flight requests after the signal; `HEALTHCHECK` asks the same question a load balancer would.'
			},
			code('compose.yaml', 1, 44),
			code('.dockerignore', 1, 22),

			{ type: 'h3', id: 'ci', text: 'The workflow' },
			code('../.github/workflows/abacus.yml', 1, 43),
			code('../.github/workflows/abacus.yml', 45, 87),
			{
				type: 'p',
				text: '`verify` runs exactly what a developer runs before pushing. The database for the unit tests is prepared with the migrations, Chromium is installed once for both Vitest and Playwright, and the traces are uploaded on failure.'
			},
			code('../.github/workflows/abacus.yml', 89, 127),
			{
				type: 'p',
				text: 'The `image` job builds the Dockerfile, starts the container the way compose does, waits for the health check, and then *stops it with SIGTERM and checks the exit code*. A Dockerfile that is never built is documentation; a graceful shutdown that is never exercised is a hope.'
			},
			code('../.github/workflows/abacus.yml', 129, 156),
			{
				type: 'checkpoint',
				items: [
					'You can say why `PUBLIC_ORIGIN` is a build argument and `SESSION_SECRET` is not.',
					'You can explain what `--import` buys over a shell script.',
					'You can name the three things the `image` job proves.'
				]
			}
		]
	},

	{
		slug: 'where-next',
		title: 'Where next',
		summary:
			'How the project was scaffolded and checked, the `verify` gate, and five directions it could go: charts, conditional formatting, a shared broadcaster, an interval tree, spilling.',
		goal: 'Leave with a list of things worth building next, each with the file it would start in.',
		blocks: [
			code('AGENTS.md', 1, 23),
			code('package.json', 11, 30),
			{
				type: 'p',
				text: '`sv create` with the `ai-tools` add-on wrote `AGENTS.md`, which tells an AI assistant how to use the Svelte MCP server — the documentation and an autofixer. The autofixer earned its place while writing this project: it flagged two pieces of state assigned inside effects, and both became the assignable deriveds of chapter 21. `verify` is the gate, and everything in this course passed it.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm run verify
  check     svelte-check: 0 errors, 0 warnings · tsc (worker): clean
  lint      prettier + eslint: clean
  test:unit 86 passed  (server: node · client: chromium)
  build     adapter-node · 11 routes · 5 prerendered · precompressed
  test:e2e  46 passed  (23 scenarios × desktop, phone)`
			},
			{ type: 'h3', id: 'five-directions', text: 'Five directions' },
			{
				type: 'ol',
				items: [
					'**Charts from a range.** A `chart` cell format, a `<canvas>` drawn from `tabulate`’s rows, and the same `sheet.version` subscription the grid uses. Everything it needs already exists in chapter 15.',
					'**Conditional formatting.** A rule is a criterion (ch. 08) applied to a rectangle; the grid already turns cell facts into classes. `CellFormat` grows a `rules` array and `formatScalar` stays as it is.',
					'**A shared broadcaster.** `live.ts` is in-process. Postgres `NOTIFY` or a Redis stream makes it work across instances, and the mailbox and the generator stay exactly as they are.',
					'**An interval tree for ranges.** The engine scans its range list per changed cell (ch. 09). The property test in chapter 12 is what lets you replace that with a tree and know you did not break anything.',
					'**Spilling.** `=A1:A3` in one cell is an error today (`toScalar`). Writing the range into the cells below, and marking them as spilled so a person cannot type over them, is a project of its own — and the engine’s `Recalc.changed` list is where it starts.'
				]
			},
			{
				type: 'checkpoint',
				items: [
					'You can run `pnpm run verify` from a fresh clone and get green.',
					'You can point at the file where each of the five directions would start.',
					'You have opened every file this course quoted, and one it did not.'
				]
			}
		]
	}
];
