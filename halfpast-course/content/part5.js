/**
 * PART 5 — The interface (chapters 25–30)
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
					'`reset.css` — flatten the browser defaults we do not want.',
					'`tokens.css` — every colour, size, radius and duration, named.',
					'`fonts.css` — `@font-face`, with metric-matched fallbacks.',
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
	--paper: oklch(99% 0.005 95);
	--ink: oklch(22% 0.02 260);
	--accent: oklch(58% 0.14 195);
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
					'**Changing hue while holding lightness gives colours that belong together.** Our six staff colours are one lightness and six hues. In hex you nudge three channels each and hope.',
					'**Dark mode becomes flipping numbers.** `--paper` goes from 99% to 15%, `--ink` from 22% to 92%. That is a change you can reason about, not a second palette to maintain.'
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
@font-face {
	font-family: 'Public Sans Fallback';
	src: local('Arial');
	size-adjust: 97.5%;
	ascent-override: 92%;
	descent-override: 24%;
	line-gap-override: 0%;
}

:root {
	--font-body: 'Public Sans', 'Public Sans Fallback', system-ui, sans-serif;
}`
			},
			{
				type: 'p',
				text: 'A `@font-face` with no download: it takes a font already on the machine and **adjusts its metrics** to match the one being fetched. The fallback then occupies almost exactly the same space, so when the real font arrives nothing jumps.'
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
	// Runs before first paint, before the framework exists.
	try {
		const stored = localStorage.getItem('halfpast-theme');
		const dark =
			stored === 'dark' ||
			(stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
		if (dark) document.documentElement.dataset.theme = 'dark';
	} catch {}
</script>`
			},
			{
				type: 'p',
				text: 'An inline, blocking script in the head. Anything later — a Svelte component, an `onMount` — runs after the browser has painted, which means a dark-mode user gets a white flash on every single navigation. Three lines in the right place is the whole fix.'
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
const staffId = $derived(page.url.searchParams.get('with'));

function choose(next: URLSearchParams) {
	// \`reset: false\` keeps the scroll position and focus where they are.
	// Replacing the entry rather than pushing keeps the back button meaning
	// "leave this page", not "undo my last twelve taps".
	void goto(\`?\${next}\`, { replaceState: true, reset: false });
}`
			},
			{
				type: 'p',
				text: 'Putting the choices in the query string buys three things for free: a refresh does not lose the customer\'s progress, the salon can link straight to `?service=cut-and-finish` from Instagram, and a customer can send a friend the exact page they are looking at.'
			},
			{
				type: 'note',
				text: 'In SvelteKit 3 `goto` takes `{ reset: false }` where Kit 2 had `keepFocus` and `noScroll`. One option, and it does the right thing on both counts. Also note `page.url` is now a `ReadonlyURL` — mutating it is a type error, which is a good thing given how many bugs "just tweak the URL object" has caused.'
			},

			{ type: 'h3', id: 'progressive', text: 'Revealing the form at the right moment' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
{#if chosenSlot}
	<section class="details" {@attach reveal({ y: 16 })}>
		<h2>Your details</h2>
		<!-- name, email, phone, note -->
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
{#if offeredBy.length > 1}
	<fieldset class="who">
		<legend>Choose who with</legend>
		<!-- radio per person, plus "anyone" -->
	</fieldset>
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
<p class="zone-note text-muted">
	Times shown in {zoneAbbreviation(now, viewerZone)} — your time.
	{#if !sameWallClock(now, viewerZone, shop.business.timeZone)}
		The studio is in {shop.business.timeZone}.
	{/if}
</p>`
			},
			{
				type: 'p',
				text: 'Times render in the **visitor\'s** zone, because that is the clock they will be looking at when they need to leave the house. The studio\'s zone is named only when it differs — saying "the studio is in Europe/London" to somebody standing in London is noise.'
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
{#if book.fields.allIssues()?.length}
	<Alert tone="error" title="We could not book that">
		<p>{book.fields.allIssues()?.[0]?.message}</p>
	</Alert>
{/if}`
			},
			{
				type: 'p',
				text: 'The message the customer sees for a lost race is "Sorry — that time was just taken. Please choose another." — and because availability is a live query, the grid has already removed it by the time they look up. Being told what happened *and* seeing the world agree is what makes an error feel like an event rather than a fault.'
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
<fieldset class="grid" role="radiogroup" aria-label="Choose a time">
	{#each slots as slot (slot.start)}
		<label class="slot">
			<input
				{...field.as('radio', \`\${slot.start}.\${slot.staffId}\`)}
				checked={value === \`\${slot.start}.\${slot.staffId}\`}
			/>
			<span>{formatTime(slot.start, zone)}</span>
		</label>
	{/each}
</fieldset>`
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
	/* Mobile first: as many 5.5rem columns as fit, and no media query. */
	grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
	gap: var(--space-2);
}

.slot {
	min-block-size: 2.75rem;   /* 44px — the smallest comfortable tap target */
	display: grid;
	place-items: center;
}`
			},
			{
				type: 'p',
				text: '`auto-fill` with `minmax` is a responsive grid with no breakpoints: three columns on a small phone, seven on a tablet, and the browser does the arithmetic. 44px is the floor for a tap target, and this grid is the single most-tapped thing in the app.'
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
 * FLIP — First, Last, Invert, Play.
 *
 *   First   — measure where everything is, right now.
 *   Last    — let the DOM change. Items appear, disappear, move.
 *   Invert  — instantly transform each survivor back to where it *was*, so the
 *             frame looks identical to before the change.
 *   Play    — animate those transforms away.
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
	return browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export async function loadMotion() {
	if (!browser || prefersReducedMotion()) return null;
	// Only now is GSAP downloaded at all.
	const { gsap } = await import('gsap');
	const { Flip } = await import('gsap/Flip');
	gsap.registerPlugin(Flip);
	return { gsap, Flip };
}`
			},
			{
				type: 'p',
				text: 'Both `capture` and `play` become no-ops and the grid updates instantly. For somebody who asked for less motion that is not a degraded experience, it is the correct one — and they never download the animation library at all.'
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
	<title>Your appointment — {booking.business.name}</title>
	<!-- The URL contains a credential. Never index it. -->
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
{#if canCancel}
	<Button variant="ghost" onclick={() => void cancel()}>Cancel this appointment</Button>
{:else}
	<p class="text-muted">
		Appointments can be cancelled up to {booking.business.cancellationNoticeHours} hours
		beforehand. Please call the studio on {booking.business.phone}.
	</p>
{/if}`
			},
			{
				type: 'p',
				text: 'Two things worth copying here. First, the rule is stated **with** the refusal — "up to 24 hours beforehand" tells them why the button is missing. Second, there is a way forward: the phone number, not a dead end.'
			},
			{
				type: 'p',
				text: 'And the server checks the same rule. The hidden button is manners; `cancelBooking` re-derives the notice window from the database, because a hidden button is not a control.'
			},

			{ type: 'h3', id: 'single-flight', text: 'Cancelling in one round trip' },
			{
				type: 'code',
				file: 'src/routes/booking/[token]/booking.remote.ts',
				lang: 'ts',
				code: `
export const cancel = command(tokenSchema, async (token) => {
	const booking = await cancelBooking(token, 'customer');

	// Refresh the query that drives this page, in the same response.
	void getBooking(token).refresh();

	return { cancelled: true };
});`
			},
			{
				type: 'p',
				text: 'Without that line: post the cancellation, wait for a response, fire a fresh query, wait again, then re-render — with a stretch in the middle where the page still says "confirmed" and the customer wonders whether the button worked. With it, the response that confirms the cancellation carries the new state of the page.'
			},

			{ type: 'h3', id: 'freed', text: 'And the slot goes back on sale' },
			{
				type: 'p',
				text: 'Cancelling deletes the booking\'s claim rows — `onDelete: \'cascade\'` does it — and publishes a diary change. Every booking page currently open on that day gets the freed time back within a second, without anybody refreshing anything.'
			},
			{
				type: 'p',
				text: 'That is worth pausing on, because it is the payoff for all the machinery: three separate design decisions (cascade deletes, the claims table, live queries) combine into a behaviour nobody had to write.'
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
<script lang="ts">
	const diary = $derived(await getDiary({ slug: data.slug, day: chosenDay }));
</script>

<header>
	<h2>Today</h2>
	<span class="live" aria-live="polite">Live</span>
</header>

{#if diary.appointments.length === 0}
	<p class="empty">Nothing booked. Enjoy it.</p>
{/if}`
			},
			{
				type: 'p',
				text: 'The "Live" badge is not decoration either. A screen that changes on its own is unsettling unless the person knows it does; a small word in the corner is the difference between "that is odd" and "ah, a booking came in".'
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
	onclick={() => void cancelFromDiary(appointment.id)}
	aria-label="Cancel {appointment.customerName} at {formatTime(appointment.startsAt, zone)}"
>
	<XIcon weight="bold" />
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
<li class="appointment" style="--hue: {appointment.staffColourHue}">
	<span class="who">{appointment.staffName}</span>
	<!-- … -->
</li>`
			},
			{
				type: 'code',
				file: 'and in the stylesheet',
				lang: 'css',
				code: `
.appointment {
	border-inline-start: 4px solid oklch(60% 0.14 var(--hue));
}`
			},
			{
				type: 'p',
				text: 'One custom property carries the staff member\'s hue into the CSS, and because the colours are one lightness and six hues in oklch, they are legible at a glance and equally weighted. **And the name is always there too** — colour alone excludes roughly one man in twelve.'
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
export const setStaffService = command(pairSchema, async ({ slug, staffId, serviceId, offers }) => {
	const context = await requireOwner(slug);

	if (offers) {
		await db
			.insert(staffService)
			.values({ staffId, serviceId })
			// Ticking an already-ticked box is not an error, it is a no-op.
			.onConflictDoNothing();
	} else {
		await db
			.delete(staffService)
			.where(and(eq(staffService.staffId, staffId), eq(staffService.serviceId, serviceId)));
	}

	void getTeam(slug).refresh();
	return { ok: true };
});`
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
