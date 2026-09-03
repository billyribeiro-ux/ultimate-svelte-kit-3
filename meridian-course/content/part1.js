/**
 * PART 1 — The library
 * (chapters 05–08)
 *
 * `@meridian/waypoint` comes first because it is the purest thing in the
 * project and because everything geographic — the map, the globe, the
 * distance under a trip's name, the leg inside a Markdown guide — reads
 * from it. Four chapters: the geodesy, a reactive class in a library, two
 * components, and the packaging that makes it a real package.
 */

import { code } from './quote.js';

const GEO = 'packages/waypoint/src/lib/geo/index.ts';
const ROUTE = 'packages/waypoint/src/lib/route.svelte.ts';

export const part1 = [
	{
		slug: 'geodesy-for-humans',
		title: 'Geodesy for humans',
		summary:
			'Distances, bearings, destinations, great-circle interpolation, arcs that survive the date line, bounds and compass points — on a sphere, in metres, with conventions written down. Plain TypeScript with no Svelte in it, so anybody can use it.',
		goal: 'Compute the distance and bearing between two places, draw the great circle between them without a leap across the Pacific, and know why longitude comes first.',
		blocks: [
			{
				type: 'p',
				text: 'Every geographic bug I have ever shipped was a convention bug: latitude and longitude the wrong way round, a bearing in `[-180, 180]` compared against one in `[0, 360)`, a distance in kilometres added to one in metres. So the file starts by writing the conventions down, and the code keeps them.'
			},
			code(GEO, 1, 23),
			code(GEO, 25, 43),
			{
				type: 'p',
				text: 'Longitude first, because GeoJSON and MapLibre both say so and the library exists to feed them. A sphere, not an ellipsoid, because a trip is planned to the kilometre and the difference is under a third of a percent — the comment says so, and says what it would cost to do better, which is how a simplification should be recorded.'
			},

			{ type: 'h3', id: 'distance', text: 'Distance, the haversine way' },
			code(GEO, 66, 93),
			{
				type: 'p',
				text: 'The spherical law of cosines is one line and it fails for points a metre apart, where the cosine of a tiny angle rounds to exactly 1 and every digit of the answer is lost. Haversine works with half-angle sines instead, which stay meaningful at small distances, and the test in `geo.spec.ts` checks a point one metre away to three decimal places to prove it. The `Math.min(1, …)` is the kind of guard you write once you have seen `asin(1.0000000002)` return `NaN` in production.'
			},

			{ type: 'h3', id: 'bearing', text: 'Which way, and where you end up' },
			code(GEO, 95, 130),
			{
				type: 'p',
				text: 'A bearing is the compass direction you set out on, and it changes along a great circle — London to New York leaves heading north of west and arrives heading south of west, and the test says exactly that. `destination` is the inverse question: start here, walk this far on this bearing, where are you? It is used by the tests to make a point a known distance away, and by nothing else; a library function that exists to test another is still worth having.'
			},

			{ type: 'h3', id: 'interpolate', text: 'The point halfway along' },
			code(GEO, 132, 178),
			{
				type: 'p',
				text: 'This is the function the globe’s camera follows and the map’s route line is drawn from, and it is the one most people get wrong. Averaging two latitudes and two longitudes gives the midpoint of the straight line on a *flat map*, which on the sphere is nowhere near halfway. Spherical linear interpolation treats the two points as unit vectors and blends the vectors, so `t = 0.5` lands on the true great-circle midpoint. `arc` samples it sixty-five times and hands the result to `unwrap`.'
			},
			code(GEO, 180, 209),
			{
				type: 'p',
				text: 'The date line is where route lines go to die. A path from Tokyo to San Francisco crosses longitude 180, and if the polyline steps from +179 to −179, MapLibre dutifully draws a line the whole way round the world the long way. `unwrap` notices any step of more than 180° between neighbours — which can only mean a crossing — and shifts everything after it by 360°, so the line stays continuous and MapLibre draws it on the next copy of the world, which is what a person expects to see.'
			},

			{ type: 'h3', id: 'bounds', text: 'Bounds, padding, and sixteen compass points' },
			code(GEO, 211, 249),
			code(GEO, 251, 277),
			{
				type: 'p',
				text: '`pad` is what the map’s “fit the route” button calls: grow the rectangle by fifteen percent so the outermost pins are not on the edge, and never let it be smaller than a twentieth of a degree so a trip with one stop still has a view around it. `compassPoint` divides the circle into sixteen and rounds — the `% 16` is for a bearing of 359°, which rounds up to index 16 and must wrap to north.'
			},

			{ type: 'h3', id: 'formatting', text: 'A distance a person can read' },
			code(GEO, 279, 326),
			{
				type: 'p',
				text: 'The last thing that happens to a distance is formatting, and it happens with `Intl.NumberFormat` and `style: "unit"`. That is not a convenience; it is the only correct way to do it. German writes `343 km` with a non-breaking space, Portuguese writes `343 km` the same way, English writes `343 km` too but `2.5 mi` with a point where German uses a comma — and the library never carries a table of any of that. Chapter 21 makes the same argument for dates and money.'
			},
			code('packages/waypoint/src/lib/geo/geo.spec.ts', 19, 45),
			{
				type: 'why',
				title: 'Why the library has no Svelte in it',
				text: 'The `./geo` entry point is plain functions. Anybody — a Node script, a React app, a worker — can import `@meridian/waypoint/geo` and pay for nothing they do not use. The Svelte parts live behind the package root, which has a `svelte` export condition; chapter 08 shows the `exports` map that draws the line. Keeping the pure part pure also makes it trivially testable: the `server` Vitest project runs these in plain Node in under a second.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why haversine and not the law of cosines, and what `Math.min(1, …)` prevents.',
					'You can say what `unwrap` does and what a map draws without it.',
					'You know why `formatDistance` reaches for `Intl` instead of a string template.'
				]
			}
		]
	},

	{
		slug: 'a-route-as-a-class',
		title: 'A route as a class, in a library',
		summary:
			'`Route` is an ordered list of waypoints as `$state`, with legs, total, bounds and the longest leg as `$derived`. It lives in a `.svelte.ts` file inside a published package, and it works in the consumer exactly as it works here.',
		goal: 'Write reactive state in a library with runes and no store abstraction, and know what `svelte-package` does with a `.svelte.ts` file.',
		blocks: [
			{
				type: 'p',
				text: 'Libraries used to ship stores: `writable()` objects with `subscribe`, so a consumer could `$store` them in a component. Svelte 5 changed the question. A `.svelte.ts` file can use runes, `svelte-package` copies it into `dist` as `route.svelte.js`, and the consuming app’s compiler compiles the runes in it — the library ships *source that is reactive*, not a runtime abstraction over reactivity.'
			},
			code(ROUTE, 1, 34),
			{
				type: 'p',
				text: 'The doc comment at the top says the one thing a reader of this file needs: the list is `$state`, everything else is `$derived`, and the file is inside a published library on purpose. The two interfaces are generic on `W extends Waypoint`, so a consumer with a richer stop type — the app’s `Stop` has a date and a kind — gets legs typed with its own type back.'
			},
			code(ROUTE, 36, 60, { partial: true }),
			{
				type: 'p',
				text: 'Four derived fields. `legs` is a `$derived.by` because it loops; the others are one-expression `$derived`s that read `legs` and so depend on it transitively. Notice `readonly` on all four: a consumer can read `route.total`, cannot assign it, and TypeScript says so — the reactive graph has exactly one input, `waypoints`, and the type system enforces that. The non-null assertions inside the loop are safe because the index is bounded by the length, and they are the price of `noUncheckedIndexedAccess`, which the library’s tsconfig turns on so that every other index is checked.'
			},
			code(ROUTE, 62, 104, { partial: true }),
			{
				type: 'p',
				text: 'The methods mutate `this.waypoints` in place — `splice`, not a new array — and that works because `$state` on an array makes it a deeply reactive proxy: a `splice` is an update the derived fields notice. `replace` is the exception and the reason drag and drop is easy: svelte-dnd-action hands back a whole new order, and one assignment installs it. `toJSON` uses `$state.snapshot` to hand a *plain* copy to `JSON.stringify` or `structuredClone`, neither of which can take a proxy.'
			},
			code('packages/waypoint/src/lib/route.svelte.test.ts', 10, 60, { partial: true }),
			{
				type: 'p',
				text: 'The test runs in the `client` project — a real browser, because the runes need the Svelte runtime — and `flushSync()` after each mutation makes the derived values settle before the assertion. Without it the test would read `total` before the graph had recomputed, and pass or fail depending on scheduling, which is the definition of a flaky test.'
			},
			{
				type: 'note',
				text: 'Try it: import `Route` in a component of your own, `bind:value` an input to `route.waypoints[0].lat`, and watch `route.total` follow. Nothing in the library knows the component exists. That is what “reactive source, not a store” buys.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `svelte-package` does with a `.svelte.ts` file and who compiles the runes in it.',
					'You know why the derived fields are `readonly` and why `replace` exists next to `add`, `remove` and `move`.',
					'You can explain what `flushSync` is for in the test.'
				]
			}
		]
	},

	{
		slug: 'two-components-for-any-app',
		title: 'Two components for any app',
		summary:
			'A compass needle and a sparkline: a few dozen lines each, `role="img"` with an accessible name, props typed with an interface, `class` forwarded, reduced motion respected. What a library component has to get right that an app component can skip.',
		goal: 'Write a component meant for strangers — typed props, a `class` prop, an accessible name computed from the data, styles that do not leak — and test it in a browser.',
		blocks: [
			{
				type: 'p',
				text: 'A component in an app can rely on the app: its tokens, its fonts, its knowledge of what the data means. A component in a library can rely on nothing, and has to be right for a consumer who will never read its source. These two are small enough to show every rule.'
			},
			code('packages/waypoint/src/lib/Compass.svelte', 1, 19),
			{
				type: 'p',
				text: '`class` is a reserved word, so the prop is renamed on the way in — `class: className` — and forwarded onto the root element beside the library’s own class, which is namespaced `waypoint-compass` so it cannot collide with anything the consumer has. Both derived values are cheap and pure; the point of deriving them rather than computing in the markup is that `point` is used twice — once as data, once in the accessible name — and must be the same value both times.'
			},
			code('packages/waypoint/src/lib/Compass.svelte', 21, 44),
			{
				type: 'p',
				text: '`role="img"` with an `aria-label` that says `92 degrees, E` makes the needle readable by a screen reader — an SVG with no name is silence. `style:transform` rotates the needle by the heading; `data-point` exposes the compass point to CSS and to tests without a class per direction.'
			},
			code('packages/waypoint/src/lib/Compass.svelte', 46, 61),
			{
				type: 'p',
				text: 'The transition on the needle is the one bit of motion in the library, and it is turned off under `prefers-reduced-motion`. A library that animates has to make that choice for people who cannot make it themselves, because the consuming app may not know the animation is there.'
			},
			code('packages/waypoint/src/lib/Sparkline.svelte', 1, 39),
			code('packages/waypoint/src/lib/Sparkline.svelte', 41, 60),
			{
				type: 'p',
				text: 'The sparkline is the argument against a chart library, in twelve hundred bytes: a path through the values, scaled to a box, with `vector-effect="non-scaling-stroke"` so the line stays hairline when the SVG is stretched. Fewer than two values draws nothing, and the test checks that, because “nothing” is a case a chart library would have thrown on.'
			},
			code('packages/waypoint/src/lib/Compass.svelte.test.ts', 1, 16),
			code('packages/waypoint/src/lib/Compass.svelte.test.ts', 18, 34),
			{
				type: 'p',
				text: '`vitest-browser-svelte` mounts the component in the Chromium that Vitest’s `client` project starts, and `expect.element(...)` retries until the locator resolves — the Playwright idea at component scale. The assertions are on *accessible names*, not class names, so the test reads the way a screen reader does.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why the prop is `class: className` and why the root class is namespaced.',
					'You can write an `aria-label` computed from the data and explain why `role="img"` matters on an SVG.',
					'You know what `vector-effect="non-scaling-stroke"` does and why a library component turns off its own motion.'
				]
			}
		]
	},

	{
		slug: 'packaging-and-proving',
		title: 'Packaging a Svelte library, and proving it',
		summary:
			'`svelte-package` 3 reads its configuration from Vite, `exports` draws the line between the framework-free entry and the Svelte one, `.js` imports name the files that will exist, and publint plus arethetypeswrong check the tarball the way a consumer would.',
		goal: 'Package a Svelte 5 library with two entry points and types that resolve, and run the two checks that catch what `tsc` cannot.',
		blocks: [
			{
				type: 'p',
				text: 'A package is a contract with strangers, and most of the ways to break it are silent: an `exports` map that forgets the `types` condition, a `.svelte` import that Node cannot resolve from a `.d.ts`, a `sideEffects` flag that lets the bundler drop your CSS. None of those is a type error in your own repository. So the library has its own verify script, and the app is its first consumer.'
			},
			code('packages/waypoint/package.json', 1, 27, { partial: true }),
			{
				type: 'p',
				text: 'The `exports` map is the whole public surface. The root entry has a `svelte` condition, which bundlers that understand Svelte prefer, and a `default`; `./geo` has no `svelte` condition because there is nothing Svelte in it, and a consumer with no Svelte resolves it fine. `types` comes first in each, because Node’s conditions are matched in order and TypeScript reads `types` before anything else. `sideEffects` names the CSS so tree-shaking keeps it; `files` ships `dist` and nothing else, and drops the tests that `svelte-package` would otherwise copy.'
			},
			code('packages/waypoint/package.json', 28, 39, { partial: true }),
			{
				type: 'p',
				text: '`svelte` is a peer dependency — a library must use the consumer’s copy, never bring its own. The `package` script runs `svelte-kit sync` first because `svelte-package` needs the generated ambient types to build declarations. `package:check` is two tools and three commands, and each one caught something during development: publint found the missing `types` condition; arethetypeswrong found that the root entry’s `.d.ts` imports `.svelte` files, which Node 16’s resolver would refuse — real, and unfixable while a `.d.ts` re-exports a component, so the rule is ignored for the root entry only and enforced for `./geo`.'
			},
			code('packages/waypoint/vite.config.ts', 1, 54),
			{
				type: 'p',
				text: 'This is the config SvelteKit 3 asks a *library* to have. `@sveltejs/package` 3 no longer reads `svelte.config.js` — there is none — it calls Vite’s `resolveConfig()` on this file and reads the `sveltekit()` plugin’s options back. So a package with no real routes still has the plugin, with `runes: true` because everything here is written in runes. The two Vitest projects mirror the app’s: components and the `Route` class in a browser, the geodesy in Node.'
			},
			code('packages/waypoint/tsconfig.json', 1, 24),
			{
				type: 'p',
				text: '`declaration` and `declarationMap` together let a consumer’s editor “Go to Definition” land in the real `.ts` or `.svelte` source rather than a generated `.d.ts`, because the map points back at the source and `files` ships it beside `dist`. The rest is the strictest TypeScript there is, and `noUncheckedIndexedAccess` is the one that changes how you write loops — chapter 06 showed the `!` it forces you to justify.'
			},
			code('packages/waypoint/src/lib/index.ts', 1, 23),
			{
				type: 'p',
				text: 'The entry point re-exports with `.js` extensions on files that are `.ts` on disk. That is not a mistake; it is Node’s ESM resolution and TypeScript’s decision to follow it. The published files *are* `.js`, an import that named `.ts` would break the moment the library was compiled, and TypeScript resolves `./geo/index.js` to `./geo/index.ts` while type-checking so you get the best of both.'
			},
			{
				type: 'terminal',
				code: `
$ pnpm run verify:package
> @meridian/waypoint@0.1.0 verify
> npm run check && npm run test && npm run package && npm run package:check

svelte-check found 0 errors and 0 warnings
 Test Files  3 passed (3)      # geo in Node; Route, Compass, Sparkline in Chromium
      Tests  32 passed (32)
svelte-package ... dist/ written
publint: All good!
attw --entrypoints ./geo ... 🟢 No problems found
attw --entrypoints .     ... 🟢 (internal-resolution-error ignored for .svelte re-exports)`
			},
			{
				type: 'why',
				title: 'Why the app consumes the library as a package and not by path',
				text: 'Because a path import bypasses every one of these checks. `import { distance } from "../../packages/waypoint/src/lib/geo"` would work today and tell you nothing about whether the package works for anybody else. `workspace:*` makes the app resolve `@meridian/waypoint` through `exports`, through `dist`, through the declarations — the same path a stranger takes — on every `pnpm run build`. When chapter 27 imports `arc` for the map and chapter 34 imports `formatDistance` inside a Markdown guide, both are proving the package.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can write an `exports` map with a framework-free entry and a Svelte entry and say why `types` comes first.',
					'You know why `svelte` is a peer dependency and why the library’s `vite.config.ts` has the SvelteKit plugin in it.',
					'You can say what publint and arethetypeswrong each catch that `tsc` does not.'
				]
			}
		]
	}
];
