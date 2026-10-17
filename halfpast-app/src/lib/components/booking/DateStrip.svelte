<script lang="ts">
	import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';
	import type { ResolvedPathname } from '$app/types';
	import {
		addDays,
		daysBetween,
		formatIsoDate,
		todayIn,
		type IsoDate,
		type TimeZone
	} from '#lib/time/index.ts';

	/**
	 * A week of days to choose between, drawn as links.
	 *
	 * Links, not buttons, because the chosen day lives in the URL (`?day=…`), the
	 * same way the chosen service does. A link works before the page's script
	 * has loaded, and without it at all: the browser asks for the page with that
	 * day, and the server renders that day's times. With JavaScript, SvelteKit
	 * turns the same click into a client-side navigation. The component draws
	 * the links and owns none of the state, so `hrefFor` comes from the page,
	 * which knows what else is in the URL.
	 *
	 * Everything here is calendar arithmetic, never elapsed time. "Next week" is
	 * `addDays(from, 7)`, not `from + 7 * 86400000` — the latter is wrong twice a
	 * year and the failure is a day that quietly appears twice.
	 */

	let {
		from,
		selected,
		zone,
		countFor,
		hrefFor,
		maxAdvanceDays = 60
	}: {
		/** First day of the visible week. */
		from: IsoDate;
		selected: IsoDate;
		/** The viewer's zone — days are grouped by *their* midnight, not the salon's. */
		zone: TimeZone;
		/** How many slots each day has, for the little indicator. */
		countFor: (day: IsoDate) => number;
		/**
		 * Where choosing `day` goes. `ResolvedPathname` is what `resolve()`
		 * returns, so only a link built by `resolve()` fits, and the
		 * `svelte/no-navigation-without-resolve` lint rule can see that here.
		 */
		hrefFor: (day: IsoDate) => ResolvedPathname | undefined;
		maxAdvanceDays?: number;
	} = $props();

	const today = $derived(todayIn(zone));

	const days = $derived(
		Array.from({ length: 7 }, (_, index) => {
			const day = addDays(from, index);
			return {
				day,
				count: countFor(day),
				isPast: day < today
			};
		})
	);

	// Never page back before today, and never past the salon's booking horizon.
	// `null` means there is nowhere to go, and the arrow is drawn but not linked.
	const previousWeek = $derived.by(() => {
		if (from <= today) return null;
		const back = addDays(from, -7);
		return back < today ? today : back;
	});
	const nextWeek = $derived(
		daysBetween(today, addDays(from, 7)) <= maxAdvanceDays ? addDays(from, 7) : null
	);

	/** `Mon`, `Tue` … derived from the date rather than an index into an array. */
	const weekdayLabel = (day: IsoDate) =>
		new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(
			new Date(`${day}T00:00:00Z`)
		);

	const dayNumber = (day: IsoDate) => Number(day.slice(8, 10));
</script>

<!--
	`data-sveltekit-reset="false"` keeps the scroll position and the focused link
	when a day is chosen: the link is still there afterwards, and throwing a
	keyboard user back to the top of the page for every day they look at would
	be cruel. `data-sveltekit-replacestate` swaps the history entry instead of
	adding one, so Back leaves the time picker rather than replaying every day
	that was looked at. Both are ignored without JavaScript, where a link is a
	plain page load and the browser's own behaviour is the right one.
-->
<div class="strip" data-sveltekit-reset="false" data-sveltekit-replacestate>
	{#if previousWeek}
		<a class="page" href={hrefFor(previousWeek)} aria-label="Previous week">
			<CaretLeftIcon weight="bold" />
		</a>
	{:else}
		<span class="page" aria-hidden="true"><CaretLeftIcon weight="bold" /></span>
	{/if}

	<!--
		A list of links, with `aria-current` on the chosen one. That is the whole
		of the semantics, and every piece of it is native: each link is reachable
		with Tab, Enter follows it, and a screen reader announces "current" on the
		day that is showing. An earlier version was a row of `<button
		role="radio">` inside a `radiogroup`, which promised the arrow-key
		behaviour of a radio group and delivered none of it, because ARIA roles
		describe behaviour, they do not add it.
	-->
	<ul class="days" role="list" aria-label="Choose a day">
		{#each days as entry (entry.day)}
			<li>
				{#if entry.isPast}
					<span class="day past" aria-hidden="true">
						<span class="weekday">{weekdayLabel(entry.day)}</span>
						<span class="number">{dayNumber(entry.day)}</span>
					</span>
				{:else}
					<!--
						`data-day` is the machine-readable identity of this link: the ISO
						date, unchanged by how the day is presented.

						Everything else here is written for a person — the weekday, the
						number, the "26 times available" sentence — and all of it changes as
						the day fills up. A test that identified a day by its accessible name
						would therefore be comparing "Tuesday, 18 August 2026 — 26 times
						available" against "… — 25 times available" and finding no match,
						which is exactly what happened. Give anything that has to be found
						again a stable identity, and do not make the presentation carry it.

						The chosen day is styled from `aria-current` itself, so what a
						sighted visitor sees and what a screen reader hears cannot disagree.
					-->
					<a
						class="day"
						href={hrefFor(entry.day)}
						data-day={entry.day}
						aria-current={selected === entry.day ? 'true' : undefined}
					>
						<span class="weekday">{weekdayLabel(entry.day)}</span>
						<span class="number">{dayNumber(entry.day)}</span>

						<!--
							The dot is decoration; the count is the information. Screen readers
							get the sentence, sighted users get the dot, and neither is missing
							anything the other has.
						-->
						<span class={['dot', { none: entry.count === 0 }]} aria-hidden="true"></span>
						<span class="visually-hidden">
							{formatIsoDate(entry.day)} —
							{entry.count === 0 ? 'no times available' : `${entry.count} times available`}
						</span>
					</a>
				{/if}
			</li>
		{/each}
	</ul>

	{#if nextWeek}
		<a class="page" href={hrefFor(nextWeek)} aria-label="Next week">
			<CaretRightIcon weight="bold" />
		</a>
	{:else}
		<span class="page" aria-hidden="true"><CaretRightIcon weight="bold" /></span>
	{/if}
</div>

<style>
	.strip {
		display: flex;
		align-items: stretch;
		gap: var(--space-2);
	}

	.page {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 2.5rem;
		border: var(--border) solid var(--line);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--ink-muted);
		transition:
			color var(--dur-fast) var(--ease-standard),
			border-color var(--dur-fast) var(--ease-standard);
	}

	a.page:hover {
		color: var(--ink);
		border-color: var(--line-strong);
	}

	/* An arrow with nowhere to go: drawn, so the strip keeps its shape, but faint. */
	span.page {
		opacity: 0.35;
	}

	.days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.days li + li {
		margin: 0;
	}

	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: var(--space-2) 0;
		min-height: 4rem;
		height: 100%;

		background: var(--surface);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-md);
		color: var(--ink);
		text-decoration: none;

		transition:
			border-color var(--dur-fast) var(--ease-standard),
			background-color var(--dur-fast) var(--ease-standard),
			transform var(--dur-instant) var(--ease-standard);
	}

	a.day:hover:not([aria-current='true']) {
		border-color: var(--line-strong);
		color: var(--ink);
		transform: translateY(-1px);
	}

	.past {
		opacity: 0.3;
	}

	.day[aria-current='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.weekday {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		opacity: 0.75;
	}

	.number {
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: var(--weight-bold);
		line-height: 1;
	}

	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
		margin-block-start: 2px;
	}

	[aria-current='true'] .dot {
		background: var(--on-accent);
	}

	.dot.none {
		background: transparent;
		border: 1px solid var(--line-strong);
	}

	/* Mobile first. On the narrowest phones the number carries the meaning, so
	 * the weekday is tiny and the days have no side padding; seven three-letter
	 * labels at full size would wrap. From 26rem there is room for both. */
	@media (min-width: 26rem) {
		.day {
			padding-inline: var(--space-1);
		}

		.weekday {
			font-size: var(--text-xs);
		}
	}
</style>
