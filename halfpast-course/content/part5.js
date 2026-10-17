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

	// …
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

const staffId = $derived.by(() => {
	const asked = page.url.searchParams.get('with');
	return asked !== null && offeredBy.some((person) => person.id === asked) ? asked : null;
});

// …
const today = $derived(todayIn(viewerZone));
const selectedDay = $derived.by(() => {
	const asked = parseIsoDate(page.url.searchParams.get('day'));
	return asked !== null && asked >= today ? asked : today;
});
const weekFrom = $derived(addDays(today, 7 * Math.floor(daysBetween(today, selectedDay) / 7)));`
			},
			{
				type: 'p',
				text: 'Every choice before the time itself lives in the query string: `?service=cut-and-finish&with=<staff id>&day=2026-10-20`. None of it is `$state`. Each value is *derived* from `page.url`, and each is checked on the way in — `with` must be somebody who offers the service, `day` must be a real calendar day that is not in the past (`parseIsoDate`, from the time layer, returns `null` for anything else) — so a stale or hand-edited link falls back to "anyone" and "today" instead of asking the server for something it will never offer. Even the visible week is derived: weeks are counted in sevens from today, so the strip always contains the chosen day.'
			},
			{
				type: 'p',
				text: 'Putting the choices in the URL buys three things for free: a refresh does not lose the customer\'s place, the salon can link straight to `?service=cut-and-finish` from Instagram, and a customer can send a friend the exact day they are looking at. It buys a fourth that matters more than all three: every choice is now a plain link, so the page works before its JavaScript arrives, and without it at all.'
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'ts',
				code: `
function bookingHref(choice: { service?: string; with?: string | null; day?: IsoDate }) {
	if (!params.slug) return undefined;
	if (!choice.service) return resolve('/book/[slug]', { slug: params.slug });

	const chosen = Object.entries(choice).filter(
		(entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''
	);
	const query = new URLSearchParams(chosen).toString();

	return resolve(\`/book/[slug]?\${query}\`, { slug: params.slug });
}`
			},
			{
				type: 'p',
				text: 'Every link on the page comes from here. `resolve()` takes a route ID with a query string attached, so `[slug]` is still filled in and type-checked, and `URLSearchParams` does the encoding. The `if (!params.slug)` guard has a story of its own in the comment above the function in the real file: during a navigation away, the outgoing page renders once more with the incoming route\'s props, and `resolve()` throws on a missing parameter.'
			},
			{
				type: 'note',
				text: 'Two SvelteKit 3 changes sit behind these lines, and the comments in the file explain both. `page.url` is a `ReadonlyURL` — its `searchParams` has no `set`, and assigning to `pathname` throws — which retires the old habit of copying the URL, poking the query string and handing the copy to `goto`; building the link from the choices with `resolve()` is the replacement. And the `data-sveltekit-reset="false"` you will see on the day strip below is the link form of the one `reset` option that replaced SvelteKit 2\'s `noScroll` and `keepFocus` pair, because wanting one without the other was almost always a mistake.'
			},

			{ type: 'h3', id: 'days', text: 'A day is a link' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<DateStrip
	from={weekFrom}
	selected={selectedDay}
	zone={viewerZone}
	{countFor}
	hrefFor={(day) => bookingHref({ service: service.slug, with: staffId, day })}
/>`
			},
			{
				type: 'code',
				file: 'src/lib/components/booking/DateStrip.svelte',
				lang: 'svelte',
				code: `
<div class="strip" data-sveltekit-reset="false" data-sveltekit-replacestate>
	<!-- … -->
	<ul class="days" role="list" aria-label="Choose a day">
		{#each days as entry (entry.day)}
			<li>
				<!-- … -->
					<a
						class="day"
						href={hrefFor(entry.day)}
						data-day={entry.day}
						aria-current={selected === entry.day ? 'true' : undefined}
					>
						<!-- … -->
					</a>
				{/if}
			</li>
		{/each}
	</ul>

	<!-- … -->
</div>`
			},
			{
				type: 'p',
				text: 'The strip draws links and owns no state: the page passes the days to show, the one that is chosen, and `hrefFor`, a function that turns a day into a link with everything else in the URL kept. Its type is `(day: IsoDate) => ResolvedPathname | undefined`, and `ResolvedPathname` is what `resolve()` returns, so only a link built by `resolve()` fits — and the `svelte/no-navigation-without-resolve` lint rule can see that inside the component.'
			},
			{
				type: 'p',
				text: 'With JavaScript, SvelteKit turns a click into a client-side navigation, and the two attributes on the strip shape it. `data-sveltekit-reset="false"` keeps the scroll position and the focused link, because throwing a keyboard user back to the top of the page for every day they look at would be cruel, and the link they pressed is still there afterwards. `data-sveltekit-replacestate` replaces the history entry instead of adding one, so Back leaves the time picker rather than replaying every day that was looked at. Without JavaScript both are ignored, the link is a page load, and the server renders that day\'s times.'
			},
			{
				type: 'why',
				title: 'Why links, and not buttons with role="radio"',
				text: 'The strip used to be a row of `<button role="radio">` inside a `role="radiogroup"`, with a comment claiming the role "gives arrow-key navigation for free". It does not. ARIA roles describe behaviour; they do not add it. A screen reader announced "radio button, 1 of 7", the user pressed the arrow keys as a radio group invites, and nothing happened, while every day was its own Tab stop. The buttons also did nothing at all without JavaScript, inside a form this course calls progressive. A list of links needs no keyboard code because it uses the keyboard behaviour links already have, `aria-current` marks the chosen one, and the chosen day is styled from `[aria-current=\'true\']` itself, so what is seen and what is announced cannot drift apart.'
			},

			{ type: 'h3', id: 'progressive', text: 'Revealing the form at the right moment' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<section class="step details" {@attach reveal({ y: 14 })}>
	<h3>Your details</h3>

	{#if selected !== null}
		<p class="summary">
			<strong>{service.name}</strong> ·
			{formatIsoDate(instantToIsoDate(selected.start, viewerZone))} at
			{formatTime(selected.start, viewerZone, { withZone: zonesDiffer })}
		</p>
	{/if}

	<!-- … -->

	<Button type="submit" size="lg" full loading={book.pending > 0}>Book this time</Button>

	<!-- … -->
</section>`
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'css',
				code: `
.booking:not(:has(:global(.slot input:checked))) .details {
	display: none;
}`
			},
			{
				type: 'p',
				text: 'A form asking for a name and email while the customer is still deciding which Tuesday is noise. Worse on a phone, where it pushes the actual choice off the screen. So the details stay out of sight until a time is chosen, and animate in when one is, which also tells the customer *something happened* without a message saying so. Between the heading and the button sit a one-line summary of the chosen time, the error alert from the end of this chapter, and the four fields: name, email, phone and a note.'
			},
			{
				type: 'p',
				text: 'The section is always rendered, and the CSS rule decides whether it shows. `:has()` asks the browser whether any time in the grid is checked; the radios are rendered by `SlotGrid`, another component, hence the `:global(...)` inside it. The `selected` that the summary reads is chapter 23\'s derived value: the chosen slot, if it is still one of the times on screen.'
			},
			{
				type: 'why',
				title: 'Why CSS, and not {#if}',
				text: 'This section used to sit inside `{#if selectedStart !== null}`, where `selectedStart` came from the form field\'s value. With JavaScript, fine. Without it, that value is whatever the server rendered — nothing — and it never changes, so the name, the email and the Book button were never in the page at all, and a checkpoint in this course that told you to book with JavaScript disabled could not be passed. Whether a radio is checked is something the browser knows by itself, script or no script, so the rule that reveals the form now asks the browser. A browser without `:has()` shows the details all the time: a worse layout, and the same working form.'
			},

			{ type: 'h3', id: 'only-one', text: 'Not asking questions with one answer' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
{#if offeredBy.length > 1}
	<section class="step">
		<h3>Who with?</h3>
		<!-- … -->
		<ul
			class="who"
			role="list"
			aria-label="Choose who with"
			data-sveltekit-reset="false"
			data-sveltekit-replacestate
		>
			<li>
				<a
					class="who-option"
					href={bookingHref({ service: service.slug, day: selectedDay })}
					aria-current={staffId === null ? 'true' : undefined}
				>
					Anyone
				</a>
			</li>
			{#each offeredBy as person (person.id)}
				<li>
					<a
						class="who-option"
						href={bookingHref({ service: service.slug, with: person.id, day: selectedDay })}
						aria-current={staffId === person.id ? 'true' : undefined}
					>
						{person.displayName}
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}`
			},
			{
				type: 'p',
				text: 'If only one person offers the service, there is no question to ask, so we do not ask it. This is the kind of thing that separates software that feels considered from software that feels like a form.'
			},
			{
				type: 'p',
				text: 'When there is a question, it is an "Anyone" link followed by one link per person who offers this service, each the same page with `?with=` changed, built the same way as the day strip\'s and for the same reasons: it works without JavaScript, survives a refresh, and is a Tab stop that Enter follows. `offeredBy` is a `$derived` in the script — the team filtered to the people who offer this service — rather than a `.filter()` written into the `{#each}`, so the markup says what it lists and the script says how.'
			},

			{ type: 'h3', id: 'zones', text: 'Two clocks, honestly labelled' },
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
<SlotGrid slots={daySlots} zone={viewerZone} field={book.fields.slot} />

{#if zonesDiffer && selected !== null}
	<p class="zone-note">
		That is {formatTime(selected.start, businessZone)} at the studio ({offsetLabel(
			selected.start,
			businessZone
		)}), and
		{formatTime(selected.start, viewerZone)} where you are.
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
				file: 'src/routes/book/[slug]/booking.remote.ts',
				lang: 'ts',
				code: `
}).catch((thrown: unknown) => {
	if (!(thrown instanceof BookingError)) throw thrown;

	// …
	if (REFUSED_TIME.has(thrown.code)) invalid(issue.slot(thrown.message));

	// …
	error(thrown.code === 'not_found' ? 404 : 400, thrown.message);
});`
			},
			{
				type: 'p',
				text: 'Most refusals are the schema\'s — a missing name, an email that is not one — and they arrive on the fields themselves. The handler\'s own refusals are about the chosen time: it was taken, it fell inside the notice period, it is past the booking horizon, the person no longer does it. `REFUSED_TIME` is the set of those `BookingError` codes, and each goes on the form with `invalid(issue.slot(…))`, attached to the `slot` field. Only a studio or service that has vanished is a failure screen, because nothing on the form can fix that.'
			},
			{
				type: 'code',
				file: 'src/routes/book/[slug]/+page.svelte',
				lang: 'svelte',
				code: `
{#if slotIssue && selected === null}
	<Alert tone="error"><p>{slotIssue}</p></Alert>
{/if}`
			},
			{
				type: 'p',
				text: 'The page shows that sentence beside the grid, where the remedy is, once the refused time has left the screen — which it does by itself: the live grid drops a taken slot within moments, and one that has slid inside the notice period at the next minute\'s tick, and the selection derived from it goes too. Without JavaScript the page that comes back is rendered without it. Choose another time and the alert gives way; the details below were never cleared, so the name and email are still there.'
			},
			{
				type: 'why',
				title: 'The same rule as chapter 21',
				text: 'This handler used to call `error(409, …)` for a lost race, which sent the submission to `+error.svelte`: a failure screen whose only button is "Back to the start", and a customer typing their name and email in again to try a different time. That is precisely the mistake chapter 21 corrects on the sign-in form — a refusal the person can put right on the same form belongs on the form — made a second time, on the page where it costs a booking.'
			},
			{
				type: 'p',
				text: 'A lost race is rarer than it sounds, because availability is a live query: a time somebody else takes disappears from the grid, usually before the customer reaches the button. When one does reach the server, the loser is normally turned away by the re-check at the top of `createBooking`, because the write queue lets the winner commit first, and the sentence is "That time is no longer available." Only two server processes racing each other get as far as the claim table, where the loser hears "Sorry — that time was booked moments ago." Either way it is the same answer on the same form.'
			},
			{
				type: 'code',
				file: 'e2e/booking.e2e.ts',
				lang: 'ts',
				code: `
await page.getByRole('button', { name: 'Book this time' }).click();

// …
await expect(page).toHaveURL(/\\/book\\/willow-lane\\?/);
await expect(page.getByRole('alert')).toContainText('That time is no longer available.');
await expect(page.locator('label.slot', { hasText: lostTime })).toHaveCount(0);

await page.locator('label.slot').first().click();
await expect(page.getByLabel('Your name')).toHaveValue('Second Sasha');
await expect(page.getByRole('button', { name: 'Book this time' })).toBeVisible();`
			},
			{
				type: 'p',
				text: 'The race is made deterministic by running the loser with JavaScript off. That browser picks a time and fills in its details; a second, ordinary browser books the same time with the same stylist; then the first presses Book. With no script there is no live grid to drop the time first, so the submission really does reach the server and lose — and the page that comes back is the booking form, with the sentence, without the lost time, and with the name still filled in.'
			},

			{
				type: 'checkpoint',
				text: 'Choosing a service, a person or a day updates the URL; refreshing keeps all three; the details form appears only after a time is picked; and with JavaScript disabled the whole flow still works, from the service list to the confirmation page.'
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
		<!--
			No \`selected\` class. The label is styled from its radio's own state,
			\`:has(input:checked)\`, so the chosen time looks chosen with or without
			JavaScript, and the look can never disagree with what the form posts.
		-->
		<label class="slot">
			<input {...field.as('radio', slotValue(slot))} />
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
				text: 'The input is visually hidden but never `display: none` — a hidden-that-way radio is unfocusable and unsubmittable. Clip it instead, and style the `<label>` from `:has(input:checked)` and `:has(input:focus-visible)`. The chosen time used to be marked with a `selected` class worked out in JavaScript from the field\'s value, which meant that without script the radio you had checked looked exactly like the ones you had not. Asking the radio itself fixes that and deletes the bookkeeping.'
			},
			{
				type: 'p',
				text: '`slotValue(slot)` writes each radio\'s value: the start instant and the staff member fused into one string, so the form posts a complete choice with no JavaScript. It lives in the component\'s `<script module>` block, which runs once per module rather than once per instance, and that is what lets the booking page import it beside the component (`import SlotGrid, { slotValue } from …`) and ask whether the chosen value is still on offer in exactly the terms the grid wrote it.'
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
 * The trick is that nothing animates layout. Layout happens once, in a single
 * frame; what animates is a \`transform\`, which costs no layout and no repaint
 * per frame — the browser moves pixels it has already painted. GSAP still
 * writes that transform from JavaScript on every frame, so the main thread is
 * not idle; it is just doing almost nothing. Animating \`top\` and \`left\`
 * directly forces a reflow every frame and drops to roughly 20fps on a phone
 * with forty cells on screen.
 *
 * Why it matters here specifically: when somebody else books the 11:00 slot,
 * that button vanishes and every later slot shifts up. Without FLIP the grid
 * snaps and the customer's finger is suddenly over a different time than the one
 * they were reaching for. With it, the movement is visible — which is the point.
 */`
			},
			{
				type: 'p',
				text: 'The comment is the documentation, and the paragraph beginning "The trick" is the part to remember: nothing animates layout. The browser lays the grid out once, in a single frame, and what moves afterwards is only a `transform`, which costs no layout and no repaint per frame. It is not free — GSAP drives the animation from JavaScript, writing the transform on every frame — but the work per frame is tiny, where animating `top` and `left` makes the browser lay the whole grid out again forty times a second.'
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

// …

let pending: Promise<Motion | null> | null = null;

// …

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
			await cancelBooking({
				bookingId: found.id,
				by: 'customer',
				reason: reason || undefined
			});
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

<!-- … -->

{#if result.entries.length === 0}
	<p class="empty">Nothing booked. Enjoy it.</p>
{:else}
	<!-- … -->
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

	<div class="body">
		<p class="who">
			<strong>{entry.customerName}</strong>
			<span class="text-muted"> · {entry.serviceName}</span>
		</p>

		<p class="with text-muted">
			with {entry.staffName} ·
			<!-- … -->
		</p>

		<!-- … -->
	</div>

	<!-- … -->
</li>`
			},
			{
				type: 'p',
				text: 'And in the same component\'s `<style>` block:'
			},
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/+page.svelte',
				lang: 'css',
				code: `
.entry {
	/* … */
	/*
	 * The staff member's colour, as a stripe rather than a background. A tinted
	 * card would put text on an arbitrary hue and lose the contrast guarantee;
	 * a stripe carries the same information and costs nothing in legibility.
	 */
	border-inline-start: 4px solid oklch(60% 0.14 var(--hue));
	/* … */
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
		{#each visible as section (section.route)}
			{const Icon = $derived(section.icon)}
			{const active = $derived(page.route.id === section.route)}
			<a
				class={['tab', { active }]}
				href={resolve(section.route, { slug: params.slug })}
				aria-current={active ? 'page' : undefined}
			>
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
			{
				type: 'p',
				text: 'Each section is named by its **route ID** — `/manage/[slug]/hours` — and that one name does two jobs. `resolve(section.route, { slug: params.slug })` turns it into the link, with `slug` filled in and type-checked, so renaming the `hours` folder fails svelte-check here rather than shipping a tab that 404s. And `page.route.id`, from `$app/state`, is the route ID of the page on screen, so the active tab is a single comparison.'
			},
			{
				type: 'why',
				title: 'Why not a base URL and a suffix',
				text: 'The tabs used to be `href="{base}{section.path}"`, with `base` the resolved `/manage/willow-lane` and each section a suffix such as `/hours`, and the active tab found by a longest-prefix search over the pathname. It worked, and it was the one place in the app that built links by gluing strings together, against the root layout\'s rule that every link goes through `resolve()` with a route ID. It also read, to anybody who knew SvelteKit 2, like the `base` export from `$app/paths`, which SvelteKit 3 removed. Route IDs make the link and the active test use the same name the router does.'
			},

			{ type: 'h3', id: 'owner-only', text: 'Hiding doors, and locking them' },
			{
				type: 'code',
				file: 'src/routes/manage/[slug]/+layout.svelte',
				lang: 'ts',
				code: `
const SECTIONS = [
	{ route: '/manage/[slug]', label: 'Diary', icon: CalendarDotsIcon, ownerOnly: false },
	{ route: '/manage/[slug]/services', label: 'Services', icon: ScissorsIcon, ownerOnly: true },
	{ route: '/manage/[slug]/hours', label: 'Hours', icon: ClockIcon, ownerOnly: false },
	{ route: '/manage/[slug]/team', label: 'Team', icon: UsersThreeIcon, ownerOnly: true },
	{ route: '/manage/[slug]/settings', label: 'Settings', icon: GearIcon, ownerOnly: true }
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
				text: 'Sign in as the staff member: three tabs are missing, and typing their URLs directly returns 403 with a page headed "That did not work". Sign in as the owner, step the diary to a day with free times, and book one of them from another window: it appears in the diary without a reload.'
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
	{id}
	aria-describedby={describedBy}
	aria-invalid={invalid}
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
				text: 'Read the comment in `toClock` again. A shift running to 01:30 the next morning is stored as minute 1530, and showing that as "01:30" would be a lie about which day it belongs to. `25:30` looks odd for exactly the right reason.'
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

		// Both sides must belong to this business, or an owner of one studio could
		// wire their staff to another studio's services by id.
		const member = await db.query.staff.findFirst({
			where: and(eq(staff.id, staffId), eq(staff.businessId, context.business.id))
		});
		const target = await db.query.service.findFirst({
			where: and(eq(service.id, serviceId), eq(service.businessId, context.business.id))
		});
		if (!member || !target) error(404, 'No such staff member or service.');

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
