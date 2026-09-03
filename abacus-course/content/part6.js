/**
 * PART 6 — The pages
 * (chapters 30–35)
 *
 * The shell and the design tokens, the landing page and the prerendered
 * templates, the local sheet, the stored sheet, the workspace with sign-in and
 * settings, and the pages that ship no JavaScript at all.
 */

import { code } from './quote.js';

export const part6 = [
	{
		slug: 'the-shell',
		title: 'The shell: layouts, tokens, toasts',
		summary:
			'A root layout that is almost empty so the embed can reset to it, an app layout with the header and the “new version” banner, design tokens that are light first with `light-dark()`, forced colours, print, and toasts mounted imperatively.',
		goal: 'Structure layouts so a page can opt out of the chrome, and build a token layer that survives dark mode, high contrast and paper.',
		blocks: [
			code('src/routes/+layout.svelte', 1, 50),
			{
				type: 'p',
				text: 'The root layout is deliberately almost empty, so that a page which must have *no* chrome — the embed — can reset to it with `+page@.svelte`. What it does own is the view transition: `onNavigate` returns a promise SvelteKit awaits, `startViewTransition` gives the browser both states to cross-fade, and a fallback timer makes sure a transition can never hold a navigation hostage.'
			},
			code('src/routes/(app)/+layout.svelte', 1, 40),
			{
				type: 'p',
				text: 'The parentheses in `(app)` make it a layout group: a folder that adds a layout without adding a segment to the URL. `beforeNavigate` with `updated.current` is the versioning story from chapter 02 finishing: when a new build has been deployed, the next navigation becomes a full load.'
			},
			code('src/routes/(app)/+layout.svelte', 42, 98),
			{
				type: 'why',
				title: 'Why the header asks whoAmI instead of reading layout data',
				text: 'The person’s name could be layout `data`. It is a remote query instead, awaited in markup inside a boundary, because the passkey commands and the sign-out form call `whoAmI().refresh()` — and a query awaited in a component updates in place, in the same response, while layout data would need a page invalidation. `$state.eager(pathname)` on the current-link class is the one place the *incoming* pathname is wanted before the new page’s awaits settle.'
			},

			{ type: 'h3', id: 'tokens', text: 'Tokens' },
			code('src/lib/styles/tokens.css', 1, 60, { partial: true }),
			{
				type: 'p',
				text: 'A spreadsheet is a sheet of paper, so the light theme is the design and the dark theme is a translation — the opposite of project 6, for the same reason: design the one people will live in. Every colour is a `light-dark()` pair and the browser picks by system setting. Windows High Contrast replaces every colour with a system one, so the rules that matter are restated in `forced-colors` with keywords that survive.'
			},
			code('src/lib/styles/tokens.css', 138, 151),
			code('src/lib/styles/base.css', 181, 201),
			{
				type: 'p',
				text: 'A published sheet is something people print. The app chrome goes, the table stays, and nothing splits a row across two pages.'
			},

			{ type: 'h3', id: 'toasts', text: 'Toasts' },
			code('src/lib/toast/toast.ts', 1, 34),
			{
				type: 'p',
				text: '`toast(\'Saved\')` from anywhere, with no `<Toasts />` host to remember to render. `mount` creates a component at a target and `unmount` removes it, with `{ outro: true }` so its `transition:fly` plays on the way out — the same two functions SvelteKit uses to start the app, used for the one component that belongs to no page.'
			},
			code('src/routes/+error.svelte', 1, 31),
			{
				type: 'checkpoint',
				items: [
					'You can say why the header lives in `(app)/+layout.svelte` and not the root.',
					'You can explain how a page resets to the root layout.',
					'You can say what `light-dark()` does and what `forced-colors` is for.'
				]
			}
		]
	},

	{
		slug: 'the-landing-and-templates',
		title: 'The landing page and the prerendered templates',
		summary:
			'A prerendered landing page with a GSAP entrance behind an attachment and `hydratable` random dots, and template pages prerendered from `entries()` with their formulas already computed on the server.',
		goal: 'Prerender pages that have dynamic parameters, animate an entrance without blanking the page, and use `hydratable` for a value the server and client must agree on.',
		blocks: [
			code('src/routes/(app)/+page.ts', 1, 7),
			code('src/routes/(app)/+page.svelte', 1, 35),
			{
				type: 'why',
				title: 'Why the drifting dots use hydratable',
				text: 'The hero has eighteen dots at random positions. Render them on the server and the browser would render eighteen *different* random positions during hydration, and Svelte would find the markup did not match. `hydratable(key, fn)` runs the function on the server, serialises the result into the page, and hands the browser the same value under the same key. The random numbers are computed once, and hydration finds what it expects.'
			},
			code('src/routes/(app)/+page.svelte', 45, 72),
			code('src/lib/motion/cinematic.ts', 1, 55),
			{
				type: 'p',
				text: 'The entrance is an attachment, so the markup says `{@attach cinematic()}` and nothing else. GSAP is imported dynamically inside it so its sixty kilobytes never reach anyone who does not see the animation; `prefersReducedMotion` is checked first; and nothing in the stylesheet starts at `opacity: 0`, so a failed import leaves the page visible. Restraint is the design: one timeline, a second long.'
			},

			{ type: 'h3', id: 'templates', text: 'Templates from entries' },
			code('src/routes/(app)/templates/[slug]/+page.ts', 1, 20),
			{
				type: 'p',
				text: 'A dynamic route cannot be prerendered unless SvelteKit knows its parameters; `entries` lists them, and the list is the same array the templates module exports, so adding a template adds a page. The `load` runs the engine — on the build machine — and the page arrives with the numbers in it.'
			},
			code('src/routes/(app)/templates/[slug]/+page.svelte', 1, 41),
			{
				type: 'p',
				text: 'Two ways in: a local copy with no account, or — if `whoAmI()` says somebody is signed in — a form that saves the template into the account. The form is `create` from chapter 27 with two hidden fields, and it works with JavaScript off.'
			},
			code('src/lib/components/SheetTable.svelte', 1, 37),
			code('src/lib/components/Section.svelte', 1, 26),
			{
				type: 'checkpoint',
				items: [
					'You can say what would go wrong if the dots used `Math.random()` directly.',
					'You can explain why `entries` returns the template slugs and not a hard-coded list.',
					'You can say why `<svelte:element this={…}>` is used for the section heading.'
				]
			}
		]
	},

	{
		slug: 'the-local-sheet',
		title: 'The local sheet: OPFS and a BroadcastChannel',
		summary:
			'No account, no server. The document lives in the Origin Private File System with `localStorage` as a fallback, two tabs stay in step over a `BroadcastChannel`, and signing in offers to save it to an account through a form.',
		goal: 'Persist a document in the browser’s private file system, synchronise tabs without a server, and hand a whole document to a form.',
		blocks: [
			code('src/lib/sheet/local.ts', 1, 29),
			code('src/lib/sheet/local.ts', 31, 70),
			{
				type: 'p',
				text: 'OPFS is a real file, private to this site, that survives a reload and a restart. It is not everywhere yet, so `localStorage` is the fallback, both behind the same two functions, and the page never knows which it got — except to say so in the status chip.'
			},
			code('src/lib/sheet/local.ts', 86, 134),
			{
				type: 'p',
				text: 'A `BroadcastChannel` is a message bus between the tabs of one origin with no server in the loop. Each tab has an id kept in `sessionStorage` for its life, and tags its operations with it so a tab can ignore itself — a channel does not echo, but the id makes that explicit and survives somebody changing the transport.'
			},

			{ type: 'h3', id: 'the-page', text: 'The page' },
			code('src/routes/(app)/sheet/local/+page.svelte', 14, 46),
			{
				type: 'p',
				text: 'Every operation the sheet emits goes to the channel and schedules a save, debounced by four hundred milliseconds. `?template=budget` starts from a template; `?from=<id>` starts from a published sheet — both are “make me a copy of this” without an account.'
			},
			code('src/routes/(app)/sheet/local/+page.svelte', 48, 100),
			code('src/routes/(app)/sheet/local/+page.svelte', 107, 140),
			{
				type: 'why',
				title: 'Why the title is a function binding',
				text: 'The title is an `<h1>` you can type into. `bind:textContent={() => sheet.title, (text) => sheet.rename(text)}` is a function binding: the getter feeds the element, the setter is called with what was typed, and `rename` trims it, refuses an empty title and emits an operation. The element stays a heading — no `role="textbox"` — because a contenteditable heading is already editable to assistive technology, and the accessibility check in `svelte-check` says so.'
			},
			{
				type: 'p',
				text: '“Save to my account” is the `create` form with the whole document in a hidden field, kept current by a `$derived` that re-serialises on every version. The form posts JSON the server validates with the same `DocumentSchema` — the one from chapter 14 — and redirects to the new sheet.'
			},
			code('e2e/local.e2e.ts', 158, 177),
			{
				type: 'checkpoint',
				items: [
					'You can say what `saveLocal` returns and what the page does with each answer.',
					'You can explain why each tab has an id and where it lives.',
					'You can say how the whole document gets into a form with JavaScript off.'
				]
			}
		]
	},

	{
		slug: 'the-stored-sheet',
		title: 'The stored sheet: a universal load, a live query, a query in the component',
		summary:
			'A universal `load` that calls remote queries and redirects to sign in. A page that reads its initial document once with `untrack`, applies live messages from `stream.current` in an effect, and reads the sheet record from the query so publishing and sharing update in place.',
		goal: 'Combine a load, a live query and component-level queries on one page, and know which of the three each piece of data should come from.',
		blocks: [
			code('src/routes/(app)/sheet/[id]/+page.ts', 1, 18),
			{
				type: 'p',
				text: 'A universal `load`, so the remote queries run on the server for the first visit and in the browser after. Nobody signed in is sent to sign in and brought back afterwards — the `next` parameter — and the sheet and the person’s locale are loaded together.'
			},
			code('src/routes/(app)/sheet/[id]/+page.svelte', 14, 33),
			{
				type: 'p',
				text: 'The first document is read *once*, at creation, with `untrack`. A later `data` change — a refresh, a navigation to the same route — must not throw away the edits in the sheet model, so the model is built from a snapshot rather than from a reactive read.'
			},
			code('src/routes/(app)/sheet/[id]/+page.svelte', 55, 67),
			{
				type: 'why',
				title: 'Why the record comes from the query and not from data',
				text: 'The page shows whether the sheet is published and who may open it. Those change when the person clicks Publish or picks a sharing option — commands and forms that call `getSheet(id).refresh()`. A query awaited in the component updates in place when it is refreshed; `data` is a snapshot of what the load returned. The first version read `data.sheet` and the Unpublish button never appeared, because the load did not re-run. `await` inside `$derived` resolves at once from the cache the load already filled, so there is no second request and no flash.'
			},
			code('src/routes/(app)/sheet/[id]/+page.svelte', 86, 106, { partial: true }),
			code('src/routes/(app)/sheet/[id]/+page.svelte', 113, 156),
			{
				type: 'p',
				text: 'The header shows the connection state — “Saved”, “Saving…”, “Connecting…”, “Reconnecting…” with a button, “Offline”, “Could not save” — and a chip for everybody else in the room. `stream.current` being still empty tells “not connected yet” from “lost the connection”, and only the second deserves a Reconnect button; one that appeared for a moment on every load shifted the grid under a finger on a phone, and the end-to-end suite noticed.'
			},
			code('src/routes/(app)/sheet/[id]/+page.svelte', 158, 236),
			{
				type: 'p',
				text: 'Sharing and publishing live in a native popover. The access setting is a *form* — two radios that submit on change — because a setting that survives a page with no JavaScript survives anything. Publishing is a command with a result, so it is a button.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can name the three sources of data on this page — load, live query, component query — and say what each is right for.',
					'You can explain what `untrack(() => data)` prevents.',
					'You can say why the Reconnect button waits for `stream.current`.'
				]
			}
		]
	},

	{
		slug: 'workspace-signin-settings',
		title: 'The workspace, sign-in and settings',
		summary:
			'A list of sheets with a create form (`preflight`, `enhance`), per-card rename and delete (`.for(id)`, `withOverride`), the sign-in page that runs the passkey ceremonies, and settings with a profile form and passkey management.',
		goal: 'Use every remote-form feature for something: client-side preflight, enhanced submission, per-instance forms, optimistic overrides, and a form that reissues the session cookie.',
		blocks: [
			code('src/routes/(app)/sheets/+page.svelte', 9, 38),
			{
				type: 'p',
				text: '`create.preflight(schema)` validates on the client before anything is sent — the same valibot the server runs, so “give it a title” appears on the keystroke — and `.enhance` wraps the submission so a failure becomes a toast rather than a page.'
			},
			code('src/routes/(app)/sheets/+page.svelte', 45, 72),
			code('src/routes/(app)/sheets/+page.svelte', 74, 139),
			{
				type: 'why',
				title: 'Why delete takes the card off the screen before the server answers',
				text: '`remove.for(sheet.id)` gives each card its own form instance, so a pending delete disables its own button and no other. `f.submit().updates(getMine().withOverride(list => …))` applies an optimistic override to the workspace query — the card disappears now — and the server’s `requested(getMine, 1).refreshAll()` replaces the override with the truth in the same response. If the delete fails, the override is dropped and the card comes back. The `{:else}` on the `each` is the empty state, and `failed` on the boundary is the error state with a `reset`.'
			},

			{ type: 'h3', id: 'signin', text: 'Sign in' },
			code('src/routes/(app)/signin/+page.svelte', 14, 58),
			{
				type: 'p',
				text: 'Two buttons and a name field. Both ceremonies run in the browser’s own credential prompt, and this page only starts them and reads the result. `next` is checked to be a path on this site — a `?next=https://elsewhere` must not become a redirect to elsewhere.'
			},
			code('src/routes/(app)/signin/+page.svelte', 65, 114),

			{ type: 'h3', id: 'settings', text: 'Settings' },
			code('src/routes/(app)/settings/+page.svelte', 15, 58),
			code('src/routes/(app)/settings/+page.svelte', 82, 121),
			{
				type: 'p',
				text: 'The profile is awaited in markup with a `$derived`, and the form is `updateProfile` with a preflight. The name is in the session cookie, so the handler reissues it — `startSession` again — and refreshes `whoAmI`, which is why the header changes without a reload. The locale select shows what each locale does to the same number, which is the one thing a person picking a locale wants to see.'
			},
			code('src/routes/(app)/settings/+page.svelte', 123, 176),
			{
				type: 'p',
				text: 'Passkeys are listed from a query, each with its own `removePasskey.for(id)` form, and the server refuses to remove the last one — an account with no passkey is an account nobody can open. Adding one on this device runs the registration ceremony for an existing user; the same device is refused, and the test in chapter 37 attaches a second virtual device to prove a second key works.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `preflight` runs and what it does not replace.',
					'You can trace a delete from the click to the card disappearing to the server confirming it.',
					'You can explain why updating a name reissues the cookie.'
				]
			}
		]
	},

	{
		slug: 'published-and-embed',
		title: 'Published sheets, the embed, the API and the health check',
		summary:
			'Pages with `csr = false` ship no JavaScript: a published sheet as a table that prints, an embed reset to the root layout and allowed inside an iframe, a `QUERY` handler beside a `GET`, and a health endpoint that reports the build version.',
		goal: 'Serve pages with no JavaScript when nothing needs it, reset a layout for a framed page, and write a search endpoint with the HTTP method that means “a read with a body”.',
		blocks: [
			code('src/routes/(app)/s/[id]/+page.ts', 1, 16),
			{
				type: 'p',
				text: '`csr = false` means the server renders the page and the browser gets HTML and CSS and nothing else: nothing to hydrate, nothing to download, a page that prints. The engine runs on the server — it is plain TypeScript — and the table arrives as text. The end-to-end suite asserts the page has zero `<script>` elements.'
			},
			code('src/routes/(app)/s/[id]/+page.svelte', 1, 43),
			code('src/routes/(app)/embed/[id]/+page.ts', 1, 11),
			code('src/routes/(app)/embed/[id]/+page@.svelte', 1, 27),
			{
				type: 'p',
				text: '`+page@.svelte` resets this page to the root layout: no header, no navigation, just the table and a line saying where it came from. It is the one route the security hook allows inside an iframe, because being framed is its purpose.'
			},

			{ type: 'h3', id: 'api', text: 'The API' },
			code('src/routes/api/published/+server.ts', 1, 23),
			code('src/routes/api/published/+server.ts', 42, 67),
			{
				type: 'p',
				text: '`QUERY` is the HTTP method for a read with a body — a GET may not carry one, and a POST says “this changes something”. The schema is exported with a leading underscore, SvelteKit’s escape hatch for “not a handler”, so the test beside the route can import it; since 3.0.0-next.19 a `+` file with `.test.` in its name is not a route.'
			},
			code('src/routes/api/published/+server.test.ts', 1, 20),
			code('src/routes/healthz/+server.ts', 1, 25),
			{
				type: 'p',
				text: 'The health check touches the database and returns the build version — the commit hash from the config — because “which version is running” is the first question in every incident. The container chapter probes it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `csr = false` removes from a page and what it keeps.',
					'You can explain the `@` in `+page@.svelte`.',
					'You can say why the search is a `QUERY` and not a `POST`.'
				]
			}
		]
	}
];
