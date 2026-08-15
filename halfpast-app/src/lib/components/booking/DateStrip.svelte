<script lang="ts">
	import { CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';
	import {
		addDays,
		daysBetween,
		formatIsoDate,
		todayIn,
		type IsoDate,
		type TimeZone
	} from '#lib/time/index.ts';

	/**
	 * A week of days to choose between.
	 *
	 * Everything here is calendar arithmetic, never elapsed time. "Next week" is
	 * `addDays(from, 7)`, not `from + 7 * 86400000` — the latter is wrong twice a
	 * year and the failure is a day that quietly appears twice.
	 */

	let {
		from = $bindable(),
		selected = $bindable(),
		zone,
		countFor,
		maxAdvanceDays = 60
	}: {
		/** First day of the visible week. */
		from: IsoDate;
		selected: IsoDate;
		/** The viewer's zone — days are grouped by *their* midnight, not the salon's. */
		zone: TimeZone;
		/** How many slots each day has, for the little indicator. */
		countFor: (day: IsoDate) => number;
		maxAdvanceDays?: number;
	} = $props();

	const today = $derived(todayIn(zone));

	const days = $derived(
		Array.from({ length: 7 }, (_, index) => {
			const day = addDays(from, index);
			return {
				day,
				count: countFor(day),
				isToday: day === today,
				isPast: day < today
			};
		})
	);

	// Never page back before today, and never past the salon's booking horizon.
	const canGoBack = $derived(from > today);
	const canGoForward = $derived(daysBetween(today, addDays(from, 7)) <= maxAdvanceDays);

	function shift(weeks: number) {
		const next = addDays(from, weeks * 7);
		from = next < today ? today : next;
	}

	/** `Mon`, `Tue` … derived from the date rather than an index into an array. */
	const weekdayLabel = (day: IsoDate) =>
		new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(
			new Date(`${day}T00:00:00Z`)
		);

	const dayNumber = (day: IsoDate) => Number(day.slice(8, 10));
</script>

<div class="strip">
	<button
		type="button"
		class="page"
		onclick={() => shift(-1)}
		disabled={!canGoBack}
		aria-label="Previous week"
	>
		<CaretLeftIcon weight="bold" />
	</button>

	<!--
		A radiogroup, not a list of buttons. It tells assistive technology that
		these are mutually exclusive choices and gives arrow-key navigation for
		free, which is what a keyboard user expects from a date picker.
	-->
	<div class="days" role="radiogroup" aria-label="Choose a day">
		{#each days as entry (entry.day)}
			<!--
				`data-day` is the machine-readable identity of this button: the ISO
				date, unchanged by how the day is presented.

				Everything else here is written for a person — the weekday, the number,
				the "26 times available" sentence — and all of it changes as the day
				fills up. A test that identified a day by its accessible name would
				therefore be comparing "Tuesday, 18 August 2026 — 26 times available"
				against "… — 25 times available" and finding no match, which is exactly
				what happened. Give anything that has to be found again a stable
				identity, and do not make the presentation carry it.
			-->
			<button
				type="button"
				role="radio"
				data-day={entry.day}
				aria-checked={selected === entry.day}
				class="day"
				class:selected={selected === entry.day}
				class:empty={entry.count === 0}
				disabled={entry.isPast}
				onclick={() => (selected = entry.day)}
			>
				<span class="weekday">{weekdayLabel(entry.day)}</span>
				<span class="number">{dayNumber(entry.day)}</span>

				<!--
					The dot is decoration; the count is the information. Screen readers
					get the sentence, sighted users get the dot, and neither is missing
					anything the other has.
				-->
				<span class="dot" aria-hidden="true" class:none={entry.count === 0}></span>
				<span class="visually-hidden">
					{formatIsoDate(entry.day)} —
					{entry.count === 0 ? 'no times available' : `${entry.count} times available`}
				</span>
			</button>
		{/each}
	</div>

	<button
		type="button"
		class="page"
		onclick={() => shift(1)}
		disabled={!canGoForward}
		aria-label="Next week"
	>
		<CaretRightIcon weight="bold" />
	</button>
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

	.page:hover:not(:disabled) {
		color: var(--ink);
		border-color: var(--line-strong);
	}

	.page:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: var(--space-2);
		flex: 1;
		min-width: 0;
	}

	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: var(--space-2) var(--space-1);
		min-height: 4rem;

		background: var(--surface);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-md);
		color: var(--ink);

		transition:
			border-color var(--dur-fast) var(--ease-standard),
			background-color var(--dur-fast) var(--ease-standard),
			transform var(--dur-instant) var(--ease-standard);
	}

	.day:hover:not(:disabled):not(.selected) {
		border-color: var(--line-strong);
		transform: translateY(-1px);
	}

	.day:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.selected {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.weekday {
		font-size: var(--text-xs);
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

	.selected .dot {
		background: var(--on-accent);
	}

	.dot.none {
		background: transparent;
		border: 1px solid var(--line-strong);
	}

	/* On the narrowest phones the weekday initial is enough; the number carries
	 * the meaning and seven three-letter labels would wrap. */
	@media (max-width: 26rem) {
		.weekday {
			font-size: 0.6rem;
		}
		.day {
			padding-inline: 0;
		}
	}
</style>
