/**
 * PART 0 — Orientation (chapters 01–04)
 *
 * What we're building, why the two hard parts are hard, and getting a project on
 * disk. Assumes the reader finished the StrikeFlow course, so it does not
 * re-teach HTML, CSS, JavaScript or what a component is.
 */

export const part0 = [
	{
		slug: 'what-we-are-building',
		title: 'What we are building',
		summary: 'A booking platform, and an honest look at the two things that make one hard.',
		goal: 'A clear picture of the finished app, and of the two problems the rest of the course exists to solve.',
		blocks: [
			{
				type: 'p',
				text: 'We are building **Halfpast**: a booking page for a small studio — a hairdresser, a physiotherapist, a tattooist, a dog groomer. A customer picks a service, picks a time, gives a name and an email, and is booked. The studio gets a diary that updates itself.'
			},
			{
				type: 'p',
				text: 'That description takes eleven seconds to say and hides two problems that are genuinely difficult. Almost everything in this course is downstream of one of them.'
			},

			{ type: 'h3', id: 'problem-one', text: 'Problem one: two people, one eleven o’clock' },
			{
				type: 'p',
				text: 'Two customers open the booking page at the same moment. Both see 11:00 free. Both tap it. Both fill in their name. Both press the button within the same second.'
			},
			{
				type: 'p',
				text: 'The obvious code does this:'
			},
			{
				type: 'code',
				file: 'the wrong way',
				lang: 'ts',
				code: `
// Is the slot free?
const clash = await db.select().from(booking).where(overlaps(start, end));

if (clash.length === 0) {
	// It's free — take it.
	await db.insert(booking).values({ start, end, customerId });
}`
			},
			{
				type: 'p',
				text: 'Read it again with two people running it at once. Request A checks and finds nothing. Request B checks and finds nothing — because A has not inserted yet. A inserts. B inserts. Two customers, one chair, one very awkward Tuesday morning.'
			},
			{
				type: 'warn',
				text: 'Wrapping that in a transaction does **not** fix it. A transaction gives you atomicity — all of it happens or none of it does — not exclusion. Both transactions still read the same empty result, and both still commit. This is the single most common serious bug in booking software.'
			},
			{
				type: 'p',
				text: 'The window is a few milliseconds wide, which is exactly what makes it dangerous: it never happens while you are testing, and it happens constantly on the morning the studio posts a promotion.'
			},
			{
				type: 'why',
				title: 'Why we cannot just be careful',
				text: 'There is no amount of careful ordering that closes a check-then-act race. The fix is structural: make the check and the act the *same operation*, and let the database — which is genuinely good at this — be the one that says no. Chapter 17 does exactly that.'
			},

			{ type: 'h3', id: 'problem-two', text: 'Problem two: time is not what you think' },
			{
				type: 'p',
				text: 'A studio says "we open at nine". That sentence contains no information about any particular moment. It is a claim about a clock on a wall.'
			},
			{
				type: 'p',
				text: 'An appointment, on the other hand, *is* a moment: a single point on the world’s timeline that everybody experiences simultaneously, whatever their clock says. Confusing those two is how a customer in Lisbon books a 9am haircut and arrives at 8am.'
			},
			{
				type: 'p',
				text: 'And twice a year the mapping between them breaks. On one Sunday in spring, 01:30 does not exist. On one Sunday in autumn, 01:30 happens twice. Software that assumes a day is 24 hours long is wrong on both of those days, and the bug reports it generates are almost impossible to read.'
			},
			{
				type: 'note',
				text: 'We will build a small time layer — four files — that keeps these ideas apart, and we will write tests that prove it behaves correctly on both of those mornings without waiting six months to find out.'
			},

			{ type: 'h3', id: 'the-shape', text: 'The shape of the finished thing' },
			{
				type: 'p',
				text: 'Two audiences, two halves of the app.'
			},
			{
				type: 'ul',
				items: [
					'**The customer** never makes an account. They land on `/book/willow-lane`, choose, book, and get a link that lets them see or cancel the appointment. Forcing a password on somebody who wants a haircut is how a booking page loses half its traffic.',
					'**The studio** signs in at `/manage/willow-lane` and gets a diary that updates itself, plus screens for services, working hours, the team and the rules customers book under.'
				]
			},
			{
				type: 'p',
				text: 'The word "updates itself" is doing real work there. When a booking arrives from the website it appears on the receptionist’s screen within a second, with nobody pressing anything. When somebody takes the 11:15, it vanishes from every other customer’s screen. That is not a nicety — it is what stops two people trying for the same slot in the first place.'
			},

			{ type: 'h3', id: 'what-you-need', text: 'What you need before starting' },
			{
				type: 'p',
				text: 'This course assumes you finished **Building StrikeFlow**, the first course in this series. It does not re-teach what a component is, what `$state` does, how CSS custom properties work, or why we use `pnpm`.'
			},
			{
				type: 'p',
				text: 'What it does assume you have not met yet: databases, transactions, authentication, real-time streams, and time zones. Those are the new material, and they are introduced from nothing.'
			},
			{
				type: 'ul',
				items: [
					'**Node 24.20.0** or newer — the current LTS. Chapter 3 covers installing it.',
					'**pnpm 11** — installed with `npm i -g pnpm`.',
					'A terminal, an editor, and a browser. No database server: SQLite lives in a file.'
				]
			},
			{
				type: 'checkpoint',
				text: 'You can describe, in your own words, why checking whether a slot is free and then booking it is unsafe — and why a transaction alone does not save you.'
			}
		]
	},

	{
		slug: 'how-the-pieces-fit',
		title: 'How the pieces fit',
		summary: 'A map of the app before we write any of it.',
		goal: 'A mental model of the layers, so every later chapter has somewhere to attach itself.',
		blocks: [
			{
				type: 'p',
				text: 'It is easier to build something when you can already picture where each part goes. Here is the whole app in one page. Nothing here needs memorising — come back to it when a later chapter feels unmoored.'
			},

			{ type: 'h3', id: 'layers', text: 'Five layers' },
			{
				type: 'code',
				file: 'the stack, top to bottom',
				lang: 'text',
				code: `
  ┌──────────────────────────────────────────────────────────┐
  │  Pages          src/routes/**                            │
  │                 What a person sees. No business rules.   │
  ├──────────────────────────────────────────────────────────┤
  │  Remote fns     *.remote.ts                              │
  │                 The client/server boundary. Validates    │
  │                 every argument. Checks who you are.      │
  ├──────────────────────────────────────────────────────────┤
  │  Services       src/lib/server/scheduling.ts             │
  │                 Booking, cancelling, reading the diary.  │
  │                 Transactions live here.                  │
  ├──────────────────────────────────────────────────────────┤
  │  Time           src/lib/time/**                          │
  │                 Pure functions. No database, no clock.   │
  ├──────────────────────────────────────────────────────────┤
  │  Database       src/lib/server/db/**                     │
  │                 Tables, and the constraint that makes    │
  │                 double-booking impossible.               │
  └──────────────────────────────────────────────────────────┘`
			},
			{
				type: 'p',
				text: 'The rule that keeps this honest: **each layer may only call the one below it.** A page never touches the database. A time function never reads the clock — you pass `now` in. That last one sounds pedantic until chapter 9, where it is the only reason we can test what happens in October without waiting until October.'
			},

			{ type: 'h3', id: 'the-grid', text: 'The idea that holds it together' },
			{
				type: 'p',
				text: 'One decision runs through every layer, so it is worth meeting early: **the diary is not continuous.** It is a row of five-minute cells.'
			},
			{
				type: 'code',
				file: 'a morning, as the database sees it',
				lang: 'text',
				code: `
 09:00  09:05  09:10  09:15  09:20  09:25  09:30  09:35  09:40  09:45
  ███    ███    ███    ███    ███    ███    ███    ███    ███    ░░░
  └──────────────── one 45-minute appointment ──────────────┘

  ███ = claimed, one row in the database each
  ░░░ = free`
			},
			{
				type: 'p',
				text: 'An appointment does not store "09:00 to 09:45". It stores nine rows, one per cell, and the database has a rule that says two rows cannot claim the same cell for the same person. "Is it free?" stops being a question we ask and becomes a question the database answers, atomically, by refusing.'
			},
			{
				type: 'why',
				title: 'Why five minutes',
				text: 'Small enough that nobody notices the quantisation — no salon books a 47-minute haircut — and large enough that a whole day is 288 rows rather than 86,400. Five also divides evenly into an hour, which matters more than it sounds: every cell boundary lands on a clean multiple in every time zone on Earth, including the ones offset by 30 or 45 minutes.'
			},

			{ type: 'h3', id: 'requests', text: 'What happens when somebody books' },
			{
				type: 'ol',
				items: [
					'The browser calls `book(...)` — which looks like a normal function, and is really a POST to an endpoint SvelteKit generated.',
					'A **valibot** schema validates every field. If anything is wrong, the handler never runs.',
					'The service layer opens a **transaction**.',
					'Inside it, availability is recomputed **on the server**. What the browser believed is a hint, never an authority.',
					'The booking row is inserted.',
					'The slot claims are inserted — one statement, nine rows. If any cell is taken, the database refuses, the whole transaction rolls back, and the customer is told the truth.',
					'On success, a message goes to the in-process notice board, and every open page watching that studio re-reads the diary.'
				]
			},
			{
				type: 'note',
				text: 'Step 4 is the one people skip. If you trust the instant the browser sent, anybody who opens the network tab can book a time that was never on offer — outside opening hours, at 3am, in the past.'
			},
			{
				type: 'checkpoint',
				text: 'You can name the five layers and say which direction calls flow, and you can explain what a "slot claim" row represents.'
			}
		]
	},

	{
		slug: 'node-and-tooling',
		title: 'Node, pnpm and the floor',
		summary: 'Getting the right runtime, and making the project refuse the wrong one.',
		goal: 'Node 24 LTS installed, pnpm ready, and an understanding of why the version is pinned rather than suggested.',
		blocks: [
			{
				type: 'p',
				text: 'Node has two release lines at any time. **Current** gets the new features; **LTS** — long-term support — gets the bug fixes and is what you run in production. Even-numbered majors become LTS in October of their year.'
			},
			{
				type: 'p',
				text: 'This project targets **Node 24.20.0**, codename Krypton, the active LTS line. Check what you have:'
			},
			{ type: 'terminal', code: 'node --version' },
			{
				type: 'p',
				text: 'If that says anything below 24, install it. The friendliest way is `nvm`, which lets several versions live side by side:'
			},
			{
				type: 'terminal',
				code: `nvm install 24.20.0
nvm use 24.20.0
node --version   # v24.20.0`
			},
			{
				type: 'note',
				text: 'Do not take a version number from a tutorial — including this one — as current. The authoritative list is `https://nodejs.org/dist/index.json`: every release, with its date and whether it is LTS. It is a plain JSON file and you can read it in a browser.'
			},

			{ type: 'h3', id: 'engines', text: 'Making the project insist' },
			{
				type: 'p',
				text: 'A README that says "requires Node 24" is a wish. A little configuration makes the project speak up for itself.'
			},
			{
				type: 'code',
				file: 'package.json',
				lang: 'json',
				code: `
{
	"engines": {
		"node": ">=24.20.0"
	}
}`
			},
			{
				type: 'code',
				file: '.npmrc',
				lang: 'ini',
				code: `engine-strict=true`
			},
			{
				type: 'p',
				text: 'On its own, `engines` is advisory. What `engine-strict=true` buys you depends on which tool reads it: **npm** turns the mismatch into a refusal, while **pnpm 11** — what this project actually installs with — still carries on, but complains loudly. Run `pnpm install` under Node 22 and you get:'
			},
			{
				type: 'terminal',
				code: ` WARN  Unsupported engine: wanted: {"node":">=24.20.0"} (current: {"node":"v22.11.0","pnpm":"11.24.0"})`
			},
			{
				type: 'p',
				text: 'If you want pnpm to refuse outright rather than warn, set `engineStrict: true` in `pnpm-workspace.yaml`. Then the same install stops dead with `ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)` before touching a single package.'
			},
			{
				type: 'why',
				title: 'Why this is worth the friction',
				text: 'Because the alternative is a colleague installing on Node 20, everything appearing to work, and a subtly different result appearing in production three weeks later. A loud complaint on day one — or better, a refusal — is cheaper than a quiet failure on day twenty-one.'
			},
			{
				type: 'p',
				text: 'Add an `.nvmrc` too, so `nvm use` in the project folder picks the right one with no arguments:'
			},
			{ type: 'code', file: '.nvmrc', lang: 'text', code: '24.20.0' },

			{ type: 'h3', id: 'icu', text: 'A version really can change behaviour' },
			{
				type: 'p',
				text: 'It is tempting to treat the Node version as bookkeeping. Here is a real example from this project, discovered while moving from 22 to 24.'
			},
			{
				type: 'code',
				file: 'the same code, two runtimes',
				lang: 'js',
				code: `
new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	notation: 'compact',
	maximumFractionDigits: 2
}).format(5600);

// Node 22 (ICU 78.2) → "$5.60K"
// Node 24 (ICU 78.3) → "$5.6K"`
			},
			{
				type: 'p',
				text: '`Intl` is implemented by ICU, the Unicode library Node bundles, and ICU changes between releases. A test asserting the exact string `"$5.60K"` is not testing your formatting function — it is testing which Node is installed, and it fails on upgrade for a reason that has nothing to do with your code.'
			},
			{
				type: 'note',
				text: 'The lesson, which we apply throughout: when asserting on `Intl` output, match a *pattern* that captures what your app actually needs — the right symbol, the right suffix, at most two decimals — not a byte-exact string.'
			},

			{ type: 'h3', id: 'pnpm', text: 'pnpm' },
			{ type: 'terminal', code: 'npm install -g pnpm\npnpm --version   # 11.x' },
			{
				type: 'checkpoint',
				text: '`node --version` reports 24.20.0 or newer, and `pnpm --version` reports 11 or newer.'
			}
		]
	},

	{
		slug: 'scaffolding',
		title: 'Scaffolding the project',
		summary: 'One command, and a tour of what it produced.',
		goal: 'A running SvelteKit 3 project with a database, authentication and a test runner already wired in.',
		blocks: [
			{
				type: 'p',
				text: 'The Svelte CLI can set up far more than an empty app. Everything after `--add` is an *addon*: a preset that installs packages, writes config, and stitches them together correctly.'
			},
			{
				type: 'terminal',
				code: `npx -y sv@next create halfpast-app \\
  --template minimal --types ts \\
  --add prettier eslint "vitest=usages:unit,component" playwright \\
        "sveltekit-adapter=adapter:node" \\
        "drizzle=database:sqlite+client:libsql" \\
        "better-auth=demo:password" \\
        "experimental=features:async,remoteFunctions" \\
  --install pnpm --no-dir-check --no-download-check`
			},
			{
				type: 'p',
				text: 'Reading that list from the end backwards is the fastest way to understand it:'
			},
			{
				type: 'ul',
				items: [
					'`experimental=features:async,remoteFunctions` — turns on `await` in components and the `query`/`form`/`command` functions. The whole data layer depends on both.',
					'`better-auth=demo:password` — email-and-password sign-in for staff.',
					'`drizzle=database:sqlite+client:libsql` — a typed query builder over SQLite. libSQL is a SQLite fork that speaks the same SQL and can also talk to a hosted database later, with no code change.',
					'`sveltekit-adapter=adapter:node` — build to a plain Node server you can run anywhere.',
					'`playwright` and `vitest` — end-to-end and unit testing.'
				]
			},
			{
				type: 'warn',
				text: 'The vitest addon takes `vitest=usages:unit,component`, not `vitest=unit,component`. The shorter form fails with an unhelpful message. Addon options are `name=key:value` pairs, and `usages` is the key.'
			},

			{ type: 'h3', id: 'tour', text: 'What you got' },
			{
				type: 'code',
				file: 'the folders that matter',
				lang: 'text',
				code: `
halfpast-app/
├── src/
│   ├── routes/          pages and endpoints; folders become URLs
│   ├── lib/             everything else; imported as #lib/…
│   │   └── server/      never reaches the browser — enforced, not hoped
│   ├── app.html         the HTML shell every page is poured into
│   ├── app.d.ts         types for locals, errors, page data
│   ├── env.ts           NEW in Kit 3 — every env var, declared
│   └── hooks.server.ts  runs on every request, before any route
├── static/              copied to the site root verbatim
├── drizzle.config.ts    for the database CLI
├── vite.config.ts       ALL framework config — there is no svelte.config.js
└── tsconfig.json`
			},
			{
				type: 'why',
				title: 'src/lib/server is a real boundary',
				text: 'Anything under it is a server-only module. Import one from a component and the build *fails* — it does not warn, it does not tree-shake it away and hope. That is what stops a database URL or a signing key reaching the browser, and it is why the database client lives there.'
			},

			{ type: 'h3', id: 'no-config-file', text: 'The missing svelte.config.js' },
			{
				type: 'p',
				text: 'If you have used SvelteKit 2, the absence of `svelte.config.js` will be the first surprise. In Kit 3 every framework option is an argument to the `sveltekit()` plugin in `vite.config.ts`.'
			},
			{
				type: 'code',
				file: 'vite.config.ts (the shape of it)',
				lang: 'ts',
				code: `
export default defineConfig(({ mode }) => {
	/* … */
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

	return {
		plugins: [
			sveltekit({
				/* … */
				paths: { origin: env.PUBLIC_ORIGIN },

				compilerOptions: {
					/* … */
					experimental: { async: true }
				},

				adapter: adapter(),

				experimental: {
					/* … */
					remoteFunctions: true
				},
				/* … */
			}),
			/* … */
		],
		/* … */
	};
});`
			},
			{
				type: 'p',
				text: 'Notice the outer shape before anything else: the config is a *function* of `({ mode })` that returns the object, not the object itself. That shape is load-bearing, not stylistic — the function form is what lets the config read the environment with `loadEnv` before building, which `paths.origin` needs.'
			},
			{
				type: 'p',
				text: 'This is not cosmetic tidying. In Kit 2 the Vite plugin had to asynchronously load your config file before it could do anything, which made a whole family of setup-ordering bugs possible. Now Vite hands the config straight to the plugin.'
			},

			{ type: 'h3', id: 'cleanup', text: 'Clearing the demo' },
			{
				type: 'p',
				text: 'The addons leave working examples behind. Read them once, then delete them — they will otherwise sit in your routes forever, and a demo login page in a real app is a liability.'
			},
			{ type: 'terminal', code: 'rm -rf src/routes/demo src/lib/vitest-examples' },
			{
				type: 'p',
				text: 'Then check it runs:'
			},
			{ type: 'terminal', code: 'pnpm run dev' },
			{
				type: 'checkpoint',
				text: 'A page loads at `http://localhost:5173`, and `src/routes/demo` no longer exists.'
			}
		]
	}
];
