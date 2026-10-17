<script lang="ts">
	import { DatePicker } from 'bits-ui';
	import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { segmentAttributes } from './date-segments.ts';

	/**
	 * ONE DATE, THE SAME WAY AS TWO
	 * =============================
	 *
	 * The single-date sibling of `DateRangeField.svelte`: Bits UI's
	 * `DatePicker`, segments in the page's language and a calendar in a
	 * popover, dressed by `src/lib/styles/dates.css`. A native
	 * `<input type="date">` would have been less code and the wrong field:
	 * it formats the date in the *browser's* language, not the page's — a
	 * German page in an American browser asks for mm/dd/yyyy — and it looks
	 * like nothing else in the product.
	 *
	 * `name` renders a hidden `<input>` with the ISO date, which is how the
	 * value reaches a remote `form`, with JavaScript off as well as on.
	 *
	 * An issue from the form is tied to the field the accessible way: each
	 * segment is `aria-invalid` and points at the issue line with
	 * `aria-describedby` (see `date-segments.ts` for why Bits cannot do it
	 * for us), and the calendar is named after the field — Bits' default
	 * name is the English word "Event" — with its month buttons named in the
	 * page's language too.
	 */
	interface Props {
		label: string;
		name: string;
		/** The earliest and latest dates that can be picked, as ISO dates. */
		min?: string;
		max?: string;
		/** The month the calendar opens on when nothing is picked yet. */
		near?: string;
		issues?: readonly { message: string }[];
	}

	let { label, name, min, max, near, issues = [] }: Props = $props();

	const locale = getLocale();

	const parse = (iso: string | undefined): DateValue | undefined => {
		if (!iso) return undefined;
		const [year, month, day] = iso.split('-').map(Number);
		return new CalendarDate(year!, month!, day!);
	};

	let value = $state<DateValue | undefined>();
	const placeholder = $derived(parse(near) ?? parse(min));

	const issueId = $props.id();
	const segment = (props: Record<string, unknown>, part: string) =>
		segmentAttributes(props, part, {
			locale,
			empty: m.date_empty(),
			issueId: issues.length > 0 ? issueId : undefined
		});
</script>

<DatePicker.Root
	bind:value
	{placeholder}
	{locale}
	calendarLabel={label}
	weekdayFormat="short"
	fixedWeeks
	minValue={parse(min)}
	maxValue={parse(max)}
>
	<div class="date">
		<DatePicker.Label class="label">{label}</DatePicker.Label>

		<div class={['datefield', { 'datefield--invalid': issues.length > 0 }]}>
			<div class="datefield__dates">
				<DatePicker.Input {name} class="datefield__input">
					{#snippet children({ segments })}
						{#each segments as { part, value: text }, i (part + i)}
							<DatePicker.Segment {part} class="datefield__segment">
								{#snippet child({ props })}
									<span {...props} {...segment(props, part)}>{text}</span>
								{/snippet}
							</DatePicker.Segment>
						{/each}
					{/snippet}
				</DatePicker.Input>
			</div>

			<DatePicker.Trigger
				class="btn btn--icon btn--ghost btn--sm datefield__trigger"
				aria-label={label}
			>
				<CalendarBlankIcon size={18} aria-hidden="true" />
			</DatePicker.Trigger>
		</div>

		{#each issues as issue, i (issue.message)}
			<span class="issue" id={i === 0 ? issueId : undefined}>{issue.message}</span>
		{/each}
	</div>

	<DatePicker.Content class="datefield__popover pop-in" sideOffset={6}>
		<DatePicker.Calendar class="cal cal--single">
			{#snippet children({ months, weekdays })}
				<DatePicker.Header class="cal__header">
					<!-- Bits names these two "Previous" and "Next", in English, after any name we pass; the child snippet lets ours come last. -->
					<DatePicker.PrevButton class="btn btn--icon btn--ghost btn--sm">
						{#snippet child({ props })}
							<button {...props} aria-label={m.date_previous_month()}>
								<CaretLeftIcon size={16} aria-hidden="true" />
							</button>
						{/snippet}
					</DatePicker.PrevButton>
					<DatePicker.Heading class="cal__heading" />
					<DatePicker.NextButton class="btn btn--icon btn--ghost btn--sm">
						{#snippet child({ props })}
							<button {...props} aria-label={m.date_next_month()}>
								<CaretRightIcon size={16} aria-hidden="true" />
							</button>
						{/snippet}
					</DatePicker.NextButton>
				</DatePicker.Header>

				{#each months as month (month.value.toString())}
					<DatePicker.Grid class="cal__grid">
						<DatePicker.GridHead>
							<DatePicker.GridRow>
								{#each weekdays as day (day)}
									<DatePicker.HeadCell class="cal__weekday">{day}</DatePicker.HeadCell>
								{/each}
							</DatePicker.GridRow>
						</DatePicker.GridHead>
						<DatePicker.GridBody>
							{#each month.weeks as week (week[0]?.toString())}
								<DatePicker.GridRow>
									{#each week as date (date.toString())}
										<DatePicker.Cell {date} month={month.value} class="cal__cell">
											<DatePicker.Day class="cal__day">{date.day}</DatePicker.Day>
										</DatePicker.Cell>
									{/each}
								</DatePicker.GridRow>
							{/each}
						</DatePicker.GridBody>
					</DatePicker.Grid>
				{/each}
			{/snippet}
		</DatePicker.Calendar>
	</DatePicker.Content>
</DatePicker.Root>

<style>
	.date {
		display: grid;
		gap: var(--space-1);
	}
</style>
