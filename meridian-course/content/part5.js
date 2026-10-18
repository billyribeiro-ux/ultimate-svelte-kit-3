/**
 * PART 5 — The interface
 * (chapters {{the-design-system}}–{{companions-presence-and-settings}})
 *
 * The design system, the motion it allows, and the shell, then the trip
 * page and each of its tabs: the itinerary, the palette, the map, the
 * globe, the expenses, the notes, the companions. Eleven chapters, and
 * every library from the roll-call in chapter {{the-map-of-features}} shows
 * up in one of them with its wiring visible.
 */

import { code } from './quote.js';

const TRIP = 'src/lib/trip';
const UI = 'src/lib/ui';

export const part5 = [
	{
		slug: 'the-design-system',
		title: 'The design system',
		summary:
			'Tokens with `light-dark()`, a theme class on `MediaQuery`, the boot script that stops the flash and tells the browser chrome and the server, fonts from fontsource preloaded by filename, a hero in four prints that downloads one, one GSAP timeline as a conditional attachment, motion tokens that reduced motion zeroes and the framework’s one query for the scripts, `style:--x` as the bridge from a script to the stylesheet, how a component’s styles are scoped, the short, named list of places a hex code may appear outside the tokens, and a contrast table checked on every lint.',
		goal: 'Build a light-and-dark design system that never flashes, respects reduced motion, and keeps every colour in one file.',
		blocks: [
			{
				type: 'p',
				text: 'Five CSS files, imported in order: tokens define, reset clears, base styles, the date fields’ sheet dresses what Bits UI renders, utilities lay out. `dates.css` is global rather than a component’s `<style>` because two components — the trip’s range and an expense’s single date — wear it, and the elements it styles are rendered by the library, out of reach of a scoped selector (chapter {{dates-and-money-in-a-locale}}). Every colour, size and duration the interface uses is named once in the first, and components reference the names. A hex code anywhere else in `src` is a copy made where a custom property cannot be read, and there are four, each saying so where it is written: the map’s canvas (`map/style.ts`), the globe’s WebGL scene, the custom element’s shadow root, and the `theme-color` meta tags in `app.html`, which the browser reads before any stylesheet. The header of `tokens.css` lists them, along with the two hex codes that are not copies: print, which is black on white whatever the theme, and the `#000` in a `mask-image` gradient, which means “opaque”, not black.'
			},
			code('src/lib/styles/index.css', 1, 6),
			code('src/lib/styles/tokens.css', 1, 32),
			code('src/lib/styles/tokens.css', 34, 127, { partial: true }),
			{
				type: 'p',
				text: '`light-dark()` is the whole theming mechanism. Each token holds its light value and its dark value and the browser picks by `color-scheme`, which follows the system by default and is pinned by `data-theme` on `<html>` when a person chooses. No duplicated `@media (prefers-color-scheme)` blocks, no `.dark` cascade, and — because the choice is applied before the first paint — no flash. The palette is “a map on a table, lit like a film”: warm paper in four surface tiers, ink in four weights, one teal that reads as water, and one hue per kind of stop that the itinerary and the map share through `--kind-*`. Three of the tokens exist only because of contrast arithmetic: `--on-fill` is the ink that reads on every kind colour in both themes (white fails on the pastel dark kinds at 1.9:1); the light `--ink-3` was darkened until tertiary text passed 4.5:1 on every tier; and `--segment-edge` is the 1px edge a chosen segment draws — the theme toggle, the notes toolbar, the stop’s kind — because the tier step alone is 1.1:1 in dark and 1.2:1 in light, a state nobody can see, and the edge is 3:1 or better against both the track and the segment. The `--night` tokens are the one family that is not `light-dark()`: the globe is a night scene in both themes. The scale has eight steps, each a `clamp()` between a 360px phone and a 1280px desktop, with a leading and a tracking token to pair with each — big serif closes up, small serif is left alone — and most durations are a `--dur-*` that the `prefers-reduced-motion` block at the bottom sets to zero. Not all: the view transitions, the live dot’s pulse and the home page’s card stagger write their timing as numbers, and the tab indicator’s tween, the list’s flip and the map’s camera are JavaScript. Each of those sits behind a reduced-motion check of its own, and the comment above the block names every one — “reads a token” and “is switched off” are two different claims, and the second is the one that matters.'
			},
			code('src/lib/styles/base.css', 1, 61, { partial: true }),
			{
				type: 'p',
				text: 'The display face is Fraunces, a variable font with an optical-size axis that the browser maps from the font size — `font-optical-sizing: auto`, so an 18px heading gets the cut drawn for 18px and a 56px hero gets the one drawn for posters; only the hero title pins `"opsz" 144`, and the 404 numeral pins 96 — at 46 to 72px the poster cut lost its hairlines and each “4” read as a blob. The body is Inter. Both come from fontsource as stylesheets of `@font-face` rules with `unicode-range`, so a browser downloads the latin subset and nothing else — and chapter {{environment-and-hooks}}’s `preload` filter names those two files by their source filename.'
			},

			{ type: 'h3', id: 'theme', text: 'The theme, and the flash it prevents' },
			code(`${UI}/theme.svelte.ts`, 1, 89),
			{
				type: 'p',
				text: '`MediaQuery` from `svelte/reactivity` is the system’s preference as a reactive value: when the operating system switches at sunset, `resolved` changes and the toaster and the map style follow, without anybody polling. The class only decides what `color-scheme` is; the CSS does the work. `browser` from `$app/env` guards the storage reads, because this module is imported on the server too. Two things outside the stylesheet follow a change as well, and `set()` updates both: the `theme-color` meta tags, and a cookie for the server — the next two blocks say what each is for.'
			},
			{
				type: 'why',
				title: 'Why one instance in a module, when Svelte advises context',
				text: 'Svelte’s best practices prefer context to state declared in a shared module, and the reason is the server: a module is loaded once per process, so state in it is shared by every request that process renders, and one person’s value can end up in another person’s page. `theme` is safe from that by construction, and the comment at the top of the file says where. On the server the constructor returns before it reads anything, and `set()` is only called from a change handler, which never runs there — so the server’s instance is `system` for its whole life and holds nothing of anybody’s. The person’s choice reaches a server render by another road, as `data.theme`, read from the cookie for that one request. Context would be the answer the day the module held something per person on the server; until then, a singleton that is written only in the browser is the simpler honest thing.'
			},
			code('src/app.html', 12, 33),
			{
				type: 'p',
				text: '`theme-color` is the colour a phone paints its status bar and a desktop browser its tab strip. It is `--paper`’s two values, by hand, because a `<meta>` is read before any stylesheet and cannot see a token. Two tags with `media` queries follow the system; the catch is a person who *chose* — a dark page on a light phone would sit under a cream bar. So the boot script below, and `theme.set()` later, point the chosen tag at every screen (`media="all"`) and the other at none (`media="not all"`). Rewriting `media` rather than `content` keeps both colours in the HTML, where the comment beside them can say where they came from.'
			},
			code('src/app.html', 34, 57),
			{
				type: 'p',
				text: 'The one inline script in the app, and the reason `vite.config.ts` hashes it. A dark choice on a light system would otherwise paint light for one frame before hydration; this runs before the first paint, sets `data-theme` from storage, points the `theme-color` tags, and writes the choice into a cookie — the one thing the *server* needs to know about a theme, for the hero below. The variable names are one letter and the syntax is `var` because this is the only JavaScript that runs before the bundle, untranspiled, in every browser that loads the page. It carries no nonce attribute, because the guides are prerendered and SvelteKit refuses to prerender a template with `%sveltekit.nonce%` in it — the hash in `script-src` allows it everywhere.'
			},
			code(`${UI}/ThemeToggle.svelte`, 1, 35),
			{
				type: 'p',
				text: 'A radio group, because that is what it is: one of three, always exactly one. Arrow keys move between them for free, and a screen reader says “Theme, Light, 2 of 3” with no ARIA beyond the fieldset. `:has(input:checked)` styles the label from the state of the input inside it, which is what `:has()` was made for — and what it paints is a tier-3 pill with the `--segment-edge` hairline, so the choice shows in the dark theme too.'
			},

			{ type: 'h3', id: 'hero', text: 'A picture in four prints' },
			code('src/routes/(site)/+page.svelte', 21, 110),
			code('src/routes/(site)/+page.svelte', 118, 183),
			{
				type: 'p',
				text: 'The hero is a map of the sample trip drawn by `scripts/make-hero.ts` with sharp — coastline, contours clipped to the land, a graticule, the dashed route and its numbered pins — once on cream for the light theme and once on near-black for the dark. Drawn twice rather than filtered once: the first version developed the cream print as a negative in the dark theme, `filter: invert(1) hue-rotate(180deg)`, and a negative is not a night map — the pins’ white numbers went black, and the land and the sea took whatever greys the arithmetic gave them rather than the night tokens’. The script is deterministic, so running it again produces the same bytes and the diff of a commit that touches it is honest.'
			},
			{
				type: 'p',
				text: 'And each print is drawn twice, for two sizes of screen. A pin and its number are drawn in the pixels of the image, and the image is shown 40rem wide on a desktop and the full width of a 360px phone: the desktop drawing’s 26px pins came out 15px across on the phone, with numbers under 5px tall. So the script draws a desktop print at 1600×1000 and a phone print at 1200×750, framed a little tighter on the route, and every size in it — strokes, pins, numbers — is written in screen pixels at the narrowest the print is shown and multiplied out per print: the phone’s pins are 21px with 11.5px numbers at 360px. The compass rose is the desktop’s ornament only; drawn on the phone print it sat on Barcelona.'
			},
			{
				type: 'p',
				text: 'Four prints must not mean four downloads, and the hero is the largest thing on the first screen — its paint *is* the page’s Largest Contentful Paint. `<picture>` makes the choice before any script runs: the browser takes the first `<source>` whose `media` and `type` match, so the order of the sources is the decision, and `prints` is that order as data. With no theme chosen, the night prints come first with `(prefers-color-scheme: dark)` in their `media` and the day prints follow, so the system decides. With a theme chosen, only that theme’s prints are rendered, with no colour scheme in their `media`, so a dark choice on a light phone fetches a night print and never a day one. Within each theme the desktop print carries `(min-width: 37em)` and comes first, and the phone print after it carries no width at all. 37em is not one of the layout’s breakpoints; it is where the desktop print’s numbers reach 11px — 30px of a 1600px drawing, shown about 590px wide — so below it the phone print, drawn for that, takes over. The server learns the choice from the cookie the boot script writes, through the `(site)` layout’s `load` (the next chapter quotes it); once the page is running, the live choice takes over, so flipping the toggle on this page swaps the print.'
			},
			{
				type: 'why',
				title: 'Why `running`, and not `theme.choice` from the start',
				text: 'The first render in the browser is hydration, and hydration does not draw the page again: it walks the elements the server sent and attaches to them, so it has to describe the same markup the server wrote. The server knew the choice only from the cookie, as `data.theme`. Read `theme.choice` straight away and a person whose storage and cookie disagree — another tab changed the theme a moment ago — describes different `<source>`s from the ones in the document. Where only a `srcset` differs Svelte keeps the server’s and ignores its own; where the number of sources differs hydration fails, and Svelte throws the server’s page away and renders all of it again. So the first render reads `data.theme`, as the server did; `onMount` runs once hydration is done and sets `running`, and from then on the live choice decides. The general rule is worth keeping: a value only the browser knows may change the page *after* hydration, never during it.'
			},
			{
				type: 'p',
				text: 'All four prints are `?enhanced` imports with the widths named — the same pipeline as `<enhanced:img>`, run by the preprocessor that must come first in `vite.config.ts`: AVIF and WebP at four widths for a desktop print and three for a phone print, with the intrinsic width and height known so nothing shifts while it loads — the phone print is 16:10 like the desktop’s, so the one `<img>` reserves the right space for either. The component is not used because it cannot put a `media` on a source; the import gives the same `sources` and `img` and the markup is written by hand, with `src/images.d.ts` telling TypeScript what such an import returns. Each source’s `sizes` tells the browser how wide that print is on screen — 40rem from 64em or the whole width for a desktop print, the whole width for a phone print — so it picks the smallest file that is still sharp, and `fetchpriority="high"` says it is the one to fetch first. On a phone the image steps out of the gutter to the screen’s edges and its bottom edge fades into the paper — only the bottom: a fade at the top as well left the map a faint band with dead space under it.'
			},
			{
				type: 'why',
				title: 'Why a cookie, when the choice is already in storage',
				text: 'Because the server renders the `<picture>`, and the browser starts fetching an image from the HTML long before any script could change it. `localStorage` is invisible to the server; a cookie is sent with the request. The cookie is a mirror, not a second source of truth: every colour still comes from `light-dark()` and `data-theme`, so a missing or stale cookie costs at most one picture drawn for the other theme — never a flash, never a wrong colour on anything else.'
			},

			{ type: 'h3', id: 'motion', text: 'One timeline, four rules' },
			code('src/lib/motion/hero.ts', 1, 75),
			{
				type: 'p',
				text: 'The project’s cinematic budget is spent on the globe and on one hero. Everything else moves the way a good editor cuts: rarely, and for a reason — a dialog rises 8px, a bottom sheet slides on the iOS curve, a tab indicator is a `Tween` from `svelte/motion`, the check mark on a copy button pops in with a ten-line custom transition in `src/lib/motion/transitions.ts`, and all of it reads its duration from the `--dur-*` tokens or from `reducedMotion` in `src/lib/motion/prefers.svelte.ts`, quoted below. The next chapter, {{motion-with-intent}}, goes through every one of those and every built-in the project leaves out. The hero is the exception that earns GSAP: an attachment — a function that receives an element and returns a cleanup — with four rules the comment states: nothing is hidden until JavaScript runs, nothing that has been seen is taken away, reduced motion means no motion, and it plays once. The third is kept by the page rather than by the function — a conditional attachment, below — so `hero()` never has to ask. The second rule is the one a review found. On a first load the server’s hero is painted long before the JavaScript arrives, and the timeline then snapped the title, the lede and the image to nothing and faded them back — the sentence a visitor had started to read blinked out. So `alreadySeen()` asks two questions: is this a hydration (the root layout has not yet set `data-hydrated`), and has the browser painted (a `first-contentful-paint` entry exists)? Both yes, and the hero stays exactly as it is; the timeline plays when the hero arrives with a client-side navigation, as new elements nobody has seen. The copy and the image are found by `data-hero-copy` and `data-hero-image`, so the attachment does not know the markup, and the cleanup kills the timeline and clears the inline styles GSAP wrote. It is imported by the home route alone, so the library ships in that chunk and no other.'
			},
			code('src/routes/(site)/+page.svelte', 185, 221),
			code('src/lib/motion/hero.ts', 77, 113),
			code('src/routes/(site)/+page.svelte', 323, 346),
			{
				type: 'p',
				text: 'The feature cards need no timeline, so they get none. `inview` only decides *when*: it sets `data-animate` in the browser while the grid is still below the fold, and `data-inview` the first time it scrolls into view, and then disconnects its observer. The CSS does the motion — a 12px rise on `--dur-5`, each card 70ms after the one before through the `--i` the markup sets — and rule 1 lives in the selector: a card is hidden only under `[data-animate]`, which the server never writes, so with JavaScript off every card is simply there. A grid already on screen when the script arrives skips the hiding step. Under reduced motion there is no `inview` at all — the same conditional attachment as the hero’s — so nothing is ever written, and the CSS sits inside a `no-preference` media query as a second lock. The list itself is a declaration tag — a `{const}` in the markup, beside the one loop that uses it — and the next chapter says what one is in full.'
			},
			{
				type: 'why',
				title: 'Why the list is a bare `{const}` and the icon a `$derived` one',
				text: 'A bare declaration tag is worked out once, when its block is created; one that wraps its value in `$derived` is worked out again whenever what it reads changes — the compiler turns the first into a plain `const` and the second into a derived signal. The list reads only messages, and the one thing that could change those is the language. A language switch loads a new page — the switcher’s links carry `data-sveltekit-reload` — and the new page works the list out afresh in the new language, so once is all it needs, and the comment above it says it is bare on purpose. `Icon` reads the loop’s item instead, and an item is like a prop: Svelte’s best practices say to “treat props as though they will change”, and to make a value that depends on one `$derived`. A keyed `{#each}` keeps a card whose key survives a change to the list and hands it the new item; a bare tag there would go on drawing the old icon. This list never changes, so the `$derived` costs nothing today, and it is the form that stays right on the day the list does.'
			},

			{ type: 'h3', id: 'one-query', text: 'One query for motion, and an attachment that is not there' },
			code('src/lib/motion/prefers.svelte.ts', 1, 21),
			{
				type: 'p',
				text: 'CSS has its own answer to “does this person want motion?” — the `prefers-reduced-motion` block at the bottom of `tokens.css` — and it reaches everything a stylesheet animates. It does not reach a script. The itinerary’s FLIP, the map’s camera, the globe and the hero are JavaScript, and so are Svelte’s own transitions: the documentation says they “are driven by the Web Animations API rather than by CSS”, so that a stylesheet rule zeroing durations “has no effect on them”. Every one of those reads `reducedMotion` from this module. It used to build its own `new MediaQuery(\'(prefers-reduced-motion: reduce)\')`; `svelte/motion` ships exactly that query as `prefersReducedMotion`, built once, and the module now only gives the framework’s instance the name the app reads. One query, so no two components can disagree about the setting.'
			},
			{
				type: 'p',
				text: 'The home page uses it in the place it reads best: the attachment itself, in the hero markup quoted above. `{@attach !reducedMotion.current && hero()}` — the documentation’s rule is that “falsy values like `false` or `undefined` are treated as no attachment, enabling conditional usage”. Under reduced motion there is no attachment, so the timeline is never built rather than built and told to stop, and `hero.ts` loses the early return it used to need. And because an attachment’s expression is read inside an effect, it follows the setting live: switch reduced motion on while the timeline plays, and Svelte runs the attachment’s cleanup — the timeline is killed and GSAP’s inline styles are cleared, so the hero is left exactly as the server drew it. `inview()`’s cleanup does the same for the attributes it wrote.'
			},
			{
				type: 'why',
				title: 'Why `MediaQuery` is not how the page first looks',
				text: '`MediaQuery` has a second argument, `fallback`, and the documentation calls it the “fallback value for the server”; leave it out and the server sees `false`. Its first sentence of advice is the real lesson: “during server-side rendering, there is no way to know what the correct value should be, potentially causing content to change upon hydration. If you can use the media query in CSS to achieve the same effect, do that.” That is why the first paint of this design never depends on one. The theme’s colours are `light-dark()` in CSS, the boot script sets `data-theme` before the first paint, and the hero’s prints are chosen by `<picture>` with `media` — all of them answered by the browser before any script runs. `MediaQuery` is for what only a script can do, after hydration: start a timeline or not, render a WebGL map beside the list or not (chapter {{the-trip-page}}), pick the toaster’s corner. A value that changes what the server rendered is a value that can make the page jump.'
			},

			{ type: 'h3', id: 'scoped', text: 'Scoped styles, and the bridge from a script to the stylesheet' },
			{
				type: 'p',
				text: 'A component’s `<style>` applies to that component and nothing else, and the mechanism is plain enough to read in the browser’s inspector. The documentation: Svelte works “by adding a class to affected elements, which is based on a hash of the component styles (e.g. `svelte-123xyz`)”, and adds the same class to each selector. Two consequences follow. Every scoped selector gains “a specificity increase of 0-1-0”, so a component’s `p` beats a global `p` “even if the global stylesheet is loaded later” — which is why a component can restyle a utility class from `utilities.css` without `!important`. And where the class would have to appear twice in one selector, the second time it is written as `:where(.svelte-xyz123)`, which adds nothing, so a long selector does not climb in specificity as it grows. `@keyframes` are scoped by the same hash, so `rise` on the home page and `pulse` in the trip header cannot collide with anybody else’s. What a scoped selector cannot see is an attribute a script writes after the fact, which is why the home page’s card rules are wrapped in `:global(…)` (above): the compiler would otherwise drop a selector it cannot see matching anything in the markup.'
			},
			code(`${TRIP}/TripView.svelte`, 430, 436),
			code(`${TRIP}/TripView.svelte`, 840, 848),
			{
				type: 'p',
				text: 'When a number computed in a script has to reach the stylesheet, the project passes it as a custom property with the `style:` directive — `style:--x`, `style:--w` — and lets the CSS decide what to do with it. The tab indicator’s position is a `Tween` (chapter {{the-trip-page}}), and the markup hands its current value to two properties that one rule turns into a `translate` and a `width`. The same bridge carries the header sheet’s stagger (`style:--i={i}` on each link, read as `calc(var(--i) * var(--stagger))`), the home page’s card delay, the frame height the trip page measures (`--frame-top`), and the trips grid’s minimum column (`style:--grid-min="18rem"` over the `.grid` utility’s `var(--grid-min, 18rem)`). The line between that and a `data-*` attribute is the kind of value. A custom property carries a *quantity* — a length, an index, a duration — that CSS does arithmetic with. An attribute carries a *state* from a short list — `data-kind="food"`, `data-ready`, `data-fresh` — that CSS matches with a selector. The directive also wins over a `style` attribute on the same element, “even over `!important` properties”, so there is never a question of which one applies.'
			},
			{
				type: 'note',
				text: 'Three styling features the project does not use, each for the same reason as Tailwind (ch. {{the-toolchain}}, ch. {{choosing-libraries}}): one set of tokens, one scope rule, no exceptions to remember. A nested `<style>` inside markup is “inserted as-is into the DOM; no scoping or processing will be done”, which makes it global CSS hidden in a component. `style:color|important` adds `!important` to a directive that already beats the attribute. And `@keyframes -global-name` exports an animation from a component: the keyframes the whole app shares — the dialog’s `panel-in`, the phone sheet’s `sheet-in`, the popovers’ `pop-in` — live in `base.css`, where shared things go.'
			},

			{ type: 'h3', id: 'checked', text: 'Contrast, checked on every lint' },
			{
				type: 'p',
				text: 'Every ratio in this chapter — 5.36:1 for the tertiary ink on paper, 3.06:1 for a chosen segment’s edge, 10.39:1 for the globe’s hints — is printed by a script, not remembered. Because every colour is a token and most tokens are a `light-dark()` pair, whether text is readable is a question `tokens.css` can answer on its own, without a browser: parse it, resolve both sides of each pair and the `var()` aliases between tokens, and work out the WCAG ratio of every pair the design puts on top of each other.'
			},
			code('src/lib/design/contrast.ts', 106, 144),
			{
				type: 'p',
				text: 'That is the table the design promises, as data: every text ink on every surface tier, the fill ink on every stop kind, the focus ring on every paper, the segment edge on its track and on itself, and the accent and state colours where they are used as text. The floor is the standard’s — 4.5:1 for text, 3:1 for something that is not text but must be seen — and the maths is too: each channel linearised, weighted by how bright the eye finds it into a luminance, and the ratio of two luminances each plus 0.05. A pair whose token does not exist counts as a failure, so renaming `--ink-3` cannot quietly drop its rows.'
			},
			code('scripts/contrast.ts', 19, 38),
			{
				type: 'p',
				text: '`pnpm run lint` ends with this script, so a token change that makes the tertiary ink unreadable on a card fails in a second, before a browser has started; `--report` prints the whole table, and `scripts/screens.ts` prints it again beside the screenshots. The module is pure — no DOM, no file system — so a script, a unit test (chapter {{unit-and-browser-tests}}) and the screenshot tool all import the same table.'
			},
			{
				type: 'why',
				title: 'Why a static table, when axe checks contrast in the browser',
				text: 'axe does check it, and chapter {{end-to-end}} runs axe on every screen in both themes. But axe can only judge what is on screen in the states the suite reaches: an error line inside a dialog, a warning chip, a hovered link may never be rendered there. The table checks every pair the design *promises*, in both themes, whether or not a page shows it today — and when it fails it names two tokens, which is where the fix goes, rather than a DOM node, which is where the symptom was. The two disagree only when a component puts colours together that the table does not list, and that is a conversation the design should have anyway.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain `light-dark()` and why the theme class only sets `color-scheme`.',
					'You know why the boot script has a hash and no nonce.',
					'You can state the four rules of the hero timeline, and say why the feature cards animate with CSS instead.',
					'You can say why a script needs `prefersReducedMotion` when the CSS already zeroes every duration, and what `{@attach cond && fn()}` does when `cond` changes.',
					'You can say when a value goes to the stylesheet as `style:--x` and when as a `data-*` attribute, and what specificity a scoped selector adds.',
					'You can say how the hero fetches one print of two, and why the server has to know the theme for that.',
					'You know which file a contrast ratio in this chapter comes from, and what fails when a token change breaks one.'
				]
			}
		]
	},

	{
		slug: 'motion-with-intent',
		title: 'Motion with intent',
		summary:
			'What moves in Meridian and what is not allowed to: the design brief’s two lists as the rules, four mechanisms and when each is the right one, the one custom transition with `css(t, u)`, three Svelte transitions and one `animate:flip`, a `Tween` for the tab bar, CSS keyframes that Bits UI waits for, a phone menu whose motion ends outside the accessibility tree, the `svelte/easing` table — and every built-in the project leaves out, with the rule that keeps it out.',
		goal: 'Choose between a CSS animation, a Svelte transition, an animation and a motion value for a given movement; write a custom transition; honour reduced motion in each; and say no to the motion a design does not need.',
		blocks: [
			{
				type: 'p',
				text: 'The design system set the budget; this chapter spends it, and the rules for spending it are not taste. The design brief has two lists. “What animates, exactly” is a table, and it is exhaustive: every movement in the product is a row, with its duration token, its curve and the file it lives in — a dialog rises 8px, a bottom sheet slides on the iOS curve, the tab indicator translates, a new stop gets a highlight that fades, the live dot pulses because the pulse is information. “What never animates” is the other list: text colour, layout (no `height`, `width` or `margin` transitions anywhere), the header’s border, table sorting, presence chips, numbers, anything parallax, and anything at all under reduced motion. A movement that is not in the first list is not built, and a movement in the second is refused even when a library makes it one word. That is what “with intent” means here: motion that explains a change of state — where the dialog came from, which tab you are on now, which card just arrived — and nothing that decorates.'
			},
			{
				type: 'p',
				text: 'There are four ways to move something in a Svelte app, and each has its own job. **CSS** — a `transition` or `@keyframes` — for anything that stays in the document and changes state: hover, press, open, closed. It reads the `--dur-*` tokens, so reduced motion reaches it for free. A **Svelte transition** (`transition:`, `in:`, `out:`) for an element that enters or leaves the document because of state — the one thing CSS cannot do on its own, because once an element is removed there is nothing left to animate. An **animation** (`animate:`) for an item that moves to a new place in a keyed list. And a **motion value** — `Tween` or `Spring` from `svelte/motion` — for a number that has to glide to its new value while a script reads it every frame. The hero’s GSAP timeline is the fifth, used once, and chapter {{the-design-system}} says why.'
			},

			{ type: 'h3', id: 'css-first', text: 'CSS first, and a library that waits for it' },
			code('src/lib/styles/base.css', 556, 594),
			{
				type: 'p',
				text: 'The dialogs are the largest movement in the product, and they have no JavaScript animation at all. Bits UI renders `data-state="open"` while a dialog is up and flips it to `closed` just before unmounting — and, the comment says, waits for any CSS animation on the element to finish first. So the enter and the exit are two keyframe rules each: the scrim fades, the phone’s sheet slides up on `--ease-sheet` and down on `--ease-in`, and from 40em the panel scales from 0.96 and rises 8px. The exit is shorter than the entrance on purpose (`--dur-3` against `--dur-4`): a person who has decided to close something wants it gone. Under reduced motion every token is 0ms, the animation ends the moment it starts, and the dialog simply appears and disappears.'
			},
			{
				type: 'p',
				text: 'That is the line between CSS and a Svelte transition. CSS can animate an element’s *leaving* only when something keeps the element in the document until the animation ends — Bits UI does it for its own components by waiting. For an element of yours inside an `{#if}`, Svelte is the thing that waits: the documentation’s rule is that when a block is transitioning out, “all elements inside it, including those that do not have their own transitions, are kept in the DOM until every transition in the block has been completed”. An element that never leaves — the update banner, which reloads the page instead of closing, the header’s sheet, the tab indicator — needs no transition at all, and gets CSS.'
			},
			code(`${UI}/UpdateBanner.svelte`, 53, 58),
			{
				type: 'p',
				text: 'The update banner is the plainest case: one keyframe rule, `arrive`, from 16px lower and transparent, on `--dur-4` with `--ease-out`, played once when the banner is rendered. It has no exit because it has no way to leave — the button reloads the page — and an `in:fly` would have done the same thing with a JavaScript import and a reduced-motion check of its own.'
			},

			{ type: 'h3', id: 'custom', text: 'One custom transition' },
			code('src/lib/motion/transitions.ts', 1, 33),
			{
				type: 'p',
				text: 'A transition is a function of three arguments — the element, the parameters written in the directive, and an `options` object — that returns a `TransitionConfig`: `delay`, `duration`, `easing`, and one of `css` or `tick`. `css(t, u)` returns a string of CSS for a moment of the transition: `t` runs from 0 to 1 on the way in and from 1 back to 0 on the way out, so 1 is always the element as it naturally is, and `u` is `1 - t`. Easing is applied before `css` sees `t`, so `pop` writes a straight line — opacity `t`, scale from 0.6 to 1 — and `cubicOut` bends it. Svelte calls `css` many times *before* the transition starts and turns the answers into keyframes for a Web Animation, which a browser can run off the main thread; `tick(t, u)` is called on every frame instead, for the rare movement that CSS cannot describe (the documentation’s example types a sentence out letter by letter). The rule is theirs: “If it’s possible to use `css` instead of `tick`, do so.”'
			},
			{
				type: 'p',
				text: 'Two more forms exist and `pop` needs neither. The third argument, `options`, carries `direction` — `in`, `out` or `both` — for a transition that should move differently on the way out. And a transition may return a *function* that returns the config instead of the config itself; that function is called in the next microtask, after every transition starting in the same update has been created, which is how `crossfade` lets a leaving element and an arriving one find each other before either decides how to move.'
			},
			{
				type: 'why',
				title: 'Why `pop` asks about reduced motion itself',
				text: 'Because nothing else will. The tokens in `tokens.css` reach CSS animations, and the documentation says plainly that Svelte’s transitions are not those: they “are driven by the Web Animations API rather than by CSS. A global `@media (prefers-reduced-motion: reduce)` rule that zeroes `transition-duration` and `animation-duration` therefore has no effect on them.” So every transition in the project reads `reducedMotion` — `prefersReducedMotion` from `svelte/motion`, under the app’s name (chapter {{the-design-system}}) — and takes a duration of 0 when it is set — `pop` in its own body, so a component that uses it never has to remember, and the built-ins at the place they are used.'
			},
			code(`${TRIP}/Companions.svelte`, 172, 193),
			code('src/routes/(site)/t/[slug=slug]/settings/EmbedSection.svelte', 68, 82),
			{
				type: 'p',
				text: '`in:` is a transition that plays only on the way in. The check mark that replaces a copy icon pops in, and the copy icon it replaced simply goes: an `out:` on it would hold both icons in the button for 160ms, side by side, and the button would grow and shrink — layout, which never animates. The invite link’s block fades in rather than sliding open for the same reason. Both are *local*, which is the default in Svelte 5: “Local transitions only play when the block they belong to is created or destroyed, not when parent blocks are created or destroyed.” The fade belongs to `{#if inviteUrl}`, so it plays at the one moment it explains — the link has just been made — and never because something around it appeared. `|global` is the opt-in for the other behaviour, and a screen built from global transitions animates every piece of itself at once whenever a page or a tab first renders; the project has none.'
			},
			code('src/lib/map/MapView.svelte', 530, 543),
			{
				type: 'p',
				text: '`transition:` is the bidirectional kind: the same function on the way in and on the way out, and “it can be smoothly reversed while the transition is in progress” — toggle the locate button twice quickly and the pill turns round where it is rather than finishing and starting again. It is the one Svelte transition on the map, on the one element that comes and goes there: “Finding you…” while the browser looks, “Location is not available.” if it cannot. `role="status"` makes a screen reader say it; the fade is for everybody else.'
			},

			{ type: 'h3', id: 'flip', text: 'One animation, in the one list that reorders' },
			code(`${TRIP}/Itinerary.svelte`, 110, 129),
			code(`${TRIP}/Itinerary.svelte`, 241, 257, { partial: true }),
			{
				type: 'p',
				text: '`animate:` is for a different event from a transition: an item that stays in a keyed `{#each}` but moves to another index. The documentation’s three conditions are the whole contract — it runs “when the contents of a keyed each block are re-ordered”, it does not run “when an element is added or removed”, and the directive must sit on an *immediate* child of the keyed block, which is why it is on the `<li>` and not on the card inside it. `flip` measures where the element was (First) and where it is now (Last), moves it back to the first place with a transform (Invert), and lets it go (Play). svelte-dnd-action does its own FLIP for the card being dragged, and `flipDurationMs` tells it how long Svelte’s will take for the others, so both read one `duration` — 240ms, or 0 under reduced motion. There are no `in:` or `out:` on the items: the library says it does not work with them, and a stop that arrives gets the brief’s “highlight, not a bounce” instead, the `fresh` mark the effect sets for 1.2 seconds.'
			},
			{
				type: 'note',
				text: 'A custom animation has the same shape as a custom transition, with one difference in its arguments: `(node, { from, to }, params)`, where `from` and `to` are the element’s `DOMRect` before and after the reorder, returning an `AnimationConfig` — `delay`, `duration`, `easing`, `css`, `tick`. The project writes none, because `flip` is the reorder the brief asks for, and the only list that reorders by hand is the itinerary. The expenses table re-sorts in place, with no movement at all: the brief lists table sorting among the things that never animate.'
			},

			{ type: 'h3', id: 'values', text: 'A value that moves: `Tween`, and the `Spring` beside it' },
			code(`${TRIP}/TripView.svelte`, 175, 194),
			{
				type: 'p',
				text: 'The tab indicator is one 2px bar that slides between tabs, and its position is a `Tween`: `new Tween(initial, { duration, easing })`, then `set(target)` — which returns a promise for when it arrives — and `.current`, which the markup reads on every frame and hands to the stylesheet as `style:--x` and `style:--w` (chapter {{the-design-system}}). The options given to `set` override the defaults for that one move, and `{ duration: 0 }` is how a tween jumps: the first placement, a resize, and every move under reduced motion. `Tween.of(() => value)` is the other constructor, a tween bound to whatever the function returns, created during component initialisation — and the project does not use it, because the obvious place for it is the trip header’s total distance, and the brief says numbers never count up.'
			},
			{
				type: 'p',
				text: '`Spring` is the tween’s physical sibling, available since Svelte 5.8: instead of a duration it has `stiffness`, `damping` and `precision`, and a value set while it is moving keeps its momentum. Its `set` takes `{ instant: true }` to jump — where a `Tween` takes `{ duration: 0 }` — and `preserveMomentum` in milliseconds for a fling, and `Spring.of` binds it to a function as `Tween.of` does. The place it belongs is the waypoint library’s compass needle, swinging to a new bearing (chapter {{two-components-for-any-app}}); it is not there because the library promises `svelte ^5.0.0` to anybody who installs it, and a class from 5.8 would break that promise. Both replace the stores `tweened` and `spring`, which Svelte 5 still exports and marks deprecated: they did the same job behind `subscribe` and `$value`.'
			},

			{ type: 'h3', id: 'sheet', text: 'A menu whose motion ends outside the accessibility tree' },
			code(`${UI}/Header.svelte`, 266, 306),
			{
				type: 'p',
				text: 'The phone’s menu sheet looks like a textbook `slide`, and the brief chose otherwise for three reasons. The sheet is always in the document, because the menu button’s `aria-controls` must point at something, and a transition only plays when an `{#if}` adds or removes an element. And `slide` animates height, padding and margin — layout, which never animates. (It also measures the element it moves, and Svelte warns at run time, as `transition_slide_display`, when the element’s `display` is `contents`, `inline` or `table`, where that measuring cannot work.) So the sheet is revealed by a `clip-path` from the top — a mask, not a box changing size — and its links fade in 30ms apart through `--i`, the custom property each link is given in the markup.'
			},
			{
				type: 'p',
				text: 'The part that matters more than the look is the last line of the closed state: `visibility: hidden`, after a delay as long as the clip takes. A clipped element is invisible to the eye and perfectly visible to a screen reader and to the Tab key — a closed menu that a keyboard can still walk into. `visibility: hidden` takes the links out of the accessibility tree and out of the tab order, and the delay lets the clip finish before it does. Opening switches `visibility` at once and runs the clip; closing runs the clip and then switches. The test proves the result rather than the CSS:'
			},
			code('e2e/public.e2e.ts', 207, 230),
			{
				type: 'p',
				text: 'On the Pixel 7 profile only, because a desktop has no menu. Before the menu opens, a query by role cannot find the Explore link at all — Playwright’s role queries see what the accessibility tree sees — so `toBeHidden()` passes on an element that is not there for a screen reader either. Opened, it is visible; Escape closes it, the button says `aria-expanded="false"`, focus is back on it, and the link is gone from the tree again. Delete `visibility: hidden` from the closed sheet and the first assertion fails, with the sheet still perfectly clipped on screen.'
			},

			{ type: 'h3', id: 'easing', text: 'The easing table' },
			{
				type: 'p',
				text: '`svelte/easing` exports thirty-one functions: `linear`, and ten families in three forms each. The form says where the movement is fast. `…Out` starts fast and settles — the curve for something *arriving*, and `cubicOut` is the nearest built-in to the `--ease-out` token, which a JavaScript easing cannot read. `…In` starts slowly and leaves fast — for something going away, the role `--ease-in` plays in CSS, “exits only”. `…InOut` is slow at both ends, for something moving from one place on screen to another, like `--ease-inout`. The family says how strongly:'
			},
			{
				type: 'ul',
				items: [
					'**`sine`, `quad`** — the gentlest. A fade that should barely be noticed.',
					'**`cubic`** — the project’s default: `cubicOut` for the tab indicator and for `pop`.',
					'**`quart`, `quint`, `expo`** — the same shape, steeper each time: most of the movement in the first moment, then a long settle. GSAP’s `power3.out` on the hero is the quart curve under another name.',
					'**`circ`** — a quarter circle: abrupt at one end, very soft at the other.',
					'**`back`, `elastic`, `bounce`** — they overshoot the target and come back, or bounce off it. Declined everywhere: an overshoot is a bounce, and the brief’s word for a new stop is “a highlight, not a bounce”.',
					'**`linear`** — no easing: for progress and for anything continuous. Nothing here needs it; the live dot’s pulse is CSS.'
				]
			},

			{ type: 'h3', id: 'left-out', text: 'What is left out, and the rule that does it' },
			{
				type: 'ul',
				items: [
					'**`fade|global` or `in:scale out:fade` on presence chips** — “Presence chips entering/leaving — they appear.” A person arriving with a bounce is a slot machine. (`in:` and `out:` together are the non-bidirectional pair: a different movement each way, and no reversing halfway.)',
					'**`Tween.of` on the total distance** — “Numbers (totals, distances) — no count-up.”',
					'**`fly` on the update banner** — the CSS `arrive` above does it, with no exit to need a transition.',
					'**`slide` on the menu sheet** — above: the sheet never leaves the document, and `slide` animates layout.',
					'**`draw` on a trip card’s route** — `draw` traces an SVG path’s stroke over time, and it is not in the brief’s table: card hover is the only card motion.',
					'**`crossfade` when a stop moves to another day** — `crossfade({ fallback })` returns a pair, `[send, receive]`, and an element sent with a `key` flies to the element received with the same key. It needs `out:` and `in:` on the items, and items in a dndzone may not have them; the brief says list reorder is FLIP only.',
					'**`scale` and `blur`** — `scale` grows a thing from a point, which is a bounce by another name; `blur` makes the text being read unreadable mid-movement, and the brief will not move the text you are reading.',
					'**`unmount(component, { outro: true })`** — plays a component’s outros before it leaves, and its promise resolves when they have finished; `mount` plays intros unless `intro: false` is passed. Both are for a component mounted by hand, and this project mounts none — even the custom element is mounted by the browser.',
					'**Skeleton loaders** — “Skeletons — None.” Every `await` resolves on the server; a shimmer would invent latency to show off.'
				]
			},
			{
				type: 'why',
				title: 'Why reduced motion means none, not less',
				text: 'Because “less” is a judgement made on somebody else’s behalf, and the setting exists for people for whom motion is not a matter of taste — vestibular disorders, migraine, attention. So in this project the setting turns every duration to 0, turns view transitions off (the root layout starts none, chapter {{the-shell}}), stops the globe’s flight and its camera, makes the map jump instead of fly, sets `flip` to 0, and never attaches the hero timeline at all. The live dot is the only thing that pulses, and under reduced motion it holds still too. Every one of those checks reads the same query, and the visual suite runs with reduced motion on, so a screen that only settles correctly with motion would fail there (chapter {{end-to-end}}).'
			},
			{
				type: 'checkpoint',
				items: [
					'Given a movement, you can say whether it is CSS, a transition, an animation or a motion value, and why.',
					'You can write a custom transition with `css(t, u)`, say what `t` and `u` are on the way in and out, and say when `tick` is the right answer.',
					'You can say what local means for a transition, and what `|global` would change.',
					'You know the three conditions under which `animate:` runs, and why the itinerary’s items have no `in:` or `out:`.',
					'You can say why the phone menu ends on `visibility: hidden`, and what the end-to-end test proves.',
					'You can name the rule in the brief that keeps each left-out built-in out.'
				]
			}
		]
	},

	{
		slug: 'the-shell',
		title: 'The shell: a root that knows nobody',
		summary:
			'The root layout has no header and no `load`; the `(site)` group has both; the header computes its links in a `{const}` declaration tag and reads `scrollY` from `svelte/reactivity/window`; view transitions in `onNavigate`; a version banner from `updated.current`; two error pages sharing one view.',
		goal: 'Arrange layouts so that prerendered pages and per-request pages can coexist, and know what belongs at the root and what does not.',
		blocks: [
			{
				type: 'p',
				text: 'The layout split is the decision this chapter is about, and it came from a failure. The first version had the header in the root layout, fed by a root `+layout.server.ts` that loaded the signed-in person. Then the guides were prerendered, and a prerendered page is rendered once, at build time, with nobody signed in — and that answer is baked into its data. A signed-in person navigating to a guide would see “Sign in” in the header. So the root knows nobody, and the pages that need to know live in a group.'
			},
			code('src/routes/+layout.svelte', 1, 40, { partial: true }),
			code('src/routes/+layout.svelte', 42, 122, { partial: true }),
			{
				type: 'p',
				text: 'Two more things in that block belong to every page. `afterNavigate` asks the browser to look for a new service worker on each client-side navigation, because the browser only looks by itself on a full page load, and a tab left open across a deploy would otherwise keep the old worker for as long as it stays open — chapter {{the-offline-itinerary}} explains the worker and why the check is skipped with no network. And the last thing in the script is one line in `onMount`: a `data-hydrated` attribute on the root element. `onMount` in the root layout runs once the whole tree has hydrated, so the attribute is an honest signal that the JavaScript is running — a stylesheet can hide a control that needs it until then, and the end-to-end suite waits for it in the test that proves text typed *before* hydration survives (chapter {{signing-in-and-up}}).'
			},
			{
				type: 'p',
				text: 'What is left at the root is what every page shares: the fonts and stylesheet, the toaster, the deploy banner, and the two navigation hooks. `onNavigate` wraps the completion of every client-side navigation in `document.startViewTransition`, so the old page cross-fades into the new — and an element with a `view-transition-name`, like the trip title, morphs. Unless the person prefers reduced motion: then no transition is started at all. Turning the CSS off is not enough, because the browser’s own default for a view transition — a 250ms cross-fade, and a position-and-size morph of every named element — runs unless something replaces it; not starting the transition is the one switch that covers all of it. `beforeNavigate` turns the next navigation into a full page load when `updated.current` says a new build was deployed, so no chunk from the old build is ever requested.'
			},
			code('src/routes/+layout.svelte', 158, 243),
			{
				type: 'p',
				text: 'Two decisions in that block. The toaster is `unstyled`, with class names that `base.css` dresses as the same tier-3 surface as a dialog, and it moves by screen size: on a phone the bottom of the screen is where the stop sheet opens, so toasts sit under the header instead, offset further when the deploy banner is up there too; on a wide screen they take the free bottom-right corner. svelte-sonner reads a separate `mobileOffset` below 600px and ignores `offset` there, so the same value goes to both — without it a phone’s toast sat 16px from the top, over the brand — and the value names the top alone, because a single string would push the sides in by a header’s height as well. Successes are `toast.success(…)`, so they wear a Phosphor check in `--ok`; errors a warning circle in `--coral`; the list sits on `--z-toast`. `MediaQuery` makes the placement a value the props read rather than a listener. And the cross-fade is CSS on the view-transition pseudo-elements — the old page leaves in 120ms, the new one arrives in 200ms — with the header excluded: it has a `view-transition-name` of its own and its group is told not to animate, so the one element that should feel fixed does not fade with every page. The trip title morphs over `--dur-4`; the trip panel rises 4px. All of it also sits inside `prefers-reduced-motion: no-preference` — the second lock on a door the script has already locked, since under reduced motion there is no transition for the CSS to style, and a navigation is a cut.'
			},
			code('src/routes/(site)/+layout.server.ts', 1, 14),
			code('src/routes/(site)/+layout.svelte', 1, 45),
			{
				type: 'p',
				text: 'The one `load` that returns data, and what it returns is about the shell, not a page. (There are two more `load`s in the project, and neither carries anything for a component to show: the `(app)` group’s guard, below, and the guide page’s in chapter {{guides-prerendered-with-mdsvex}}, which picks a prerendered file by its slug.) Identity is needed by every page and by the header around them, which is exactly the case a layout `load` exists for; the theme cookie is read here for the one picture with two prints (chapter {{the-design-system}}), because the server has to choose its sources before any script runs. Everything page-specific comes through remote functions. The `(app)` group inside `(site)` adds a second layout load that redirects strangers to sign in — chapter {{signing-in-and-up}} quotes it — so a page under it cannot forget to check. The layout takes its props as `LayoutProps` from `./$types`: the type SvelteKit generates for *this* layout, which knows that `data` has a `user` and a `theme` because the `load` beside it returned them, and that `children` is the snippet of the page inside. Every layout in the project types its props that way, and every page with a `params` or `data` uses its twin, `PageProps` (chapter {{the-trip-page}}). The one effect in the layout is about the device, not the page: whenever it finds nobody signed in, it deletes the copies of pages the service worker kept for reading offline, because they were rendered for whoever was signed in before — chapter {{the-offline-itinerary}} says which ways a session can end and why this is the net under all of them.'
			},

			{ type: 'h3', id: 'header', text: 'The header' },
			code(`${UI}/Header.svelte`, 1, 104),
			code(`${UI}/Header.svelte`, 108, 121),
			{
				type: 'p',
				text: 'Two small Svelte 5 things. `scrollY` from `svelte/reactivity/window` is the window’s scroll position as a reactive value with the listener managed for us — `undefined` on the server, where there is no window — and one `$derived` turns it into the border that appears when the page has scrolled. `{const}` is a declaration tag: a value computed in the markup and visible to its siblings and their children. It is what Svelte 5.56 put in place of `{@const}`, which still compiles but is legacy. The two are easy to confuse, and the difference is the whole lesson. `{@const}` could only sit directly inside a block, and it was *reactive*: the compiler made it a derived value, worked out again whenever what it read changed. A declaration tag works anywhere in the markup, can be a `let` holding `$state`, and is reactive only when it says so. A bare one is worked out once, when the block is created; to follow what it reads it wraps the value in `$derived`, as a `const` in a `<script>` would. So the one-for-one translation of old code is `{@const x = y}` → `{const x = $derived(y)}`, which is what Svelte’s own documentation gives. Dropping the `@` alone gives you the bare, once-only form — and this project made exactly that slip three times, in the header, the diagnostics page and the settings page, each found by a reader noticing something did not update. The link list depends on whether somebody is signed in, and the header sits in the layout, so it outlives a sign-in. The first version was a bare `{const}`: after signing in there was no “Trips” link until a reload, and after signing out the link stayed. The sign-up test in chapter {{end-to-end}} now looks for it both ways. The header is the only place that needs the list, so it lives where it is used.'
			},
			code(`${UI}/Header.svelte`, 123, 216),
			{
				type: 'p',
				text: 'Mobile first: the nav is a sheet under the header, opened by a button with `aria-expanded` and `aria-controls`, and at forty-eight ems it becomes a row and the button disappears. Below that it behaves like the dialog it is: `inert` on the page behind it, a scrim that dims the page as every other overlay does, focus moved in and back, Escape to close, and `afterNavigate` to close it whatever caused the navigation. The scrim is rendered after the `<header>`, not inside it: the header’s `backdrop-filter` makes it the containing block of anything fixed inside it, so a scrim in there could not reach the bottom of the screen. And `open` is an assignable `$derived` that reads the 48em query: cross the line — an iPad turned to landscape with the sheet open — and it derives afresh, closed, so the page is never left inert behind a menu button that has disappeared. The header is also the same on every page. The first version left out whatever the page already was — no “New trip” on the trips list, no “Sign in” on the sign-in page — and the result was a header whose links, language switcher and theme toggle jumped 130px sideways on the most travelled path in the app, from the trips list into a trip. Now the action is always there, and on its own page it carries `aria-current="page"`, like a nav link: a screen reader says “current page”, and the stylesheet can mark it without a second rule for the same idea. Signing out is a `<form>` spread from a remote `form` with no fields, so it works with JavaScript off; with it on, the form’s `enhance` empties this device’s offline copies before the submission ends the session (chapter {{the-offline-itinerary}}). The end-to-end helper in chapter {{end-to-end}} has to know about the sheet, which is the kind of thing a phone project in the test matrix catches. And every `href` in it is a call to `href()` — the next section — so the link list is a list of typed route ids, `/(site)/(app)/trips` and friends, not strings that happen to look like paths.'
			},
			{
				type: 'why',
				title: 'Why `class={[…]}`, and not `class:nav--open={open}`',
				text: 'A class that comes and goes is written in this project as the `class` attribute with an array or an object in it: `class={[\'nav\', { \'nav--open\': open }]}` — strings are always there, an object’s keys are there while their values are truthy, and Svelte turns the lot into one string with the same rules as the clsx library. Before Svelte 5.16 the convenient way was the `class:` directive, one per class: `class="nav" class:nav--open={open}`. It still compiles, and Svelte’s documentation now says to prefer the attribute, because the attribute is one value — it can be built in the script, passed as a prop, and merged with a class handed in from outside, `class={[\'btn\', props.class]}`, none of which a directive can do. You will meet the directive in older code and in libraries; read it as the same thing written the earlier way.'
			},

			{ type: 'h3', id: 'links', text: 'One way to write a link' },
			code('src/lib/href.ts', 1, 50),
			{
				type: 'p',
				text: 'A dozen lines of code under three dozen of comment, and the comment is the point. `resolve()` from `$app/paths` is SvelteKit’s typed link: the route id — groups included, which is why it is `/(site)/(app)/trips/new` and not `/trips/new` — is checked against the routes that exist, the parameters against the matchers in `src/params.ts`, and since 2.54 — `resolve()` itself is from 2.26; the search-string form came later, so every 3.x has it — the id may carry its own search string or hash, so `href(`/(site)/t/[slug=slug]?tab=${tab}`, { slug })` is one call and still typed. Paraglide’s `localizeHref` then puts the language in front. Wrapping the two in one function means a link cannot forget either half: rename a folder and every link to it is a type error in every component; add a language and every link already speaks it.'
			},
			{
				type: 'note',
				text: 'The return type is `ResolvedPathname`, and that is not a trick played on the linter — on one condition, which `vite.config.ts` sets: `paths.relative: false`. With SvelteKit’s default, `true`, `resolve()` answers a *server* render with a path relative to the page, `./explore` or `../trips`, so the HTML still works if the whole app is moved under a subdirectory; Paraglide’s `localizeHref` then resolved that against an origin and handed back a whole URL, `http://localhost:4173/explore`. Every link in the server’s HTML carried the build’s origin, and so did every prerendered guide — and the header could not mark the page it was on, because `isCurrent` compares the page’s pathname with each `href`, and a URL is never equal to a pathname. Nobody saw it in a browser, which redraws the links as root-relative paths the moment it hydrates; chapter {{end-to-end}} has the test that reads the server’s HTML with JavaScript off. This app is served from the root of its domain, so the portability was worth nothing and the setting is `false`. SvelteKit defines the type as `/${Path}` *or* `/${string}/${Path}` — a slot for a base path in front of every resolved pathname — and `/de/trips` is exactly that shape, a prefix that `reroute` in `src/hooks.ts` strips before routing. eslint-plugin-svelte’s `no-navigation-without-resolve` rule, which started recognising SvelteKit 3 projects in 3.23.1, accepts an `href` or a `goto()` of that type; it cannot see through `localizeHref`, and this is the honest way to tell it what the wrapper does. The one link in the app that bypasses `href()` is the language switcher in chapter {{three-languages-with-paraglide}}, and it says why in a comment the linter reads.'
			},
			code(`${UI}/Footer.svelte`, 1, 20),
			code(`${UI}/UpdateBanner.svelte`, 1, 22),
			{
				type: 'p',
				text: 'The footer is product copy, not a build log: one sentence and two links. `version` from `$app/env` — the commit hash — is on the element as `data-version`, so “which build is this?” is answered for whoever opens the inspector, and on the diagnostics page in words, without a hash sitting in front of every visitor. The banner appears when `updated.current` flips — under the header on a phone, where the toasts also go, never at the bottom where the stop sheet opens — and its button is a plain reload, because there is nothing to save that the server does not already have.'
			},

			{ type: 'h3', id: 'errors', text: 'Two error pages, one view' },
			code(`${UI}/ErrorView.svelte`, 1, 40),
			code('src/routes/+error.svelte', 1, 23),
			{
				type: 'p',
				text: 'A URL that matches no route lands on the root `+error.svelte`, inside the root layout, which has no header — so the root error page brings a small one of its own. An error on a site page renders `(site)/+error.svelte`, inside the site layout, with the full header. Both render `ErrorView`, so the words live once: the status large in the display face and the secondary grey, over a faint compass rose turned 45° so its points fall between the digits — decoration, so `aria-hidden`, while the heading carries the meaning — a sentence, two ways out (back to your trips, or explore), and the reference id from `handleError` when there is one.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the root layout has no `load`, and what would go wrong if it did.',
					'You can explain what `onNavigate` and `beforeNavigate` each do here.',
					'You know why there are two `+error.svelte` files and what each one adds.'
				]
			}
		]
	},

	{
		slug: 'the-trip-page',
		title: 'The trip page: one await, one state object, one stream',
		summary:
			'The page awaits `tripBySlug` in markup with no boundary; `TripView` starts the live query and reads props once with `untrack`; `TripState` derives everything from whichever snapshot is newer; two presence effects that must not loop; tabs from the URL.',
		goal: 'Build a page whose first paint comes from one query and whose every later paint comes from a live stream, with local interaction state kept apart from server state.',
		blocks: [
			{
				type: 'p',
				text: 'This is the page everything else hangs off, and it is short because the work is elsewhere. The page awaits one remote query; the view starts the live one; the state object derives every value the tabs read; and the tabs are components that take the state object as a prop.'
			},
			code('src/routes/(site)/t/[slug=slug]/+page.svelte', 1, 36),
			{
				type: 'p',
				text: 'One `await`, in the markup, with no boundary. The comment says why twice over: a `pending` snippet is what the server would render *instead of* the trip, so the first paint would be a placeholder and a second request; and the failure that matters is a 404, which belongs to `+error.svelte` with the right status and language — where an uncaught error from a remote function goes. The `await` sits inside `$derived` in a declaration tag, so `initial` follows the slug and the query; a bare `{const}` is worked out once, and would go on holding the first trip it was given. `{#key slug}` makes a different trip a fresh `TripView`, which is what lets the view read its props once.'
			},
			{
				type: 'why',
				title: 'Why `params` from the props, and not `page.params`',
				text: 'A page receives its route’s parameters as a prop, `params`, and `PageProps` from `./$types` is the type SvelteKit generates for exactly this route: `params.slug` is a `string`, already accepted by the matcher in `src/params.ts` (chapter {{environment-and-hooks}}), because a URL whose slug did not match never reached this file. `page.params` from `$app/state` holds the same value as global state, typed for every route in the app at once — so on that type `slug` may be missing, and the first version wrote `page.params.slug ?? \'\'`, a fallback that could never run and that would have sent an empty string to a query whose schema refuses it. The prop is also what makes the page an ordinary component: what it depends on is in its signature. SvelteKit’s documentation shows the same pair for the same reason — `let { params } = $props()` beside a remote query called with `params.slug`.'
			},

			{ type: 'h3', id: 'state', text: 'The state object' },
			code(`${TRIP}/state.svelte.ts`, 1, 29),
			code(`${TRIP}/state.svelte.ts`, 36, 70),
			{
				type: 'p',
				text: 'Two kinds of thing, kept apart. What the server says — the document — is derived from whichever is newer: the live query’s latest snapshot, or the first paint’s document until the stream delivers. What this person is doing — the selected stop — is local `$state` that is never sent anywhere. (The open tab is not here at all: it lives in the URL, and the view below derives it from there.) Everything else is `$derived` from the two, so a change on the server or a click on the screen re-derives exactly the parts that depend on it. The `$derived.by` closures are there because the private fields are assigned in the constructor, after field initialisers run; the comment explains the TypeScript reason.'
			},
			{
				type: 'why',
				title: 'Why a class and not a store, or a context',
				text: 'A class with `$state` and `$derived` fields is the Svelte 5 shape for “an object several components read from”. It is typed, it has methods, it can be constructed with arguments, and every field is fine-grained — a component that reads `view.total` re-renders when the total changes and not when the presence list does. A store would make every consumer subscribe to everything; a context would hide the dependency. Passing `view` as a prop is explicit, and `Itinerary`, `Expenses`, `Notes` and `Companions` all take exactly that.'
			},

			{ type: 'h3', id: 'the-view', text: 'The view' },
			code(`${TRIP}/TripView.svelte`, 41, 73),
			{
				type: 'p',
				text: '`watchTrip(slug)` is the live query; `.current` is the latest snapshot and `.connected` says whether the stream is up. It is created inside `untrack`, and so is the state object, because the props are read once on purpose — the page keys this component on the slug — and `untrack` both says so and quiets the compiler’s fair question. The tab comes from the URL: `?tab=map` is a link, so it works with the back button, can be shared, and needs no state. What the URL says is a `string | null`, and `isTab` from `state.svelte.ts` is a type guard — `value is Tab` — so the value that passes it is a `Tab` to TypeScript with no cast, and anything else falls back to the itinerary.'
			},
			code(`${TRIP}/TripView.svelte`, 257, 298),
			{
				type: 'p',
				text: 'Read the comment above the effects slowly; it records two bugs the end-to-end suite found, and both are general. First, an effect that read `view.trip` re-ran every time the live query yielded — because `view.trip` is a new object each time — and its cleanup said goodbye, which woke the room, which yielded, which re-ran the effect: a loop through the server. The id is a string that never changes, so it is read once. Second, a remote command keeps a little reactive state of its own and reads it as it starts; called inside an effect, that read becomes a dependency and the write that follows re-runs the effect synchronously until Svelte stops it with `effect_update_depth_exceeded`. `untrack` around the call says: run this, depend on nothing it touches.'
			},
			{
				type: 'warn',
				text: 'The general rule: an `$effect` should read the reactive values it *reacts to* and nothing else. Anything it merely *uses* — a remote function, a library call that keeps state, a derived object you only need one field of — goes inside `untrack`, or is read once outside the effect. The Svelte MCP autofixer flags every function call inside an effect for exactly this reason; most are fine, and the ones that are not are loops.'
			},
			code('src/lib/remote/fire-and-forget.ts', 1, 22),
			{
				type: 'p',
				text: 'The heartbeat and the goodbye are sent and not awaited, and the first version wrote `.catch(() => {})` after each — reasonable for a heartbeat, whose next attempt is fifteen seconds away, and exactly how a real bug hid for an afternoon: when the seeded ids turned out not to be UUIDs (chapter {{the-database}}), every heartbeat that named a seeded stop failed validation on the server and nobody heard. `fireAndForget()` keeps the production behaviour — nothing a person could act on — and adds a console warning in development, where somebody is looking. Silence is a decision; it should be one you can see in the code.'
			},
			code(`${TRIP}/TripView.svelte`, 93, 127),
			code(`${TRIP}/TripView.svelte`, 327, 399),
			{
				type: 'p',
				text: 'The header shows the live status, in four states rather than two: a pulsing chip while the stream is up, a quiet “Connecting…” for the first three seconds while it is not up *yet*, and only after that the coral “Reconnect” button — `live.reconnect()` is the method SvelteKit gives every live query. The first version had two states, and showed “Reconnect” the moment the page hydrated, before the stream had had a chance: everybody on a slow network was told something had failed when nothing had. The fourth state comes first in the derivation: when the device itself has no network, the chip says “Offline” in the same quiet grey and offers nothing, because a button that cannot work is a button that lies — chapter {{the-offline-itinerary}} is where a page with no network comes from, and why the stream needs asking back. All four share one slot as wide as the widest label, so the palette and settings beside it never move. The width comes from an invisible sizer in the same grid cell whose labels are generated text — `content: attr(data-label)` — so they are in nobody’s way: not in the accessibility tree, not in the page’s text, not a second “Live” for a test to find. The slot is that wide and the chip is not: a grid item stretches to its cell by default, and “Live” sat in a pill two and a half times its width, crowded to one side. `justify-self` puts the chip at the slot’s leading edge on a phone, where the tools read from the left, and at its trailing edge beside the name, where they are set against the right — so the edge beside the settings button is the one that stays put when the label changes.'
			},
			{
				type: 'p',
				text: 'On a phone the trip’s name has the full width and the status tools are a row of their own under the lede; from 40em they move up beside the name. Sharing the name’s row at every width, as the first version did, left a real trip name 177px of a 328px column, and “A long weekend in the Douro valley with the cousins” ran to five ragged lines of display type. On a phone the palette button is a magnifier and the settings link an icon, its word still its name, visually hidden.'
			},
			code(`${TRIP}/TripView.svelte`, 401, 437),
			{
				type: 'p',
				text: 'The strip itself. The tabs are links to the same route with a different `?tab=` — `href()` with a route id that carries its search string — marked `data-sveltekit-reset="false"` so the scroll position and the focus survive the navigation; SvelteKit 3 folded the old `noscroll` and `keepfocus` attributes into that one `reset`, and only warns about the old names in development, it no longer reads them. The strip is sticky under the header, so the tabs stay in reach down a long itinerary, and it scrolls sideways on a phone, where six tabs do not fit. The frame around it carries the paper and two edge fades, `::before` and `::after` gradients from `--paper` to transparent, each shown only while there is more strip that way. The first version faded the strip with a `mask-image`, which faded whatever was *behind* the strip too — the page scrolling under a sticky element — and faded the current tab whenever it sat at an edge.'
			},
			code(`${TRIP}/TripView.svelte`, 144, 219),
			{
				type: 'p',
				text: 'One bar slides under the current tab instead of each link drawing its own border, and its position is a `Tween` from `svelte/motion`: a value that, when `set`, moves to the new one over a duration, with `.current` read by the markup on every frame. The effect reads `tab` and so re-runs on every switch; the first `set` passes `{ duration: 0 }` so the bar starts under the tab rather than sliding in from the edge, and reduced motion — read with `untrack`, because the effect should not re-run when the setting changes — makes every move instant. The second effect is a `ResizeObserver` on the strip and on every link: a rotation, a resize or a late font changes a tab’s width, and the bar is measured again — moved, not animated, because nothing was chosen. The current tab is also scrolled into view by hand, to a position that leaves 32px clear on either side, because `scrollIntoView({ inline: \'nearest\' })` stops exactly at the strip’s edge, which is where the fade is: “Notes” was left with its last letter and its bar faded out. And there is no scroll snapping — proximity snapping took a tab scrolled into view by hand and re-aligned it to the edge, under the fade again. The bar sits inside the strip — `overflow-y: hidden`, the hairline under the tabs an inset shadow — because a scroll container clips at its padding box: a bar placed on the border was cut to 1px and let the strip scroll a pixel up and down.'
			},
			code(`${TRIP}/TripView.svelte`, 221, 255),
			{
				type: 'p',
				text: 'The map and the globe fill what is left of the screen below the tabs, so their bottom edge — the map’s status pill, the globe’s “Fly the route” — is on screen without a scroll, at 1440×900 and on a phone alike. A fixed `72dvh` did not manage that, because how much is left depends on the header, and the header depends on the trip’s name, the width and the language. So the effect measures the panel’s top in page coordinates whenever the header changes size, writes it to `--frame-top`, and the CSS does the rest: `clamp(20rem, calc(100dvh - var(--frame-top, var(--frame-guess)) - var(--space-4)), 46rem)`. Until the script has measured — on the server, and in the first frame — the top is `--frame-guess`, a guess for the width: 21rem on a phone, where the status tools are a row of their own, 18rem beside them from 40em. A guess that matches the measurement is a frame that does not change height under a map that has already started, which the map in chapter {{the-map}} had to be taught to survive.'
			},
			code(`${TRIP}/TripView.svelte`, 439, 479, { partial: true }),
			code(`${TRIP}/TripView.svelte`, 306, 312),
			{
				type: 'p',
				text: 'The panel has a `view-transition-name` of its own, so a tab switch cross-fades the panel while the header and the strip hold still. The itinerary tab is a split view from 64em, with the map sticky beside the days, and the list alone below that — the Map tab is one tap away. The map is not hidden with CSS on a phone but not rendered at all: `wide` is a `MediaQuery`, and a hidden MapLibre would still be a WebGL context, two of them for one trip on the device least able to afford it. Both components take the same `view` and the same callbacks, and selecting a stop in one highlights it in the other because the selection lives in `view`.'
			},
			code(`${TRIP}/TripView.svelte`, 530, 538),
			{
				type: 'checkpoint',
				items: [
					'You can say why the trip page has no `pending` snippet and where a 404 goes.',
					'You can say why the slug comes from `params` through `PageProps` rather than from `page.params`.',
					'You can explain what `TripState.document` is derived from and what that means for caching.',
					'You can state the effect rule and identify both loops the presence effects avoid.'
				]
			}
		]
	},

	{
		slug: 'the-itinerary',
		title: 'The itinerary: days you can drag',
		summary:
			'One `dndzone` per day with svelte-dnd-action, `animate:flip` for the settling, an optimistic override that is derived rather than synced, `place()` from the domain on both sides, a stop card, a dialog with assignable deriveds, and a combobox over the gazetteer.',
		goal: 'Wire a drag-and-drop library into a live document so the screen shows the drop immediately and agrees with the server when it answers — and build the dialog and search that add stops.',
		blocks: [
			{
				type: 'p',
				text: 'svelte-dnd-action makes a list a drop zone, with the items and a shared `type` so cards can move between lists. It handles pointer, touch and keyboard — focus a card, press space, arrow — and tells you two things: `consider` (how the list would look if you dropped here) and `finalize` (you dropped here). Everything else is ours, and the interesting part is what happens between the drop and the server’s answer.'
			},
			{
				type: 'p',
				text: 'The library ships an *action*, the shape element behaviour took before attachments arrived in Svelte 5.29: a function applied with `use:dndzone={options}`, handed the element once and given an `update` method for new options. This project applies it as an attachment instead, `{@attach fromAction(dndzone, () => options)}` — `fromAction` from `svelte/attachments` turns any action into one — so the zone is attached the same way as everything else in the project, and the difference is worth one sentence: the second argument is a *function* returning the options. The attachment calls it inside an effect of its own, so when `group.stops` or `editable` changes, the library’s `update` runs with the new options, exactly as the action’s would have, and the zone is never torn down. The action used to carry the types of its two events onto the element it was used on; applied through an attachment nothing does, so `src/app.d.ts` declares `onconsider` and `onfinalize` for every element — the augmentation Svelte’s TypeScript guide gives for events that come from an action.'
			},
			code(`${TRIP}/Itinerary.svelte`, 20, 94, { partial: true }),
			{
				type: 'p',
				text: 'The override. The server is the source of truth and the live query will send the new order a few hundred milliseconds after the drop; in between, the screen should show what the drag said. So `override` is a copy of the groups with a version stamp, and `groups` is derived: use the override while the server’s version has not moved past the one we dropped on, and the live groups otherwise. Derived, not synced — there is no effect that copies one into the other and could get out of step. The prop is named `view` and not `state` for the reason in the comment: a local called `state` makes `$state` read as a store subscription.'
			},
			code(`${TRIP}/Itinerary.svelte`, 96, 108),
			code(`${TRIP}/Itinerary.svelte`, 149, 177),
			{
				type: 'p',
				text: 'Both the zone that lost the card and the zone that gained it fire `finalize`; only the one that received it — `TRIGGERS.DROPPED_INTO_ZONE` — sends the move. The move is a day and an index, which is what `moveStop` takes and what `place()` in the domain turns into row changes; the server writes them, the live query yields, and the derived `groups` switches back to the server’s order, which is the same order. If the command fails, the override is dropped and the cards animate back to where the server says they are.'
			},
			code(`${TRIP}/Itinerary.svelte`, 198, 277),
			{
				type: 'p',
				text: '`animate:flip` on each `<li>` is what makes the other cards slide out of the way rather than jump; `flipDurationMs` on the zone tells svelte-dnd-action to expect it, and both read the same `duration`, which is 0 when the app’s `reducedMotion` query says so — the one piece of motion in the itinerary that CSS tokens cannot reach. `dropTargetStyle: {}` turns off the library’s inline outline in favour of `dropTargetClasses`, a class from the tokens, and `transformDraggedElement` lifts the library’s clone of the dragged card — a heavier shadow, a degree of tilt. The empty-day item is inside the list so a day with nothing on it is still a drop target, and its sentence tells an editor that it is one. Each day is a rail and a column: the day of the month in the display face, with a hairline running down to the next day. On a phone the heading is the short date — “Sun, May 10” — because the rail beside it already says the day and the weekday, and the long one wrapped onto two lines beside “Add a stop”; both are rendered and a media query shows one, so the server’s HTML is right at every width without a script measuring anything. The title takes the free space (`flex: 1 1 0`, `min-width: 0`) and the button none (`flex: none`), so a long German date wraps instead of squeezing the button’s icon. And above the days sits a visually hidden `<h2>`: the page’s `<h1>` is the trip, each day is an `<h3>`, and an outline that jumps from one to three is a document a screen reader’s heading list cannot make sense of.'
			},
			code(`${TRIP}/Itinerary.svelte`, 110, 147),
			{
				type: 'p',
				text: 'A stop that has just arrived lights up once. svelte-dnd-action does not play well with `in:` transitions on its items, so instead the effect compares the ids with the last render’s and puts a new one in `fresh` for 1.2 seconds; the card turns `data-fresh` into a background that fades back over 700ms. `fresh` is a `SvelteSet` because it is mutated over time and read by the template; the snapshot it is compared against is a plain `Set`, because nothing reads it reactively. The first render marks nothing — forty stops do not all light up on load.'
			},

			{ type: 'h3', id: 'card', text: 'The card' },
			code(`${TRIP}/StopCard.svelte`, 1, 42),
			code(`${TRIP}/StopCard.svelte`, 44, 103),
			{
				type: 'p',
				text: 'The name is a button with `aria-pressed`, because selecting a stop is a toggle that highlights it on the map — and it is a button’s size: 36px drawn, so the number and the grip centre on it, and 44px to hit, through a pseudo-element that reaches into the card’s padding where there is nothing else to press. The number is the route position from `view.scheduled`, so the list agrees with the map’s pins. `lookers` are the companions whose pointer is on this stop, as chips — presence at the granularity of a card. `data-kind` sets the `--kind` custom property from `tokens.css` for the coloured border and the number badge, whose digits are `--on-fill` — the ink that reads on every kind colour in both themes — so the six kinds of stop share one hue table with the map. On a screen with a mouse the edit and remove buttons fade in on hover or focus; on a touch screen there is no hover, so they are always there. They are hidden by opacity, not `display`, so a keyboard can still reach them.'
			},
			code(`${TRIP}/StopCard.svelte`, 113, 148),
			{
				type: 'p',
				text: 'The card is a grid with named areas, and the areas change at 40em rather than the markup. On a phone the name has the whole first row and the two actions sit at the end of the second, beside the kind chip; with the buttons on the name’s row, a 360px screen left the name 108px, and the most important words on the screen broke over two lines beside two grey icons. Writing the layout as `grid-template-areas` makes that decision readable at a glance — the strings *are* the picture — and moving an area is one line in one media query, with no element reordered in the DOM, so the tab order and the reading order stay the same at every width.'
			},

			{ type: 'h3', id: 'dialog', text: 'The dialog: assignable deriveds' },
			code(`${TRIP}/StopDialog.svelte`, 24, 96),
			{
				type: 'p',
				text: 'One dialog for adding and editing, told apart by `mode`, and the fields are **assignable `$derived`s**. Each starts from the stop being edited (or from the day and point the add came from) and is then bound and edited like state; when `mode` changes — a different stop, or the dialog reopens — every field resets to the new starting value. That is exactly the semantics a form in a dialog wants, and before assignable deriveds it took an effect that copied props into state and a bug when it ran at the wrong time.'
			},
			code(`${TRIP}/StopDialog.svelte`, 98, 118),
			{
				type: 'p',
				text: 'The gazetteer is asked for here, by the dialog, when the trip page mounts — long before anybody opens it. `places()` is the `prerender` remote function from chapter {{remote-functions-the-reads}}, and the resource it returns has a `.current` that is `undefined` until the file arrives and the hundred places after, without suspending anything. The first version awaited it inside the search, and an `await` in a component with no boundary of its own holds back the update that mounts it: the dialog opened with no search field and the wrong day selected, then rebuilt itself mid-animation when the file landed. Now the first frame of the dialog is its finished layout, and the search shows “Loading places…” in the rare case it is opened faster than a small static file can be fetched. In the browser only: a closed dialog has nothing to render on the server, and the guard keeps the fetch off it.'
			},
			{
				type: 'why',
				title: 'Why not `await` with a `pending` snippet',
				text: 'A `<svelte:boundary>` with a `pending` snippet would have kept the rest of the dialog from waiting, and drawn a placeholder where the search goes — a layout that changes when the file arrives, inside a panel that is animating in. Starting the request early and reading `.current` turns a waterfall (open, then fetch, then render) into a head start, and asks nothing of the layout. `await` in markup is the right tool when the data *is* the page; here it is a nicety the person may not even use.'
			},
			code(`${TRIP}/StopDialog.svelte`, 126, 210),
			{
				type: 'p',
				text: 'Bits UI’s `Dialog` supplies the focus trap, the Escape key, the scroll lock and the ARIA; the form inside is plain HTML. Saving calls `addStop` or `updateStop` — commands, because a dialog only exists once JavaScript is running — and a date change on an existing stop goes through `moveStop`, the same function a drag uses, so “move to Thursday” means one thing in the whole application. The coordinates are `number | null`: a stop added with no place picked and no click on the map has no pin, and `null` says so. The first version started them at `0, 0`, which is a real point — in the Gulf of Guinea — and one save of it turned a 1,263km route into a 10,000km one.'
			},
			{
				type: 'p',
				text: 'Before anything is sent, `check()` runs the schema the server will run — `StopInputSchema` or `StopPatchSchema`, the same import — with `v.safeParse`, and `v.flatten` turns its issues into one message per field. A name of three spaces passes the input’s `required` and fails the schema’s trim; it used to reach the server and come back as a toast of raw JSON, and now it is a line under the field, the field is `aria-invalid` and `aria-describedby` points at the line, and nothing is sent. `issues` is an assignable `$derived` like the fields, so it resets whenever the dialog opens for something else. The toast for the errors that *do* come back reads `errorMessage(error)`, which the next block is.'
			},
			code('src/lib/ui/errors.ts', 1, 45),
			{
				type: 'p',
				text: 'A failed `command` throws SvelteKit’s `HttpError` in the browser, and an `HttpError` is not an `Error` — so the `error instanceof Error ? error.message : String(error)` every component used to write fell through to `String()`, and the toast read `{"status":400,"message":"…"}`. `isHttpError()` from `@sveltejs/kit` is the test that knows the difference, and `body.message` is a sentence the server wrote in the request’s language (chapter {{three-languages-with-paraglide}} says how). Anything else — the network went away, a bug — gets the product’s one sentence for “that did not work”, rather than the browser’s English for a failed fetch. Every toast in the trip page goes through this one function, so the rule is in one place. A boundary is the other half of the rule, as the comment’s last paragraph says: its `failed` snippet is handed an `App.Error`, which is not an `HttpError` either, so this function would answer its fallback every time. `boundaryMessage`, beside it, is the boundary’s half: it reads a `message` if there is a string one, and falls back to the same sentence if there is not. The end-to-end suite holds the toast to the rule: Ben saves a stop that Ana has just removed, and the toast must say the server’s sentence, “That stop is no longer on the trip.”, whole — not a fragment of it inside a dump of JSON (chapter {{end-to-end}}).'
			},
			{
				type: 'why',
				title: 'Why a guard, and not `failed(error: App.Error)`',
				text: 'SvelteKit’s documentation writes the snippet as `{#snippet failed(error: App.Error)}`, and inside SvelteKit an `App.Error` is what arrives. The annotation does not type-check: Svelte types the snippet as `Snippet<[error: unknown, reset: () => void]>`, because a boundary is a Svelte feature, and outside SvelteKit — the custom element in chapter {{embedding-a-trip}} — it is handed whatever was thrown. A parameter that claims more than `unknown` is refused. The way round that the type system offers is a cast, `(error as App.Error).message`, and a cast is a claim nobody checks: the day `handleError` returns something else, it compiles and prints `undefined`. A guard checks — four comparisons, and the snippet relies on exactly what it was handed, a string `message` or nothing. The trips list, the diagnostics page, the globe and its loader all call it.'
			},
			code(`${TRIP}/StopDialog.svelte`, 212, 379),
			{
				type: 'p',
				text: 'The kind is a segmented control — six radios in a `fieldset`, drawn as a pill track three to a row — six across would squeeze “Transport” and “Hospedagem” out of a 32rem panel — whose chosen segment takes the kind’s colour — and the coordinates sit in a `<details>` that folds away once a place is picked, because then the pin is already right, and is open while adding: a click on the map gives a pin to nudge, and an add with neither has no pin at all — the summary says “Not set”, the two inputs are `required` so the browser will not submit, and the summary refuses to fold, because a required field folded out of sight is a form that will not submit and will not say why. The inputs listen for the browser’s own `invalid` event as well, which unfolds the row and puts the issue under it, and their `step` is `any`: a click on the map or a dragged pin gives a coordinate to many more places than four, and `step="0.0001"` made the browser refuse a perfectly good point as a “step mismatch”. From 40em the dialog opens with focus in the place search, labelled “Place” like every other field (`onOpenAutoFocus`); on a phone focus stays on the close button, so no keyboard rises over the sheet. The day select writes each day as the itinerary’s headings do — “Sunday, May 10”. The close button is labelled “Close” and the second action “Cancel”: an icon button announced as “Menu”, and a cancel that said “Undo”, were both things a review of the screens caught, and neither shows in a screenshot.'
			},
			code('src/lib/styles/base.css', 556, 594),
			{
				type: 'p',
				text: 'The shell lives in `base.css` because it is the product’s dialog pattern, not because two dialogs share it today: the stop dialog is the one that wears it. The command palette shares only the scrim — it is a search box you type into, a panel near the top of the screen at every width, not a sheet — and its own comment says so. On a phone the shell is a bottom sheet with a grabber, sliding up on the `--ease-sheet` curve; from 40em it is a centred panel that rises 8px and scales from 96%. There is no JavaScript in any of it: Bits UI sets `data-state="open"` while the dialog is up and `closed` as it leaves, waiting for the exit animation, so the motion is two keyframe rules per state — and under reduced motion every `--dur-*` is zero and the dialog simply appears.'
			},

			{ type: 'h3', id: 'search', text: 'A combobox over the gazetteer' },
			code(`${TRIP}/PlaceSearch.svelte`, 1, 56),
			{
				type: 'p',
				text: 'Bits UI’s `Combobox` is the accessible half — `role="combobox"`, a listbox, arrow keys, Escape, type-ahead, `aria-activedescendant`. The other half is ours: the places arrive as a prop, already loaded or still empty, and `matches` filters a hundred names on every keystroke without a server. The component used to fetch them itself, with `$derived(await places())`; the dialog above says why that moved out. `query` is read from the input’s own event because the root’s `inputValue` is a prop to set, not one to bind — the kind of detail a headless library’s docs say once.'
			},
			code(`${TRIP}/PlaceSearch.svelte`, 58, 87),
			{
				type: 'checkpoint',
				items: [
					'You can explain the override, why it is derived, and what the version stamp compares against.',
					'You can say which `finalize` sends the move and why the other one must not.',
					'You can describe assignable deriveds in the dialog and what they replaced.',
					'You can say why the gazetteer is fetched by the dialog and read through `.current`, rather than awaited by the search.'
				]
			}
		]
	},

	{
		slug: 'the-command-palette',
		title: 'The command palette',
		summary:
			'Ctrl+K: a `Dialog` around a `Command` from Bits UI, every stop and every action as an item with a value to match and an `onSelect` to run, and `goto` with `replace` so a tab switch does not fill the history.',
		goal: 'Add a keyboard-first way to reach anything on a page with two headless primitives and no filtering code of your own.',
		blocks: [
			{
				type: 'p',
				text: 'A command palette is a text input, a filtered list, and roving focus with Enter to run. Bits UI’s `Command` does the filtering, the scoring and the focus; a `Dialog` around it does the overlay and the focus trap. What is in the palette is this trip’s stops and a handful of actions.'
			},
			code(`${TRIP}/CommandPalette.svelte`, 1, 88),
			{
				type: 'p',
				text: '`<svelte:window onkeydown>` is how a component listens on the window without an `addEventListener` it has to remember to remove. The button that opens the palette shows a magnifier, which means “search” to everybody, rather than the ⌘ glyph, which means something only on a Mac; its shortcut hint is filled in on mount from the platform — ⌘K on a Mac or an iPad, Ctrl K elsewhere — because only the browser knows which keyboard it has. The button’s name is its label — “Search and commands”, visually hidden on a phone — and not an `aria-label`: with one, the name said “Search and commands” while the button read “Search and commands Ctrl K”, and WCAG’s “label in name” asks that what a control is called contains what it shows, so speech input can find it. The shortcut goes to assistive technology in its own vocabulary, `aria-keyshortcuts="Control+K Meta+K"`. `goto(href(`/(site)/t/[slug=slug]?tab=${tab}`, { slug }), { replace: true })` switches the tab through the URL — the same typed `href()` the tabs themselves use, so the palette and the tab bar cannot disagree about where a tab lives — and `replace` keeps five palette jumps from becoming five history entries. SvelteKit 3 also rejects a `goto` to anything that is not a route of the app, which a resolved pathname never is. The `GotoOptions` in 3.0 are `replace`, `shallow`, `reset`, `refreshAll`, `invalidate`, `state` and `persistState`; `replaceState` and `invalidateAll` survive only as deprecated aliases of `replace` and `refreshAll`, and the old `noScroll` and `keepFocus` are gone — folded into `reset: false`.'
			},
			code(`${TRIP}/CommandPalette.svelte`, 90, 130),
			code(`${TRIP}/CommandPalette.svelte`, 132, 202),
			{
				type: 'p',
				text: 'Each `Command.Item` is a `value` to match against — the stop’s name plus its id, so two stops with the same name stay distinct — and `keywords` that also match, so typing “food” finds the restaurant. `onSelect` runs the action. The date beside a stop is formatted in the page’s language — “May 10”, “10. Mai” — while the ISO date stays among the keywords, so typing “2026-05” still finds it. Dated stops come first, in day order, and the ideas — no date yet — under their own heading, both rendered by one top-level snippet; a snippet declared inside a component’s tags would be passed to that component as a prop. The footer says in words what each key does. The groups have headings; the empty state is a component. The `class` props are ours from the tokens, which is what headless means in practice: every visible pixel is in the `<style>` block below, and the library brought the behaviour.'
			},
			{
				type: 'note',
				text: 'The end-to-end test for this presses `ControlOrMeta+k` — Playwright’s name for “Control on Linux and Windows, Command on a Mac” — types three letters, and clicks an option. It runs on the phone profile too, where there is no keyboard shortcut in real life, and passes, which says something about how well the primitive degrades.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `Command` does and what the component adds to it.',
					'You know why the tab switch is `goto` with `replace` over a typed `href()`, and which `GotoOptions` exist in SvelteKit 3.'
				]
			}
		]
	},

	{
		slug: 'the-map',
		title: 'The map with no tile server',
		summary:
			'svelte-maplibre over MapLibre GL: a style built from the prerendered world, a worker URL set once in a module script, great-circle legs as a GeoJSON line layer, draggable markers, a theme-following style patched with `diffStyleUpdates`, and geolocation through `createSubscriber`.',
		goal: 'Put an interactive vector map in a SvelteKit app that works offline, in CI and under a strict CSP, and wire its state in and out of Svelte.',
		blocks: [
			{
				type: 'p',
				text: 'The map is where most trip planners send you to a tile provider, an API key and a `connect-src` that names somebody else’s domain. This one draws every country from a bundled atlas and needs none of that. What it costs is streets, and at the scale a trip is planned — a country, a coastline, a city as a dot — that is the right trade for a project that has to work on a train and in CI.'
			},
			code('src/lib/map/style.ts', 1, 82),
			{
				type: 'p',
				text: 'A MapLibre style is JSON: sources and layers. One GeoJSON source, the prerendered `/api/world.json` from chapter {{remote-functions-the-reads}}, and three layers — sea, land, borders. No sprite, no glyphs, because no layer draws text. The colours are literals rather than tokens, and the comment says why: MapLibre paints a canvas and does not read the cascade, so `mapPalette()` holds the five colours each scheme needs — the route is `--sea` copied by hand, one of the four hand copies the header of `tokens.css` lists, each where a custom property cannot reach — `worldStyle()` builds the style from them, and the component reads the same palette for the route and rebuilds the style when the theme flips. The comment also says exactly what to change to put OpenFreeMap tiles under it — one source and one CSP line.'
			},

			{ type: 'h3', id: 'the-component', text: 'The component' },
			code('src/lib/map/MapView.svelte', 1, 13),
			{
				type: 'p',
				text: 'MapLibre parses geometry in a Web Worker, and Vite has to be told to emit that worker as a file — `?worker&url` does — and MapLibre has to be handed the URL once, before the first map. A `<script module>` runs once per module, not once per instance, which is exactly the place. The CSP’s `worker-src "self" blob:` in chapter {{the-config}} is for this file.'
			},
			code('src/lib/map/MapView.svelte', 15, 130, { partial: true }),
			{
				type: 'p',
				text: 'The route is one great-circle line per leg — `arc()` from the library, forty-eight segments, unwrapped across the date line — as a GeoJSON `FeatureCollection` the `LineLayer` draws. `fit` is the padded bounds from the same library. `diffStyleUpdates` makes MapLibre patch three paint properties when the theme flips rather than tear the map down. `bind:map` hands the underlying `Map` instance back for the imperative calls, the first of them `fitBounds` on a button — which fits the route into the part of the canvas that is on screen: the side-by-side map is as tall as the viewport under the sticky tabs, so at the top of the page its bottom is below the fold, and the hidden strip is counted as padding.'
			},
			code('src/lib/map/MapView.svelte', 132, 210),
			{
				type: 'p',
				text: 'The route is framed once, as a cut, when the map has loaded and there is a route to frame — and after that the camera belongs to the person. It moves for “Fit the route”, for a bubble pressed and for a stop chosen, and for nothing else. The effect that frames it is written so that it can only ever do so once: `framed` is a plain `let`, and once it is true the effect returns before it has read anything reactive, so it has no dependencies left and never runs again.'
			},
			{
				type: 'why',
				title: 'Why not `bounds={fit}` on `<MapLibre>`',
				text: 'Because svelte-maplibre re-fits the map whenever `bounds` changes, and `fit` is derived from the stops — which the live query hands over as a new array every time anybody’s heartbeat wakes the room. Choosing a stop sends a heartbeat. So the flight to the chosen stop took off, the next snapshot arrived a few frames later, and the whole route was fitted again underneath it: on the desktop’s side map, choosing Sagrada Família left the camera on the overview with its pin about 155px from the middle. A prop that is “the bounds to show” is right for a map whose view is a pure function of its data; this one is not, because a person moves it.'
			},
			{
				type: 'p',
				text: 'The second effect is a repair for something MapLibre does not do reliably. It watches its own container and redraws the canvas when the container changes size — but on a phone the frame’s height is measured from the trip’s header after the map has started, and in five loads out of six the canvas was redrawn for the new height while every pin stayed where the old height had put them: 25px below the route, until something moved the camera. So the frame is watched here too, and a change of size asks for `resize()` again — at once if the camera is still, or on the `moveend` of the move in progress. At rest, `resize()` redraws and re-places every marker, which is all the cure needs to know about the cause. The first report a `ResizeObserver` makes is the size it started at, not a change, and is let go. `TripView` also guesses the header’s height per width now, so in the usual case there is no change of size to repair.'
			},
			code('src/lib/map/MapView.svelte', 212, 335),
			{
				type: 'p',
				text: 'Five Lisbon stops at the zoom that fits Lisbon to Barcelona are one blob of pins with only the top number readable. So markers that would share a press are drawn as one bubble that says which numbers it holds — “1–5” for a run of the route, “3, 5” or “1–5, 12” when a city is visited at two points of it — and pressing it fits the camera to them. “Would share a press” is the same 44px the phone’s target check presses with: two press areas that touch are two targets a finger cannot tell apart, however they are drawn. A press area is 44px square, or as wide as the marker when the marker is wider, and a bubble’s width is guessed from its label, generously, because the grouping has to be decided before there is anything drawn to measure.'
			},
			{
				type: 'p',
				text: 'The trick that makes it cheap is that the test needs no screen. A point’s Web Mercator coordinate, 0 to 1 across the world, times `512 × 2^zoom` is where MapLibre draws it in world pixels at that zoom, and two stops 44 of those apart are 44 screen pixels apart wherever the map is panned — so the grouping is a `$derived` of the stops, the zoom and the selection. `bind:zoom` is written by svelte-maplibre on `moveend`, so the groups are recomputed once per gesture, not on every frame of it. Any two markers that touch are merged, the merged bubble moves to the middle of what it holds, and the loop runs again until no two touch — because a bubble that has grown and moved may now touch a neighbour it did not.'
			},
			{
				type: 'p',
				text: 'Two exceptions keep it honest. The selected stop is never folded into a bubble — the one thing a person asked to see is always a pin — and above zoom 16 nothing is grouped, because two stops that close are on the same street and a bubble there would never come apart. The label lists numbers rather than counting them because a count lied: a bubble holding stops 3 and 5 said “2”, beside the pin that *is* stop 2; only past two runs of numbers does the count come back. The bubble is a button whose name is its label plus a visually hidden “2 stops here, zoom in”, in the page’s language; the stop names are only its `title`, and a single pin is named by its number. The bubble’s first draft spelled its stops out in that hidden text, which made a second button called “Alfama” beside the itinerary’s own, and every test that asked for “the Alfama button” found two.'
			},
			code('src/lib/map/MapView.svelte', 337, 401),
			{
				type: 'p',
				text: 'And a stop chosen is a stop shown. Selecting one — in the list, in the palette, on the map — flies the camera to it, which also takes it out of any bubble; under reduced motion it is a jump. How close is a judgement about this atlas, which has coastlines and borders and nothing under them. A fixed street-level zoom put Alfama in an empty beige field; a fixed country-level one still showed no coast at Lisbon and hid the hotel a kilometre away under the chosen pin. What tells a person where a stop is, at the scale of a city, is the trip’s other stops around it, so `closeEnough()` works out the zoom at which the chosen pin’s press area — a quarter larger while it is chosen — touches no other stop’s, from the same world-pixel arithmetic as the bubbles, and the camera goes there: never further out than zoom 9, never closer than 16, and never out from where the map already is.'
			},
			{
				type: 'p',
				text: '`flownTo` is a plain `let`, not `$state`, on purpose: it is what the effect writes down about where it went, and an effect that depended on its own note would run again for having written it. The zoom is read with `untrack` for the same reason — a flight changes the zoom, and the effect must not answer its own flight. `round()` keeps five decimal places, a metre, on every coordinate the map hands over: the map’s click and a dragged pin give fifteen, which nobody typed and no field shows.'
			},
			code('src/lib/map/MapView.svelte', 403, 424),
			{
				type: 'p',
				text: 'For an editor, a click on empty map starts a new stop there — and for a while a click on a pin or a bubble did too. Pressing a bubble asked for a zoom and got the “New stop” dialog over it. The marker’s own click handler calls `stopPropagation()`, and it comes too late: MapLibre listens for clicks on the element the markers live in, with `addEventListener`, and the marker’s handler is a Svelte `onclick`, which Svelte *delegates* — it attaches one listener at the root of the app and runs the handlers on the event’s path when the event arrives there. By then the click has already passed MapLibre on its way up. So the map’s own handler asks where the click began, and a click that began inside `.maplibregl-marker` is not a click on the map.'
			},
			{
				type: 'why',
				title: 'Why the map checks the target instead of the marker stopping the event',
				text: 'Because the marker’s handler is not ours — it is inside svelte-maplibre — and the fix that would work there, a native listener in the capture phase, is the kind of fight with the framework’s event model the Svelte documentation warns about: a `stopPropagation()` in a hand-added listener keeps the event from ever reaching the root, and every delegated handler above it silently stops working. Asking the event where it started is local, cannot break anybody else’s handler, and reads as what it means.'
			},
			code('src/lib/map/MapView.svelte', 427, 506),
			{
				type: 'p',
				text: 'svelte-maplibre’s components are thin and declarative: `<GeoJSON>` is a source, `<LineLayer>` a layer inside it, `<Marker>` a DOM element positioned by the map. The route is two layers over one source — a wide halo in the paper colour, then the dashed line on top — so the dashes read where they cross a border. `onload` sets `data-ready`, which the CSS turns into a fade-in, so the canvas never flashes an empty frame. Markers are `asButton` so they are focusable, draggable when the viewer may edit, and the pin inside is ours — numbered, coloured by kind through the same `--kind` property the card uses, and scaled when selected. The selected marker carries `zIndex={10}`: pins that share a city paint in list order, and a z-index on the pin inside cannot climb out of the marker’s own stacking context, so the ring around “1” used to show a “5”.'
			},
			code('src/lib/map/MapView.svelte', 648, 668),
			{
				type: 'p',
				text: 'A pin is drawn 26px across and pressed across 44px, and the difference is a pseudo-element. The arithmetic has one trap, the same one the icon buttons fell into: an absolutely placed box is measured from its parent’s *padding* edge, inside the border, so a reach of `(44 − 26) / 2 = 9px` from the outside of a pin with a 2px ring made a 40px target. A percentage inset is a share of the padding box — of its width for the sides, its height for the top and bottom — so `min(-2px, calc(50% - var(--control) / 2))` is right for both shapes at once: a round pin reaches out to 44px each way, and a bubble that is already wider than 44px reaches sideways only to its own ring, and does not grow into its neighbours. The phone’s target check in chapter {{end-to-end}} presses every marker at that distance.'
			},
			{ type: 'h3', id: 'geolocation', text: 'Where am I, as a reactive value' },
			code('src/lib/map/geolocation.svelte.ts', 1, 73),
			code('src/lib/map/MapView.svelte', 508, 548),
			{
				type: 'p',
				text: '`createSubscriber` from `svelte/reactivity` turns an external source of events into something a template can read like state. The function it is given runs when the value is first read inside an effect and its cleanup runs when nothing reads it any more — so the browser’s position watch starts the moment the template shows `geo.fix` and stops the moment it stops showing it. Nobody calls start; nobody forgets stop; the “Where am I” button toggles a boolean and the watch follows. That is the pattern for any subscription-shaped API — a `BroadcastChannel`, a `ResizeObserver`, a WebSocket — and chapter {{reactivity-utilities}} returns to it.'
			},
			{
				type: 'why',
				title: 'Why svelte-maplibre and not the MapLibre API through an attachment',
				text: 'Because a map has a lot of *declarative* state — sources, layers, markers with positions — and a wrapper that turns those into components lets the itinerary’s stops become markers with an `{#each}`. An attachment would be right for the map instance itself and wrong for thirty markers that come and go. The line is: use a wrapper when the library’s objects map onto a tree the template already has; use an attachment when the library wants one element and owns it. Tiptap, in chapter {{notes-with-tiptap-through-an-attachment}}, is the second case.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what the style contains, what it costs, and what one change would add tiles.',
					'You can explain why the worker URL is set in a module script and which CSP line it needs.',
					'You can describe `createSubscriber` and give one other API it would fit.',
					'You can say how the map decides that two pins overlap without asking where they are on screen, and why the result is a `$derived`.',
					'You can explain why a marker’s `stopPropagation()` did not keep its click from reaching the map, and what the map checks instead.'
				]
			}
		]
	},

	{
		slug: 'the-globe',
		title: 'The globe: Threlte, on demand',
		summary:
			'three.js through Threlte — `<T.Mesh>` is a mesh, children attach — with coastlines from the same atlas, arcs lifted off the surface, clickable markers, a `useTask` flyover that follows the library’s great-circle interpolation, a `MediaQuery` that holds it still, and a dynamic import so three.js reaches only the people who ask for it.',
		goal: 'Add a 3D scene to a SvelteKit page declaratively, animate it per frame without an effect loop, respect reduced motion, and load it lazily behind a boundary.',
		blocks: [
			{
				type: 'p',
				text: 'Threlte is Svelte for three.js. `<T.Mesh>` is a `THREE.Mesh`; its attributes are the object’s properties; a geometry and a material as children become that mesh’s geometry and material. The scene is markup, and the two things that are genuinely imperative — building vertex buffers and moving a camera per frame — are the only imperative code in the file.'
			},
			code(`${TRIP}/TripView.svelte`, 480, 519, { partial: true }),
			{
				type: 'p',
				text: 'Loading first, because it is the decision that matters most. three.js and Threlte are the largest dependency in the project and most visits never open the globe tab, so the import is dynamic, in markup, behind a boundary: `{const { default: Globe } = await import(...)}`. That declaration is bare on purpose — a module is the same module however often it is asked for, so there is nothing to follow — where the page’s `{const initial = $derived(await tripBySlug(slug))}` follows the slug. The `pending` snippet shows until the chunk arrives and the `failed` snippet if the network does not deliver it, with a `reset` that tries again. `failed` prints the `message` of what it is handed, through `boundaryMessage` (chapter {{the-itinerary}}), because that is an `App.Error` — the failure after `handleError` in `src/hooks.client.ts` has put it into words, in the page’s language (chapter {{environment-and-hooks}}) — and not the `Error` the import threw. The first version tested `error instanceof Error`, which an `App.Error` never is, so it showed its fallback whatever had happened. This is the one boundary whose failure never touches the server, so it is the one chapter {{end-to-end}} breaks on purpose: the test drops the chunk on its way to a German page and expects “Etwas ist schiefgelaufen” and a “Neu verbinden” button. `browser` guards the whole thing because a WebGL scene has no server-rendered form; the server renders the loading text and nothing else.'
			},
			code('src/lib/globe/Globe.svelte', 1, 53),
			code('src/lib/globe/Globe.svelte', 55, 109),
			{
				type: 'p',
				text: 'The frame around the scene. It loads the coastlines — the same prerendered file the map reads, so the two agree about where Portugal is — and holds the state the scene does not own: whether the camera is flying, and whether the first frame has been drawn (the canvas fades in on it). Reduced motion comes from `src/lib/motion/prefers.svelte.ts`, which hands on the framework’s own `prefersReducedMotion` from `svelte/motion` — one `MediaQuery` for the whole app — and it is live: change the operating system setting and the scene stops animating without a reload. The controls are outside the boundary, which is why the end-to-end test can see the button before the chunk has loaded. The hint under them is a second `MediaQuery`, `(pointer: coarse)`: with a mouse a scroll wheel zooms the globe, and on a touch screen a scroll moves the page and a pinch zooms, so the sentence says pinch where a pinch is what works.'
			},

			{ type: 'h3', id: 'the-scene', text: 'The scene' },
			code('src/lib/globe/Scene.svelte', 33, 94),
			code('src/lib/globe/Scene.svelte', 96, 119),
			{
				type: 'p',
				text: 'The colours first, because the first version got them wrong in an instructive way: it drew the arc in `--sun` and every stop in `--coral`, so the same route was teal on the Map tab and amber on the Globe tab next to it, and two *state* colours — warning and danger — were spent as decoration. Now the route is in the sea and each stop in its kind’s hue, exactly as on the map. They are the dark theme’s values whatever the page’s theme, because the globe is a night scene, and they are copied from `tokens.css` by hand, because a WebGL material cannot read a custom property — which is why `GlobeStop` grew a `kind`. A latitude and longitude become a point on the unit sphere, with 0°E facing the default camera. The coastlines become a `BufferGeometry` of line segments — every ring of every polygon, pairs of consecutive points — which is twenty thousand vertices and one draw call. `interactivity()` from `@threlte/extras` is what makes `onclick` on a mesh work: it raycasts from the pointer into the scene.'
			},
			code('src/lib/globe/Scene.svelte', 121, 164),
			{
				type: 'p',
				text: 'Each leg gets an arc from the library’s `arc()`, lifted off the surface by an amount that grows with the leg’s length so a long flight visibly arcs and a short hop hugs the ground. The geometries are built in `$derived`, so a change to the stops rebuilds exactly the arcs, and the `$effect` with a cleanup disposes the previous set — buffers are GPU memory, and a globe that leaks one per drag would not survive a planning session. The effect computes nothing a template reads; it only frees what lives outside Svelte, which is the job an effect is for. Each arc carries a name, the ids of the two stops it joins, and the `{#each}` in the markup keys on that name rather than on the arc’s position in the list: a stop is a row, so no two legs of one route join the same pair, and a key that identifies the leg keeps each line with its leg when a stop is inserted before it.'
			},
			code('src/lib/globe/Scene.svelte', 166, 269),
			{
				type: 'p',
				text: 'The flyover. `useTask` runs a function every frame with the time since the last one, and the function advances along the current leg by `delta / seconds`, puts the camera above `interpolate(a, b, progress)` — the library’s great-circle interpolation, so the camera follows the line it draws — and looks at the centre. The flight variables are plain `let`s, not `$state`: they change sixty times a second and nothing renders them, so making them reactive would only schedule work. Reduced motion means a change of selection is a cut, not an ease, and the flight button does not exist.'
			},
			code('src/lib/globe/Scene.svelte', 271, 331),
			{
				type: 'p',
				text: 'The markup. A camera with `OrbitControls` from extras, disabled while flying so the two do not fight; two lights; `Stars` for a restrained bit of cinema, with `speed={0}` under reduced motion; the sphere; a slightly larger back-facing shell for an atmosphere; the coastlines; the arcs; and one small mesh per stop, scaled up when selected and clickable. `bind:ref={camera}` hands the three.js camera to the task. Every colour here is a literal or one of the two constants above, like the map’s, because WebGL does not read the cascade; the selected stop is white, the one thing lit. The camera starts over the route — the mean of the stops as unit vectors, which is the right middle on a sphere where an average of longitudes is not — at the distance where the sphere fills about 80% of the frame’s shorter side: a sphere of radius R fills an angle of 2·asin(R/d) from a distance d, and the horizontal field of view comes from the canvas’s aspect, so a portrait phone backs the camera off instead of cutting the globe at both edges. Until the person turns the globe, a resize re-frames it; `OrbitControls`’ `onstart` is how the scene knows they have.'
			},
			{
				type: 'why',
				title: 'Why Threlte and not three.js in an attachment',
				text: 'The same line as the map. A scene is a tree — camera, lights, meshes, materials — and a template is a tree; Threlte maps one onto the other and `{#each markers}` gives you a mesh per stop for free, with disposal handled when the each block shrinks. An attachment would be the right shape for a single canvas that an imperative renderer owns end to end, and there is one of those in project 5. Here, three quarters of the scene is declarative and Threlte lets it stay that way.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the globe is a dynamic import in markup and what the boundary’s two snippets do.',
					'You can explain what `useTask` is and why the flight variables are not `$state`.',
					'You know where reduced motion is honoured in this component, and by what mechanism.'
				]
			}
		]
	},

	{
		slug: 'expenses-with-tanstack-and-layerchart',
		title: 'Expenses: a headless table, two charts, and the settle-up',
		summary:
			'TanStack Table v9 with opt-in features and a typed column-meta slot, a `get data()` getter so the table follows the live document, a small render helper instead of `FlexRender`, `aria-sort` on the header; LayerChart for a bar and a pie; the domain’s `balances()` and `settle()`; and a remote form whose fields carry their types.',
		goal: 'Use a headless data-table library the Svelte 5 way, chart the same rows, and let a form submit numbers and arrays to a schema that expects them.',
		blocks: [
			{
				type: 'p',
				text: 'Three views of the same rows: a sortable table, two charts, and the settle-up. The table is TanStack Table, which is headless in the strictest sense — it sorts, groups and paginates, and renders nothing — and v9 is the first version whose Svelte adapter is written for runes.'
			},
			code(`${TRIP}/Expenses.svelte`, 39, 80, { partial: true }),
			code(`${TRIP}/Expenses.svelte`, 82, 102),
			{
				type: 'p',
				text: 'Rows are derived from the live document with the payer’s name already looked up, so the table never sees an id. The category labels are message functions — the table shows “Food” in English and “Essen” in German through the same column definition.'
			},
			code(`${TRIP}/Expenses.svelte`, 104, 158),
			{
				type: 'p',
				text: 'Three v9 idioms. `tableFeatures` names the features this table uses — sorting, and nothing else — so the bundle carries sorting and not the twelve other things a data grid can do. `columnMeta: {} as { align?: "end" }` is a *type-only slot*: `meta.align` on a column is now typed, with no global declaration merging, which is how v8 did it. And `get data() { return rows }` is a getter, so the table sees the latest rows whenever the live document changes without being re-created; the adapter syncs options in `$effect.pre`, before the rows below are read.'
			},
			code(`${TRIP}/Expenses.svelte`, 181, 195),
			code(`${TRIP}/Expenses.svelte`, 411, 490),
			{
				type: 'p',
				text: 'The markup is a plain `<table>` in our own CSS. Header and cell templates in TanStack are functions that return strings, or strings; the library’s own `FlexRender` also renders components, and this table only needs text, so a six-line `render` helper calls the template with the context the library provides. `aria-sort` goes on the `<th>`, not the button inside it — the attribute belongs to the column header — and `getToggleSortingHandler()` is the whole of the sorting interaction. The amount is the third column, beside what it was for: on a phone the table scrolls sideways and the first three columns are what fits, and the amount is the reason the table exists. “Fits” is a number, not a hope — the title column is 8rem on a phone, 12rem from 40em, so the date, the title and the amount end before the wrapper’s right-hand fade, and only the category, the payer and the shares scroll. The sort button fills its header cell edge to edge — the cell gives its padding to the button, so the label sits where it did and the column is no wider — and it is a control’s 44px tall, so the whole cell is the target; and the last header, over the remove buttons, has a visually hidden name, because an empty `<th>` is a column a screen reader announces as nothing. The wrapper’s right-hand fade shows only while there is more table than screen, and that is measured: `{@attach watchOverflow}` hands the wrapper to a `ResizeObserver` and writes `overflowing` whenever its width changes.'
			},
			{
				type: 'why',
				title: 'Why an attachment, and not `bind:this` and an effect',
				text: 'The first version held the wrapper with `bind:this={wrap}` and watched it from an `$effect` that returned early until `wrap` arrived — two pieces of code, a variable that is `undefined` for the first render, and an effect whose only job was to wait for an element. Watching one element is exactly an attachment’s contract: it is handed the element when the element is in the document, its cleanup runs when it is not, and it runs again only if state it *read* changes. `watchOverflow` reads none, so it runs once per element and disconnects its observer when the table goes. `bind:this` is still the right tool elsewhere in this project, wherever an element is needed by several pieces of code — the map’s frame is measured on every fit and every flight, and the tab strip in three places — and each of those says so where it is declared.'
			},

			{ type: 'h3', id: 'charts', text: 'Two charts' },
			code(`${TRIP}/Expenses.svelte`, 209, 316),
			code(`${TRIP}/Expenses.svelte`, 352, 409),
			{
				type: 'p',
				text: 'LayerChart is components over d3 scales: `<BarChart data x y>` and `<PieChart data key value>` draw with sensible defaults. The bars take `--sea` through a class, and the axes are told what a person needs from them: under each bar the date while there is room and the day of the month alone when there is not — the box’s width is bound, and below 56px a band six “May 10”s run into one string — and up the side round amounts in the trip’s currency, with the ticks and the top of the domain computed from one step, so the top line is at or above the tallest bar (LayerChart rounds the domain and picks its ticks separately, and a 264 bar rose past a top line at 250). Two settings are about looking right rather than being right: `tickLength: 8` is the gap between the baseline and the labels, since no tick marks are drawn; and LayerChart draws a halo round every label in `--color-surface-100`, white or black, so the chart sets that variable to the card’s own paper — the halo still keeps a label legible over a bar, and no longer embosses every label in black on a dark card. The amounts are `fromMinor()`, which asks `Intl` how many decimals the currency has, so yen are yen. The donut’s slices need one colour per category, as strings, and a token is `light-dark(#…, #…)` until a browser resolves it for an element — so a hidden probe element is given each `--kind-*` as its `color` and `getComputedStyle` hands back the plain `rgb(…)` the current theme means, again whenever `theme.resolved` changes. That is an effect writing state — the thing effects are usually told not to do — and the right tool here, because the answer comes from the DOM: a server render has no document to ask, and a `$derived` must not force a style resolution in the middle of drawing. The server draws the slices in `currentColor`, and the effect paints them once the page is in a browser. The pie is a donut with the total in the hole and a legend of chips under it, because five labels around a 14rem circle are unreadable. The data for both is derived from the rows into small arrays of `{ label, total }`, and the `Map` inside each derivation is a plain one on purpose — built whole and never mutated after, which the ESLint comment says, because the Svelte plugin would otherwise suggest a `SvelteMap` that signals on every insert for nobody. The settle-up is the domain’s `balances()` and `settle()` on the raw minor units: the cents on screen are the cents the server would compute. Balances and transfers sit side by side from 64em, each list no wider than 28rem and pushed to the two edges of the card, so an amount is never a screen’s width from its name and the card has no empty third on the right, and a negative balance is written with U+2212, the minus sign, rather than the hyphen `Intl` produces. Above it all, the total is shown only when there is something to total, and the empty state says “add the first one below” only to somebody with a form below.'
			},

			{ type: 'h3', id: 'the-form', text: 'A form that submits numbers and arrays' },
			code(`${TRIP}/Expenses.svelte`, 538, 644),
			{
				type: 'p',
				text: 'Every field is rendered through `fields.x.as(...)`, which encodes the field’s type into its name so the server can coerce it: `as("number")` gives the schema a number, `as("checkbox", member.userId)` for each companion gives it a `string[]`, `as("select")` a string, `as("hidden", value)` a fixed value. Chapter {{remote-functions-the-writes}} showed the schema these arrive at; the compile-time check runs both ways, so a checkbox for a field the schema calls a number does not build. `issues()` under each field are the messages the schema or `invalid()` produced, and `pending` disables the button while a submission is in flight. With JavaScript off, the same form posts and the page re-renders with the same issues.'
			},
			{
				type: 'p',
				text: 'Two changes came from one bug. Submit with no date, and the server refused the form — correctly — and the page re-rendered it with the issue under the date and both selects *empty*: the category and the payer had been chosen with `<option selected>`, the form’s fields are re-rendered from what was submitted, and a select with no value of its own came back with nothing chosen and was then left out of the next submission. The fix is to give `as()` the default — `as("select", "food")`, `as("select", payer)`, where `payer` is a `$derived` of the person filling it in — so the value belongs to the field, not to an option. The second change makes the round trip rare: `{...addExpense.preflight(ExpenseFormSchema)}` runs the form’s own schema in the browser before anything is sent, so a forgotten date is an issue at once, in the page’s language, and nothing else on the form moves. The schema is the server’s — `ExpenseFormSchema` lives in `domain/schemas.ts` with the others (chapter {{schemas-with-valibot}}), and `addExpense` in chapter {{remote-functions-the-writes}} is built from the same import — so the two cannot disagree.'
			},
			{
				type: 'why',
				title: 'Why preflight, when the server checks anyway',
				text: 'The server check is the one that counts — a preflight is JavaScript, and JavaScript can be off or bypassed — so `preflight` is not security, it is courtesy: the answer arrives in the time it takes to press the button, rather than a network round trip later, and without a re-render that could lose state. Running the *same* schema in both places is what makes it safe to have two: there is one definition of a valid expense, and the browser merely asks it first.'
			},
			{
				type: 'p',
				text: 'The date is not an `<input type="date">`, which formats the date in the *browser’s* language — a German page in an American browser asks for mm/dd/yyyy — and looks like nothing else in the product; it is `DateField.svelte`, the single-date sibling of chapter {{dates-and-money-in-a-locale}}’s range picker, sharing its stylesheet and its `segmentAttributes`, so a missing date is announced on the date itself, and its hidden input carries the name `as("hidden", "")` returns.'
			},
			code(`${UI}/DateField.svelte`, 1, 62),
			{
				type: 'checkpoint',
				items: [
					'You can name the three v9 idioms and say what each replaced.',
					'You can explain why `aria-sort` is on the `<th>` and what `render` does instead of `FlexRender`.',
					'You can say how a checkbox array and a number reach the schema with the right types.'
				]
			}
		]
	},

	{
		slug: 'notes-with-tiptap-through-an-attachment',
		title: 'Notes: Tiptap through an attachment',
		summary:
			'Tiptap has no Svelte binding and needs none: `{@attach tiptap()}` hands it the element and destroys it on cleanup. A debounced `command` saves the JSON; a counter makes `isActive()` reactive for the toolbar; remote edits arrive through the live query and are applied only when the person is not mid-sentence.',
		goal: 'Integrate an imperative editor library with an attachment, make its non-reactive API drive a toolbar, and merge remote changes without stamping on someone typing.',
		blocks: [
			{
				type: 'p',
				text: 'Tiptap’s `Editor` takes a DOM element and owns it. That is exactly the contract of a Svelte attachment: a function that receives the element when it is in the document and returns a cleanup for when it is not. No `onMount`, no `bind:this` — and no wrapper library, because there is nothing for one to add. One rule comes with the contract, though, and the first version of this file broke it: an attachment runs inside an effect, so any state it *reads* while it runs is a reason to run it again — to call its cleanup and start over.'
			},
			code(`${TRIP}/Notes.svelte`, 23, 52, { partial: true }),
			code(`${TRIP}/Notes.svelte`, 54, 110),
			{
				type: 'p',
				text: 'The attachment creates the editor with the note from the live snapshot, the `editable` flag from the viewer’s role, and two callbacks: `onUpdate` schedules a save, `onTransaction` bumps a counter. All of that is read inside `untrack(() => new Editor(…))`, which reads without depending — the comment above the function tells the story of what happened without it. What may change later gets an effect of its own. `editable` is a prop, so a child `$effect` inside the attachment follows it with `setEditable`, and Svelte ties that effect to the attachment and stops it with the attachment; the note a companion saves arrives through the effect after the function. The extensions are StarterKit and Placeholder, which writes the empty-note sentence from the message file onto the first empty paragraph as `data-placeholder` for the CSS to draw. The cleanup destroys the instance — and first sends a save that is still waiting for its pause, rather than throwing it away with the editor; `save()` reads the editor’s JSON before its first `await`, so the save sent from the cleanup reads a live editor. `editor` is `$state.raw` because a Tiptap editor is a large object with its own internal state and must not be proxied — `raw` stores the reference and signals only on reassignment.'
			},
			{
				type: 'why',
				title: 'Why `untrack`, and what the first version did',
				text: 'The first version read `view.document.note` and `editable` straight into `new Editor({…})`. That looks harmless — the values are only *used* once — but the attachment’s effect cannot tell using from depending: whatever it read, it now depends on. `view.document` is a new object with every snapshot of the live query, and a snapshot comes after every save, this person’s own included, and whenever a companion arrives or points at a stop. Each one destroyed the editor and built another: the cursor gone, the undo history gone, the save that was waiting for its pause cancelled by the cleanup’s `clearTimeout`, and the next keystrokes typed into nothing. The end-to-end test for notes typed once and waited for “Saved”, so it never typed *after* a snapshot and could not see it. Svelte’s documentation names both ways out, under “Controlling when attachments re-run”: read the starting values without tracking them, and apply later changes from a child effect. Chapter {{end-to-end}} has the test that types, waits for the save and for a companion to arrive, and carries on typing without clicking.'
			},
			code(`${TRIP}/Notes.svelte`, 112, 148),
			{
				type: 'p',
				text: 'Two small mechanisms. Saving is a debounce — type, pause eight hundred milliseconds, one `command` with the whole document, validated by the same `NoteDocSchema` the server checks so a too-long note is refused before the request. And the effect handles the other direction: when the live document carries a note somebody else saved, replace the editor’s content — but only when this person is not focused in it, which is what “mid-sentence” means here. Last writer wins on a page two people rarely edit at the same moment; the comment says which project has the CRDT.'
			},
			code(`${TRIP}/Notes.svelte`, 150, 193),
			{
				type: 'p',
				text: '`editor.isActive("bold")` is not reactive; it is a method on an object Svelte knows nothing about. The counter is the bridge: every Tiptap transaction increments `transactions`, the `$derived.by` reads it — `void transactions` is the read — and so recomputes after every edit, and the toolbar buttons follow the cursor. The tools array is data: a key, a message function for the label, an icon, and a command chain, rendered by one `{#each}`. A pressed tool is drawn three ways — a tier-3 pill, the 1px `--segment-edge`, and the icon at bold weight — because in the dark theme the tier step alone is 1.1:1, and Bold looked the same on and off.'
			},
			code(`${TRIP}/Notes.svelte`, 196, 231),
			{
				type: 'why',
				title: 'Why not a Svelte wrapper for Tiptap',
				text: 'Several exist. Each is a component that calls `new Editor` in `onMount` and exposes the instance through a store or a prop — which is what the forty lines of `tiptap()` do, with an attachment’s cleanup semantics for free. A wrapper would add a dependency, a version to track against Tiptap’s own, and an abstraction between you and the editor’s excellent API. The rule from chapter {{what-we-are-building}}: could we remove it later? Here there was nothing to add in the first place.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can write an attachment for a library that owns an element and say what the cleanup must do.',
					'You can say why state read inside an attachment re-runs it, and how `untrack` and a child `$effect` keep an editor alive through a live document’s snapshots.',
					'You can explain the counter that makes a non-reactive API reactive.',
					'You can say when a remote note replaces the editor’s content and when it does not.'
				]
			}
		]
	},

	{
		slug: 'companions-presence-and-settings',
		title: 'Companions, presence, the join page and settings',
		summary:
			'The member list with roles and “here now”; the owner’s invite link and two moderation buttons; presence chips fed by the live query; the join page as one query and one form; and the settings page — an owner-only page, a form that reads its props once, single-flight refresh, and a delete that asks first.',
		goal: 'Finish the trip’s social surface: everything a person can do to another person on the trip, and the page an owner uses to change the trip itself.',
		blocks: [
			{
				type: 'p',
				text: 'The last tab and the two pages around it. Nothing here introduces a new library; it is the remote functions from chapter {{invites-and-membership}} with faces, and the interesting parts are the choices about which write is a form and which is a command.'
			},
			code(`${TRIP}/Companions.svelte`, 14, 49, { partial: true }),
			code(`${TRIP}/Companions.svelte`, 53, 88),
			{
				type: 'p',
				text: 'Making an invite is a `command` because the result exists to be copied — a link, on screen, with a button that writes it to the clipboard. Leaving is a `form`, because it is a page with a button and should work with JavaScript off. `here` is a set derived from the presence list, so the chip beside a companion who has the trip open appears and disappears with the stream. That chip is the only one in the sea colour — presence is live, and the sea already means live — while the role beside it is a fact, so a quiet chip. After a copy the button shows a check for 1.6 seconds and the toast says “Copied”; the toast is a live region already, so the button carries none of its own, which used to make a screen reader say it twice.'
			},
			code(`${TRIP}/Companions.svelte`, 91, 154),
			code(`${TRIP}/Companions.svelte`, 156, 200),
			code(`${TRIP}/Presence.svelte`, 1, 42),
			code(`${TRIP}/Presence.svelte`, 44, 69),
			{
				type: 'p',
				text: 'Presence is an overlapping stack of initials, one circle per other person, with the stop under their pointer in the tooltip, fed entirely by `view.presence` — which the server refreshes from its thirty-second time-to-live. Four faces, then a “+N”: a crowd is a number, not a row of circles — and the people behind it are still in the list, in a visually hidden “and 2 more: Ana and Cal” built with `Intl.ListFormat`, because a list named “here now” has to contain everybody who is. The name beside each circle shows from 48em and is visually hidden below it, so a screen reader and the end-to-end test still find it. The initials are computed from the name; there are no avatars in this app, and a coloured circle with two letters is what a person recognises across a table. Nobody arrives with a bounce: a chip appearing is information, and a chip bouncing is a slot machine.'
			},

			{ type: 'h3', id: 'join', text: 'The join page' },
			code('src/routes/(site)/(app)/join/[token]/+page.svelte', 1, 50),
			{
				type: 'p',
				text: 'One query says whether the link still works; one remote form accepts it. The page is under `(app)`, so a stranger is sent to sign in and brought back here afterwards — the invite test in chapter {{end-to-end}} follows exactly that path with a brand-new account. Every state the invite can be in has a sentence: already a member, used, expired, or a button.'
			},

			{ type: 'h3', id: 'settings', text: 'Settings: owner only' },
			code('src/routes/(site)/t/[slug=slug]/settings/+page.svelte', 1, 38),
			{
				type: 'p',
				text: 'The remote function already refuses to *change* anything for anybody but the owner. This page refuses to *show* itself, with a 403 rather than a 404, because a member who is not the owner already knows the trip exists — `error()` in markup, which SvelteKit turns into the right status on the server and the error page in the browser, where `+error.svelte` prints the sentence from `page.error.message`. That sentence is `m.error_owner_only()`, a Paraglide message: the error page prints it word for word, so a literal would have put an English sentence under a German heading. The slug is `params.slug` from `PageProps`, as on the trip page. Both declarations are `$derived`, so they follow the query: when the form below saves, the server refreshes `tripBySlug` in the same response, and `trip` — and everything drawn from it, the form’s heading and the embed section that only offers its code for a trip visible by link — is the saved trip. The first version read the query two ways, a template `await` for the first render and `query.current` for the embed section, and the comment that justified it outlived the code it described; one reactive read, declared once, is the version with nothing to keep in step.'
			},
			code('src/routes/(site)/t/[slug=slug]/settings/SettingsForm.svelte', 1, 29),
			code('src/routes/(site)/t/[slug=slug]/settings/SettingsForm.svelte', 31, 56),
			{
				type: 'p',
				text: 'The fields start from the trip and belong to the form from then on: `untrack` reads the prop once, on purpose, and the page keys the form on the slug so a different trip is a different form. This is the *other* answer to the stop dialog’s question — assignable deriveds reset on a prop change; `untrack` says the prop never changes — and each is right where it is used. The save is a command with `.updates(tripBySlug(trip.slug))`: single-flight from the client’s side, naming the query this page is holding so the server refreshes it in the same response and the embed section below sees the new visibility before the toast appears.'
			},
			code('src/routes/(site)/t/[slug=slug]/settings/+page.svelte', 40, 47),
			code('src/routes/(site)/t/[slug=slug]/settings/DeleteTrip.svelte', 17, 38),
			{
				type: 'p',
				text: 'Delete is a remote `form` whose question is asked inside `enhance`, the remote form’s own hook. With JavaScript off the form posts and the trip is gone; with it on, `enhance` is handed the form and submits it only if `confirm()` says yes. The first version put the `confirm()` in an `onsubmit` and called `preventDefault()` on a no — the way you would cancel a plain form — and “Cancel” deleted the trip anyway: the remote form’s attachment has a submit listener of its own, and it does not look at `defaultPrevented`. The end-to-end suite now dismisses the dialog first and checks the trip is still listed, then accepts it and checks it is gone (chapter {{end-to-end}}). This is the one destructive *form* in the app; the smaller removals — a stop, an expense, a companion — are commands behind a button, with the person looking at the thing they remove, and ask nothing. It is a component of its own so the page can put it last, under the embed section: the one thing on the page that cannot be undone comes after everything that can, where nobody reaches it on the way to something else. Its heading is an `h2` at an `h3`’s size, so heading navigation files the danger zone as a section of its own and not as a part of the embed section above it.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the invite is a command and leaving is a form.',
					'You can explain the settings page’s 403 and where `error()` in markup is handled.',
					'You can compare `untrack` in the settings form with assignable deriveds in the stop dialog and say when each is right.',
					'You can say why a `confirm()` belongs in a remote form’s `enhance` and not in an `onsubmit` with `preventDefault()`.'
				]
			}
		]
	}
];
