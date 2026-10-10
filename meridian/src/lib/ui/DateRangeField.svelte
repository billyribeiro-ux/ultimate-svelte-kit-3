<script lang="ts">
	import { DateRangePicker } from 'bits-ui';
	import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';
	import { untrack } from 'svelte';
	import { CalendarDate, getLocalTimeZone, today, type DateValue } from '@internationalized/date';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { segmentAttributes } from './date-segments.ts';

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
	 *
	 * Each segment is rendered through Bits UI's `child` snippet, so the
	 * names a screen reader hears are in the page's language and an issue
	 * from the form is announced on the field it belongs to —
	 * `date-segments.ts` says what Bits writes in English and why.
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
		const [year, month, day] = iso.split('-').map(Number);
		return new CalendarDate(year!, month!, day!);
	};

	// The props are the *initial* value only — after that the picker owns it.
	// `untrack` says so out loud, and quiets the compiler's fair question.
	let value = $state(untrack(() => ({ start: parse(start), end: parse(end) })));
	const placeholder = today(getLocalTimeZone());

	/* The issue line's id: what an invalid segment points at with `aria-describedby`. */
	const issueId = $props.id();
	const segment = (props: Record<string, unknown>, part: string) =>
		segmentAttributes(props, part, {
			locale,
			empty: m.date_empty(),
			issueId: issues.length > 0 ? issueId : undefined
		});
</script>

<DateRangePicker.Root
	bind:value
	onValueChange={(range) => {
		if (range.start && range.end) onchange?.(range.start.toString(), range.end.toString());
	}}
	{placeholder}
	{locale}
	calendarLabel={label}
	weekdayFormat="short"
	fixedWeeks
	minValue={futureOnly ? placeholder : undefined}
	class="range"
>
	<DateRangePicker.Label class="label">{label}</DateRangePicker.Label>

	<!--
		The two dates are one group that may wrap, and the calendar button
		stays at the end: at 360px, "mm/dd/yyyy – mm/dd/yyyy" and a 36px
		button are wider than a card's column, and a field that cannot shrink
		pokes out of the card it is in.
	-->
	<div class="datefield" class:datefield--invalid={issues.length > 0}>
		<div class="datefield__dates">
			{#each [['start', startName], ['end', endName]] as const as [type, name] (type)}
				<span class="datefield__date">
					<DateRangePicker.Input {type} {name} class="range__input datefield__input">
						{#snippet children({ segments })}
							{#each segments as { part, value: text }, i (part + i)}
								<DateRangePicker.Segment {part} class="datefield__segment">
									{#snippet child({ props })}
										<span {...props} {...segment(props, part)}>{text}</span>
									{/snippet}
								</DateRangePicker.Segment>
							{/each}
						{/snippet}
					</DateRangePicker.Input>
					{#if type === 'start'}
						<span class="range__dash" aria-hidden="true">–</span>
					{/if}
				</span>
			{/each}
		</div>

		<DateRangePicker.Trigger
			class="btn btn--icon btn--ghost btn--sm datefield__trigger"
			aria-label={label}
		>
			<CalendarBlankIcon size={18} aria-hidden="true" />
		</DateRangePicker.Trigger>
	</div>

	{#each issues as issue, i (issue.message)}
		<span class="issue" id={i === 0 ? issueId : undefined}>{issue.message}</span>
	{/each}

	<DateRangePicker.Content class="datefield__popover pop-in" sideOffset={6}>
		<DateRangePicker.Calendar class="cal">
			{#snippet children({ months, weekdays })}
				<DateRangePicker.Header class="cal__header">
					<!-- Bits names these two "Previous" and "Next", in English, after any name we pass; the child snippet lets ours come last. -->
					<DateRangePicker.PrevButton class="btn btn--icon btn--ghost btn--sm">
						{#snippet child({ props })}
							<button {...props} aria-label={m.date_previous_month()}>
								<CaretLeftIcon size={16} aria-hidden="true" />
							</button>
						{/snippet}
					</DateRangePicker.PrevButton>
					<DateRangePicker.Heading class="cal__heading" />
					<DateRangePicker.NextButton class="btn btn--icon btn--ghost btn--sm">
						{#snippet child({ props })}
							<button {...props} aria-label={m.date_next_month()}>
								<CaretRightIcon size={16} aria-hidden="true" />
							</button>
						{/snippet}
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
		margin-inline-start: var(--space-1);
		color: var(--ink-3);
	}
</style>
