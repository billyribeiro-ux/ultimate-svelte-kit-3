<script lang="ts">
	import {
		createColumnHelper,
		createSortedRowModel,
		createTable,
		rowSortingFeature,
		sortFn_alphanumeric,
		sortFn_basic,
		tableFeatures
	} from '@tanstack/svelte-table';
	import { BarChart, PieChart } from 'layerchart';
	import { toast } from 'svelte-sonner';
	import { CaretDownIcon, CaretUpIcon, TrashIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/domain/dates.ts';
	import { formatMoney } from '#lib/domain/money.ts';
	import { EXPENSE_CATEGORIES, type ExpenseCategory } from '#lib/domain/schemas.ts';
	import { balances, settle } from '#lib/domain/split.ts';
	import { addExpense, removeExpense } from '#lib/remote/expenses.remote.ts';
	import type { TripState } from './state.svelte.ts';

	/**
	 * WHO PAID, WHO OWES
	 * ==================
	 *
	 * Three views of the same rows: a sortable table (TanStack Table), two
	 * charts (LayerChart), and the settle-up — which is the domain's
	 * `balances()` and `settle()` on the raw minor units, so the cents on
	 * screen are the cents the server would compute.
	 *
	 * TanStack Table is *headless*: it sorts, groups and paginates, and
	 * renders nothing. The markup below is a plain `<table>` in our own CSS,
	 * and the library's job is the header click that sorts and the row model
	 * that comes back sorted. In v9 the features are opt-in — `tableFeatures`
	 * names the ones this table uses — so the bundle carries sorting and not
	 * the twelve other things a data grid can do.
	 */
	interface Props {
		view: TripState;
		editable: boolean;
		viewerId: string | null;
	}

	let { view, editable, viewerId }: Props = $props();

	const locale = getLocale();
	const currency = $derived(view.trip.currency);
	const names = $derived(new Map(view.document.members.map((c) => [c.userId, c.name])));
	const nameOf = (id: string) => names.get(id) ?? '…';

	const categoryLabels: Record<ExpenseCategory, () => string> = {
		food: m.category_food,
		lodging: m.category_lodging,
		transport: m.category_transport,
		activity: m.category_activity,
		other: m.category_other
	};

	interface Row {
		readonly id: string;
		readonly date: string;
		readonly title: string;
		readonly category: ExpenseCategory;
		readonly payer: string;
		readonly amountMinor: number;
		readonly sharedWith: number;
	}

	const rows: Row[] = $derived(
		view.document.expenses.map((e) => ({
			id: e.id,
			date: e.date,
			title: e.title,
			category: e.category,
			payer: nameOf(e.paidBy),
			amountMinor: e.amountMinor,
			sharedWith: e.shares.length
		}))
	);

	/* ------------------------------------------------------------------ */
	/* The table                                                           */
	/* ------------------------------------------------------------------ */

	const features = tableFeatures({
		rowSortingFeature,
		sortedRowModel: createSortedRowModel(),
		sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
		// A type-only slot: `meta.align` on a column is now typed, with no global declaration merging.
		columnMeta: {} as { align?: 'end' }
	});

	const helper = createColumnHelper<typeof features, Row>();

	const columns = helper.columns([
		helper.accessor('date', {
			header: () => m.expenses_date(),
			cell: ({ getValue }) => formatDate(getValue(), locale, 'short')
		}),
		helper.accessor('title', { header: () => m.expenses_what() }),
		helper.accessor('category', {
			header: () => m.expenses_category(),
			cell: ({ getValue }) => categoryLabels[getValue()]()
		}),
		helper.accessor('payer', { header: () => m.expenses_paid_by() }),
		helper.accessor('sharedWith', {
			header: () => m.expenses_shared_by(),
			meta: { align: 'end' }
		}),
		helper.accessor('amountMinor', {
			header: () => m.expenses_amount(),
			cell: ({ getValue }) => formatMoney(getValue(), currency, locale),
			meta: { align: 'end' }
		})
	]);

	/*
	 * `get data()` is a getter, so the table sees the latest rows whenever the
	 * live document changes, without being re-created. The adapter syncs
	 * options in `$effect.pre`, before the rows below are read.
	 */
	const table = createTable({
		features,
		columns,
		get data() {
			return rows;
		},
		getRowId: (row) => row.id,
		initialState: { sorting: [{ id: 'date', desc: false }] }
	});

	/* ------------------------------------------------------------------ */
	/* Totals, charts, settle-up                                           */
	/* ------------------------------------------------------------------ */

	/*
	 * Header and cell templates are functions that return strings (or plain
	 * strings). TanStack's own `FlexRender` also renders components; this
	 * table only needs text, so two small helpers call the templates with the
	 * context the library provides and keep the markup a plain <table>.
	 */
	type Template<C> = string | ((context: C) => unknown) | undefined;
	const render = <C,>(template: Template<C>, context: C, fallback: string) =>
		typeof template === 'function'
			? String(template(context) ?? '')
			: typeof template === 'string'
				? template
				: fallback;

	const total = $derived(rows.reduce((sum, r) => sum + r.amountMinor, 0));

	const byDay = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built whole inside the derivation, never mutated after
		const map = new Map<string, number>();
		for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + r.amountMinor);
		return [...map]
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([date, minor]) => ({
				date,
				label: formatDate(date, locale, 'day'),
				total: minor / 100
			}));
	});

	const byCategory = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built whole inside the derivation, never mutated after
		const map = new Map<ExpenseCategory, number>();
		for (const r of rows) map.set(r.category, (map.get(r.category) ?? 0) + r.amountMinor);
		return [...map].map(([category, minor]) => ({
			category,
			label: categoryLabels[category](),
			total: minor / 100
		}));
	});

	const ledger = $derived(
		balances(
			view.document.expenses.map((e) => ({
				amountMinor: e.amountMinor,
				paidBy: e.paidBy,
				shares: e.shares.map((s) => ({ userId: s.userId, weight: s.weight }))
			}))
		)
	);
	const transfers = $derived(settle(ledger));

	async function remove(id: string) {
		try {
			await removeExpense({ tripId: view.trip.id, id });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		}
	}
</script>

<section class="expenses stack stack--lg">
	<header class="cluster cluster--between">
		<h2>{m.expenses_title()}</h2>
		<p class="expenses__total tabular">
			<strong>{formatMoney(total, currency, locale)}</strong>
			{#if view.document.members.length > 0}
				<span class="muted">
					· {formatMoney(Math.round(total / view.document.members.length), currency, locale)}
					{m.expenses_per_person()}
				</span>
			{/if}
		</p>
	</header>

	{#if rows.length === 0}
		<p class="card card--pad muted">{m.expenses_empty()}</p>
	{:else}
		<div class="charts">
			<figure class="card card--pad chart">
				<figcaption class="label">{m.expenses_by_day()}</figcaption>
				<div class="chart__box">
					<BarChart
						data={byDay}
						x="label"
						y="total"
						props={{ bars: { rounded: 'top', class: 'chart__bar' } }}
					/>
				</div>
			</figure>
			<figure class="card card--pad chart">
				<figcaption class="label">{m.expenses_by_category()}</figcaption>
				<div class="chart__box">
					<PieChart
						data={byCategory}
						key="category"
						label="label"
						value="total"
						innerRadius={-20}
					/>
				</div>
			</figure>
		</div>

		<div class="table-wrap">
			<table class="table">
				<thead>
					{#each table.getHeaderGroups() as group (group.id)}
						<tr>
							{#each group.headers as header (header.id)}
								{@const sorted = header.column.getIsSorted()}
								<th
									class:num={header.column.columnDef.meta?.align === 'end'}
									aria-sort={sorted === 'asc'
										? 'ascending'
										: sorted === 'desc'
											? 'descending'
											: 'none'}
								>
									<button
										class="sort"
										type="button"
										onclick={header.column.getToggleSortingHandler()}
									>
										{render(header.column.columnDef.header, header.getContext(), header.column.id)}
										{#if sorted === 'asc'}<CaretUpIcon size={12} aria-hidden="true" />
										{:else if sorted === 'desc'}<CaretDownIcon size={12} aria-hidden="true" />{/if}
									</button>
								</th>
							{/each}
							{#if editable}<th></th>{/if}
						</tr>
					{/each}
				</thead>
				<tbody>
					{#each table.getRowModel().rows as row (row.id)}
						<tr>
							{#each row.getAllCells() as cell (cell.id)}
								<td class:num={cell.column.columnDef.meta?.align === 'end'}>
									{render(
										cell.column.columnDef.cell,
										cell.getContext(),
										String(cell.getValue() ?? '')
									)}
								</td>
							{/each}
							{#if editable}
								<td class="num">
									<button
										class="btn btn--icon btn--ghost btn--sm"
										type="button"
										title={m.expenses_remove()}
										aria-label={m.expenses_remove()}
										onclick={() => remove(row.original.id)}
									>
										<TrashIcon size={14} aria-hidden="true" />
									</button>
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="hint">{m.expenses_sort_hint()}</p>

		<div class="card card--pad stack stack--sm">
			<h3>{m.expenses_settle()}</h3>
			<ul class="balances" role="list">
				{#each [...ledger] as [userId, amount] (userId)}
					<li class="cluster cluster--between">
						<span>{nameOf(userId)}{userId === viewerId ? ` (${m.companions_you()})` : ''}</span>
						<span class="tabular" class:owed={amount > 0} class:owes={amount < 0}>
							{formatMoney(amount, currency, locale)}
						</span>
					</li>
				{/each}
			</ul>
			{#if transfers.length === 0}
				<p class="muted">{m.expenses_square()}</p>
			{:else}
				<ol class="transfers">
					{#each transfers as t (t.from + t.to)}
						<li>
							{m.expenses_owes({ from: nameOf(t.from), to: nameOf(t.to) })}
							<strong class="tabular">{formatMoney(t.amountMinor, currency, locale)}</strong>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	{/if}

	{#if editable}
		<!--
			A remote `form`. Every field is rendered through `fields.x.as(...)`,
			which encodes the field's type into its name so the server can
			coerce it — the amount arrives as a number, the checked companions
			as an array — and works with JavaScript off.
		-->
		<form class="card card--pad stack" {...addExpense}>
			<h3>{m.expenses_add()}</h3>
			<input {...addExpense.fields.tripId.as('hidden', view.trip.id)} />

			<div class="two">
				<label class="field">
					<span class="label">{m.expenses_what()}</span>
					<input class="input" {...addExpense.fields.title.as('text')} required maxlength="120" />
					{#each addExpense.fields.title.issues() ?? [] as issue (issue.message)}
						<span class="issue">{issue.message}</span>
					{/each}
				</label>
				<label class="field">
					<span class="label">{m.expenses_amount()} ({currency})</span>
					<input
						class="input"
						{...addExpense.fields.amount.as('number')}
						step="0.01"
						min="0.01"
						inputmode="decimal"
						required
					/>
					{#each addExpense.fields.amount.issues() ?? [] as issue (issue.message)}
						<span class="issue">{issue.message}</span>
					{/each}
				</label>
			</div>

			<div class="two">
				<label class="field">
					<span class="label">{m.expenses_category()}</span>
					<select class="select" {...addExpense.fields.category.as('select')}>
						{#each EXPENSE_CATEGORIES as category (category)}
							<option value={category}>{categoryLabels[category]()}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span class="label">{m.expenses_date()}</span>
					<input
						class="input"
						{...addExpense.fields.date.as('date')}
						min={view.trip.startDate}
						max={view.trip.endDate}
						required
					/>
				</label>
			</div>

			<label class="field">
				<span class="label">{m.expenses_paid_by()}</span>
				<select class="select" {...addExpense.fields.paidBy.as('select')}>
					{#each view.document.members as member (member.userId)}
						<option value={member.userId} selected={member.userId === viewerId}
							>{member.name}</option
						>
					{/each}
				</select>
			</label>

			<fieldset class="field">
				<legend class="label">{m.expenses_shared_by()}</legend>
				<div class="cluster">
					{#each view.document.members as member (member.userId)}
						<label class="check">
							<input {...addExpense.fields.participants.as('checkbox', member.userId)} checked />
							{member.name}
						</label>
					{/each}
				</div>
				{#each addExpense.fields.participants.issues() ?? [] as issue (issue.message)}
					<span class="issue">{issue.message}</span>
				{/each}
			</fieldset>

			<div>
				<button class="btn btn--primary" type="submit" disabled={addExpense.pending > 0}>
					{m.expenses_add()}
				</button>
			</div>
		</form>
	{/if}
</section>

<style>
	.expenses__total {
		font-size: var(--text-lg);
	}

	.charts {
		display: grid;
		gap: var(--space-4);
	}

	.chart__box {
		height: 14rem;
		margin-block-start: var(--space-2);
	}

	.chart :global(.chart__bar) {
		fill: var(--sea);
	}

	.sort {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
	}

	.balances {
		display: grid;
		gap: var(--space-1);
	}

	.owed {
		color: var(--sea);
	}

	.owes {
		color: var(--coral);
	}

	.transfers {
		padding-inline-start: 1.2em;
		display: grid;
		gap: var(--space-1);
	}

	.two {
		display: grid;
		gap: var(--space-3);
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
	}

	@media (min-width: 40em) {
		.two {
			grid-template-columns: 1fr 1fr;
		}
		.charts {
			grid-template-columns: 3fr 2fr;
		}
	}
</style>
