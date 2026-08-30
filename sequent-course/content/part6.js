/**
 * PART 6 — The screens (chapters 34–38)
 *
 * Mobile first on a screen designed for six monitors, two bugs that only a real
 * browser could find, and a motion system whose defining feature is how little
 * of it there is.
 */

export const part6 = [
	{
		slug: 'mobile-first-for-real',
		title: 'Mobile first, for real',
		summary:
			'Designing a trading terminal for a 390px phone first — and the flex default that gives half the web a horizontal scrollbar.',
		goal: 'Build a layout that works at 390px before it works at 1440px, and know why it usually does not.',
		blocks: [
			{
				type: 'p',
				text: 'A trading terminal is the least mobile-looking software there is. Six monitors, dense grids, forty numbers on screen at once. Which is exactly why building it phone-first is worth doing: if the discipline survives here, it survives anywhere.'
			},
			{
				type: 'why',
				title: 'Mobile first is not about phones',
				text: 'It is about deciding what matters. A 390px screen cannot show everything, so you have to rank — and that ranking is *true on every screen*. The desktop version of a page designed phone-first has a clear hierarchy because it was forced to have one. The phone version of a page designed desktop-first is whatever was left after the columns were thrown away.'
			},

			{ type: 'h3', id: 'breakpoints', text: 'Breakpoints from content, not devices' },
			{
				type: 'code',
				file: 'apps/web/src/lib/styles/app.css',
				lang: 'css',
				code: `
/* Base styles: the phone. No media query. */

@media (min-width: 48rem) {
	/* 768px — a tablet, or a phone turned sideways. */
}

@media (min-width: 64rem) {
	/* 1024px — a laptop. Where the terminal gets its side-by-side layout. */
}`
			},
			{
				type: 'ul',
				items: [
					'**`min-width`, never `max-width`.** Base styles are the small screen; each query *adds* as room appears. Written the other way round, every rule needs an override and the cascade fights you.',
					'**`rem`, not `px`.** A person who has set their browser font to 20px gets breakpoints that scale with it. In `px` they get a layout that switches at the wrong moment for their text size.',
					'**Two breakpoints.** Not five. Every extra one is a layout somebody has to check, and this app only genuinely has three shapes: one column, two columns, and the full desk.'
				]
			},

			{ type: 'h3', id: 'the-bug', text: 'The page that scrolled sideways' },
			{
				type: 'p',
				text: 'The terminal was checked at 390px in a real browser. It scrolled sideways by 122 pixels. Every panel measured correctly — `getBoundingClientRect` on every child was inside its parent — and the page still scrolled.'
			},
			{
				type: 'p',
				text: 'There were two independent causes. Here is the first.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/styles/app.css',
				lang: 'css',
				code: `
.card {
	/*
	 * \`min-inline-size: 0\`, and it is not cosmetic.
	 *
	 * A flex or grid item's \`min-width\` defaults to \`auto\`, which resolves to its
	 * **min-content** size — the narrowest it can be without its contents
	 * overflowing. So an item containing a 512px-wide table refuses to be
	 * narrower than 512px, however narrow its container is, and the page gains a
	 * horizontal scrollbar on a 390px phone.
	 *
	 * The maddening part is that the table is inside \`.scroller\`, which has
	 * \`overflow-x: auto\` and exists precisely to absorb this. It never gets the
	 * chance: its parent has already grown to fit, so there is nothing to scroll.
	 */
	min-inline-size: 0;
}`
			},
			{
				type: 'warn',
				text: 'This is the single most common cause of "why does my page scroll sideways on mobile", and it is invisible in devtools because **every element looks like it is behaving.** Nothing is overflowing its parent. The parents simply grew.'
			},
			{
				type: 'p',
				text: 'The rule to carry: **any flex or grid item that contains something wide needs `min-inline-size: 0`.** Tables, `<pre>` blocks, long unbroken strings, images without `max-width`. The default of `auto` is right for a button and wrong for a container.'
			},
			{
				type: 'note',
				text: '`min-inline-size` rather than `min-width` because the whole stylesheet uses logical properties — `inset-inline-start` instead of `left`, `padding-block` instead of `padding-top`. On an English-language exchange this changes nothing today, and it means a right-to-left locale is a `dir="rtl"` attribute rather than a stylesheet rewrite.'
			},

			{ type: 'h3', id: 'tap-targets', text: 'Two tap-target sizes, and why' },
			{
				type: 'p',
				text: 'WCAG 2.5.5 (AAA) asks for 44×44 pixels. WCAG 2.5.8 (AA) asks for 24×24. Most guidance says "use 44" and stops. On a dense screen that guidance is wrong, and it is worth understanding why before ignoring it.'
			},
			{
				type: 'p',
				text: 'Forcing every inline "Cancel" in a table row to 44px makes a ten-row order blotter taller than a phone screen. The trader then has to scroll to see the orders the blotter exists to show. You have improved one accessibility number by damaging the thing the page is for.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/styles/app.css',
				lang: 'css',
				code: `
.link {
	background: none;
	border: none;
	padding: 0;
	min-block-size: auto;
	color: var(--accent);
	text-decoration: underline;
	position: relative;
}

@media (pointer: coarse) {
	.link::after {
		content: '';
		position: absolute;
		/* Grows the hit area to ~44px without growing the box to ~44px. */
		inset-block: -12px;
		inset-inline: -6px;
	}
}`
			},
			{
				type: 'p',
				text: 'The rule this settles on: **standalone controls get 44px** — buttons, inputs, nav, anything that is the reason you tapped. **Inline actions inside a dense row get 24px plus an invisible expander**, which meets AA and, because the expander is a pseudo-element, does not change the row\'s height at all.'
			},
			{
				type: 'why',
				title: 'Why the expander is behind a media query',
				text: '`@media (pointer: coarse)` means "the primary input is a finger". A mouse is precise enough not to need the expander, and on a desktop the invisible boxes would **overlap between adjacent rows** — so the row above would steal clicks meant for the row below. An accessibility improvement that creates a click-stealing bug on desktop is not an improvement.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/styles/app.css',
				lang: 'css',
				code: `
/* Visible to a screen reader, invisible to everyone else. Never display:none —
   that would make it unfocusable and unread. */
.sr-only {
	position: absolute;
	inline-size: 1px;
	block-size: 1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}`
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why `min-width: auto` on a flex item causes horizontal scroll',
					'You can explain why an `overflow-x: auto` wrapper does not save you from it',
					'You can justify a 24px tap target with an expander over a 44px box',
					'You can explain why the expander is only applied under `pointer: coarse`'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'tables-that-are-measurements',
		title: 'Tables that are measurements',
		summary:
			'Why restacking a table into cards destroys it, and the sticky-position overflow bug that took a browser to find.',
		goal: 'Make a dense table usable on a phone without throwing away the reason it is a table.',
		blocks: [
			{
				type: 'p',
				text: 'The popular answer to "table on mobile" is to restack each row as a labelled card. Every value survives. It is the right pattern about half the time, and this venue is the other half.'
			},
			{
				type: 'why',
				title: 'Records versus measurements',
				text: 'A row that is a **record** — an invoice, a booking, a customer — is read across. Restacking it loses nothing. A row that is a **measurement** — five accounts\' positions, ten orders\' fill ratios — is read **down a column**, and that vertical comparison is the entire reason the data is in a table. Restack it and the numbers no longer line up under each other, so the comparison is gone while every value is technically still on screen.'
			},
			{
				type: 'p',
				text: 'So these scroll sideways instead, with the identifying column pinned.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/styles/app.css',
				lang: 'css',
				code: `
.scroller {
	overflow-x: auto;
	margin-block-start: var(--space-2);
	/* Stops a sideways swipe at the edge from scrolling the page behind it. */
	overscroll-behavior-x: contain;
	/* Same reason as \`.card\`: without this the scroller itself can be forced
	   wide by its table when it is a flex or grid item. */
	min-inline-size: 0;
}

.scroller:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.scroller table { inline-size: 100%; border-collapse: collapse; min-inline-size: 32rem; }

/* The pinned column, so scrolling sideways never loses the row's identity. */
.scroller .pin {
	position: sticky;
	inset-inline-start: 0;
	background: var(--surface);
	z-index: 1;
}

@media (min-width: 48rem) {
	.scroller table { min-inline-size: 0; }
	.scroller .pin { position: static; }
}`
			},
			{
				type: 'ul',
				items: [
					'**`overscroll-behavior-x: contain`** — swiping past the end of the table stops there instead of dragging the page behind it. Without it, a horizontal scroller inside a page feels broken on iOS.',
					'**`:focus-visible` on the scroller** — a horizontal scroll region must be reachable by keyboard, and a focus ring is what tells somebody they can now use the arrow keys.',
					'**The 48rem query undoes it all.** On a laptop the table fits, so the pin becomes `static` and the minimum width goes away. The mobile treatment is not carried up to a screen that does not need it.'
				]
			},

			{ type: 'h3', id: 'the-second-cause', text: 'The 122 pixels that were not there' },
			{
				type: 'p',
				text: 'After `min-inline-size: 0` was added everywhere it belonged, the page **still** scrolled sideways. Less — 122px instead of 220px — but still.'
			},
			{
				type: 'p',
				text: 'Every element measured correctly. Nothing overflowed anything. The only way to observe the problem was to actually try scrolling the page in a browser, which is precisely why an automated check that measures element boxes would never have found it.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/styles/app.css',
				lang: 'css',
				code: `
.card {
	/*
	 * The second most common cause, which took a browser to find.
	 *
	 * A \`position: sticky\` cell inside a horizontally scrolling container
	 * contributes its **sticky-shifted** position to scrollable overflow, and
	 * that overflow propagates all the way up to the document. So the pinned
	 * first column of a table that scrolls 220px sideways adds 220px of
	 * scrollable width to the *page*, even though the table itself is correctly
	 * clipped and nothing is visibly out of place.
	 */
	overflow-x: clip;
	overflow-clip-margin: 4px;
	overflow-y: visible;
}`
			},
			{
				type: 'p',
				text: 'The pinned column does its job by shifting right as you scroll. That shifted position counts as scrollable overflow, and scrollable overflow propagates up through every ancestor to the document. The table is clipped; the *page* is not.'
			},
			{
				type: 'warn',
				text: '`clip` and not `hidden`. `overflow: hidden` makes an element a **scroll container**, which breaks the `position: sticky` it was meant to protect and gives the card its own scrollbar. `clip` just clips, with no scroll container and no side effects. `overflow-clip-margin: 4px` lets focus rings and the tap-target expanders bleed a few pixels instead of being shaved off at the border.'
			},

			{ type: 'h3', id: 'the-exception', text: 'The overflow rule nobody remembers' },
			{
				type: 'code',
				file: 'apps/web/src/lib/styles/app.css',
				lang: 'css',
				code: `
	/*
	 * Stated explicitly, because the computed value is not what you would guess.
	 *
	 * CSS says that when one axis is \`visible\` and the other is not, the
	 * \`visible\` one computes to \`auto\` — which would silently turn every card
	 * into a vertical scroll container. \`clip\` is the single exception: paired
	 * with \`clip\`, \`visible\` stays \`visible\`.
	 *
	 * Relying on an exception without writing it down is how the next person
	 * "tidies" this to \`overflow: hidden\` and gives forty panels their own
	 * scrollbar.
	 */
	overflow-y: visible;`
			},
			{
				type: 'p',
				text: 'This is the one combination in CSS where `visible` survives being paired with a non-`visible` value on the other axis. `overflow-x: hidden; overflow-y: visible` gives you `overflow-y: auto` whether you like it or not. `overflow-x: clip; overflow-y: visible` gives you what you wrote.'
			},
			{
				type: 'note',
				text: 'Writing `overflow-y: visible` explicitly is redundant to the browser and essential to the next reader. A comment explaining a spec exception is worth more than the line it explains — without it, this is exactly the kind of "obviously redundant" declaration somebody deletes in a tidy-up commit.'
			},
			{
				type: 'why',
				title: 'What actually found both of these',
				text: 'A real browser at 390px, 768px and 1440px, with a check that compared `document.documentElement.scrollWidth` against `clientWidth`. Not a unit test, not a screenshot diff, not a component story. Two of the most user-visible bugs in this project were invisible to every form of testing except opening the page.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can decide between restacking and side-scrolling from what a row *is*',
					'You can explain how a sticky cell adds scrollable width to the whole document',
					'You can explain why `clip` and `hidden` are not interchangeable here',
					'You can state the one case where `overflow: visible` does not compute to `auto`'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'motion-that-means-something',
		title: 'Motion that means something',
		summary:
			'A motion system whose defining feature is how little of it there is — and the reveal that made the app unusable for 800ms.',
		goal: 'Animate a trading screen without ever making somebody wait.',
		blocks: [
			{
				type: 'p',
				text: 'A marketing page animates to persuade: a headline can afford to arrive in pieces over 1.2 seconds, because feeling something is the point. This screen is stared at for nine hours by somebody whose attention is the scarcest resource in the building, and every pixel that moves without meaning is a false alarm.'
			},
			{
				type: 'why',
				title: 'The rule',
				text: '**Nothing moves unless the movement is the message.** A price that flashes green flashed *because it went up*, and a trader reads that flash faster than they can read the number. A tape entry that slides in from the top is telling you it is new. A bar that eases to its new width lets you watch liquidity being eaten rather than teleporting. Every one of those is data arriving through a channel that does not require reading.'
			},
			{
				type: 'p',
				text: 'What is banned, explicitly: entrance animations on data, parallax, anything that delays a number appearing, anything that runs on a loop.'
			},
			{
				type: 'p',
				text: 'The restraint is not timidity — it is **budgeting**. Three moments in this app are genuinely cinematic, and they earn it by being rare and consequential: signing in, an instrument opening, and the kill switch. Those get the full treatment, and they land precisely because nothing else does.'
			},

			{ type: 'h3', id: 'why-gsap', text: 'Why GSAP and not CSS' },
			{
				type: 'p',
				text: 'Most of what follows could be a CSS transition, and where it can be, it is — a hover state has no business in JavaScript. GSAP earns its place for three things CSS cannot do:'
			},
			{
				type: 'ul',
				items: [
					'**Interrupting cleanly.** A price that ticks three times in 200ms needs the second flash to take over from the first *mid-flight, from wherever it got to*. A CSS animation restarts from the beginning, which produces a visible stutter exactly when the market is busiest.',
					'**Sequencing.** A timeline coordinating six elements with overlapping offsets is a paragraph in GSAP and an unmaintainable pile of `animation-delay` in CSS.',
					'**Animating what CSS cannot.** Counting a number from one value to another is not a CSS property.'
				]
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/motion/motion.svelte.ts',
				lang: 'ts',
				code: `
/*
 * \`power2.out\` for almost everything: fast at the start, settling at the end.
 * That is what physical objects do, and it is what makes an interface feel
 * responsive — the movement has visibly *begun* within a frame or two of the
 * click, even if it takes 300ms to finish.
 *
 * \`power2.in\` — slow start, fast finish — is what things do when they fall, and
 * on a button press it reads as lag.
 */
gsap.defaults({ ease: 'power2.out', duration: 0.35 });

export const DURATION = {
	/** A flash, a state change, a colour. Barely perceptible as motion. */
	instant: 0.12,
	/** The default. Panels, rows, bars. */
	quick: 0.35,
	/** A panel entering, a sheet sliding up. */
	settled: 0.55,
	/** Sign-in, market open, kill switch. Three places, and no more. */
	cinematic: 1.1
} as const;`
			},
			{
				type: 'p',
				text: 'The numbers are not arbitrary. Below about 100ms a change reads as a jump rather than a movement, and the eye cannot follow where anything went. Above about 400ms an interface starts to feel like it is thinking, and the person starts to feel like they are waiting.'
			},

			{ type: 'h3', id: 'the-bug', text: 'The reveal that made the app unusable' },
			{
				type: 'p',
				text: 'The first version staggered every panel in on load: 0.6s each, delayed 0.1s apart, six panels. It looked lovely. It also meant that for roughly 800 milliseconds after the page appeared, panels were mid-flight — and a GSAP `from` tween sets `opacity: 0` and a transform, so elements were **visible but not yet where they would end up**. Clicks landed in the wrong place or on nothing at all.'
			},
			{
				type: 'p',
				text: 'On a marketing page that is a slightly slow-feeling entrance. On an order ticket it is a control that does not respond for most of a second, which is a control that can cost money.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/motion/motion.svelte.ts',
				lang: 'ts',
				code: `
const REVEAL_BUDGET = 0.45;

export function reveal(options: RevealOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		const { distance = 10 } = options;

		// Delay and duration are clamped together, so adding a seventh panel to a
		// staggered page cannot quietly push the last one past the budget.
		const delay = Math.min(options.delay ?? 0, REVEAL_BUDGET * 0.5);
		const duration = Math.min(options.duration ?? DURATION.quick, REVEAL_BUDGET - delay);

		if (prefersReducedMotion()) {
			// Nothing to do: the element is already where it should be, and it has no
			// starting style to undo, because \`from\` sets that rather than the CSS.
			return;
		}

		const tween = gsap.from(node, {
			opacity: 0,
			y: distance,
			duration,
			delay,
			clearProps: 'transform,opacity,willChange',
			onStart: () => (node.style.willChange = 'transform, opacity')
		});

		return () => {
			tween.kill();
			node.style.willChange = '';
		};
	};
}`
			},
			{
				type: 'ul',
				items: [
					'**The budget is enforced in code, not in a comment.** `delay + duration` can never exceed 450ms, so a future person adding a seventh panel cannot quietly break the guarantee.',
					'**The order ticket has no reveal at all.** Not a shorter one — none. It is the one control somebody might need to reach in the first half-second.',
					'**`will-change` is set for the duration and removed after.** Leaving it on permanently promotes the element to its own compositor layer forever, which on a page with forty of them costs more memory than the animation ever saved.'
				]
			},

			{ type: 'h3', id: 'attachments', text: 'Why these are attachments, not actions' },
			{
				type: 'p',
				text: 'An earlier version of this file exported Svelte *actions* returning `{ update, destroy }`. The official `use:` docs now mark that return shape as legacy — "prior to the `$effect` rune, actions could return an object with `update` and `destroy` methods; using effects is preferred" — and recommend attachments outright for 5.29 and newer. An attachment is a function that runs in an effect when its element mounts and may return a cleanup, which is why `reveal` above ends with `return () => …` instead of a `destroy` method.'
			},
			{
				type: 'p',
				text: 'Used from the template as `{@attach reveal({ delay: 0.05 })}` instead of `use:reveal={{ delay: 0.05 }}`. The file is `motion.svelte.ts` rather than `motion.ts` for the same reason: the `.svelte.ts` suffix is what lets a shared module use runes.'
			},
			{
				type: 'why',
				title: 'The getter pattern, for the two that react',
				text: 'Attachments are fully reactive: `{@attach flash(directionFor(level))}` would read `level` while the expression is evaluated, and the docs are explicit that the attachment is then torn down and recreated on every change — killing the tween continuity the flash exists for. The documented fix is to pass the value **as a function** and read it inside a child `$effect`: `{@attach flash(() => directionFor(level))}`. The per-node setup runs once; only the effect re-runs when the level changes. `flash`, `count` and the ladder\'s `bar` all use this shape.'
			},

			{ type: 'h3', id: 'reduced-motion', text: 'What "reduce" actually means' },
			{
				type: 'code',
				file: 'apps/web/src/lib/motion/motion.svelte.ts',
				lang: 'ts',
				code: `
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return true;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}`
			},
			{
				type: 'p',
				text: 'Checked live rather than read once, because it can change while the page is open — somebody toggling it in system settings expects the page to obey without a reload. And `true` on the server, because server-rendered markup must not assume animation.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/motion/motion.svelte.ts',
				lang: 'ts',
				code: `
if (prefersReducedMotion()) {
	/*
	 * The signal survives; the movement does not.
	 *
	 * Somebody who asked for reduced motion still needs to know the price
	 * moved. Removing the flash entirely would remove *information* under
	 * the guise of removing animation, which is the usual way this
	 * preference gets implemented badly.
	 */
	node.style.backgroundColor = colourFor(value);
	setTimeout(() => (node.style.backgroundColor = ''), 900);
	return;
}`
			},
			{
				type: 'why',
				title: 'Reduce movement, not information',
				text: 'The common implementation of `prefers-reduced-motion` is "turn animations off", and it usually makes an interface *worse* for the people who asked for it. Here the reduced path keeps the colour change and drops the travel: the signal survives, the vestibular trigger does not. Same rule in `sweep()` — a brief static wash instead of a band crossing the field of view.'
			},

			{ type: 'h3', id: 'two-details', text: 'Two details worth stealing' },
			{
				type: 'code',
				file: 'apps/web/src/lib/motion/motion.svelte.ts',
				lang: 'ts',
				code: `
gsap.fromTo(
	node,
	{ backgroundColor: colourFor(value) },
	{
		backgroundColor: 'rgba(0,0,0,0)',
		duration: 0.9,
		ease: 'power1.out',
		overwrite: 'auto',
		clearProps: 'backgroundColor'
	}
);`
			},
			{
				type: 'p',
				text: '`overwrite: \'auto\'` is what makes a fast market look right. A price ticking three times in 200ms gets three flashes; without overwrite they queue and fight, and the cell ends up a colour that corresponds to nothing. With it, each new flash takes over from wherever the last one had got to.'
			},
			{
				type: 'code',
				file: 'apps/web/src/lib/motion/motion.svelte.ts',
				lang: 'ts',
				code: `
gsap.to(state, {
	value,
	duration: duration ?? DURATION.quick,
	ease: 'power2.out',
	overwrite: true,
	snap: { value: 1 },
	onUpdate: () => (node.textContent = format(state.value))
});`
			},
			{
				type: 'p',
				text: '`snap: { value: 1 }` on the counting animation. Without it, a position animating from 100 to 250 renders `137.4821` for a frame — a share count with a fractional part, which on this venue is not a rounding artefact but a lie about what the number means.'
			},
			{
				type: 'note',
				text: '`flash` is deliberately **not** run on mount. A page that loads with forty prices flashing says "forty things just happened", and nothing happened at all. The same guard as `seenPhase !== null` in Part 4: arriving at a state is not the state changing.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can state the rule that decides whether something animates',
					'You can explain the three things GSAP does here that CSS cannot',
					'You can explain what a reveal budget prevents, and why the ticket has none',
					'You can explain why reduced motion keeps the colour and drops the travel'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'the-depth-ladder',
		title: 'The depth ladder',
		summary:
			'The one component with a real performance problem — and why the obvious optimisation solves the wrong half of it.',
		goal: 'Render a book that updates many times a second without dropping frames.',
		blocks: [
			{
				type: 'p',
				text: 'The ladder shows ten price levels a side, the size resting at each, and a bar whose length is that size relative to the deepest level on screen. It is the component a trader looks at most, and the only one in this project with a genuine performance problem.'
			},
			{
				type: 'why',
				title: 'The obvious answer solves the wrong half',
				text: 'The reflex is "virtualise it" — only render the rows on screen. That matters for a list of ten thousand orders and does **nothing** here, because a ladder shows twenty rows total. The actual cost is **update rate**, not row count: the same twenty rows re-rendering many times a second.'
			},
			{
				type: 'p',
				text: 'Three things keep that cheap, in the order they matter.'
			},

			{ type: 'h3', id: 'coalesce', text: '1. The server coalesces' },
			{
				type: 'p',
				text: 'From Part 4: `watchMarket` drains every waiting event and yields **one** snapshot, so the component is asked to update once per batch rather than once per trade.'
			},
			{
				type: 'p',
				text: 'That is the biggest win by a wide margin, and it does not happen in this component at all. **The fastest render is the one nobody asked for.** Whenever a component seems to need optimising, check first whether something upstream is asking it to work more often than the data actually changes.'
			},

			{ type: 'h3', id: 'keyed', text: '2. Keyed by price' },
			{
				type: 'code',
				lang: 'svelte',
				code: `
{#each levels as level (level.price)}
	<tr>…</tr>
{/each}`
			},
			{
				type: 'p',
				text: 'The key is `level.price`, not the index. A level that survives an update keeps its DOM node, and Svelte writes only the numbers that changed. Keyed by index, every row\'s text would be rewritten whenever a level appeared or vanished at the top of the book — which is most updates, since the top of the book is where all the action is.'
			},
			{
				type: 'note',
				text: 'Keying by index is not merely slower — it is *wrong* here. The flash animation is attached to a DOM node. Key by index and when a new best bid appears, every node shifts down one level while keeping its identity, so the flash fires on the wrong row.'
			},

			{ type: 'h3', id: 'transform', text: '3. The bar is a transform, not a width' },
			{
				type: 'p',
				text: 'Changing `width` on twenty elements is twenty layout invalidations per frame. `transform: scaleX()` is handled by the compositor and never touches layout at all.'
			},
			{
				type: 'ul',
				items: [
					'**Layout** — the browser recalculates where things are. Expensive, and it cascades to siblings.',
					'**Paint** — the browser redraws pixels. Cheaper.',
					'**Composite** — the browser moves an already-drawn layer. Nearly free, and it can happen off the main thread.'
				]
			},
			{
				type: 'p',
				text: '`transform` and `opacity` are the two properties that can stay in the composite step. Everything else drags you back up the list. That is the whole reason `reveal()` animates `y` rather than `top`, and why the depth bars scale rather than resize.'
			},

			{ type: 'h3', id: 'one-scale', text: 'One scale for both sides' },
			{
				type: 'code',
				file: 'apps/web/src/lib/components/DepthLadder.svelte',
				lang: 'svelte',
				code: `
/**
 * The scale for the depth bars.
 *
 * Both sides share one maximum, so a bar's length is comparable across the
 * spread. Scaling each side to its own maximum would make a thin bid side
 * look as deep as a heavy ask side — a chart that is technically accurate
 * and actively misleading, which is the worst kind.
 */
const largest = $derived(
	Math.max(1, ...bids.map((level) => level.quantity), ...asks.map((level) => level.quantity))
);`
			},
			{
				type: 'p',
				text: 'This is not a performance decision, it is an honesty one, and it belongs in the same file because it is the same kind of care. A ladder exists to let somebody see imbalance at a glance. Normalising each side independently deletes exactly the signal the component is for, while every individual number on screen remains correct.'
			},

			{ type: 'h3', id: 'non-reactive', text: 'The Map that is deliberately not $state' },
			{
				type: 'code',
				file: 'apps/web/src/lib/components/DepthLadder.svelte',
				lang: 'svelte',
				code: `
/**
 * What each level's size was last time we drew it.
 *
 * A plain \`Map\`, deliberately **not** \`$state\`. Nothing reads it during
 * render — it exists only so \`directionFor\` can compare — and making it
 * reactive would create a dependency cycle: reading it in the template makes
 * the template depend on it, and writing it during that same render
 * invalidates the template that just read it.
 */
const lastSeen = new Map<number, number>();`
			},
			{
				type: 'why',
				title: 'Not everything in a component is state',
				text: 'Runes make it very easy to reach for `$state` reflexively. The test is: **does the template need to re-run when this changes?** Here the answer is no — the Map exists so the component can tell whether a size went up or down, and the answer to that question is already carried by the new props. Making it reactive would build a loop out of a variable that has no business being in the graph at all.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why virtualisation is the wrong optimisation for this component',
					'You can explain why keying by price rather than index is a correctness issue, not just speed',
					'You can name the three rendering steps and which properties stay in the cheapest one',
					'You can explain why both sides of the ladder share one scale'
				]
			}
		]
	},

	/* ---------------------------------------------------------------------- */

	{
		slug: 'live-screens-and-the-stale-phase',
		title: 'Live screens, and the stale phase',
		summary:
			'The bug where a refresh returned the old answer — and why the fix was to stop refreshing.',
		goal: 'Understand when refresh() is enough and when only a live query will do.',
		blocks: [
			{
				type: 'p',
				text: 'The venue console has a button that opens an instrument for trading. An operator presses it, and the phase badge on screen should change from `auction` to `continuous`.'
			},
			{ type: 'p', text: 'It did not. It stayed on `auction` until you reloaded the page.' },

			{ type: 'h3', id: 'the-code', text: 'The code that looked right' },
			{
				type: 'code',
				lang: 'ts',
				code: `
export const setPhase = command(schema, async (input) => {
	const viewer = requireViewer();
	await submit(viewer, { kind: 'change_phase', ...input });

	// Tell the console to re-read.
	void getVenue().refresh();
});`
			},
			{
				type: 'p',
				text: 'That is the pattern from Part 4, and it is correct everywhere else in this app. Here it produced a screen that showed the wrong thing while reporting success.'
			},

			{ type: 'h3', id: 'why', text: 'Why it could not work' },
			{
				type: 'p',
				text: 'Look at what `submit` actually does. It appends a **command** to the log and returns the sequence number. That is all. The command has not been applied yet — the engine is a separate process, and it will pick the command up on its next poll, run it through the matching engine, and append the resulting `phase_changed` **event**.'
			},
			{
				type: 'p',
				text: 'So `refresh()` fires immediately, the query re-reads the projections, and the projections faithfully report the phase as it was — because it still is. The refresh worked perfectly. It was asking a question whose answer had not changed yet.'
			},
			{
				type: 'why',
				title: 'The gap is the architecture, not a bug in it',
				text: 'Every command in this system is asynchronous by design. That is what buys deterministic replay, a single ordering, and a venue that can be rebuilt from its log. The cost is that "I sent it" and "it happened" are two different moments, and any UI that conflates them will eventually show somebody a lie. You cannot patch this with a `setTimeout` — you have to build the screen around it.'
			},

			{ type: 'h3', id: 'the-fix', text: 'The fix: stop asking, start listening' },
			{
				type: 'code',
				file: 'apps/web/src/routes/admin/admin.remote.ts',
				lang: 'ts',
				code: `
/**
 * The venue's instruments and their phases, streamed.
 *
 * A plain \`query\` plus \`refresh()\` cannot work here: \`submit\` appends a
 * *command*, and the phase does not change until the engine applies it and
 * writes the resulting event. A refresh fired straight after the command
 * re-reads the old value and reports success.
 *
 * Tailing the log means the console updates when the phase *actually* changes,
 * which is both correct and — usefully — honest: an operator watching the badge
 * is watching the engine, not their own click.
 */
export const getVenue = query.live(v.object({}), async function* () {
	requireOperator();
	const { request } = getRequestEvent();

	yield await venueSnapshot();

	for await (const batch of tailEvents(db, await currentSeq(), { signal: request.signal })) {
		if (batch.some((record) => record.kind === 'phase_changed')) {
			yield await venueSnapshot();
		}
	}
});`
			},
			{
				type: 'p',
				text: 'The command no longer refreshes anything. It appends and returns. The badge changes when the engine says so, which may be forty milliseconds later or, if the engine is down, not at all — and "not at all" is information the operator badly needs.'
			},

			{ type: 'h3', id: 'when-which', text: 'When refresh is enough' },
			{
				type: 'p',
				text: 'The rule that came out of this:'
			},
			{
				type: 'ul',
				items: [
					'**`refresh()`** when the command\'s effect is complete by the time it returns. Creating an API key, adding a webhook endpoint, setting a feature flag — these write directly to a table, so the next read sees them.',
					'**`query.live`** when the command goes through the log. Placing an order, cancelling, changing a phase, hitting the kill switch — the effect arrives later, from another process.'
				]
			},
			{
				type: 'p',
				text: 'The test is not "does this change often?" — it is **"who writes the value I am about to read, and have they finished?"**'
			},
			{
				type: 'note',
				text: 'Note that the order blotter *does* use `refresh()`, and correctly: `order_record` gets an `accepted` row from the gateway path, so there is something true to show immediately. The blotter shows "working" and then transitions when the engine\'s events land — two stages, both honest, neither pretending.'
			},

			{ type: 'h3', id: 'the-test-trap', text: 'The test that could never pass' },
			{
				type: 'p',
				text: 'One more trap, from testing this page in a browser:'
			},
			{
				type: 'code',
				lang: 'ts',
				code: `
// Hangs forever. Every time.
await page.goto('/terminal');
await page.waitForLoadState('networkidle');`
			},
			{
				type: 'warn',
				text: '`networkidle` waits for 500ms with no network activity. A page with a `query.live` connection has an **open, deliberately long-lived request** for as long as the page exists. The condition is never satisfied, and the failure is a timeout with no explanation.'
			},
			{
				type: 'p',
				text: 'Wait for the thing you actually care about instead — a selector, a row count, a piece of text. Which is better practice anyway: `networkidle` is a proxy for "the page is ready", and proxies are exactly what break when the architecture changes underneath them.'
			},
			{
				type: 'checkpoint',
				items: [
					'You can explain why `refresh()` returned a stale phase without failing',
					'You can state the rule for choosing between `refresh()` and `query.live`',
					'You can explain why the blotter\'s refresh is correct and the console\'s was not',
					'You know why `networkidle` never fires on a page with a live query'
				]
			}
		]
	}
];
