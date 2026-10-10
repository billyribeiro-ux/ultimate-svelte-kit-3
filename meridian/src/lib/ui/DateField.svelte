<script lang="ts">
	import { DatePicker } from 'bits-ui';
	import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from 'phosphor-svelte';
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import { getLocale } from '#lib/paraglide/runtime.js';

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
		const [y, m, d] = iso.split('-').map(Number);
		return new CalendarDate(y!, m!, d!);
	};

	let value = $state<DateValue | undefined>();
	const placeholder = $derived(parse(near) ?? parse(min));
</script>

<DatePicker.Root
	bind:value
	{placeholder}
	{locale}
	weekdayFormat="short"
	fixedWeeks
	minValue={parse(min)}
	maxValue={parse(max)}
>
	<div class="date">
		<DatePicker.Label class="label">{label}</DatePicker.Label>

		<div class="datefield" class:datefield--invalid={issues.length > 0}>
			<DatePicker.Input {name} class="datefield__input">
				{#snippet children({ segments })}
					{#each segments as { part, value: text }, i (part + i)}
						<DatePicker.Segment {part} class="datefield__segment">{text}</DatePicker.Segment>
					{/each}
				{/snippet}
			</DatePicker.Input>

			<DatePicker.Trigger
				class="btn btn--icon btn--ghost btn--sm datefield__trigger"
				aria-label={label}
			>
				<CalendarBlankIcon size={18} aria-hidden="true" />
			</DatePicker.Trigger>
		</div>

		{#each issues as issue (issue.message)}
			<span class="issue">{issue.message}</span>
		{/each}
	</div>

	<DatePicker.Content class="datefield__popover pop-in" sideOffset={6}>
		<DatePicker.Calendar class="cal cal--single">
			{#snippet children({ months, weekdays })}
				<DatePicker.Header class="cal__header">
					<DatePicker.PrevButton class="btn btn--icon btn--ghost btn--sm">
						<CaretLeftIcon size={16} aria-hidden="true" />
					</DatePicker.PrevButton>
					<DatePicker.Heading class="cal__heading" />
					<DatePicker.NextButton class="btn btn--icon btn--ghost btn--sm">
						<CaretRightIcon size={16} aria-hidden="true" />
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
