/**
 * PART 3 — The studio
 * (chapters 14–20)
 *
 * Everything a person touches. The session that holds the pattern and its
 * history; a knob, because the web does not have one; the pads and the grid;
 * the transport and the mixer; panels that are history entries; the page
 * that puts it together; and the two panels that let sound and patterns in
 * and out. This is the part with the most Svelte in it — bindings of every
 * kind, attachments, springs, `fork`, `settled`, `$inspect` — and every one
 * of them is there because a groovebox needed it.
 */

import { code } from './quote.js';

export const part3 = [
	{
		slug: 'the-session',
		title: 'The session: a pattern and its history',
		summary:
			'A class in a `.svelte.ts` file holds the pattern as deep `$state`, keeps undo as snapshots, autosaves with a root effect, and can be tested without a component.',
		goal: 'Know when to put state in a class rather than a component, how deep `$state` makes a sixteen-by-eight grid cheap to update, and why undo is a stack of plain data.',
		blocks: [
			{
				type: 'p',
				text: 'The studio page is long, and most of what it does is not about the page. Undo, the selected track, whether the pattern has changed since it was saved, where it came from — none of that is *rendering*. So it lives in a class, in a file that ends in `.svelte.ts`, which is the file extension that lets `$state` be used outside a component.'
			},
			code('src/lib/studio/session.svelte.ts', 1, 20),
			{
				type: 'p',
				text: 'The fields are all `$state`. The pattern is *deep* state: Svelte wraps it in a proxy, and the proxy wraps every array and object inside it as it is reached. Toggling `step.velocity` on one pad notifies exactly the things that read that one step — the pad — and nothing else. A hundred and twenty-eight pads on screen, one re-render per click.'
			},
			code('src/lib/studio/session.svelte.ts', 44, 65, { partial: true }),
			{
				type: 'why',
				title: 'Why a class, and not a store or a component',
				text: 'A class with `$state` fields is the plainest way to have reactive state that outlives, and is bigger than, any one component. It can be created in a test with `new Session()` and every method called directly, which is what `session.svelte.test.ts` does (ch. 37). A store would work but would push every update through `set`; a component would drag rendering into a thing that has nothing to render. The `.svelte.ts` extension is the whole trick — the compiler treats runes in it exactly as it does in a component script.'
			},
			{ type: 'h3', id: 'loading', text: 'Loading a pattern' },
			code('src/lib/studio/session.svelte.ts', 71, 100),
			{
				type: 'p',
				text: '`load` replaces the whole pattern. `generation` goes up by one, and the grid is wrapped in `{#key session.generation}` (ch. 19), so a whole new pattern gets a whole new grid rather than a row-by-row diff with transitions playing between two grooves that have nothing to do with each other.'
			},
			{
				type: 'warn',
				text: '`snapshot()` is not `$state.snapshot()`, and the comment above it says why: `$state.snapshot` uses `structuredClone`, which calls `toJSON()` on anything that has one and drops the prototype of anything that does not. A `Note` (ch. 4) has a `toJSON` — it becomes its MIDI number — and the copy would have numbers where notes should be. `clonePattern` is the model’s own copy, and it knows what a `Note` is. Reach for `$state.snapshot` for plain data; for a model with a class in it, write the clone.'
			},
			{ type: 'h3', id: 'undo', text: 'Undo is a stack of snapshots' },
			code('src/lib/studio/session.svelte.ts', 106, 137),
			{
				type: 'p',
				text: 'Every edit calls `commit()` *before* it changes anything. The snapshot is a DTO — plain arrays and numbers, produced by `toDto` reading through the proxy — so the history holds no proxies, and nothing observes it. `undo` moves the current pattern to the redo stack and puts the previous one back with `fromDto`, which rebuilds the `Note`s. A hundred entries is the limit; a pattern is two kilobytes and nobody undoes further than that.'
			},
			{
				type: 'note',
				text: '`canUndo` and `canRedo` are `$state` booleans kept in step by `#syncHistoryFlags()`, rather than derived from the private arrays. A `$derived` cannot see a plain array change, and the arrays are deliberately plain — making them `$state` so that a button can grey out would proxy every snapshot for the sake of two booleans.'
			},
			{ type: 'h3', id: 'editing', text: 'Editing' },
			code('src/lib/studio/session.svelte.ts', 147, 165),
			{
				type: 'p',
				text: 'The brush decides what a click does. `cycle` is the default — off, soft, on, accent, off — and the other three paint a fixed velocity. The early `return` when nothing would change matters more than it looks: it is what keeps a click on an already-erased step from pushing an undo entry that undoes nothing.'
			},
			code('src/lib/studio/session.svelte.ts', 174, 182),
			{
				type: 'p',
				text: '`Note.transpose` returns the *same* object when the result would be identical (ch. 4), which is what makes `note === step.note` a correct test for “nothing changed” — and again, no empty undo entry.'
			},
			code('src/lib/studio/session.svelte.ts', 213, 234),
			{
				type: 'p',
				text: '`moveTrack` splices the array in place. Because the grid keys its rows by `track.id`, Svelte moves the existing `<li>` rather than rebuilding it, and `animate:flip` (ch. 16) draws the move. `setKind` reads `wasMelodic` *before* assigning the new kind — the order matters, because after the assignment the old kind is gone.'
			},
			{ type: 'h3', id: 'persistence', text: 'Persistence and autosave' },
			code('src/lib/studio/session.svelte.ts', 240, 265),
			{
				type: 'p',
				text: 'What is saved is the encoded string from chapter 7 — the same thing a share link holds — plus the id this is a remix of. `localStorage` can throw (private mode, a full quota), and a studio that forgets is better than a studio that crashes, so the `catch` is empty on purpose and says so.'
			},
			code('src/lib/studio/session.svelte.ts', 267, 301),
			{
				type: 'why',
				title: 'Why `$effect.root`',
				text: 'An `$effect` needs an owner — normally the component it is written in — so that it is torn down when the component is. `Session` is not a component; it is built by the page *and* by tests, and a bare `$effect` in a test throws. `$effect.root` creates an owner and hands back the function that disposes of it. The page calls `autosave()` inside its own `$effect` and returns the disposer as that effect’s cleanup (ch. 19), so from the page’s point of view it is one line.'
			},
			{
				type: 'warn',
				text: 'The `first` flag is not a nicety. The effect runs once immediately with whatever pattern the page started from — on a fresh visit that is the server’s placeholder preset — and *persisting that* would overwrite the saved session a few milliseconds before `restore()` reads it. This was found by the end-to-end test that reloads the studio and expects yesterday’s pattern (ch. 38). Effects run on creation; when the first run must not have the side effect, say so.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say why `.svelte.ts` is in the filename, and what would happen if it were not.',
					'You can explain why undo snapshots are DTOs rather than `$state.snapshot()` results.',
					'You can trace one click on a pad through `paint` → `commit` → `step.velocity = next` and say which component re-renders.'
				]
			}
		]
	},

	{
		slug: 'a-knob',
		title: 'A knob',
		summary:
			'A control the web does not have: drag, scroll and arrow keys, a `$bindable` value, a spring on the pointer, `$props.id()` for the label, and a wheel listener that must not be passive.',
		goal: 'Build a bindable component with a gesture, and know why the wheel listener is an attachment, why the pointer is a spring and the value is not, and what `$props.id()` is for.',
		blocks: [
			{
				type: 'p',
				text: 'Every instrument is covered in knobs. The web has sliders, which are the wrong shape for a mixer strip — a slider is as wide as its range, a knob is as wide as a thumb. So we build one, and it has to do everything a native control does: respond to a pointer, to the wheel, to the keyboard; announce itself to a screen reader; take a value from its parent and give it back.'
			},
			code('src/lib/studio/Knob.svelte', 20, 43),
			{
				type: 'p',
				text: '`value = $bindable(0)` is the whole API. A parent writes `<Knob bind:value={track.gain} />` and the knob writes straight into the track — into deep `$state`, through the binding, with no event to handle. `onstart` fires once at the beginning of a gesture, *before* the first change, and it is where the studio takes its undo snapshot: one entry per twist, not one per pixel.'
			},
			code('src/lib/studio/Knob.svelte', 45, 54),
			{
				type: 'why',
				title: 'Why `$props.id()`',
				text: 'The dial is a `role="slider"` `<div>` and needs `aria-labelledby` pointing at the label. That needs an id, unique per knob, and — because the page is server-rendered — *the same* id on the server and in the browser, or hydration would find a mismatch. `$props.id()` is exactly that: a per-instance id that the two renders agree on. Nobody numbers the knobs.'
			},
			{ type: 'h3', id: 'the-spring', text: 'The pointer is a spring; the value is not' },
			code('src/lib/studio/Knob.svelte', 56, 67),
			{
				type: 'p',
				text: 'When a preset loads or an undo lands, the tempo jumps from 120 to 92. Audio must change instantly — a tempo that eased in would be a tempo that was wrong for a quarter of a second. But the *pointer* on the dial can afford a little weight, so a jump reads as a movement. `Spring.of` takes a function returning the target and follows it; the value it holds, `angle.current`, is what the SVG rotates by.'
			},
			{ type: 'h3', id: 'the-gestures', text: 'Drag, keys and wheel' },
			code('src/lib/studio/Knob.svelte', 69, 104),
			{
				type: 'p',
				text: '`on` from `svelte/events` adds a listener and returns the function that removes it. The `pointerup` handler calls both removers and itself is removed — three lines, no `removeEventListener` with a named function to keep around. A hundred and fifty pixels covers the whole range; Shift makes it a tenth of that for fine work.'
			},
			code('src/lib/studio/Knob.svelte', 110, 131),
			code('src/lib/studio/Knob.svelte', 133, 158),
			{
				type: 'warn',
				text: 'Scrolling over a knob turns it, so the page must *not* scroll — and browsers register `wheel` listeners as passive by default, which means `preventDefault()` is ignored. An `onwheel` attribute cannot change that. An attachment can: it gets the element and calls `on(node, "wheel", …, { passive: false })`. This is the general rule — when a listener needs options, it is an attachment, not an attribute.'
			},
			{
				type: 'note',
				text: 'A wheel gesture has no “up” event. The knob decides a gesture has ended when the wheel has been quiet for a quarter of a second, and calls `onend` then. `onstart` is called only on the first tick of a burst, which is what keeps one flick of the wheel to one undo entry.'
			},
			{ type: 'h3', id: 'the-markup', text: 'The markup' },
			code('src/lib/studio/Knob.svelte', 160, 162),
			code('src/lib/studio/Knob.svelte', 165, 193),
			{
				type: 'p',
				text: 'Two arcs on one circle, drawn with `stroke-dasharray`: the track is always three quarters of the circumference, the fill is however much of that the value has reached. `style:--size` sets a CSS custom property from a prop — the stylesheet reads `var(--size)` and the component never touches `width` directly. The `aria-*` attributes are what makes a `<div>` a slider to assistive technology; `aria-valuetext` gives it the *formatted* value, so a screen reader says “92” for the tempo and “L20” for a pan.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `$bindable` does and how a parent uses it.',
					'You can explain why the wheel handler is an attachment and the pointer handler is an attribute.',
					'You can say which of `value` and `angle` is instant and why.'
				]
			}
		]
	},

	{
		slug: 'pads-and-the-grid',
		title: 'Pads and the grid',
		summary:
			'One pad is a button with a class list; the grid is a keyed `{#each}` with `animate:flip`, `bind:group` for the brush, a function binding for the row checkbox, `bind:indeterminate`, and a `contenteditable` name.',
		goal: 'Read a component that owns nothing and reports everything, and use every binding on a form control that Svelte has — including the three-state checkbox.',
		blocks: [
			{
				type: 'p',
				text: 'A pad is the smallest component in the project and the most numerous: sixteen per track, eight tracks, a hundred and twenty-eight of them. It is a button. It knows its velocity, its note, its column, and whether the playhead is on it; it reports a click and an arrow key. It holds no state at all.'
			},
			code('src/lib/studio/Pad.svelte', 13, 45),
			code('src/lib/studio/Pad.svelte', 47, 76),
			{
				type: 'p',
				text: '`class` takes an array — strings and objects, falsy entries dropped — with the same rules as the `clsx` library, built in. It reads as a list of the things this pad *is*. Two `style:` directives set custom properties: the hue comes from the track kind, the level from the velocity, and the stylesheet computes the colour from both with `oklch(calc(…))`. Svelte does the styling; CSS does the maths.'
			},
			{
				type: 'note',
				text: '`aria-pressed={on}` is what makes a screen reader say “pressed” for a lit step, and `aria-label` spells out what it is: “Step 5, accent” or “Step 9, C3”. The pad has no visible text — a lit square is all it needs to be — so the label is the whole story for anyone who cannot see it.'
			},
			{ type: 'h3', id: 'the-grid', text: 'The grid' },
			code('src/lib/studio/StepGrid.svelte', 19, 48),
			{
				type: 'p',
				text: 'The grid does not own the pattern either. It renders one and reports edits through callbacks — `onpaint`, `onfill`, `onmove` — so the same component draws the studio (where the callbacks edit the session), the published page (read-only, no callbacks) and the jam room (where every callback is a command sent to the server, ch. 31). `brush` is the one `$bindable`, because two things write it: this toolbar, and the keyboard shortcuts on the page.'
			},
			code('src/lib/studio/StepGrid.svelte', 61, 77),
			{
				type: 'p',
				text: '`bind:group` on four radio inputs: one variable, whichever is checked. The inputs are visually hidden and the `<label>` is the chip, which is why the end-to-end tests click the label — a hidden radio has no size to click.'
			},
			{ type: 'h3', id: 'flip', text: 'Moving a row' },
			code('src/lib/studio/StepGrid.svelte', 79, 100),
			{
				type: 'p',
				text: 'The rows are keyed by `track.id`. When `moveTrack` splices the array, Svelte moves the `<li>` rather than rewriting the rows between, and `animate:flip` draws the move — FLIP: measure where it was, apply the change, invert the difference with a transform, play it back to zero. The duration is zero when the person prefers reduced motion.'
			},
			{
				type: 'warn',
				text: 'The four `{const}` declarations are *inside* the `<li>`, and the comment says why: an element with `animate:` must be the only child of its keyed `{#each}` block, and a declaration tag counts as a child. Written before the `<li>`, the compiler refuses. This was found by the Svelte MCP server’s autofixer while writing this file, which is what that tool is for.'
			},
			{ type: 'h3', id: 'three-states', text: 'A checkbox with three states' },
			code('src/lib/studio/StepGrid.svelte', 101, 117),
			{
				type: 'p',
				text: 'The box at the start of each row means “every step on”. It is *derived* from the steps — so `bind:checked` gets a function binding: a getter that computes it and a setter that, instead of assigning, calls `onfill`. Ticking the box is a command, not an assignment, and the box shows whatever the steps say once the command has run.'
			},
			{
				type: 'p',
				text: '`bind:indeterminate` is the third state a checkbox has and most interfaces never use. When some steps are on and some off, the honest answer to “is this row on?” is “partly”, and the browser has a way to draw that. Its setter is a no-op: the browser clears `indeterminate` on click, and the getter decides what it should be again on the next render.'
			},
			code('src/lib/studio/StepGrid.svelte', 121, 135),
			{
				type: 'p',
				text: 'The track name is a `contenteditable` span with `bind:textContent` — another function binding, reading the name and writing it back trimmed, with the old name kept if the new one is empty. `plaintext-only` stops a paste from bringing formatting with it.'
			},
			code('src/lib/studio/StepGrid.svelte', 137, 176),
			code('src/lib/studio/StepGrid.svelte', 179, 193),
			{
				type: 'p',
				text: 'The pads are the second `{#each}`, keyed by column. `{melodic}` and `{column}` are the shorthand for `melodic={melodic}` — the four declarations from the top of the `<li>` are in scope all the way down here. `playing={column === step}` is the whole playhead: the scheduler’s `step` comes in as a prop, and the one pad whose column matches lights up.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what a function binding is and when to use it instead of a variable.',
					'You can explain why the `{const}` tags are inside the `<li>`.',
					'You can name the three things `bind:group`, `bind:checked` and `bind:indeterminate` bind to in this file.'
				]
			}
		]
	},

	{
		slug: 'transport-and-mixer',
		title: 'The transport and the mixer',
		summary:
			'Play, tempo, swing and volume; a strip per track with level, pan, mute, solo and a meter drawn by an attachment at sixty frames a second; and `$inspect.trace` in the one effect most likely to re-run for the wrong reason.',
		goal: 'Bind knobs into deep state, keep a per-frame value out of the reactivity system, and know what `$inspect.trace` tells you.',
		blocks: [
			{
				type: 'p',
				text: 'The transport is the row above the grid: play, tempo, swing, master volume, and a bar counter. Two of the knobs bind into the pattern; one binds into the engine, because how loud *this machine* is has nothing to do with what gets shared.'
			},
			code('src/lib/studio/Transport.svelte', 16, 33),
			code('src/lib/studio/Transport.svelte', 76, 105),
			{
				type: 'p',
				text: '`bind:value={bpm}` on a `$bindable` prop that the page bound to `session.pattern.bpm`: a binding chained through two components into deep state. The scheduler reads `pattern.bpm` on every tick (ch. 12), so a turn of the knob is heard on the next sixteenth. `bind:value={engine.volume}` binds to a *setter* on the engine class, which writes the gain node.'
			},
			{ type: 'h3', id: 'inspect-trace', text: '`$inspect.trace`' },
			code('src/lib/studio/Transport.svelte', 35, 48),
			{
				type: 'p',
				text: 'The transport reads the engine, the scheduler and the pattern, which makes it the component most likely to update for a reason nobody intended. `$inspect.trace("transport")` as the *first statement* of an effect prints, in development, which piece of state caused each re-run — not that it ran, but *why*. It compiles to nothing in production. The `eslint-disable` comment is deliberate and says so: the lint rule exists to catch `$inspect` left in by accident, and this one is the lesson.'
			},
			{
				type: 'note',
				text: 'Open the studio in development, press play, and read the console. Every message names a signal — `scheduler.playing`, `engine.state` — and that is the fastest way to learn what the reactivity system actually tracks, which is not always what you assumed.'
			},
			{ type: 'h3', id: 'the-mixer', text: 'The mixer' },
			code('src/lib/studio/Mixer.svelte', 8, 28),
			code('src/lib/studio/Mixer.svelte', 39, 60),
			{
				type: 'p',
				text: '`bind:value={track.gain}` inside an `{#each}`: a binding straight into an element of a deep `$state` array. Nothing forwards it; the knob writes the number and the engine reads it on the next scheduled step. The pan formatter turns −0.4 into “L40” and 0 into “C”, which is what a mixer says.'
			},
			code('src/lib/studio/Mixer.svelte', 91, 98),
			{
				type: 'p',
				text: 'The meter appears only once the engine has built a channel for the track, which happens on the first note it plays. `engine.channels` is a `SvelteMap` (ch. 11), so `has()` is reactive, and the meter shows up on its own the first time the track sounds.'
			},
			{ type: 'h3', id: 'the-meter', text: 'A meter at sixty frames a second' },
			code('src/lib/studio/Meter.svelte', 16, 56),
			{
				type: 'why',
				title: 'Why an attachment, and not `$state`',
				text: 'A peak level changes every frame. Putting it through `$state` would mean sixty state updates a second per track, each scheduling a re-render, for a value that only a canvas reads. So it never enters the reactivity system: an attachment gets the canvas, runs a `requestAnimationFrame` loop that reads the analyser and draws, and returns the function that cancels the loop. The rule: if a value changes faster than a person can see it change, it is not state.'
			},
			{
				type: 'p',
				text: '`meter(analyser)` is an attachment *factory* — a function that returns an attachment. Because it closes over the prop, Svelte re-runs the factory when the prop changes, tearing down the old loop and starting a new one on the new node. `devicePixelRatio` from `svelte/reactivity/window` is read inside for the same reason: move the window to a different screen and the canvas re-scales.'
			},
			code('src/lib/studio/Meter.svelte', 59, 62),
			{
				type: 'p',
				text: '`bind:clientWidth` and `bind:clientHeight` are read-only bindings the browser keeps current with a `ResizeObserver`. The canvas is sized from them at draw time, at device resolution, so the bar is crisp on a phone.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain the chain from a knob in `Transport` to `session.pattern.bpm`.',
					'You can say why the meter’s level is never `$state`.',
					'You have read a `$inspect.trace` message and can say what it names.'
				]
			}
		]
	},

	{
		slug: 'panels-as-history',
		title: 'Panels that are history entries',
		summary:
			'A sheet on a phone, a sidebar on a desktop — one component, one `MediaQuery`. Opening it is `pushState`, closing it is the back button: shallow routing.',
		goal: 'Use `MediaQuery` to make one component behave two ways, and use `pushState` and `page.state` so that something covering the screen closes the way people expect.',
		blocks: [
			{
				type: 'p',
				text: 'The sound panel and the share panel cover part of the screen. On a phone they slide up from the bottom; on a desktop they slide in from the right. Same content, same props, and the difference is one reactive media query deciding which axis the transition uses.'
			},
			code('src/lib/studio/Sheet.svelte', 9, 33),
			code('src/lib/studio/Sheet.svelte', 47, 55),
			{
				type: 'p',
				text: '`new MediaQuery("min-width: 64rem")` is a `matchMedia` you can read in a template: `desktop.current` is true or false and changes when the window is resized. The `fly` transition’s options are chosen from it — `{ x: 320 }` for a sidebar, `{ y: 320 }` for a sheet — and `duration` is zero under reduced motion, from `prefersReducedMotion` in `svelte/motion`.'
			},
			{
				type: 'note',
				text: 'Mobile first, with `min-width` breakpoints: the default is the phone layout, and the desktop is the exception that a media query adds. The stylesheet below the component reads the same way — `.sheet` is a bottom sheet, `.sheet--side` overrides it.'
			},
			code('src/lib/studio/Sheet.svelte', 35, 44),
			{
				type: 'p',
				text: 'Focus goes to the close button when the sheet opens, and back to wherever it was when the sheet closes. An attachment is the right tool: it runs on mount with the element, and its return value runs on unmount. Escape closes it, through `<svelte:window onkeydown>`.'
			},
			{
				type: 'why',
				title: 'Why the sheet is not modal',
				text: 'A sound panel you have to close before you can hear the change is a panel nobody leaves open. The grid stays usable behind the sheet, the transport keeps playing, and turning the tone knob while a loop runs is the whole point. `role="dialog"` without `aria-modal` says exactly this to assistive technology: a dialog, and the page behind it is still there.'
			},
			{ type: 'h3', id: 'shallow-routing', text: 'Opening a panel is a history entry' },
			code('src/app.d.ts', 28, 39),
			code('src/routes/(app)/studio/+page.svelte', 97, 114),
			{
				type: 'p',
				text: 'Opening the sound panel pushes a history entry with `{ panel: "sound" }` in its state and *no change to the URL*. The back button — or a swipe on a phone — closes it, which is what a person expects of something that covers the screen. `page.state` is typed by `App.PageState` in `app.d.ts`, so `page.state.panel` is `"sound" | "share" | undefined` and nothing else.'
			},
			code('src/routes/(app)/studio/+page.svelte', 329, 337),
			{
				type: 'p',
				text: 'The template reads `page.state.panel` and shows the matching sheet. `close()` calls `history.back()` rather than clearing the state itself, so that closing with the button and closing with the back gesture are the same operation and leave the history the same shape.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `MediaQuery` gives you that a CSS media query does not.',
					'You can explain why opening a panel calls `pushState` and closing it calls `history.back()`.',
					'You can say where `App.PageState` is declared and what it does for `page.state`.'
				]
			}
		]
	},

	{
		slug: 'the-studio-page',
		title: 'The studio page',
		summary:
			'A universal `load` decides where the pattern comes from; the page builds the instrument, provides it through context, restores after hydration, snapshots across navigation, and wires the keyboard, the window and the body.',
		goal: 'Assemble the studio: read a `load` with four sources, know why a fresh visit restores in `onMount`, and use `snapshot`, `settled`, `{#key}`, `<svelte:boundary>` and `$inspect` for what they are for.',
		blocks: [
			{
				type: 'p',
				text: 'A pattern arrives at the studio four ways, and the `load` function is the list. A universal `load` — `+page.ts`, not `+page.server.ts` — runs on the server for the first visit and in the browser for every navigation after, and the remote query it calls behaves the same in both.'
			},
			code('src/routes/(app)/studio/+page.ts', 7, 62),
			{
				type: 'p',
				text: 'The fourth case is the interesting one. A fresh visit should show whatever this browser was working on last, and that lives in `localStorage`, which the server cannot read. A `load` that returned one thing on the server and another in the browser would hydrate to a mismatch. So `load` returns `null`, the server renders a preset, and the page swaps the saved session in *after* hydration.'
			},
			{
				type: 'note',
				text: 'The `as const` on each `source` is what makes `data.source` a union of five literal strings rather than `string`. The page then switches on it with the compiler checking that every case is spelled right.'
			},
			{ type: 'h3', id: 'the-instrument', text: 'Building the instrument' },
			code('src/routes/(app)/studio/+page.svelte', 24, 59),
			{
				type: 'p',
				text: 'The session, the engine, the sample bank and the scheduler are created once, at the top of the script. `setStudio` puts the three the rest of the tree needs into context (ch. 11): the sound panel is three components down and asks for the engine by calling `getStudio()`, and nothing in between knows.'
			},
			{
				type: 'why',
				title: 'Why `untrack(() => data)`',
				text: '`data` is a prop, and props are reactive: when a navigation changes the URL, `data` changes with it. The *first* pattern must be read exactly once, at creation, and never again — a later `data` change should not reload the session and throw away edits. `untrack` reads without subscribing. The `onMount` after it runs once the DOM exists, which is when `localStorage` can be read without the server disagreeing.'
			},
			{ type: 'h3', id: 'snapshot-and-effects', text: 'Snapshot, autosave, prune, inspect' },
			code('src/routes/(app)/studio/+page.svelte', 61, 91),
			{
				type: 'p',
				text: 'Four things, each in the place Svelte or SvelteKit provides for it. `snapshot` is SvelteKit’s: `capture` runs before the page is left and `restore` when the back button brings it back, and the value — the encoded pattern, a few hundred characters — is stored with the history entry. Go to the gallery, come back, and the pattern is where you left it.'
			},
			{
                                type: 'p',
				text: '`$effect(() => session.autosave())` is the root effect from chapter 14, wired in one line: the disposer it returns is this effect’s cleanup. `engine.prune` runs whenever the track list changes — a sync with an external system, the audio graph, which is what `$effect` is for. And `$inspect(...).with(...)` logs the tempo in development with a custom formatter that says *which* of the two values changed, which the default `console.log` does not.'
			},
			{ type: 'h3', id: 'settled', text: 'Presets and `settled()`' },
			code('src/routes/(app)/studio/+page.svelte', 120, 136),
			{
				type: 'p',
				text: 'Loading a preset replaces the pattern, which replaces the grid (the `{#key}` below), which creates a hundred new pads. Focusing the first pad *before* that has finished would focus a pad about to be removed. `settled()` resolves when the state change and everything it caused — the new rows, their transitions started — has reached the DOM. It is `await tick()` for a world with async in it.'
			},
			{ type: 'h3', id: 'the-keyboard', text: 'The keyboard, the window, the body' },
			code('src/routes/(app)/studio/+page.svelte', 142, 175),
			code('src/routes/(app)/studio/+page.svelte', 190, 197),
			{
				type: 'p',
				text: 'Three special elements, each for what it is the right listener for. `<svelte:window>` for the shortcuts, because a key press goes to the window when nothing is focused. `<svelte:document>` for `visibilitychange`, which is a document event. `<svelte:body>` for the pointer press that wakes the audio engine — browsers will not start audio without a gesture, and any press anywhere on the page counts, after which the space bar (not a gesture in every browser) works too.'
			},
			{ type: 'h3', id: 'the-grid-in-place', text: 'The grid, keyed and bounded' },
			code('src/routes/(app)/studio/+page.svelte', 282, 314),
			{
				type: 'p',
				text: '`{#key session.generation}` destroys and recreates its contents when the number changes: a whole new grid for a whole new pattern. Inside it, `<svelte:boundary>` catches a rendering error in the grid — a damaged pattern with a step missing, say — and shows the `failed` snippet with a “Try again” button instead of taking the page down. `onerror` sends the message to a toast as well.'
			},
			code('src/routes/(app)/studio/+page.svelte', 177, 187),
			code('src/routes/(app)/studio/+page.svelte', 259, 267),
			{
				type: 'p',
				text: '“Published 3s ago” needs a clock that ticks. `now` is a `SvelteDate`, updated by an interval; `session.savedAt` is another. Subtract one from the other in a `$derived.by` and the label re-renders every second, because reading a `SvelteDate` is tracked. A plain `Date` would show “0s ago” forever.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can list the four places a pattern comes from and say which one restores in `onMount` and why.',
					'You can say what `settled()` waits for and what would go wrong without it.',
					'You can explain what `{#key}` and `<svelte:boundary>` each protect against here.'
				]
			}
		]
	},

	{
		slug: 'sound-and-share',
		title: 'Sound in, patterns out',
		summary:
			'The sound panel: `bind:files`, a `DataTransfer` to clear it, a waveform drawn by an attachment factory. The share panel: a link, a WAV rendered speculatively with `fork`, `$effect.pending()`, media bindings, and a form with preflight validation.',
		goal: 'Use the bindings and primitives that only show up when a page does real work: files, media elements, `fork`, `$effect.pending`, `<select defaultValue>`, and a remote form with `preflight` and `enhance`.',
		blocks: [
			{
				type: 'p',
				text: 'Two panels, both opened as history entries (ch. 18). The sound panel edits one track: its instrument, its two knobs, and — for a sample track — the file it plays. The share panel is three ways out of the studio: a link, a file, and the gallery.'
			},
			{ type: 'h3', id: 'files', text: 'A file, in' },
			code('src/lib/studio/SoundPanel.svelte', 33, 61),
			code('src/lib/studio/SoundPanel.svelte', 131, 158),
			{
				type: 'p',
				text: '`bind:files` on `<input type="file">` gives a `FileList`. A `FileList` cannot be constructed, so clearing the input means assigning the `files` of an empty `DataTransfer` — the one way to make an empty one. The variable starts `undefined` rather than as an empty list because `DataTransfer` does not exist on the server, and this component is server-rendered with the rest of the page.'
			},
			code('src/lib/studio/waveform.ts', 16, 59),
			{
				type: 'p',
				text: '`{@attach waveform(samples.get(track.id), hue)}` — an attachment factory again (ch. 17). It draws the loudest sample per pixel column, sized from the canvas’s CSS box at draw time, and re-draws through a `ResizeObserver` when the sheet becomes a sidebar. When the buffer prop changes, Svelte re-runs the factory and the new attachment draws the new file.'
			},
			code('src/lib/studio/SoundPanel.svelte', 63, 97),
			{
				type: 'p',
				text: '“Audition” plays the sound once with the current knobs, without pressing play. It is the same `switch` as the scheduler’s (ch. 10), `satisfies never` and all, which is what guarantees that adding a kind to the model breaks this file at compile time until it is handled.'
			},
			{ type: 'h3', id: 'the-link', text: 'The link' },
			code('src/lib/studio/SharePanel.svelte', 31, 35),
			{
				type: 'p',
				text: '`session.encoded` is a getter over the whole pattern, so the link is a `$derived.by` that recomputes on every edit. Copy it, paste it into a chat, and the other person opens your groove — the studio’s `load` (ch. 19) decodes `?p=` on arrival.'
			},
			{ type: 'h3', id: 'fork', text: 'A WAV, rendered before the click' },
			code('src/lib/studio/SharePanel.svelte', 168, 199),
			{
				type: 'p',
				text: 'Two small things first. `<select defaultValue="2">` is the element *uncontrolled* with a starting value — new in Svelte 5.57 — and only the change handler reads it. And the render button has five handlers: pointer enter and focus start something; pointer leave and focus out cancel it; click commits it.'
			},
			code('src/lib/studio/SharePanel.svelte', 50, 80),
			{
				type: 'why',
				title: 'Why `fork`',
				text: 'Rendering two bars through an `OfflineAudioContext` (ch. 13) takes a few hundred milliseconds. `fork` runs a state change *speculatively*: `wanted = true` happens in a fork, the `await render(bars)` it unlocks in the markup below starts immediately, but nothing is shown until the fork is committed. Hover the button and the render begins; click and it is already half done; leave and `discard()` throws the work away — which it must, or the fork leaks. This is the same primitive SvelteKit uses to preload pages on hover, exposed for your own state.'
			},
			code('src/lib/studio/SharePanel.svelte', 82, 105),
			code('src/lib/studio/SharePanel.svelte', 201, 241),
			{
				type: 'warn',
				text: '`{const rendered = $derived(await render(bars))}` — with the `$derived`. A bare `{const x = await …}` in markup runs *once*; wrapped in `$derived` it re-runs when `bars` changes, which is the whole feature. This distinction cost an afternoon during the jam room (ch. 38), and it appears here first: when an `await` in a template should follow its inputs, it needs `$derived` around it.'
			},
			{
				type: 'p',
				text: '`$effect.pending()` counts the `await`s in flight in this boundary after the first render — changing the bar count re-renders, and the “Re-rendering 4 bars…” line is what says so while it happens. The `pending` snippet covers the *first* render, the `failed` snippet a thrown error, with `reset` to try again. And `bind:paused`, `bind:currentTime` and `bind:duration` on the `<audio>` make a play button and a clock with no event handlers at all.'
			},
			{ type: 'h3', id: 'publishing', text: 'Publishing: a form with preflight' },
			code('src/lib/studio/SharePanel.svelte', 111, 145),
			{
				type: 'p',
				text: '`publish` is a remote form function (ch. 24). `.preflight(schema)` checks the fields in the browser before anything is sent — which is what makes “three to twenty characters” appear on the keystroke rather than after a round trip — and the schema must describe the *whole* input, including the fields the server alone judges, which is why `_pattern`, `remixOf` and `action` are typed here but barely checked. `.enhance()` takes over the submission: `submit()` resolves `true` on success, the handler’s return value is on `publish.result`, and the page never reloads.'
			},
			code('src/lib/studio/SharePanel.svelte', 252, 282),
			{
				type: 'p',
				text: 'Validate on every keystroke *and* on blur. SvelteKit only reports issues for fields a person has finished with — it marks a field touched on `focusout` — so the blur is what turns a rule into a message under the field. The handle input sits in its own `<svelte:boundary>` with `{const me = $derived(await whoAmI())}` so that a browser that already has a handle sees it filled in, and one that does not sees a placeholder while the query is in flight.'
			},
			code('src/lib/studio/SharePanel.svelte', 304, 319),
			{
				type: 'p',
				text: 'Two submit buttons, one field: `publish.fields.action.as("submit", "stay")` and `as("submit", "open")`. Whichever is pressed sends its value as `action`, and the server either returns the result or redirects to the new page — a redirect from inside an enhanced submission navigates, since SvelteKit 3.0.0-next.17. With JavaScript off, the form posts, the hidden `_pattern` field carries the JSON, and everything still works.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can say what `fork` does, and what happens if a fork is never committed or discarded.',
					'You can explain why `preflight` covers fields the browser does not validate.',
					'You can say why the handle input is inside a boundary with a `pending` snippet.'
				]
			}
		]
	}
];
