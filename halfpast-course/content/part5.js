/**
 * PART 5 — The interface (chapters 24–29)
 *
 * A design system in vanilla CSS, then the four screens that use it: the public
 * booking flow, the customer's own page, the live diary, and the owner's
 * settings. Mobile first throughout — every one of these is used on a phone,
 * standing up, one-handed, in a hurry.
 */

export const part5 = [
	{
		slug: 'a-design-system-in-plain-css',
		title: 'A design system in plain CSS',
		summary:
			'Tokens in oklch, a fluid type scale that respects zoom, and dark mode as an exercise in flipping numbers.',
		goal: 'Six stylesheets that make every later component short, and consistent by construction.',
		blocks: [
			{
				type: 'p',
				text: 'No Tailwind, no CSS-in-JS, no component library. Six files of vanilla CSS, loaded once, and every component after this is a handful of rules.'
			},
			{
				type: 'ul',
				items: [
					'`fonts.css` — `@font-face`, with metric-matched fallbacks.',
					'`tokens.css` — every colour, size, radius and duration, named.',
					'`reset.css` — flatten the browser defaults we do not want.',
					'`base.css` — element defaults: headings, links, form controls.',
					'`utilities.css` — the handful of helpers worth having.',
					'`app.css` — imports the other five, in that order.'
				]
			},

			{ type: 'h3', id: 'oklch', text: 'Why oklch and not hex' },
			{
				type: 'code',
				file: 'src/lib/styles/tokens.css',
				lang: 'css',
				code: `
:root {
	/* Surfaces, from furthest back to nearest front. */
	--paper: oklch(98.6% 0.006 85);
	/* … */
	--ink: oklch(22% 0.015 230);
	/* … */
	--accent: oklch(52% 0.11 190);
	/* … */
}`
			},
			{
				type: 'p',
				text: '`oklch(lightness chroma hue)`. Three reasons it beats hex for a design system:'
			},
			{
				type: 'ol',
				items: [
					'**The first number is perceived lightness.** Two colours at `oklch(70% …)` look equally bright to a human eye whatever their hue. In hex, `#0000FF` and `#FFFF00` have wildly different perceived brightness at similar-looking values, so palettes get even contrast by squinting rather than by construction.',
					'**Changing hue while holding lightness gives colours that belong together.** Our staff colours work this way: each person stores a single hue (the seed gives Ada 268 and Ben 172) and the diary paints every stripe at one hard-coded lightness. In hex you nudge three channels each and hope.',
					'**Dark mode becomes flipping numbers.** `--paper` goes from 98.6% to 16.5%, `--ink` from 22% to 94%. That is a change you can reason about, not a second palette to maintain.'
				]
			},

			{ type: 'h3', id: 'type', text: 'A fluid type scale that does not break zoom' },
			{
				type: 'code',
				file: 'src/lib/styles/tokens.css',
				lang: 'css',
				code: `
--text-sm: clamp(0.875rem, 0.85rem + 0.12vw, 0.925rem);
--text-base: clamp(1rem, 0.97rem + 0.15vw, 1.0625rem);
/* … */
--text-xl: clamp(1.6rem, 1.4rem + 1vw, 2.25rem);`
			},
			{
				type: 'p',
				text: '`clamp(minimum, preferred, maximum)`: the text grows with the viewport between two limits, so there are no breakpoints to write for typography.'
			},
			{
				type: 'warn',
				text: 'The `rem` in the middle term is an accessibility requirement, not a stylistic choice. A pure `vw` preferred value — `clamp(1rem, 2vw, 1.5rem)` — **ignores the reader\'s browser font-size setting entirely**. Someone who has set their default to 24px because they cannot comfortably read 16px gets 16px anyway, and cannot work out why your site alone refuses to grow. Mixing in `rem` keeps the text responsive to both the viewport and the reader.'
			},
			{
				type: 'p',
				text: 'Mobile first is baked into the numbers: the **minimum** is the real design and the maximum is the bonus. Writing the scale the other way round produces a phone layout that is a squashed desktop.'
			},

			{ type: 'h3', id: 'fonts', text: 'Fallbacks that do not move the page' },
			{
				type: 'code',
				file: 'src/lib/styles/fonts.css',
				lang: 'css',
				code: `
/* Public Sans: real ascent 0.95em, real descent 0.23em, at weight 400. */
@font-face {
	font-family: 'Public Sans Fallback';
	src: local('Arial');
	size-adjust: 105.4%;
	ascent-override: 90.1%;
	descent-override: 21.8%;
	line-gap-override: 0%;
}`
			},
			{
				type: 'p',
				text: 'A `@font-face` with no download: it takes a font already on the machine and **adjusts its metrics** to match the one being fetched. The fallback then occupies almost exactly the same space, so when the real font arrives nothing jumps. The numbers were measured, not estimated — `pnpm run fonts:measure` reproduces them. The family then enters the stack over in `tokens.css`:'
			},
			{
				type: 'code',
				file: 'src/lib/styles/tokens.css',
				lang: 'css',
				code: `
--font-body: 'Public Sans', 'Public Sans Fallback', system-ui, sans-serif;`
			},
			{
				type: 'p',
				text: 'That jump is called layout shift, Google measures it, and — more to the point — it is what makes somebody tap the wrong appointment time because the button moved between the decision and the finger.'
			},
			{
				type: 'note',
				text: 'The fallback is named as a first-class family in the stack rather than appended as an afterthought. The generic families at the end catch machines with neither.'
			},

			{ type: 'h3', id: 'dark', text: 'Dark mode, and the flash it can cause' },
			{
				type: 'code',
				file: 'src/app.html',
				lang: 'html',
				code: `
<script>
	(function () {
		try {
			var choice = localStorage.getItem('halfpast-theme');
			if (choice === 'dark' || choice === 'light') {
				document.documentElement.dataset.theme = choice;
			}
		} catch (error) {
			// No storage available. The media query still works.
		}
	})();
</script>`
			},
			{
				type: 'p',
				text: 'An inline, blocking script in the head. Anything later — a Svelte component, an `onMount` — runs after the browser has painted, which means a dark-mode user gets a white flash on every single navigation. Not a subtle one: a full-screen strobe, in a product somebody uses at a reception desk all day.'
			},
			{
				type: 'p',
				text: 'Read the logic carefully, because the omission is the clever part. It sets `data-theme` **only** for an explicit choice. A visitor who never chose gets no attribute at all, and the CSS media query follows their operating system — including when it switches at sunset with the page open. Writing `data-theme="light"` for them would pin them to light forever. And the try/catch is there because `localStorage` throws in Safari private mode, and a theme preference is not worth breaking the page over.'
			},
			{
				type: 'p',
				text: 'The reactive half lives in a `.svelte.ts` module, and the two read the same storage key. They are separate on purpose: one has to run before the framework exists, the other has to be reactive.'
			},
			{
				type: 'code',
				file: 'src/lib/theme.svelte.ts',
				lang: 'ts',
				code: `
class ThemeStore {
	/** The visitor's *choice*, which may be "let the OS decide". */
	#preference = $state<Theme>(readStored());

	/** What the OS currently says, tracked live so \`resolved\` stays honest. */
	#systemIsDark = $state(false);

	constructor() {
		if (!browser) return;

		const query = window.matchMedia('(prefers-color-scheme: dark)');
		this.#systemIsDark = query.matches;

		// The OS theme can change while the page is open — most desktops switch
		// automatically at sunset. Without this listener the page would keep the
		// theme it started with until a reload.
		query.addEventListener('change', (event) => {
			this.#systemIsDark = event.matches;
		});
	}
}`
			},
			{
				type: 'note',
				text: 'The `.svelte.ts` extension is what tells the compiler to process runes in a plain module. Name it `theme.ts` and `$state` is an undefined function — a confusing error for a file that looks correct.'
			},

			{
				type: 'checkpoint',
				text: 'Switching your OS to dark mode with the page open recolours it immediately, and a hard refresh in dark mode shows no white flash.'
			}
		]
	},

	{
		slug: 'the-booking-page',
		title: 'The booking page',
		summary:
			'Service, person, day, time, details — in one page that survives a refresh and works without JavaScript.',
		goal: 'The public flow, with state in the URL and the details form hidden until it is relevant.',
		blocks: [
			{
				type: 'p',
				text: 'Five decisions, one page, no wizard. Each step appears as the one before it is answered, and the whole thing is one scroll on a phone.'
			},

			{ type: 'h3', id: 'url-state', text: 'The URL is the state' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'ts',
				code: `
const serviceSlug = $derived(page.url.searchParams.get('service'));

// …

function pickService(slug: string | null) {
	/*
	 * \`page.url\` is a \`ReadonlyURL\` in SvelteKit 3 — its \`searchParams\` has no
	 * \`set\` or \`delete\`, and assigning to \`pathname\` throws. That is a good
	 * change: mutating the page's URL object never did anything useful and
	 * silently looked like it might. Copy it through \`href\` to get a real one.
	 */
	const url = new URL(page.url.href);
	if (slug) url.searchParams.set('service', slug);
	else url.searchParams.delete('service');

	/*
	 * \`reset: false\` keeps the scroll position and the focused element.
	 * SvelteKit 3 replaced the old \`noScroll\` and \`keepFocus\` pair with this
	 * one option, because wanting one without the other was almost always a
	 * mistake — a page that stays put but throws focus to \`<body>\` strands a
	 * keyboard user in a place they cannot see.
	 */
	void goto(url, { reset: false });
}`
			},
			{
				type: 'p',
				text: 'Putting the choices in the query string buys three things for free: a refresh does not lose the customer\'s progress, the salon can link straight to `?service=cut-and-finish` from Instagram, and a customer can send a friend the exact page they are looking at.'
			},
			{
				type: 'note',
				text: 'Two SvelteKit 3 changes are visible in those twenty lines, and the comments explain both. Read them rather than skimming: `ReadonlyURL` and the merged `reset` option are the sort of thing that costs an hour when you meet them in an error message instead of in prose.'
			},

			{ type: 'h3', id: 'progressive', text: 'Revealing the form at the right moment' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
{#if selectedStart !== null}
	<section class="step details" {@attach reveal({ y: 14 })}>
		<h3>Your details</h3>
		<!-- … name, email, phone, note … -->
	</section>
{/if}`
			},
			{
				type: 'p',
				text: 'A form asking for a name and email while the customer is still deciding which Tuesday is noise. Worse on a phone, where it pushes the actual choice off the screen. It appears when a time is chosen and animates in, which also tells the customer *something happened* without a message saying so.'
			},

			{ type: 'h3', id: 'only-one', text: 'Not asking questions with one answer' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
{#if service.staffIds.length > 1}
	<section class="step">
		<h3>Who with?</h3>
		<div class="who" role="radiogroup" aria-label="Choose who with">
			<button
				type="button"
				role="radio"
				aria-checked={staffId === null}
				class="who-option"
				class:selected={staffId === null}
				onclick={() => (staffId = null)}
			>
				Anyone
			</button>
			<!-- … one button per person who offers this service … -->
		</div>
	</section>
{/if}`
			},
			{
				type: 'p',
				text: 'If only one person offers the service, there is no question to ask, so we do not ask it. This is the kind of thing that separates software that feels considered from software that feels like a form.'
			},

			{ type: 'h3', id: 'zones', text: 'Two clocks, honestly labelled' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<SlotGrid slots={daySlots} zone={viewerZone} field={book.fields.slot} />

{#if zonesDiffer && selectedStart !== null}
	<p class="zone-note">
		That is {formatTime(selectedStart, businessZone)} at the studio ({offsetLabel(
			selectedStart,
			businessZone
		)}), and
		{formatTime(selectedStart, viewerZone)} where you are.
	</p>
{/if}`
			},
			{
				type: 'p',
				text: 'Times render in the **visitor\'s** zone, because that is the clock they will be looking at when they need to leave the house. The studio\'s time is shown only when the two zones actually differ **and** a slot has been chosen — saying "that is 14:00 at the studio" to somebody standing in the studio\'s own city is noise, and saying it before they have picked anything is noise with no referent.'
			},
			{
				type: 'warn',
				text: 'The server does not know the visitor\'s zone on the first render, so it uses the studio\'s and the browser corrects it after hydration. Do not "fix" that by hiding times until hydration: a page whose content appears a beat late is worse than one that adjusts, and it is empty to a search engine.'
			},

			{ type: 'h3', id: 'errors', text: 'When the answer is no' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
{#if book.result === undefined && book.fields.allIssues()?.length}
	<Alert tone="error" title="Please check the form">
		<p>Some details need another look.</p>
	</Alert>
{/if}`
			},
			{
				type: 'p',
				text: 'For a lost race the message comes from the server: "That time was just taken." — or, when the race is lost at the claim itself, "Sorry — that time was booked moments ago." And because availability is a live query, the grid has already removed it by the time they look up. Being told what happened *and* seeing the world agree is what makes an error feel like an event rather than a fault.'
			},

			{
				type: 'checkpoint',
				text: 'Choosing a service updates the URL; refreshing keeps it; the details form appears only after a time is picked; and the whole flow works with JavaScript disabled.'
			}
		]
	},

	{
		slug: 'the-slot-grid',
		title: 'The slot grid',
		summary:
			'The one component customers actually touch. Radio buttons in disguise, sized for thumbs.',
		goal: 'An accessible, keyboard-navigable grid of times that animates when the world changes underneath it.',
		blocks: [
			{
				type: 'p',
				text: 'It looks like a grid of buttons. It is a radio group, because that is what it *is*: a set of mutually exclusive options, exactly one of which will be chosen.'
			},
			{
				type: 'code',
				file: 'src/lib/components/booking/SlotGrid.svelte',
				lang: 'svelte',
				code: `
<div class="grid" bind:this={grid}>
	{#each slots as slot (slot.start)}
		{@const value = valueOf(slot)}
		<label class="slot" class:selected={selectedValue === value}>
			<input {...field.as('radio', value)} />
			<span>{labelFor(slot)}</span>
		</label>
	{/each}
</div>`
			},
			{
				type: 'why',
				title: 'Why not <button>',
				text: 'Real radios give you arrow-key navigation, a single tab stop for the whole group, correct screen-reader announcements ("Choose a time, 09:00, radio button, 3 of 24"), and form submission with JavaScript off — for free, from the browser, in the version you are not testing on. Rebuilding that on `<button>` takes a hundred lines and will still be worse.'
			},
			{
				type: 'p',
				text: 'The input is visually hidden but never `display: none` — a hidden-that-way radio is unfocusable and unsubmittable. Clip it instead, and style the `<label>` from `:has(:checked)` and `:has(:focus-visible)`.'
			},

			{ type: 'h3', id: 'touch', text: 'Sized for a thumb' },
			{
				type: 'code',
				file: 'src/lib/components/booking/SlotGrid.svelte',
				lang: 'css',
				code: `
.grid {
	display: grid;
	/*
	 * \`auto-fill\`, not \`auto-fit\`. With \`auto-fit\` a row containing three slots
	 * stretches them across the full width, so the same 11:00 button is a
	 * different size depending on how many neighbours it has — which looks like
	 * a bug. \`auto-fill\` keeps the empty tracks, so every slot is the same size
	 * whether the day is full or nearly empty.
	 */
	grid-template-columns: repeat(auto-fill, minmax(min(5.5rem, 100%), 1fr));
	gap: var(--space-2);
}

.slot {
	display: grid;
	place-items: center;
	margin: 0;
	min-height: 2.75rem;
	padding: var(--space-2);
	/* … */
	font-variant-numeric: tabular-nums;
	/* … */
}`
			},
			{
				type: 'p',
				text: '`auto-fill` with `minmax` is a responsive grid with no breakpoints: three columns on a small phone, seven on a tablet, and the browser does the arithmetic. The `min-height` of 2.75rem is 44px — the floor for a comfortable tap target — and this grid is the single most-tapped thing in the app. `tabular-nums` is a small one worth knowing: without it, 11:00 and 12:45 are different widths and the column of times looks ragged.'
			},

			{ type: 'h3', id: 'flip', text: 'When a slot disappears' },
			{
				type: 'p',
				text: 'Availability is live. Somebody else books 11:00 and that cell vanishes — and every later time shifts up by one position, **while a finger is on the way down**.'
			},
			{
				type: 'code',
				file: 'src/lib/motion/flip.ts',
				lang: 'ts',
				code: `
/**
 * FLIP — the technique that makes a live-updating grid feel like an object
 * rather than a slideshow.
 *
 * The name is the method: **F**irst, **L**ast, **I**nvert, **P**lay.
 *
 *   First   — measure where everything is, right now.
 *   Last    — let the DOM change. Items appear, disappear, move.
 *   Invert  — instantly transform each survivor back to where it *was*, so the
 *             frame looks identical to before the change.
 *   Play    — animate those transforms away. The elements slide to their new
 *             homes because the browser has already decided where those are.
 *
 * …
 */`
			},
			{
				type: 'p',
				text: 'Nothing animates layout. Layout happens once, in a single frame; what animates is a `transform`, which the compositor handles without touching the main thread. Animating `top` and `left` forces a reflow every frame and drops to roughly 20fps on a phone with forty cells on screen.'
			},
			{
				type: 'p',
				text: 'The point is not decoration. Movement that is *visible* is movement the customer can follow; movement that is instant is a button that was there a moment ago and now is not.'
			},
			{
				type: 'warn',
				text: 'Our first version left every cell stuck at `position: absolute`, because the capture was asynchronous — GSAP is loaded on demand — and `play()` could start before it finished. The fix was to hold a **promise** of the captured state rather than the state itself, so `play()` awaits whatever `capture()` began and the two can never cross.'
			},

			{ type: 'h3', id: 'reduced-motion', text: 'And for anyone who asked for less' },
			{
				type: 'code',
				file: 'src/lib/motion/gsap.ts',
				lang: 'ts',
				code: `
export function prefersReducedMotion(): boolean {
	if (!browser) return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let pending: Promise<Motion | null> | null = null;

export function loadMotion(): Promise<Motion | null> {
	if (!browser || prefersReducedMotion()) return Promise.resolve(null);

	pending ??= (async () => {
		try {
			const [{ gsap }, { Flip }] = await Promise.all([import('gsap'), import('gsap/Flip')]);

			gsap.registerPlugin(Flip);

			// GSAP's default is a gentle ease-out over half a second, which is a
			// reasonable default for a marketing page and too slow for a tool
			// somebody uses forty times a day. These match the CSS tokens so a
			// GSAP transition and a CSS one feel like the same system.
			gsap.defaults({ duration: 0.35, ease: 'power3.out' });

			return { gsap, Flip };
		} catch (thrown) {
			// A blocked or failed chunk must not take the page with it.
			console.warn('[motion] GSAP failed to load; continuing without animation', thrown);
			return null;
		}
	})();

	return pending;
}`
			},
			{
				type: 'p',
				text: 'Both `capture` and `play` become no-ops and the grid updates instantly. For somebody who asked for less motion that is not a degraded experience, it is the correct one — and they never download the animation library at all.'
			},
			{
				type: 'note',
				text: 'The result is memoised in `pending` with `??=`, so twenty components mounting at once share one network request rather than starting twenty. `Promise.all` fetches `gsap` and `gsap/Flip` together instead of one after the other, `gsap.defaults(...)` sets a snappier timing than GSAP\'s own default so a GSAP tween and a CSS transition feel like the same system, and the `try/catch` means a blocked or failed chunk resolves to `null` rather than rejecting — the same outcome a reduced-motion visitor already gets, handled by the same `if (!motion) return`.'
			},

			{
				type: 'checkpoint',
				text: 'Arrow keys move between times, Tab treats the grid as one stop, and booking a slot in a second window makes it slide out of the first.'
			}
		]
	},

	{
		slug: 'the-customers-own-page',
		title: 'The customer’s own page',
		summary:
			'One link, no account, and a cancel button that respects the studio’s notice period.',
		goal: 'A page reached by a bearer token that updates itself in one round trip when the booking is cancelled.',
		blocks: [
			{
				type: 'p',
				text: 'The confirmation email contains one link: `/booking/QV8XD0E265QH1SW2VH7NN2ZP67`. That link is the customer\'s entire relationship with the software.'
			},
			{
				type: 'code',
				file: 'src/routes/booking/[token]/+page.svelte',
				lang: 'svelte',
				code: `
<svelte:head>
	<title>Your appointment — Halfpast</title>
	<!--
		Never index this page. The URL is the credential, and a search engine that
		crawled it would publish somebody's appointment along with the ability to
		cancel it.
	-->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>`
			},
			{
				type: 'warn',
				text: 'The `noindex` is not optional. The URL *is* the password. A search engine that indexes it publishes a cancel button for somebody\'s appointment — a breach delivered by Google, with a stack trace nowhere.'
			},

			{ type: 'h3', id: 'notice', text: 'A rule the customer can see' },
			{
				type: 'code',
				file: 'src/routes/booking/[token]/+page.svelte',
				lang: 'svelte',
				code: `
{#if b.canCancel}
	<Button variant="secondary" full onclick={() => void cancel()} loading={cancelling}>
		Cancel this appointment
	</Button>
	<p class="small text-faint">
		Free to cancel up to {b.cancellationNoticeHours} hours beforehand.
	</p>
{:else if !cancelled}
	<Alert tone="warning" title="Too late to cancel online">
		<p>
			Please ring the studio{b.businessPhone ? \` on \${b.businessPhone}\` : ''} and they will sort it
			out.
		</p>
	</Alert>
{/if}`
			},
			{
				type: 'p',
				text: 'Two things worth copying here. First, the rule is stated **with the working button**, not the refusal — "Free to cancel up to 24 hours beforehand" sits right under the control while it still works, so the customer learns the boundary before they ever hit it. Second, once the button is gone, there is still a way forward: an alert naming the studio\'s phone number, not a dead end.'
			},
			{
				type: 'p',
				text: 'And the server checks the same rule. The hidden button is manners; `cancelBooking` re-derives the notice window from the database, because a hidden button is not a control.'
			},

			{ type: 'h3', id: 'single-flight', text: 'Cancelling in one round trip' },
			{
				type: 'code',
				file: 'src/routes/booking/[token]/manage.remote.ts',
				lang: 'ts',
				code: `
export const cancelOwnBooking = command(
	v.object({
		token: tokenSchema,
		reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), '')
	}),
	async ({ token, reason }) => {
		const found = await loadBookingByToken(token);
		if (!found) error(404, 'We could not find that booking.');

		try {
			await cancelBooking({ bookingId: found.id, by: 'customer', reason: reason || undefined });
		} catch (thrown) {
			if (thrown instanceof BookingError) {
				// 409 for "too late": the request was valid, the world moved on.
				error(thrown.code === 'too_late_to_cancel' ? 409 : 400, thrown.message);
			}
			throw thrown;
		}

		// The refreshed booking rides back with this response — no second request.
		void getManagedBooking(token).refresh();

		return { cancelled: true };
	}
);`
			},
			{
				type: 'p',
				text: 'Without the `refresh()` line: post the cancellation, wait for a response, fire a fresh query, wait again, then re-render — with a stretch in the middle where the page still says "confirmed" and the customer wonders whether the button worked. With it, the response that confirms the cancellation carries the new state of the page.'
			},
			{
				type: 'p',
				text: 'The status codes are chosen, not defaulted. **409 Conflict** for "too late to cancel", because the request was perfectly valid and the world simply moved on; 400 for anything else the domain refuses. A blanket 400 would tell a monitoring dashboard that customers are sending malformed requests, when in fact they are arriving four minutes late.'
			},

			{ type: 'h3', id: 'freed', text: 'And the slot goes back on sale' },
			{
				type: 'p',
				text: 'Cancelling does not delete the booking. It updates its `status` to `\'cancelled\'` and explicitly deletes its claim rows — `tx.delete(slotClaim).where(eq(slotClaim.bookingId, found.id))` — then publishes a diary change. `slotClaim.bookingId` does carry `onDelete: \'cascade\'`, but that only fires if the booking row itself were ever deleted, which cancellation never does: the record has to survive so the studio still has something to look up. Every booking page currently open on that day gets the freed time back within a second, without anybody refreshing anything.'
			},
			{
				type: 'p',
				text: 'That is worth pausing on, because it is the payoff for all the machinery: three separate design decisions (the claims table kept separate from the booking record, an explicit delete on cancellation, live queries) combine into a behaviour nobody had to write.'
			},

			{
				type: 'checkpoint',
				text: 'Open the manage link and a booking page for the same day side by side. Cancel in one; watch the time reappear in the other.'
			}
		]
	},

	{
		slug: 'the-live-diary',
		title: 'The live diary',
		summary:
			'The screen a receptionist stares at all day. Today by default, updating itself, readable across a room.',
		goal: 'A dashboard that puts new bookings on screen without anybody pressing anything.',
		blocks: [
			{
				type: 'p',
				text: 'The dashboard\'s home is today. Not this week, not a month grid — today, because that is the question somebody standing at a desk actually has.'
			},
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<header class="head" {@attach reveal({ y: 10, duration: 0.4 })}>
	<h1>{isToday ? 'Today' : formatIsoDate(activeDay)}</h1>

	{#if diaryQuery.connected}
		<span class="live"><BroadcastIcon weight="fill" aria-hidden="true" /> Live</span>
	{/if}
</header>

{#if result.entries.length === 0}
	<p class="empty">Nothing booked. Enjoy it.</p>
{/if}`
			},
			{
				type: 'p',
				text: 'The "Live" badge is not decoration either. A screen that changes on its own is unsettling unless the person knows it does; a small word in the corner is the difference between "that is odd" and "ah, a booking came in".'
			},
			{
				type: 'p',
				text: 'And it is gated on `diaryQuery.connected` — a property the live query exposes — so it disappears when the stream drops. A badge that says "Live" on a screen that has silently stopped updating is worse than no badge at all: it is a promise the page is no longer keeping.'
			},
			{
				type: 'note',
				text: 'The empty state says "Nothing booked. Enjoy it." rather than "No results found." One of those is written by somebody who has thought about who is reading it.'
			},

			{ type: 'h3', id: 'cancel', text: 'Cancelling from the desk' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<button
	type="button"
	class="cancel"
	onclick={() => void cancel(entry.id, entry.customerName)}
	disabled={cancelling === entry.id}
	aria-label="Cancel {entry.customerName}'s appointment"
>
	<XCircleIcon weight="bold" />
</button>`
			},
			{
				type: 'p',
				text: 'The visible label is an icon; the accessible name is a full sentence. A screen-reader user hearing "button, button, button" down a list of appointments has no idea which one they are on, and the fix is one attribute.'
			},
			{
				type: 'p',
				text: 'It is also what makes the end-to-end test readable: `getByRole(\'button\', { name: /Cancel Doomed Dora/ })`. Tests that select by accessible name are testing the thing a person actually uses, and they break when the interface becomes unusable rather than when a class name changes.'
			},

			{ type: 'h3', id: 'colour', text: 'Whose appointment is whose' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<li class="entry" style="--hue: {entry.colourHue}">
	<!-- … -->
	<p class="who">
		<strong>{entry.customerName}</strong>
		<!-- … -->
	</p>

	<p class="with text-muted">
		with {entry.staffName}
		<!-- … -->
	</p>
	<!-- … -->
</li>`
			},
			{
				type: 'code',
				file: 'and in the stylesheet',
				lang: 'css',
				code: `
.entry {
	border-inline-start: 4px solid oklch(60% 0.14 var(--hue));
}`
			},
			{
				type: 'p',
				text: 'One custom property carries the staff member\'s hue into the CSS, and because every staff colour shares one hard-coded lightness in oklch, they are legible at a glance and equally weighted regardless of hue. **And the name is always there too** — `.who` names the customer, `.with` names the staff member, and colour alone excludes roughly one man in twelve.'
			},

			{ type: 'h3', id: 'tabs', text: 'Navigation for a phone, without a hamburger' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/+layout.svelte',
				lang: 'svelte',
				code: `
<nav class="tabs" aria-label="Dashboard sections">
	<div class="tabs-inner container">
		{#each visible as section (section.path)}
			{@const Icon = section.icon}
			{@const active = activePath === section.path}
			<a class="tab" class:active href="{base}{section.path}" aria-current={active ? 'page' : undefined}>
				<Icon weight={active ? 'fill' : 'regular'} aria-hidden="true" />
				{section.label}
			</a>
		{/each}
	</div>
</nav>`
			},
			{
				type: 'p',
				text: 'A horizontal scroller rather than a menu behind a button. Five short labels fit in a swipe; a hamburger costs a tap on every navigation and hides the shape of the app from somebody who has never seen it before.'
			},
			{
				type: 'p',
				text: '`aria-current="page"` is what tells a screen reader which tab is the current one. The colour and the filled icon say it to everybody else.'
			},

			{ type: 'h3', id: 'owner-only', text: 'Hiding doors, and locking them' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/+layout.svelte',
				lang: 'ts',
				code: `
const SECTIONS = [
	{ path: '', label: 'Diary', icon: CalendarDotsIcon, ownerOnly: false },
	{ path: '/services', label: 'Services', icon: ScissorsIcon, ownerOnly: true },
	{ path: '/hours', label: 'Hours', icon: ClockIcon, ownerOnly: false },
	{ path: '/team', label: 'Team', icon: UsersThreeIcon, ownerOnly: true },
	{ path: '/settings', label: 'Settings', icon: GearIcon, ownerOnly: true }
] as const;

const visible = $derived(
	SECTIONS.filter((section) => !section.ownerOnly || data.viewer.role === 'owner')
);`
			},
			{
				type: 'warn',
				text: 'Hiding a link is a **courtesy**, not a control. `requireOwner` in each section\'s `+page.server.ts` is the control. Both exist because showing somebody a door they cannot open is its own kind of rude — but if you only build one of the two, build the server-side one.'
			},

			{
				type: 'checkpoint',
				text: 'Sign in as the staff member: three tabs are missing, and typing their URLs directly returns 403. Sign in as the owner and book something from another window: it appears in the diary without a reload.'
			}
		]
	},

	{
		slug: 'the-owner-screens',
		title: 'The owner’s screens',
		summary:
			'Services, hours, team and settings — four small forms with one thing each to teach.',
		goal: 'A complete admin surface, and validation that lives in exactly one place.',
		blocks: [
			{
				type: 'p',
				text: 'Four screens, and each has one idea worth taking away.'
			},

			{ type: 'h3', id: 'services', text: 'Services: two guards for one rule' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/services/+page.svelte',
				lang: 'svelte',
				code: `
<input
	{...editForm.fields.durationMinutes.as('number', entry.durationMinutes)}
	min="5"
	max="480"
	step="5"
/>`
			},
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/studio.remote.ts',
				lang: 'ts',
				code: `
const gridMinutes = (label: string, min: number, max: number) =>
	v.pipe(
		v.number(),
		v.integer(),
		v.minValue(min, \`\${label} must be at least \${min} minutes\`),
		v.maxValue(max, \`\${label} cannot be more than \${max} minutes\`),
		v.check(isWholeSlots, \`\${label} must be a multiple of \${SLOT_MINUTES} minutes\`)
	);`
			},
			{
				type: 'p',
				text: '`step="5"` in the browser is the courtesy: the arrows step sensibly and the field refuses 47 before anything is sent. `v.check(isWholeSlots)` on the server is the guarantee, because an attacker has no step attribute and neither does curl.'
			},
			{
				type: 'note',
				text: 'This pairing has a consequence for testing. Our end-to-end test **removes the step attribute** before typing 47 — otherwise it would be testing Chromium rather than our schema, and deleting the server-side check would leave the suite green.'
			},

			{ type: 'h3', id: 'hours', text: 'Hours: wall-clock in, minutes out' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/hours/+page.svelte',
				lang: 'ts',
				code: `
/** \`09:30\` → 570. The input gives us wall-clock text; the API wants minutes. */
function toMinutes(value: string): number {
	const [h = '0', m = '0'] = value.split(':');
	return Number(h) * 60 + Number(m);
}

/** 570 → \`09:30\`, for display. */
function toClock(minutes: number): string {
	// Minutes beyond 1440 mean "past midnight" — show them as 25:30 rather than
	// wrapping to 01:30, because that is what the rule actually means.
	const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
	const mm = String(minutes % 60).padStart(2, '0');
	return \`\${hh}:\${mm}\`;
}`
			},
			{
				type: 'p',
				text: 'Read the comment in `toClock` again. A shift running to 02:00 the next morning is stored as minute 1560, and showing that as "01:30" would be a lie about which day it belongs to. `25:30` looks odd for exactly the right reason.'
			},
			{
				type: 'p',
				text: 'The page also uses `<input type="time" step="300">`, which gives you the platform\'s native time picker — the one the owner already knows how to use — snapping to five minutes.'
			},

			{ type: 'h3', id: 'team', text: 'Team: a checkbox that is a join table' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/studio.remote.ts',
				lang: 'ts',
				code: `
export const setStaffService = command(
	v.object({
		slug: slugSchema,
		staffId: idSchema,
		serviceId: idSchema,
		offers: v.boolean()
	}),
	async ({ slug, staffId, serviceId, offers }) => {
		const context = await requireOwner(slug);

		// … both staffId and serviceId are looked up scoped to
		// context.business.id first, and a 404 stops an owner of one studio
		// wiring their staff to another studio's services by id …

		if (offers) {
			/*
			 * \`onConflictDoNothing\` makes this idempotent. Two quick clicks would
			 * otherwise race and the second would fail on the composite primary key —
			 * a red error for an action that already succeeded.
			 */
			await db.insert(staffService).values({ staffId, serviceId }).onConflictDoNothing();
		} else {
			await db
				.delete(staffService)
				.where(and(eq(staffService.staffId, staffId), eq(staffService.serviceId, serviceId)));
		}

		void getTeam(slug).refresh();
		void getServices(slug).refresh();
		publishDiaryChange(context.business.id);

		return { offers };
	}
);`
			},
			{
				type: 'p',
				text: '`onConflictDoNothing()` makes the command **idempotent**. A double-click, a retried request, a flaky connection — all of them end with the box ticked once. Without it, the second one is a unique-constraint error shown to somebody who did nothing wrong.'
			},

			{ type: 'h3', id: 'settings', text: 'Settings: validating against reality' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/studio.remote.ts',
				lang: 'ts',
				code: `
timeZone: v.pipe(
	v.string(),
	v.check(isValidTimeZone, 'That is not a time zone this server recognises')
),`
			},
			{
				type: 'p',
				text: 'The dropdown cannot produce a bad value, and the schema checks anyway — against `Intl`, which is the same lookup every formatted date on the site will perform. A value that passes here cannot fail there.'
			},
			{
				type: 'p',
				text: 'And the end-to-end test drives it the way an attacker would: inject an option into the select, set it, submit, and assert the server refuses. That is the only way to know the check is load-bearing rather than decorative.'
			},

			{
				type: 'checkpoint',
				text: 'All four screens save, show their own errors, and reject bad input from the server even when the browser has been persuaded to send it.'
			}
		]
	}
];
