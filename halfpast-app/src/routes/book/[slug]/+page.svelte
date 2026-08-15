<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { browser } from '$app/env';
	import { PUBLIC_DEFAULT_TIME_ZONE } from '$app/env/public';
	import { CaretLeftIcon, MapPinIcon, BroadcastIcon } from 'phosphor-svelte';

	import Alert from '#lib/components/Alert.svelte';
	import Button from '#lib/components/Button.svelte';
	import Field from '#lib/components/Field.svelte';
	import DateStrip from '#lib/components/booking/DateStrip.svelte';
	import SlotGrid, { type SlotOption } from '#lib/components/booking/SlotGrid.svelte';
	import { reveal } from '#lib/motion/index.ts';
	import {
		detectTimeZone,
		formatDuration,
		formatIsoDate,
		formatMoney,
		formatTime,
		instantToIsoDate,
		offsetLabel,
		sameWallClock,
		todayIn,
		type IsoDate
	} from '#lib/time/index.ts';

	import { book, getAvailability, getBookingPage } from './booking.remote.ts';

	let { data }: { data: { slug: string } } = $props();

	/* ---------------------------------------------------------------- state */

	/**
	 * The chosen service lives in the URL, not in component state.
	 *
	 * That is a deliberate trade. It costs a navigation, and it buys: a
	 * shareable link to a specific service, a back button that steps back through
	 * the choice, and a page that works with JavaScript disabled — because the
	 * service list is a list of ordinary links.
	 */
	const serviceSlug = $derived(page.url.searchParams.get('service'));

	/**
	 * This page's own address, computed once and guarded.
	 *
	 * The guard is not defensive padding — without it this page intermittently
	 * destroys itself, and the failure is thoroughly misleading.
	 *
	 * When SvelteKit navigates away from here, the outgoing component re-renders
	 * once before it is torn down, and by then `data` belongs to the *incoming*
	 * route — so `data.slug` is `undefined`. Most expressions shrug at that.
	 * `resolve()` does not: given `{ slug: undefined }` it throws `Missing
	 * parameter 'slug' in route /book/[slug]`, which kills the render.
	 *
	 * What makes it hard to find is where the wreckage lands. The URL has already
	 * changed, so the error is reported against the page you were navigating *to*
	 * — a 500 on the confirmation page, thrown by the page you just left, with an
	 * empty server log because the server was never involved.
	 *
	 * The general rule: inside a template, any expression that reads route data
	 * *and can throw* must tolerate that data being momentarily absent.
	 */
	const shopHref = $derived(data.slug ? resolve('/book/[slug]', { slug: data.slug }) : '');

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

	let staffId = $state<string | null>(null);

	/**
	 * The chosen time, read back out of the form.
	 *
	 * Not a separate `$state`. The radio group *is* the selection, and SvelteKit's
	 * form fields already track it — keeping a parallel copy means two sources of
	 * truth that agree until they do not.
	 */
	const selectedValue = $derived(book.fields.slot.value());
	const selectedStart = $derived(
		selectedValue ? Number(selectedValue.slice(0, selectedValue.indexOf('.'))) : null
	);

	// The visible week, and the day within it.
	let weekFrom = $state<IsoDate>(todayIn(PUBLIC_DEFAULT_TIME_ZONE));
	let selectedDay = $state<IsoDate>(todayIn(PUBLIC_DEFAULT_TIME_ZONE));

	/* ------------------------------------------------------------ page data */

	/**
	 * `await` inside `$derived` is the whole reason this page server-renders.
	 *
	 * SvelteKit waits for the boundary in the root layout to settle before it
	 * sends any HTML, so a customer — and a search engine — receives a fully
	 * rendered list of services rather than an empty div that fills in later.
	 * Reading `.ready` / `.current` instead would render nothing on the server
	 * and hydrate into content, which is a blank first paint and no SEO at all.
	 */
	const shop = $derived(await getBookingPage(data.slug));

	const service = $derived(
		serviceSlug ? (shop.services.find((entry) => entry.slug === serviceSlug) ?? null) : null
	);

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
					slug: data.slug,
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
	 * Forget the chosen time whenever the thing it referred to changes.
	 *
	 * `untrack` around the write is load-bearing, and leaving it out produces a
	 * bug that looks like the radio buttons are broken.
	 *
	 * An effect re-runs when anything it *read* changes. `fields.slot.set(...)`
	 * reads the field's current value internally, so without `untrack` this
	 * effect subscribes to the very thing it is writing: the customer clicks a
	 * time, the field changes, the effect wakes up and immediately clears it
	 * again. The selection never survives a single frame, and nothing in the
	 * console says why.
	 *
	 * `untrack` says "run this, but do not count what it reads as a dependency",
	 * which leaves the effect depending on exactly the three things named above.
	 */
	$effect(() => {
		void service?.id;
		void staffId;
		void selectedDay;
		untrack(() => book.fields.slot.set(''));
	});

	/**
	 * If the chosen slot vanishes underneath us — somebody else took it while the
	 * customer was typing their name — drop the selection rather than let them
	 * submit a time that is gone. The live query is what makes this reachable.
	 */
	$effect(() => {
		if (selectedStart === null) return;
		if (daySlots.some((slot) => slot.start === selectedStart)) return;
		untrack(() => book.fields.slot.set(''));
	});

	/* ---------------------------------------------------------- presentation */

	const businessZone = $derived(shop.business.timeZone);

	/**
	 * Only mention time zones when they actually differ. Telling a customer in
	 * Bristol that a Bristol salon is on Bristol time is noise; telling one in
	 * Lisbon is essential.
	 */
	const zonesDiffer = $derived(
		selectedStart !== null && !sameWallClock(selectedStart, viewerZone, businessZone)
	);

	function pickService(slug: string | null) {
		/*
		 * `page.url` is a `ReadonlyURL` in SvelteKit 3 — its `searchParams` has no
		 * `set` or `delete`, and assigning to `pathname` throws. That is a good
		 * change: mutating the page's URL object never did anything useful and
		 * silently looked like it might. Copy it through `href` to get a real one.
		 */
		const url = new URL(page.url.href);
		if (slug) url.searchParams.set('service', slug);
		else url.searchParams.delete('service');

		/*
		 * `reset: false` keeps the scroll position and the focused element.
		 * SvelteKit 3 replaced the old `noScroll` and `keepFocus` pair with this
		 * one option, because wanting one without the other was almost always a
		 * mistake — a page that stays put but throws focus to `<body>` strands a
		 * keyboard user in a place they cannot see.
		 */
		void goto(url, { reset: false });
	}

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
						<a class="service" href="{shopHref}?service={entry.slug}">
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
		<form {...book} class="stack stack-lg">
			<!--
				Every control inside a remote form must be built by `fields.<name>.as()`.
				A hand-written `<input name="slug">` throws at runtime — SvelteKit needs
				to own the name and value to construct the submitted data. `hidden`,
				`radio` and `submit` inputs take their value as the second argument.
			-->
			<input {...book.fields.slug.as('hidden', data.slug)} />
			<input {...book.fields.serviceId.as('hidden', service.id)} />
			<input {...book.fields.viewerTimeZone.as('hidden', viewerZone)} />

			<section class="step">
				<button type="button" class="back" onclick={() => pickService(null)}>
					<CaretLeftIcon weight="bold" aria-hidden="true" />
					All services
				</button>

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
						{#each shop.team.filter( (person) => service.staffIds.includes(person.id) ) as person (person.id)}
							<button
								type="button"
								role="radio"
								aria-checked={staffId === person.id}
								class="who-option"
								class:selected={staffId === person.id}
								onclick={() => (staffId = person.id)}
							>
								{person.displayName}
							</button>
						{/each}
					</div>
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

				<DateStrip bind:from={weekFrom} bind:selected={selectedDay} zone={viewerZone} {countFor} />

				<p class="day-label">{formatIsoDate(selectedDay)}</p>

				<SlotGrid slots={daySlots} zone={viewerZone} field={book.fields.slot} />

				{#if zonesDiffer && selectedStart !== null}
					<p class="zone-note">
						That is {formatTime(selectedStart, businessZone)} at the studio ({offsetLabel(
							selectedStart,
							businessZone
						)}), and
						{formatTime(selectedStart, viewerZone)} where you are.
					</p>
				{/if}
			</section>

			{#if selectedStart !== null}
				<section class="step details" {@attach reveal({ y: 14 })}>
					<h3>Your details</h3>

					<p class="summary">
						<strong>{service.name}</strong> ·
						{formatIsoDate(instantToIsoDate(selectedStart, viewerZone))} at
						{formatTime(selectedStart, viewerZone, { withZone: zonesDiffer })}
					</p>

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
			{/if}
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
	}

	.who-option {
		padding: var(--space-2) var(--space-4);
		min-height: 2.75rem;
		background: var(--surface);
		border: var(--border) solid var(--line-strong);
		border-radius: var(--radius-pill);
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--ink);
		transition:
			background-color var(--dur-fast) var(--ease-standard),
			border-color var(--dur-fast) var(--ease-standard);
	}

	.who-option:hover:not(.selected) {
		border-color: var(--accent);
	}

	.who-option.selected {
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
