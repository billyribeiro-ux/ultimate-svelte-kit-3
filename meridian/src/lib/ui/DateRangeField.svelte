<script lang="ts">
	import { DateRangePicker } from 'bits-ui';
	import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';
	import { untrack } from 'svelte';
	import { CalendarDate, getLocalTimeZone, today, type DateValue } from '@internationalized/date';
	import { getLocale } from '#lib/paraglide/runtime.js';

	/**
	 * A DATE RANGE, THE ACCESSIBLE WAY
	 * ================================
	 *
	 * Bits UI is *headless*: it renders the markup, the ARIA and the keyboard
	 * model of a date range picker — segmented inputs you can type into,
	 * arrow keys between segments, a calendar grid you can arrow around — and
	 * nothing else. Every visible pixel here is ours, from `tokens.css`.
	 *
	 * The value is a pair of `CalendarDate`s from `@internationalized/date`,
	 * the same type the domain uses, so there is no conversion to get wrong.
	 * `name` on each input renders a hidden `<input>` with the ISO date, which
	 * is how the value reaches a remote `form` — and how it would reach a
	 * plain HTML form with JavaScript off.
	 */
	interface Props {
		label: string;
		startName: string;
		endName: string;
		start?: string;
		end?: string;
		/** Validation messages from the form, shown under the field. */
		issues?: readonly { message: string }[];
		/** Both ends as ISO dates, whenever a complete range is picked. */
		onchange?: (start: string, end: string) => void;
		/**
		 * Refuse dates before today. On for a new trip; off when editing one that
		 * may already have happened, where "before today" is the whole point.
		 */
		futureOnly?: boolean;
	}

	let {
		label,
		startName,
		endName,
		start,
		end,
		issues = [],
		onchange,
		futureOnly = false
	}: Props = $props();

	const locale = getLocale();

	const parse = (iso: string | undefined): DateValue | undefined => {
		if (!iso) return undefined;
		const [y, m, d] = iso.split('-').map(Number);
		return new CalendarDate(y!, m!, d!);
	};

	// The props are the *initial* value only — after that the picker owns it.
	// `untrack` says so out loud, and quiets the compiler's fair question.
	let value = $state(untrack(() => ({ start: parse(start), end: parse(end) })));
	const placeholder = today(getLocalTimeZone());
</script>

<DateRangePicker.Root
	bind:value
	onValueChange={(range) => {
		if (range.start && range.end) onchange?.(range.start.toString(), range.end.toString());
	}}
	{placeholder}
	{locale}
	weekdayFormat="short"
	fixedWeeks
	minValue={futureOnly ? placeholder : undefined}
	class="range"
>
	<DateRangePicker.Label class="label">{label}</DateRangePicker.Label>

	<div class="datefield" class:datefield--invalid={issues.length > 0}>
		{#each [['start', startName], ['end', endName]] as const as [type, name] (type)}
			<DateRangePicker.Input {type} {name} class="range__input datefield__input">
				{#snippet children({ segments })}
					{#each segments as { part, value: text }, i (part + i)}
						<DateRangePicker.Segment {part} class="datefield__segment"
							>{text}</DateRangePicker.Segment
						>
					{/each}
				{/snippet}
			</DateRangePicker.Input>
			{#if type === 'start'}
				<span class="range__dash" aria-hidden="true">–</span>
			{/if}
		{/each}

		<DateRangePicker.Trigger
			class="btn btn--icon btn--ghost btn--sm datefield__trigger"
			aria-label={label}
		>
			<CalendarBlankIcon size={18} aria-hidden="true" />
		</DateRangePicker.Trigger>
	</div>

	{#each issues as issue (issue.message)}
		<span class="issue">{issue.message}</span>
	{/each}

	<DateRangePicker.Content class="datefield__popover pop-in" sideOffset={6}>
		<DateRangePicker.Calendar class="cal">
			{#snippet children({ months, weekdays })}
				<DateRangePicker.Header class="cal__header">
					<DateRangePicker.PrevButton class="btn btn--icon btn--ghost btn--sm">
						<CaretLeftIcon size={16} aria-hidden="true" />
					</DateRangePicker.PrevButton>
					<DateRangePicker.Heading class="cal__heading" />
					<DateRangePicker.NextButton class="btn btn--icon btn--ghost btn--sm">
						<CaretRightIcon size={16} aria-hidden="true" />
					</DateRangePicker.NextButton>
				</DateRangePicker.Header>

				{#each months as month (month.value.toString())}
					<DateRangePicker.Grid class="cal__grid">
						<DateRangePicker.GridHead>
							<DateRangePicker.GridRow class="cal__row">
								{#each weekdays as day (day)}
									<DateRangePicker.HeadCell class="cal__weekday">{day}</DateRangePicker.HeadCell>
								{/each}
							</DateRangePicker.GridRow>
						</DateRangePicker.GridHead>
						<DateRangePicker.GridBody>
							{#each month.weeks as week (week[0]?.toString())}
								<DateRangePicker.GridRow class="cal__row">
									{#each week as date (date.toString())}
										<DateRangePicker.Cell {date} month={month.value} class="cal__cell">
											<DateRangePicker.Day class="cal__day">{date.day}</DateRangePicker.Day>
										</DateRangePicker.Cell>
									{/each}
								</DateRangePicker.GridRow>
							{/each}
						</DateRangePicker.GridBody>
					</DateRangePicker.Grid>
				{/each}
			{/snippet}
		</DateRangePicker.Calendar>
	</DateRangePicker.Content>
</DateRangePicker.Root>

<style>
	/* The field, the segments, the popover and the calendar are `src/lib/styles/dates.css`, shared with the single-date field. */
	:global(.range) {
		display: grid;
		gap: var(--space-1);
	}

	.range__dash {
		color: var(--ink-3);
	}
</style>
