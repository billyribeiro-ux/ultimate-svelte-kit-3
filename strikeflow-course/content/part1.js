/**
 * Chapters 1–7: getting set up, and the foundations.
 */

export const part1 = [
	/* ============================================================ 01 */
	{
		slug: '01-what-were-building',
		title: "What we're building",
		summary:
			'A tour of the finished site, what you need installed, and how to get the most out of this course.',
		goal: "You'll know exactly what you're building and have the right tools installed.",
		blocks: [
			{
				type: 'p',
				text: "We're going to build **StrikeFlow** — a marketing site for a fictional real-time options trading data product. Marketing pages only: no dashboard, no accounts, no product. The one thing it *does* is capture an email address in exchange for a free PDF guide."
			},
			{
				type: 'p',
				text: "That sounds small. It isn't. By the time we're done you'll have written a design system, an SEO engine that emits a cross-referenced structured-data graph, a live-updating TradingView chart, a signed and expiring gated download, and a test suite that runs against a real browser on both a desktop and a phone profile."
			},
			{ type: 'h3', id: 'pages', text: 'The pages' },
			{
				type: 'ul',
				items: [
					'**Home** — hero, a live chart, feature grid, how-it-works',
					'**Features** — the detailed breakdown, plus an honest "what this data cannot tell you" section',
					'**Pricing** — three plans, a monthly/annual toggle, and an FAQ',
					'**Free guide** — the email capture form and the gated PDF download',
					'**Insights** — a blog with three real articles',
					'**About** — the team, written to establish genuine expertise',
					'**Contact** and three **legal** pages',
					'**sitemap.xml**, **robots.txt** and **llms.txt**, all generated'
				]
			},
			{ type: 'h3', id: 'stack', text: 'The stack, and why' },
			{
				type: 'ul',
				items: [
					'**SvelteKit 3** (release candidate) and **Svelte 5** — the current versions, with all the things that changed in 3',
					'**TypeScript**, strict, plus a couple of extra flags most people skip',
					'**Vanilla CSS** — no Tailwind. You will understand every line you write',
					'**Phosphor Icons** via `phosphor-svelte`',
					'**TradingView Lightweight Charts v5** — the library actual trading products use',
					'**Fontsource** for self-hosted Montserrat and Sofia Sans',
					'**Valibot** for validation, **adapter-node** for deployment'
				]
			},
			{
				type: 'why',
				title: 'Why vanilla CSS',
				text: "Tailwind is a fine tool and I use it elsewhere. But this is a course, and a class like `flex items-center gap-2` teaches you Tailwind, not CSS. Writing the design system by hand means that when something looks wrong, you'll know why — which is a skill that outlives any framework."
			},
			{ type: 'h3', id: 'prereqs', text: 'What you need' },
			{
				type: 'p',
				text: "You should be comfortable with HTML, CSS and JavaScript, and have seen a component framework before — React, Vue, or Svelte itself. You do **not** need to know Svelte 5 or SvelteKit. I'll explain every Svelte-specific thing as we hit it."
			},
			{
				type: 'p',
				text: 'On your machine you need **Node 22.17 or newer**. SvelteKit 3 requires it and will refuse to install otherwise. Check with:'
			},
			{ type: 'terminal', code: 'node -v\n# should print v22.17.0 or higher' },
			{
				type: 'p',
				text: "If it's older, install the current LTS from [nodejs.org](https://nodejs.org) or use a version manager like `nvm` or `fnm`."
			},
			{ type: 'p', text: "We'll use **pnpm**. If you don't have it:" },
			{ type: 'terminal', code: 'npm install -g pnpm\npnpm -v   # should be 10 or higher' },
			{
				type: 'note',
				text: "You can use npm or yarn instead — nothing here depends on pnpm specifically. Just translate `pnpm run x` to `npm run x` as you go. I use pnpm because it's fast and its strict `node_modules` layout catches a class of dependency bug the others hide."
			},
			{ type: 'h3', id: 'how-to', text: 'How to work through this' },
			{
				type: 'p',
				text: "**Type the code out.** There's a copy button on every block and you're welcome to use it, but you'll retain roughly twice as much by typing. The typos you make and fix are where the learning happens."
			},
			{
				type: 'p',
				text: "**Run the app constantly.** Keep `pnpm run dev` going in a terminal and look at the browser after every chapter. If something breaks, you'll know it was the last thing you touched."
			},
			{
				type: 'p',
				text: "**Read the *why* boxes.** The green ones explain a decision rather than a syntax. Those are the parts that transfer to your own work."
			},
			{
				type: 'warn',
				text: "One honest note about SvelteKit 3: it's a release candidate as of August 2026. It's stable enough to build on and the API is settled, but the docs live at [next.svelte.dev](https://next.svelte.dev) rather than svelte.dev. If you search for a SvelteKit answer, most results will describe version 2 — I'll flag every place they differ."
			},
			{
				type: 'checkpoint',
				text: '`node -v` prints 22.17 or higher, and `pnpm -v` prints 10 or higher. That is all you need. Next we scaffold the project.'
			}
		]
	},

	/* ============================================================ 02 */
	{
		slug: '02-scaffolding',
		title: 'Scaffolding the project',
		summary:
			'One command creates the project. We go through every flag, then take a tour of what it gave us.',
		goal: "You'll have a running SvelteKit 3 app and understand every file in it.",
		blocks: [
			{
				type: 'p',
				text: "Make a folder for the course, and let the Svelte CLI create the project inside it. Note the `@next` — that's what gets you SvelteKit 3 rather than 2."
			},
			{
				type: 'terminal',
				code: 'mkdir strikeflow-course && cd strikeflow-course\n\nnpx sv@next create strikeflow-site'
			},
			{
				type: 'p',
				text: "It'll ask you a series of questions. You can answer them interactively, but I'd rather show you the flags so you know what each answer means:"
			},
			{
				type: 'terminal',
				code: `npx sv@next create strikeflow-site \\
  --template minimal \\
  --types ts \\
  --add prettier eslint "vitest=usages:unit,component" playwright \\
        "sveltekit-adapter=adapter:node" \\
        "experimental=features:async,remoteFunctions" \\
  --install pnpm`
			},
			{ type: 'h3', id: 'flags', text: 'What each flag does' },
			{
				type: 'ul',
				items: [
					'`--template minimal` — an empty app. The `demo` template adds example pages we would only delete.',
					'`--types ts` — TypeScript. Non-negotiable for a project you intend to maintain.',
					'`prettier` and `eslint` — formatting and linting. Configured for you.',
					'`vitest=usages:unit,component` — unit tests in Node, component tests in a real browser.',
					'`playwright` — end-to-end tests. We lean on these heavily later.',
					'`sveltekit-adapter=adapter:node` — build to a Node server. Runs anywhere, no vendor lock-in.',
					'`experimental=features:async,remoteFunctions` — the two big Svelte 5 / SvelteKit 3 features. We use both.'
				]
			},
			{
				type: 'warn',
				text: "The add-on syntax is fussy. Options are `addon=name:value`, and multiple options join with `+`. Writing `vitest=unit,component` (leaving out the option name `usages`) fails with *\"missing their option name or value\"*, which is a confusing error the first time you hit it."
			},
			{ type: 'h3', id: 'run-it', text: 'Run it' },
			{ type: 'terminal', code: 'cd strikeflow-site\npnpm run dev' },
			{
				type: 'p',
				text: 'Open [localhost:5173](http://localhost:5173) and you should see a plain "Welcome to SvelteKit" page. That page is Times New Roman on white, and fixing that is the first thing we do — but not yet.'
			},
			{ type: 'h3', id: 'tour', text: 'A tour of what you got' },
			{
				type: 'ul',
				items: [
					'`src/routes` — **the structure of your app.** A folder here is a URL. `src/routes/about/+page.svelte` becomes `/about`. This is the single most important idea in SvelteKit.',
					'`src/lib` — your stuff: components, utilities, data. Importable via `#lib` (more on that shortly).',
					'`src/lib/server` — **special.** SvelteKit refuses to bundle anything in here into browser code. Put your secrets here.',
					'`src/app.html` — the actual HTML shell sent to the browser. Everything Svelte renders is injected into it.',
					'`src/app.d.ts` — global type declarations.',
					'`static/` — files copied verbatim into the build. Anything here is public.',
					'`vite.config.ts` — **all** your configuration, including SvelteKit\'s. This is new in 3.',
					'`tsconfig.json` — TypeScript config, extending a generated one.',
					'`.svelte-kit/` — generated. Never edit it, never commit it.'
				]
			},
			{
				type: 'why',
				title: "There's no svelte.config.js",
				text: 'If you have used SvelteKit before, this is the first thing you will notice missing. In SvelteKit 3 all configuration moved into the `sveltekit()` plugin inside `vite.config.ts`. Vite can now hand the config straight to the plugin instead of loading a separate file asynchronously, which removes a whole category of setup-ordering bug.'
			},
			{ type: 'h3', id: 'cleanup', text: 'A little cleanup' },
			{
				type: 'p',
				text: "The Playwright add-on generates a demo route and Vitest generates some example tests. They're useful to look at once, then they're noise. Delete them:"
			},
			{ type: 'terminal', code: 'rm -rf src/routes/demo src/lib/vitest-examples' },
			{
				type: 'checkpoint',
				text: '`pnpm run dev` serves a page at localhost:5173, and you can point at any file in the project and say roughly what it is for.'
			}
		]
	},

	/* ============================================================ 03 */
	{
		slug: '03-whats-new-in-sveltekit-3',
		title: "What's different in SvelteKit 3",
		summary:
			"Five changes that will trip you up if you've used SvelteKit 2, and that every tutorial you find online still gets wrong.",
		goal: "You'll recognise SvelteKit 3 code on sight and know why each change was made.",
		blocks: [
			{
				type: 'p',
				text: "Before we write anything, let's get the version differences out of the way. If you search for SvelteKit help over the next few hours, almost every result will describe version 2. Here is what changed, so you can translate on the fly."
			},
			{ type: 'h3', id: 'config', text: '1. Configuration lives in vite.config.ts' },
			{
				type: 'p',
				text: 'There is no `svelte.config.js`. Open `vite.config.ts` and you will find everything inside the `sveltekit()` plugin call:'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			compilerOptions: {
				experimental: { async: true }
			},
			experimental: {
				remoteFunctions: true
			}
		})
	]
});`
			},
			{
				type: 'p',
				text: 'Everything that used to live under `kit.*` is now a top-level option on the plugin.'
			},
			{ type: 'h3', id: 'lib', text: '2. $lib became #lib — and extensions are mandatory' },
			{
				type: 'p',
				text: 'This is the change that will bite you most often. SvelteKit 2 gave you a `$lib` alias. SvelteKit 3 uses **Node subpath imports** instead, declared in `package.json`:'
			},
			{
				type: 'code',
				file: 'package.json',
				lang: 'json',
				code: `{
	"imports": {
		"#lib": "./src/lib/index.js",
		"#lib/*": "./src/lib/*"
	}
}`
			},
			{
				type: 'p',
				text: 'And because subpath imports are a real Node feature rather than a bundler alias, they follow Node rules — which means **you must write the file extension**:'
			},
			{
				type: 'code',
				lang: 'ts',
				file: 'the difference',
				code: `// SvelteKit 2
import { site } from '$lib/data/site';

// SvelteKit 3 — note the #, and the .ts
import { site } from '#lib/data/site.ts';`
			},
			{
				type: 'warn',
				text: "Forgetting the extension gives you a module-not-found error that looks like the file is missing. It isn't. Check for the extension first — it's the answer nine times out of ten."
			},
			{
				type: 'why',
				title: 'Why bother changing this?',
				text: '`$lib` was a bundler invention: only tools that knew about SvelteKit could resolve it. `#lib` is a standard Node feature, so Node itself, your test runner, your editor and any other tool all understand it without special support. Fewer moving parts.'
			},
			{ type: 'h3', id: 'env', text: '3. Environment variables are declared, not implicit' },
			{
				type: 'p',
				text: "In SvelteKit 2 every variable in your environment was importable from `$env/*`. In 3 you declare them in `src/env.ts`, which gets you types, startup validation, and a hard guarantee that a private variable can't reach the browser. We build this in chapter 9."
			},
			{ type: 'h3', id: 'paths', text: '4. $app/paths changed shape' },
			{
				type: 'code',
				lang: 'ts',
				file: 'the difference',
				code: `// SvelteKit 2
import { base, assets, resolveRoute } from '$app/paths';
const url = base + resolveRoute('/blog/[slug]', { slug });
const img = assets + '/logo.png';

// SvelteKit 3 — base, assets and resolveRoute are gone
import { resolve, asset } from '$app/paths';
const url = resolve('/blog/[slug]', { slug });
const img = asset('logo.png');   // note: no leading slash`
			},
			{ type: 'h3', id: 'nav', text: '5. Navigation consolidated into goto()' },
			{
				type: 'code',
				lang: 'ts',
				file: 'the difference',
				code: `// SvelteKit 2
import { pushState, replaceState, invalidateAll } from '$app/navigation';
pushState('/foo', state);
await invalidateAll();

// SvelteKit 3
import { goto, refreshAll } from '$app/navigation';
await goto('/foo', { shallow: true, state });
await refreshAll();`
			},
			{
				type: 'p',
				text: "Also: `error(404, { message: 'Not found' })` became `error(404, 'Not found')`, with any extra properties in a third argument. And `page.url` is now read-only — clone it if you need to change a search param."
			},
			{
				type: 'note',
				text: "You don't need to memorise this. Come back to it when something you copied from a blog post doesn't compile."
			},
			{
				type: 'checkpoint',
				text: 'You can explain, in one sentence each, why config moved and why `$lib` became `#lib`.'
			}
		]
	},

	/* ============================================================ 04 */
	{
		slug: '04-typescript-strictness',
		title: 'TypeScript, tightened',
		summary:
			'Two extra compiler flags that catch real crashes, and the one setting SvelteKit 3 now requires you to write yourself.',
		goal: 'Your `tsconfig.json` is stricter than the default and `pnpm run check` passes.',
		blocks: [
			{
				type: 'p',
				text: 'Open `tsconfig.json`. The scaffold gives you something short, because most of the configuration comes from a file SvelteKit generates:'
			},
			{
				type: 'code',
				file: 'tsconfig.json (generated)',
				lang: 'json',
				code: `{
	"extends": "$app/tsconfig",
	"compilerOptions": {
		"sourceMap": true,
		"strict": true
	}
}`
			},
			{
				type: 'p',
				text: "`strict: true` is doing a lot of work — it turns on `strictNullChecks`, `noImplicitAny` and half a dozen others. We're going to add three more, and one required section."
			},
			{
				type: 'code',
				file: 'tsconfig.json',
				lang: 'json',
				code: `{
	"extends": "$app/tsconfig",
	"compilerOptions": {
		"sourceMap": true,
		"strict": true,
		"noUncheckedIndexedAccess": true,
		"noImplicitOverride": true,
		"noFallthroughCasesInSwitch": true,
		"noImplicitReturns": true
	},
	"include": [
		"src/**/*.ts",
		"src/**/*.js",
		"src/**/*.svelte",
		"scripts/**/*.js",
		"*.config.ts",
		"*.config.js"
	],
	"exclude": ["node_modules", "build", ".svelte-kit", "static", "src/service-worker"]
}`
			},
			{
				type: 'why',
				title: 'noUncheckedIndexedAccess is the one that matters',
				text: 'Without it, TypeScript claims `array[0]` is definitely a `T`. It is not — the array might be empty. With the flag on, you get `T | undefined` and have to deal with it. It is mildly irritating for about a day and then it starts catching real "cannot read properties of undefined" crashes before they ship.'
			},
			{
				type: 'p',
				text: 'The `include` and `exclude` arrays are not optional in SvelteKit 3. The generated config no longer guesses them. Leave them out and `svelte-check` will happily type-check your **minified production build** in `build/` and report a couple of thousand meaningless errors — which is a genuinely bewildering first experience.'
			},
			{ type: 'h3', id: 'check', text: 'Checking your work' },
			{
				type: 'p',
				text: 'TypeScript on its own does not understand `.svelte` files. `svelte-check` does — it type-checks your components, your markup expressions and your props:'
			},
			{ type: 'terminal', code: 'pnpm run check' },
			{
				type: 'p',
				text: 'Run this constantly. It is the fastest feedback loop in the project, and unlike the dev server it checks files you are not currently looking at.'
			},
			{
				type: 'checkpoint',
				text: '`pnpm run check` prints `0 errors`. If it reports thousands, you have not added the `exclude` array.'
			}
		]
	},

	/* ============================================================ 05 */
	{
		slug: '05-fonts',
		title: 'Fonts, done properly',
		summary:
			'Getting Montserrat and Sofia Sans on the page is easy. Getting them there without a flash of jumping text is where the engineering is.',
		goal: 'Both fonts load, are preloaded, and produce **zero** layout shift when they swap in.',
		blocks: [
			{
				type: 'p',
				text: "Let's get rid of Times New Roman. We want **Montserrat** for headings and **Sofia Sans** for body text. We'll use [Fontsource](https://fontsource.org/), which packages Google Fonts (and more) as npm modules you self-host."
			},
			{
				type: 'terminal',
				code: 'pnpm add @fontsource-variable/montserrat @fontsource-variable/sofia-sans'
			},
			{
				type: 'why',
				title: 'Why self-host instead of using Google Fonts CDN?',
				text: 'Privacy (no third party sees your visitors), reliability (one fewer domain that can be slow or blocked), and speed — a cross-origin font needs a DNS lookup, a TCP connection and a TLS handshake before the first byte. Self-hosted, it rides the connection you already have.'
			},
			{
				type: 'why',
				title: 'And why the "variable" packages?',
				text: 'A variable font contains every weight from 100 to 900 in a single file, as a continuous axis. The alternative is one file per weight. If you use regular, semibold and bold, that is three downloads versus one — and the single variable file is usually smaller than the three static ones combined.'
			},
			{ type: 'h3', id: 'naive', text: 'The easy way, and why we are not doing it' },
			{
				type: 'p',
				text: 'The documented approach is one import line:'
			},
			{
				type: 'code',
				lang: 'css',
				file: 'the simple version',
				code: "@import '@fontsource-variable/montserrat';"
			},
			{
				type: 'p',
				text: "That works. It also declares `@font-face` for every subset the package ships — Cyrillic, Greek, Vietnamese, Latin — and, more importantly, gives you a hashed file path you cannot write a `<link rel=\"preload\">` for. We want that preload, so we take ownership of the two files we actually use."
			},
			{ type: 'h3', id: 'sync', text: 'Copying the files we need' },
			{
				type: 'p',
				text: 'Create `scripts/sync-fonts.js`. It copies exactly two files out of `node_modules` and into `static/fonts`:'
			},
			{
				type: 'code',
				file: 'scripts/sync-fonts.js',
				lang: 'js',
				code: `import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'static', 'fonts');

const FONTS = [
	{
		from: '@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2',
		to: 'montserrat-latin-wght-normal.woff2'
	},
	{
		from: '@fontsource-variable/sofia-sans/files/sofia-sans-latin-wght-normal.woff2',
		to: 'sofia-sans-latin-wght-normal.woff2'
	}
];

mkdirSync(outDir, { recursive: true });

for (const font of FONTS) {
	const source = join(root, 'node_modules', font.from);
	if (!existsSync(source)) {
		console.error(\`[sync-fonts] missing: \${font.from}\`);
		process.exit(1);
	}
	copyFileSync(source, join(outDir, font.to));
	console.log(\`[sync-fonts] \${font.to}\`);
}`
			},
			{
				type: 'p',
				text: 'Wire it into `package.json` so it runs on every install and nobody has to remember it:'
			},
			{
				type: 'code',
				file: 'package.json',
				lang: 'json',
				code: `"scripts": {
	"fonts:sync": "node scripts/sync-fonts.js",
	"prepare": "node scripts/sync-fonts.js && (svelte-kit sync || echo '')"
}`
			},
			{ type: 'terminal', code: 'pnpm run fonts:sync' },
			{ type: 'h3', id: 'face', text: 'Declaring the fonts' },
			{
				type: 'p',
				text: 'Create `src/lib/styles/fonts.css`:'
			},
			{
				type: 'code',
				file: 'src/lib/styles/fonts.css',
				lang: 'css',
				code: `@font-face {
	font-family: 'Montserrat Variable';
	font-style: normal;
	font-display: swap;
	font-weight: 100 900;
	src: url('/fonts/montserrat-latin-wght-normal.woff2') format('woff2-variations');
	unicode-range:
		U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
		U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,
		U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
	font-family: 'Sofia Sans Variable';
	font-style: normal;
	font-display: swap;
	font-weight: 1 1000;
	src: url('/fonts/sofia-sans-latin-wght-normal.woff2') format('woff2-variations');
	unicode-range:
		U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
		U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,
		U+2212, U+2215, U+FEFF, U+FFFD;
}`
			},
			{
				type: 'p',
				text: '`font-display: swap` means: show the text immediately in a fallback font, then swap to the real one when it arrives. The alternative leaves the user staring at invisible text.'
			},
			{ type: 'h3', id: 'shift', text: 'The problem with swap' },
			{
				type: 'p',
				text: "Swapping fonts changes how much space the text takes. Every line reflows, and everything below it moves. On a phone, where content is stacked vertically, that shift can be enormous — and if it happens while someone is reaching for a button, the button moves out from under their thumb."
			},
			{
				type: 'p',
				text: 'Google measures this as **Cumulative Layout Shift**, one of the three Core Web Vitals. The fix is to make the fallback font occupy almost exactly the same space as the real one, using three CSS descriptors:'
			},
			{
				type: 'code',
				file: 'src/lib/styles/fonts.css (continued)',
				lang: 'css',
				code: `/* Montserrat: size-adjust 110.2%, real ascent 0.97em, real descent 0.25em */
@font-face {
	font-family: 'Montserrat Fallback';
	src: local('Arial');
	size-adjust: 110.2%;
	ascent-override: 88%;      /* 0.97 / 1.102 */
	descent-override: 22.7%;   /* 0.25 / 1.102 */
	line-gap-override: 0%;
}

/* Sofia Sans: size-adjust 96.7%, real ascent 0.90em, real descent 0.30em */
@font-face {
	font-family: 'Sofia Sans Fallback';
	src: local('Arial');
	size-adjust: 96.7%;
	ascent-override: 93.1%;    /* 0.90 / 0.967 */
	descent-override: 31%;     /* 0.30 / 0.967 */
	line-gap-override: 0%;
}`
			},
			{
				type: 'p',
				text: "These `@font-face` rules download nothing. They re-describe a font the user already has — Arial — so that it lines up with ours. `size-adjust` scales the glyphs to match our width; the two overrides match our line height."
			},
			{
				type: 'warn',
				text: "**Do not guess these numbers.** I did, the first time I wrote this project. The result was a **181-pixel** jump on mobile when the fonts loaded. It was eventually caught by an end-to-end test complaining that an element \"was not stable\" — a wonderfully indirect way to be told you have a Core Web Vitals problem."
			},
			{
				type: 'p',
				text: "In chapter 26 we'll write a script that measures these properly. For now, use the values above — they're the measured ones for these two fonts against Arial."
			},
			{
				type: 'checkpoint',
				text: '`static/fonts/` contains two `.woff2` files and `src/lib/styles/fonts.css` declares four `@font-face` rules — two real, two metric-matched fallbacks.'
			}
		]
	},

	/* ============================================================ 06 */
	{
		slug: '06-design-tokens',
		title: 'Design tokens',
		summary:
			'One file that owns every colour, size and duration in the project — and the breakpoint scale we build everything on.',
		goal: 'A complete token system, and a clear rule for how the site responds to screen size.',
		blocks: [
			{
				type: 'p',
				text: "Before any component, we define the vocabulary. Every colour, spacing value, font size and animation duration in this project comes from `src/lib/styles/tokens.css`. Nothing downstream is allowed to invent a hex code."
			},
			{
				type: 'why',
				title: 'Why be this strict about it?',
				text: 'When a token is the only way to say "brand blue", you can change the brand in one place. When forty components hardcode `#4F7DFF`, you cannot — and six months later nobody knows which blues were deliberate and which were typos.'
			},
			{ type: 'h3', id: 'mobile-first', text: 'Mobile-first, and what that actually means' },
			{
				type: 'p',
				text: "Every style in this project targets the smallest screen first. Media queries only ever *add* things as the screen gets bigger. There is not one `max-width` query in the entire codebase."
			},
			{
				type: 'code',
				lang: 'css',
				file: 'the pattern',
				code: `/* Base — phones. No media query. */
.thing {
	display: flex;
	flex-direction: column;
}

/* Then ADD as we get more room. */
@media (min-width: 48em) {
	.thing {
		flex-direction: row;
	}
}`
			},
			{
				type: 'why',
				title: 'Why min-width only',
				text: 'Mixing `min-width` and `max-width` means two rules can both apply, and you spend your afternoon working out which one wins. Going one direction only means the cascade reads top to bottom, small to large, and stays predictable no matter how big the stylesheet grows.'
			},
			{ type: 'h3', id: 'breakpoints', text: 'The breakpoint scale' },
			{
				type: 'ul',
				items: [
					'**(base)** 320px+ — small phones. The default.',
					'**40em** = 640px — large phones, small tablets',
					'**48em** = 768px — tablets, portrait',
					'**64em** = 1024px — tablets landscape, small laptops',
					'**80em** = 1280px — desktops',
					'**96em** = 1536px — large desktops'
				]
			},
			{
				type: 'note',
				text: "We use `em` rather than `px` in media queries so the layout responds to a user's browser zoom and default font size, not just their device width. Media queries always measure against the *initial* font size, so 1em is 16px here regardless of what you set on `html`."
			},
			{
				type: 'warn',
				text: "You cannot put breakpoints in CSS variables. `@media (min-width: var(--bp-md))` does not work — custom properties resolve per element at paint time, and media queries are evaluated before that. Write the values literally and document the scale in a comment."
			},
			{ type: 'h3', id: 'colours', text: 'Colours' },
			{
				type: 'code',
				file: 'src/lib/styles/tokens.css',
				lang: 'css',
				code: `:root {
	/* Neutrals — cool-tinted near-blacks, not pure grey */
	--ink-950: #05070c;
	--ink-900: #080b12;
	--ink-850: #0b0f18;
	--ink-800: #10151f;
	--ink-700: #171d2a;
	--ink-600: #202839;
	--ink-500: #2b3549;
	--ink-400: #3a465e;

	--paper-50: #f4f7fc;
	--paper-300: #b9c3d6;
	--paper-400: #7f8ba3;

	/* Brand — blue. Deliberately NOT green and NOT red. */
	--brand-300: #9db4ff;
	--brand-400: #6e93ff;
	--brand-500: #4f7dff;
	--brand-600: #3b63e8;

	/* Market semantics — these encode data, never decoration */
	--bull-500: #16c784;
	--bear-500: #ea3943;
	--warn-500: #f0b90b;
}`
			},
			{
				type: 'why',
				title: 'Why the brand colour is not green',
				text: 'In a trading product, green and red already mean something: up and down. If the brand colour were green, every button on the site would read as a buy signal. Keeping brand and data colours in separate families is a small decision that prevents a permanent low-grade confusion.'
			},
			{ type: 'h3', id: 'semantic', text: 'Semantic aliases' },
			{
				type: 'p',
				text: 'Components never use `--ink-800` directly. They ask for what they *mean*:'
			},
			{
				type: 'code',
				file: 'src/lib/styles/tokens.css',
				lang: 'css',
				code: `	--bg-root: var(--ink-950);
	--surface: var(--ink-850);
	--surface-raised: var(--ink-800);

	--border: color-mix(in srgb, var(--ink-500) 60%, transparent);
	--border-strong: var(--ink-400);

	--text-primary: var(--paper-50);
	--text-secondary: var(--paper-300);
	--text-muted: var(--paper-400);

	--accent: var(--brand-500);
	--accent-hover: var(--brand-400);
	--accent-contrast: #ffffff;

	--focus-ring: 0 0 0 2px var(--bg-root), 0 0 0 4px var(--brand-400);`
			},
			{ type: 'h3', id: 'type', text: 'A fluid type scale' },
			{
				type: 'code',
				file: 'src/lib/styles/tokens.css',
				lang: 'css',
				code: `	--font-heading: 'Montserrat Variable', 'Montserrat Fallback', system-ui, sans-serif;
	--font-body: 'Sofia Sans Variable', 'Sofia Sans Fallback', system-ui, sans-serif;

	--fs-sm:   clamp(0.875rem, 0.855rem + 0.10vw, 0.9375rem);
	--fs-base: clamp(1rem,     0.965rem + 0.18vw, 1.0625rem);
	--fs-md:   clamp(1.0625rem, 1.01rem + 0.28vw, 1.1875rem);
	--fs-lg:   clamp(1.25rem,   1.16rem + 0.45vw, 1.5rem);
	--fs-xl:   clamp(1.5rem,    1.35rem + 0.75vw, 1.9375rem);
	--fs-2xl:  clamp(1.875rem,  1.62rem + 1.25vw, 2.5rem);
	--fs-3xl:  clamp(2.25rem,   1.83rem + 2.10vw, 3.25rem);
	--fs-4xl:  clamp(2.625rem,  1.95rem + 3.40vw, 4.25rem);`
			},
			{
				type: 'p',
				text: '`clamp(min, preferred, max)` gives you a size that grows smoothly with the viewport and stops at both ends. Text scales continuously between phone and desktop instead of jumping at breakpoints.'
			},
			{
				type: 'warn',
				text: "Notice every preferred value has a `rem` part, not just `vw`. A pure `vw` font size ignores the user's browser font-size setting entirely, which is a WCAG 1.4.4 failure. The `rem` component keeps it zoomable."
			},
			{ type: 'h3', id: 'rest', text: 'Space, shape, motion, layers' },
			{
				type: 'code',
				file: 'src/lib/styles/tokens.css',
				lang: 'css',
				code: `	/* 4px scale */
	--space-1: 0.25rem;  --space-2: 0.5rem;   --space-3: 0.75rem;
	--space-4: 1rem;     --space-5: 1.25rem;  --space-6: 1.5rem;
	--space-8: 2rem;     --space-10: 2.5rem;  --space-12: 3rem;
	--space-16: 4rem;    --space-20: 5rem;    --space-24: 6rem;

	/* Fluid vertical rhythm between page sections */
	--section-y: clamp(3.5rem, 2.4rem + 5.5vw, 7rem);

	--container-max: 75rem;
	--container-narrow: 46rem;
	--gutter: clamp(1rem, 0.55rem + 2.2vw, 2rem);
	--header-height: 4rem;

	--radius-sm: 0.375rem; --radius-md: 0.625rem;
	--radius-lg: 0.875rem; --radius-xl: 1.25rem;
	--radius-full: 9999px;

	--dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 320ms;
	--ease-out: cubic-bezier(0.22, 1, 0.36, 1);

	/* Named layers. If you ever type z-index: 9999, you have lost. */
	--z-header: 200; --z-drawer: 300; --z-modal: 400; --z-skip-link: 600;`
			},
			{
				type: 'checkpoint',
				text: 'You have `src/lib/styles/tokens.css` with colour, type, space, shape, motion and layer tokens, and you can state the mobile-first rule in one sentence.'
			}
		]
	},

	/* ============================================================ 07 */
	{
		slug: '07-reset-base-utilities',
		title: 'Reset, base and utilities',
		summary:
			'Flatten the browser defaults, restyle raw HTML, and add the small handful of layout helpers we will actually reuse.',
		goal: 'A page written in plain semantic HTML already looks right, before any component exists.',
		blocks: [
			{ type: 'h3', id: 'reset', text: 'The reset' },
			{
				type: 'p',
				text: "Every rule here exists because it prevents a specific bug. Create `src/lib/styles/reset.css`:"
			},
			{
				type: 'code',
				file: 'src/lib/styles/reset.css',
				lang: 'css',
				code: `*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; }

html {
	scroll-padding-top: calc(var(--header-height) + var(--space-4));
	-webkit-text-size-adjust: 100%;
}

body {
	min-height: 100svh;
	line-height: var(--lh-relaxed);
	-webkit-font-smoothing: antialiased;
}

img, picture, video, canvas, svg {
	display: block;
	max-width: 100%;
}

input, button, textarea, select {
	font: inherit;
	color: inherit;
}

button {
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
	-webkit-appearance: none;
	appearance: none;
}

p, h1, h2, h3, h4, h5, h6, li { overflow-wrap: break-word; }

ul[role='list'], ol[role='list'] { list-style: none; padding: 0; }

:focus-visible {
	outline: none;
	box-shadow: var(--focus-ring);
	border-radius: var(--radius-sm);
}`
			},
			{
				type: 'ul',
				items: [
					'`box-sizing: border-box` — when you say `width: 300px`, you mean 300px. Padding and border included.',
					'`display: block` on media — kills the mysterious 4px gap under images (it is space for a text descender).',
					'`font: inherit` on form controls — they do not inherit typography by default. They should.',
					'`:focus-visible` rather than `:focus` — mouse users get no ring on click, keyboard users always do.'
				]
			},
			{
				type: 'warn',
				text: "**Do not add `scroll-behavior: smooth` to `html`.** It is the most popular one-liner in web development and it causes real problems: it breaks scroll restoration on back navigation, and it deadlocks any code that scrolls then measures. We hit this in chapter 26 — it hung the entire e2e suite. If you want smooth scrolling, ask for it per call: `element.scrollIntoView({ behavior: 'smooth' })`."
			},
			{
				type: 'p',
				text: 'Finally, respect the operating system "reduce motion" setting. For people with vestibular disorders, large transitions can cause genuine nausea:'
			},
			{
				type: 'code',
				file: 'src/lib/styles/reset.css (continued)',
				lang: 'css',
				code: `@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}
}`
			},
			{ type: 'h3', id: 'base', text: 'Base element styles' },
			{
				type: 'p',
				text: '`src/lib/styles/base.css` restyles raw HTML, so semantic markup looks right without classes.'
			},
			{
				type: 'code',
				file: 'src/lib/styles/base.css',
				lang: 'css',
				code: `html {
	background-color: var(--bg-root);
	color-scheme: dark;
}

body {
	background-color: var(--bg-root);
	color: var(--text-secondary);
	font-family: var(--font-body);
	font-size: var(--fs-base);
	font-synthesis-weight: none;
}

h1, h2, h3, h4, h5, h6 {
	font-family: var(--font-heading);
	color: var(--text-primary);
	font-weight: var(--weight-bold);
	line-height: var(--lh-snug);
	letter-spacing: var(--tracking-snug);
	text-wrap: balance;
}

h1 { font-size: var(--fs-3xl); font-weight: var(--weight-black); }
h2 { font-size: var(--fs-2xl); }
h3 { font-size: var(--fs-xl); }

p { text-wrap: pretty; }

/* ~70 characters — the range typographers consider most readable */
p, li { max-width: 70ch; }`
			},
			{
				type: 'why',
				title: 'Why style elements rather than classes',
				text: 'Search engines and screen readers read your semantic structure, not your class names. If `<h2>` only looks like a heading once you add `class="heading-2"`, someone will eventually reach for a `<div>` instead, and your document outline rots. Make the correct markup also be the easy markup.'
			},
			{
				type: 'note',
				text: '`text-wrap: balance` on headings stops a heading ending in one orphaned word. `text-wrap: pretty` does the same, more cheaply, for paragraphs. Two lines of CSS that make typography look professionally set.'
			},
			{ type: 'h3', id: 'utilities', text: 'Utilities' },
			{
				type: 'p',
				text: 'About a dozen classes in `src/lib/styles/utilities.css`. A utility earns its place if it appears in three or more unrelated components; everything else lives in the component.'
			},
			{
				type: 'code',
				file: 'src/lib/styles/utilities.css',
				lang: 'css',
				code: `.container {
	width: 100%;
	max-width: var(--container-max);
	margin-inline: auto;
	padding-inline: var(--gutter);
}

.section { padding-block: var(--section-y); }

/* The owl selector: space BETWEEN children, no trailing margin */
.stack > * + * { margin-block-start: var(--stack-space, var(--space-4)); }

/* Responsive columns with no media queries at all */
.auto-grid {
	display: grid;
	gap: var(--grid-gap, var(--space-6));
	grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--grid-min, 17rem)), 1fr));
}

.cluster {
	display: flex;
	flex-wrap: wrap;
	gap: var(--cluster-gap, var(--space-3));
	align-items: center;
}`
			},
			{
				type: 'why',
				title: 'auto-grid deserves a moment',
				text: '`auto-fit` plus `minmax()` lets the grid work out how many columns fit. One on a phone, four on a desktop, no breakpoints. It responds to the *container*, not the viewport — so it still behaves if you drop it into a narrow sidebar. The `min(100%, ...)` guards the one failure case: without it, a minimum wider than the screen overflows.'
			},
			{ type: 'h3', id: 'a11y-utils', text: 'Two accessibility helpers' },
			{
				type: 'code',
				file: 'src/lib/styles/utilities.css (continued)',
				lang: 'css',
				code: `/* Hidden visually, still announced by screen readers */
.visually-hidden:not(:focus):not(:active) {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}

/* The first focusable thing on the page */
.skip-link {
	position: absolute;
	top: var(--space-2);
	left: var(--space-2);
	z-index: var(--z-skip-link);
	padding: var(--space-3) var(--space-5);
	background-color: var(--accent);
	color: var(--accent-contrast);
	border-radius: var(--radius-md);
	text-decoration: none;
	transform: translateY(-200%);
	transition: transform var(--dur-base) var(--ease-out);
}

.skip-link:focus { transform: translateY(0); }`
			},
			{
				type: 'warn',
				text: 'Never use `display: none` or `visibility: hidden` to hide something you still want announced. Both remove the element from the accessibility tree entirely, which defeats the whole purpose. The clip-based recipe above is the accepted way.'
			},
			{ type: 'h3', id: 'entry', text: 'One stylesheet to import them all' },
			{
				type: 'code',
				file: 'src/lib/styles/app.css',
				lang: 'css',
				code: `@import './fonts.css';
@import './tokens.css';
@import './reset.css';
@import './base.css';
@import './utilities.css';`
			},
			{
				type: 'p',
				text: 'The order matters: fonts first so the browser starts fetching, then tokens (variables must exist before anything references them), then reset, base and utilities last so they can win on specificity. Vite inlines these at build time, so the browser gets one stylesheet rather than five round-trips.'
			},
			{
				type: 'checkpoint',
				text: "Five files in `src/lib/styles/`. Nothing renders differently yet — we haven't imported `app.css` anywhere. That happens in chapter 15."
			}
		]
	}
];
