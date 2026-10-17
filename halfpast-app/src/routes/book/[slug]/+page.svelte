<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { browser } from '$app/env';
	import { PUBLIC_DEFAULT_TIME_ZONE } from '$app/env/public';
	import { CaretLeftIcon, MapPinIcon, BroadcastIcon } from 'phosphor-svelte';

	import Alert from '#lib/components/Alert.svelte';
	import Button from '#lib/components/Button.svelte';
	import Field from '#lib/components/Field.svelte';
	import DateStrip from '#lib/components/booking/DateStrip.svelte';
	import SlotGrid, { slotValue, type SlotOption } from '#lib/components/booking/SlotGrid.svelte';
	import { reveal } from '#lib/motion/index.ts';
	import {
		addDays,
		daysBetween,
		detectTimeZone,
		formatDuration,
		formatIsoDate,
		formatMoney,
		formatTime,
		instantToIsoDate,
		offsetLabel,
		parseIsoDate,
		sameWallClock,
		todayIn,
		type IsoDate
	} from '#lib/time/index.ts';

	import { book, getAvailability, getBookingPage } from './booking.remote.ts';
	import type { PageProps } from './$types';

	/*
	 * `params` is the route's own parameter, typed from the folder name by the
	 * generated `./$types`. A remote function cannot read the URL for itself, so
	 * the page passes `params.slug` to every query as an argument.
	 */
	let { params }: PageProps = $props();

	/* ------------------------------------------------------- the URL is the state */

	/*
	 * Every choice on this page lives in the query string, not in component
	 * state: `?service=cut-and-finish&with=<staff id>&day=2026-10-20`.
	 *
	 * That is a deliberate trade. Each choice costs a navigation, and it buys: a
	 * shareable link to a specific service and day, a refresh that keeps the
	 * customer's place, and a page that works with JavaScript disabled — because
	 * every choice before the time itself is an ordinary link, and the server
	 * renders whatever the URL says.
	 */
	const serviceSlug = $derived(page.url.searchParams.get('service'));

	/**
	 * The viewer's own time zone.
	 *
	 * On the server there is nothing to detect — `Intl` would report whatever the
	 * container is set to, which is almost always UTC and is nobody's home — so
	 * the configured default is used. In the browser the real zone is available
	 * synchronously, so this is a plain `$derived` rather than state corrected by
	 * an effect: one source of truth, no intermediate frame with the wrong answer.
	 */
	const viewerZone = $derived(browser ? detectTimeZone() : PUBLIC_DEFAULT_TIME_ZONE);

	/* ------------------------------------------------------------ page data */

	/**
	 * `await` inside `$derived` is the whole reason this page server-renders.
	 *
	 * SvelteKit waits for the boundary it wraps around this page to settle before
	 * it sends any HTML, so a customer — and a search engine — receives a fully
	 * rendered list of services rather than an empty div that fills in later.
	 * Reading `.ready` / `.current` instead would render nothing on the server
	 * and hydrate into content, which is a blank first paint and no SEO at all.
	 */
	const shop = $derived(await getBookingPage(params.slug));

	const service = $derived(
		serviceSlug ? (shop.services.find((entry) => entry.slug === serviceSlug) ?? null) : null
	);

	/** The people who offer the chosen service, in the studio's own order. */
	const offeredBy = $derived(
		service ? shop.team.filter((person) => service.staffIds.includes(person.id)) : []
	);

	/**
	 * `?with=` — one person, or `null` for "anyone".
	 *
	 * Checked against who actually offers the service. A link shared from a
	 * stylist who has since stopped doing colour falls back to "anyone" rather
	 * than asking the server for a combination it will never offer.
	 */
	const staffId = $derived.by(() => {
		const asked = page.url.searchParams.get('with');
		return asked !== null && offeredBy.some((person) => person.id === asked) ? asked : null;
	});

	/**
	 * `?day=` — the day being looked at, in the viewer's calendar.
	 *
	 * Today when it is missing, mangled, or already in the past. The week on
	 * screen is worked out from it rather than kept separately: weeks are counted
	 * in sevens from today, so the strip always contains the chosen day and
	 * paging a week moves both together.
	 */
	const today = $derived(todayIn(viewerZone));
	const selectedDay = $derived.by(() => {
		const asked = parseIsoDate(page.url.searchParams.get('day'));
		return asked !== null && asked >= today ? asked : today;
	});
	const weekFrom = $derived(addDays(today, 7 * Math.floor(daysBetween(today, selectedDay) / 7)));

	/**
	 * A link to this page with the given choices — built by `resolve()`, and guarded.
	 *
	 * `resolve` takes a route ID with a query string attached: `[slug]` is still
	 * filled in from the params, and the query rides along. That keeps every
	 * internal link on this page typed and base-path-aware, which is what the
	 * `svelte/no-navigation-without-resolve` lint rule insists on — and it is
	 * right to: a hand-assembled `href` is the one that breaks the day the app is
	 * deployed under a sub-path. `URLSearchParams` does the encoding, so a value
	 * with an `&` in it cannot split itself into two parameters.
	 *
	 * Built from the choices, not by copying `page.url` and editing it. In
	 * SvelteKit 3 `page.url` is a `ReadonlyURL`: its `searchParams` has no `set`
	 * or `delete`, and assigning to `pathname` throws. That is a good change —
	 * mutating the page's URL object never did anything useful and silently
	 * looked like it might — and the habit it breaks, copy the URL, poke the
	 * query string, hand the copy to `goto`, has this better replacement.
	 *
	 * The guard is not defensive padding — without it this page intermittently
	 * destroys itself, and the failure is thoroughly misleading.
	 *
	 * When SvelteKit navigates away from here, the outgoing component re-renders
	 * once before it is torn down, and by then its props belong to the *incoming*
	 * route — so `params.slug` is `undefined`. Most expressions shrug at that.
	 * `resolve()` does not: given `{ slug: undefined }` it throws `Missing
	 * parameter 'slug' in route /book/[slug]`, which kills the render.
	 *
	 * What makes it hard to find is where the wreckage lands. The URL has already
	 * changed, so the error is reported against the page you were navigating *to*
	 * — a 500 on the confirmation page, thrown by the page you just left, with an
	 * empty server log because the server was never involved.
	 *
	 * The general rule: inside a template, any expression that reads route data
	 * *and can throw* must tolerate that data being momentarily absent. Returning
	 * `undefined` renders a link with no `href` for that one frame, which is
	 * harmless; returning `''` would widen the type to a plain string and lose the
	 * connection to `resolve()` that the linter checks for.
	 */
	function bookingHref(choice: { service?: string; with?: string | null; day?: IsoDate }) {
		if (!params.slug) return undefined;
		if (!choice.service) return resolve('/book/[slug]', { slug: params.slug });

		const chosen = Object.entries(choice).filter(
			(entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''
		);
		const query = new URLSearchParams(chosen).toString();

		return resolve(`/book/[slug]?${query}`, { slug: params.slug });
	}

	/**
	 * The live availability stream.
	 *
	 * Recreated whenever its arguments change — a different service, a different
	 * week, a different person — and SvelteKit tears down the old subscription
	 * and opens the new one. Because it is a `query.live`, this is not a fetch
	 * that finishes: the server keeps the connection and pushes a fresh answer
	 * every time somebody books or cancels.
	 */
	const availabilityQuery = $derived(
		service
			? getAvailability({
					slug: params.slug,
					serviceId: service.id,
					staffId: staffId ?? undefined,
					from: weekFrom,
					days: 7
				})
			: null
	);

	/*
	 * Two references to the same thing, on purpose.
	 *
	 * `availabilityQuery` is the resource — it carries `connected`, which is how
	 * the page knows whether to show the "Live" badge. `availability` is the
	 * value, re-awaited every time the server pushes a new one down the stream.
	 */
	const availability = $derived(availabilityQuery ? await availabilityQuery : null);

	/**
	 * Slots for the selected day, in the *viewer's* calendar, merged across staff.
	 *
	 * Merging is what makes "anyone" work: two people free at 11:00 is one 11:00
	 * button, and the booking picks whoever can take it. Showing the same time
	 * twice because two stylists are free would be technically accurate and
	 * useless.
	 */
	const slotsByDay = $derived.by(() => {
		/*
		 * Plain `Map` and `Set`, not the reactive versions, and the linter is right
		 * to ask about it.
		 *
		 * `SvelteMap` exists so that *mutating* a collection after the fact
		 * re-triggers whatever is reading it. These are built from scratch inside
		 * the derived and never touched again — the reactivity comes from the
		 * derived itself re-running when `availability` changes, which is both
		 * correct and cheaper. Reactive collections here would add proxy overhead
		 * per entry in exchange for nothing.
		 */
		/* eslint-disable svelte/prefer-svelte-reactivity */
		const byDay = new Map<IsoDate, SlotOption[]>();
		if (!availability) return byDay;

		// First pass: one entry per distinct start time, remembering everybody free.
		const byStart = new Map<number, Set<string>>();
		for (const person of availability.staff) {
			for (const slot of person.slots) {
				let ids = byStart.get(slot.start);
				if (!ids) byStart.set(slot.start, (ids = new Set()));
				ids.add(person.id);
			}
		}

		// Second pass: file each start time under the viewer's calendar day. Sorted
		// once here so the grid can render in order without sorting per day.
		for (const [start, ids] of [...byStart.entries()].sort((a, b) => a[0] - b[0])) {
			const day = instantToIsoDate(start, viewerZone);
			const option = { start, staffIds: [...ids] };
			const list = byDay.get(day);
			if (list) list.push(option);
			else byDay.set(day, [option]);
		}

		return byDay;
		/* eslint-enable svelte/prefer-svelte-reactivity */
	});

	const daySlots = $derived(slotsByDay.get(selectedDay) ?? []);

	/**
	 * The chosen time — if it is still on screen to be chosen.
	 *
	 * The radio group *is* the selection: SvelteKit's form field holds the value,
	 * so there is no parallel `$state` to keep in step. What is derived here is
	 * whether that value is one of the times offered right now. Look at another
	 * day, or narrow to another person, and the chosen radio is no longer
	 * rendered; somebody else books it and the live grid drops it. In every one
	 * of those cases this becomes `null` and the page stops talking about a time
	 * the customer cannot see.
	 *
	 * An earlier version cleared the field from two `$effect`s instead — one when
	 * the service, person or day changed, one when the live grid dropped the
	 * time. Both were state written in reaction to other state, which is what
	 * `$derived` is for, and the first needed `untrack` to stop it waking itself
	 * up. Deriving the answer removed both effects and the trap with them.
	 */
	const selectedValue = $derived(book.fields.slot.value());
	const selected = $derived(daySlots.find((slot) => slotValue(slot) === selectedValue) ?? null);

	/** The server's answer about the chosen time, when it refused it. */
	const slotIssue = $derived(book.fields.slot.issues()?.[0]?.message);

	/* ---------------------------------------------------------- presentation */

	const businessZone = $derived(shop.business.timeZone);

	/**
	 * Only mention time zones when they actually differ. Telling a customer in
	 * Bristol that a Bristol salon is on Bristol time is noise; telling one in
	 * Lisbon is essential.
	 */
	const zonesDiffer = $derived(
		selected !== null && !sameWallClock(selected.start, viewerZone, businessZone)
	);

	const countFor = (day: IsoDate) => slotsByDay.get(day)?.length ?? 0;
</script>

<svelte:head>
	<title>Book with {shop.business.name}</title>
	<meta
		name="description"
		content={shop.business.tagline ?? `Book an appointment with ${shop.business.name}.`}
	/>
</svelte:head>

<div class="container-narrow page">
	<header class="shop" {@attach reveal({ y: 12 })}>
		<h1>{shop.business.name}</h1>
		{#if shop.business.tagline}<p class="tagline">{shop.business.tagline}</p>{/if}
		{#if shop.business.city}
			<p class="place text-muted">
				<MapPinIcon weight="fill" aria-hidden="true" />
				{shop.business.city}
			</p>
		{/if}
	</header>

	{#if !service}
		<!-- ---------------------------------------------- step 1: service -->
		<section class="step">
			<h2>What would you like booked?</h2>

			<ul class="services" role="list">
				{#each shop.services as entry (entry.id)}
					<li>
						<a class="service" href={bookingHref({ service: entry.slug })}>
							<span class="service-main">
								<span class="service-name">{entry.name}</span>
								{#if entry.description}
									<span class="service-desc">{entry.description}</span>
								{/if}
							</span>
							<span class="service-meta">
								<span class="price">
									{entry.priceCents === 0
										? 'Free'
										: formatMoney(entry.priceCents, shop.business.currency)}
								</span>
								<span class="duration text-muted">
									{formatDuration(entry.durationMinutes)}
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<!-- ------------------------------------- steps 2–4: when and who -->
		<form {...book} class="booking stack stack-lg">
			<!--
				Every control inside a remote form must be built by `fields.<name>.as()`.
				A hand-written `<input name="slug">` throws at runtime — SvelteKit needs
				to own the name and value to construct the submitted data. `hidden`,
				`radio` and `submit` inputs take their value as the second argument.
			-->
			<input {...book.fields.slug.as('hidden', params.slug)} />
			<input {...book.fields.serviceId.as('hidden', service.id)} />
			<input {...book.fields.viewerTimeZone.as('hidden', viewerZone)} />

			<section class="step">
				<a class="back" href={bookingHref({})}>
					<CaretLeftIcon weight="bold" aria-hidden="true" />
					All services
				</a>

				<div class="chosen">
					<h2>{service.name}</h2>
					<p class="text-muted">
						{formatDuration(service.durationMinutes)} ·
						{service.priceCents === 0
							? 'Free'
							: formatMoney(service.priceCents, shop.business.currency)}
					</p>
				</div>
			</section>

			{#if offeredBy.length > 1}
				<section class="step">
					<h3>Who with?</h3>
					<!--
						Links, like the day strip: each one is this page with `?with=` changed,
						so the choice works without JavaScript, survives a refresh, and is a
						plain Tab stop that Enter follows. `aria-current` marks the one in
						force and carries the styling too, so the two cannot drift apart.
					-->
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
			{/if}

			<section class="step">
				<div class="when-head">
					<h3>When?</h3>
					{#if availabilityQuery?.connected}
						<span class="live" title="This list updates on its own">
							<BroadcastIcon weight="fill" aria-hidden="true" />
							Live
						</span>
					{/if}
				</div>

				<DateStrip
					from={weekFrom}
					selected={selectedDay}
					zone={viewerZone}
					{countFor}
					hrefFor={(day) => bookingHref({ service: service.slug, with: staffId, day })}
				/>

				<p class="day-label">{formatIsoDate(selectedDay)}</p>

				<!--
					A time the server refused: taken in the last few seconds, or no longer
					on offer. It is said here, beside the grid, because the remedy is to
					pick another time — and the details below are still filled in.
				-->
				{#if slotIssue && selected === null}
					<Alert tone="error"><p>{slotIssue}</p></Alert>
				{/if}

				<SlotGrid slots={daySlots} zone={viewerZone} field={book.fields.slot} />

				{#if zonesDiffer && selected !== null}
					<p class="zone-note">
						That is {formatTime(selected.start, businessZone)} at the studio ({offsetLabel(
							selected.start,
							businessZone
						)}), and
						{formatTime(selected.start, viewerZone)} where you are.
					</p>
				{/if}
			</section>

			<!--
				Always rendered, and hidden by CSS until a time is checked: see
				`.booking:not(:has(...)) .details` below. The browser knows which radio
				is checked with or without JavaScript, so the same rule reveals the form
				on a page whose script never arrived — where an `{#if}` on the chosen
				time could never change, and the fields would never appear at all.
			-->
			<section class="step details" {@attach reveal({ y: 14 })}>
				<h3>Your details</h3>

				{#if selected !== null}
					<p class="summary">
						<strong>{service.name}</strong> ·
						{formatIsoDate(instantToIsoDate(selected.start, viewerZone))} at
						{formatTime(selected.start, viewerZone, { withZone: zonesDiffer })}
					</p>
				{/if}

				{#if book.result === undefined && book.fields.allIssues()?.length}
					<Alert tone="error" title="Please check the form">
						<p>Some details need another look.</p>
					</Alert>
				{/if}

				<div class="stack">
					<Field label="Your name" required error={book.fields.name.issues()?.[0]?.message}>
						{#snippet children({ id, describedBy, invalid })}
							<input
								{...book.fields.name.as('text')}
								{id}
								aria-describedby={describedBy}
								aria-invalid={invalid}
								autocomplete="name"
								placeholder="Sam Okafor"
							/>
						{/snippet}
					</Field>

					<Field
						label="Email"
						required
						hint="We send your confirmation and a link to change or cancel."
						error={book.fields.email.issues()?.[0]?.message}
					>
						{#snippet children({ id, describedBy, invalid })}
							<input
								{...book.fields.email.as('email')}
								{id}
								aria-describedby={describedBy}
								aria-invalid={invalid}
								autocomplete="email"
								placeholder="sam@example.com"
							/>
						{/snippet}
					</Field>

					<Field label="Phone" error={book.fields.phone.issues()?.[0]?.message}>
						{#snippet children({ id, describedBy, invalid })}
							<input
								{...book.fields.phone.as('tel')}
								{id}
								aria-describedby={describedBy}
								aria-invalid={invalid}
								autocomplete="tel"
							/>
						{/snippet}
					</Field>

					<Field label="Anything we should know?" error={book.fields.note.issues()?.[0]?.message}>
						{#snippet children({ id, describedBy, invalid })}
							<textarea
								{...book.fields.note.as('text')}
								{id}
								aria-describedby={describedBy}
								aria-invalid={invalid}
								rows="3"
								placeholder="Growing out a fringe, allergic to the blue dye, running late…"
							></textarea>
						{/snippet}
					</Field>
				</div>

				<Button type="submit" size="lg" full loading={book.pending > 0}>Book this time</Button>

				<p class="small text-faint">
					You can cancel free up to {shop.business.cancellationNoticeHours} hours beforehand.
				</p>
			</section>
		</form>
	{/if}
</div>

<style>
	.page {
		padding-block: var(--space-6) var(--space-8);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.shop h1 {
		font-size: var(--text-xl);
	}

	.tagline {
		color: var(--ink-muted);
		margin-block-start: var(--space-1);
	}

	.place {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		margin-block-start: var(--space-2);
	}

	.step {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.step h2 {
		font-size: var(--text-lg);
	}

	.step h3 {
		font-size: var(--text-md);
	}

	/* ------------------------------------------------------------ services */

	.services {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.services li + li {
		margin: 0;
	}

	.service {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-4);

		background: var(--surface);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-lg);
		text-decoration: none;
		color: var(--ink);

		transition:
			border-color var(--dur-fast) var(--ease-standard),
			box-shadow var(--dur-fast) var(--ease-standard),
			transform var(--dur-fast) var(--ease-standard);
	}

	.service:hover {
		border-color: var(--accent-line);
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
		color: var(--ink);
	}

	.service-main {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}

	.service-name {
		font-family: var(--font-display);
		font-weight: var(--weight-semibold);
		font-size: var(--text-md);
	}

	.service-desc {
		font-size: var(--text-sm);
		color: var(--ink-muted);
	}

	.service-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		flex-shrink: 0;
	}

	.price {
		font-weight: var(--weight-semibold);
		font-variant-numeric: tabular-nums;
	}

	.duration {
		font-size: var(--text-sm);
	}

	/* --------------------------------------------------------------- steps */

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		align-self: flex-start;
		font-size: var(--text-sm);
		color: var(--ink-muted);
		text-decoration: none;
		padding: var(--space-2) 0;
	}

	.back:hover {
		color: var(--accent);
	}

	.chosen {
		padding: var(--space-4);
		background: var(--accent-soft);
		border: var(--border) solid var(--accent-line);
		border-radius: var(--radius-lg);
	}

	.chosen p {
		margin-block-start: var(--space-1);
		font-size: var(--text-sm);
	}

	.who {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.who li + li {
		margin: 0;
	}

	.who-option {
		display: inline-flex;
		align-items: center;
		padding: var(--space-2) var(--space-4);
		min-height: 2.75rem;
		background: var(--surface);
		border: var(--border) solid var(--line-strong);
		border-radius: var(--radius-pill);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--ink);
		text-decoration: none;
		transition:
			background-color var(--dur-fast) var(--ease-standard),
			border-color var(--dur-fast) var(--ease-standard);
	}

	.who-option:hover:not([aria-current='true']) {
		border-color: var(--accent);
		color: var(--ink);
	}

	.who-option[aria-current='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.when-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.live {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
		color: var(--ok);
	}

	/* A slow pulse, not a blink. It says "connected", not "look at me". */
	.live :global(svg) {
		animation: breathe 2.4s ease-in-out infinite;
	}

	@keyframes breathe {
		50% {
			opacity: 0.35;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.live :global(svg) {
			animation: none;
		}
	}

	.day-label {
		font-size: var(--text-sm);
		color: var(--ink-muted);
		max-width: none;
	}

	.zone-note {
		padding: var(--space-3);
		background: var(--warn-soft);
		border: var(--border) solid var(--warn-line);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		max-width: none;
	}

	.details {
		padding-block-start: var(--space-2);
		border-block-start: var(--border) solid var(--line);
	}

	/*
	 * Nothing to ask for until there is something to book. `:has()` asks the
	 * browser whether any time in the grid is checked — a question it can answer
	 * with or without JavaScript — and the grid's radios live in another
	 * component, hence `:global` inside it. A browser without `:has()` simply
	 * shows the details all the time, which is a worse layout and the same
	 * working form.
	 */
	.booking:not(:has(:global(.slot input:checked))) .details {
		display: none;
	}

	.summary {
		padding: var(--space-3) var(--space-4);
		background: var(--surface-sunken);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		max-width: none;
	}

	.small {
		font-size: var(--text-sm);
		text-align: center;
		max-width: none;
	}
</style>
