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
	import type { Attachment } from 'svelte/attachments';
	import { BarChart, PieChart } from 'layerchart';
	import { toast } from 'svelte-sonner';
	import { errorMessage } from '#lib/ui/errors.ts';
	import {
		ArrowRightIcon,
		ArrowsDownUpIcon,
		CaretDownIcon,
		CaretUpIcon,
		ReceiptIcon,
		TrashIcon
	} from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/domain/dates.ts';
	import { formatMoney, fromMinor } from '#lib/domain/money.ts';
	import {
		EXPENSE_CATEGORIES,
		ExpenseFormSchema,
		type ExpenseCategory
	} from '#lib/domain/schemas.ts';
	import { balances, settle } from '#lib/domain/split.ts';
	import { addExpense, removeExpense } from '#lib/remote/expenses.remote.ts';
	import { theme } from '#lib/ui/theme.svelte.ts';
	import DateField from '#lib/ui/DateField.svelte';
	import Empty from '#lib/ui/Empty.svelte';
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
	/* Who the form says paid, before anybody touches it: the person filling it in, if they are on the trip. */
	const payer = $derived(
		view.document.members.find((member) => member.userId === viewerId)?.userId ??
			view.document.members[0]?.userId ??
			''
	);

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

	/*
	 * The amount comes third, beside what it was for: on a phone the table
	 * scrolls sideways and the first three columns are what fits, and the
	 * amount is the reason the table exists.
	 */
	const columns = helper.columns([
		helper.accessor('date', {
			header: () => m.expenses_date(),
			cell: ({ getValue }) => formatDate(getValue(), locale, 'short')
		}),
		helper.accessor('title', { header: () => m.expenses_what() }),
		helper.accessor('amountMinor', {
			header: () => m.expenses_amount(),
			cell: ({ getValue }) => formatMoney(getValue(), currency, locale),
			meta: { align: 'end' }
		}),
		helper.accessor('category', {
			header: () => m.expenses_category(),
			cell: ({ getValue }) => categoryLabels[getValue()]()
		}),
		helper.accessor('payer', { header: () => m.expenses_paid_by() }),
		helper.accessor('sharedWith', {
			header: () => m.expenses_shared_by(),
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

	/*
	 * The wrapper fades at its right edge while there is more table than
	 * screen. Watching one element's size is an attachment's job: it is
	 * handed the element when it is in the document and its cleanup runs
	 * when it is not, so there is no `bind:this` to hold the element and no
	 * effect to wait for it to arrive. It reads no state, so it runs once.
	 */
	let overflowing = $state(false);

	const watchOverflow: Attachment<HTMLElement> = (element) => {
		const observer = new ResizeObserver(() => {
			overflowing = element.scrollWidth > element.clientWidth + 1;
		});
		observer.observe(element);
		return () => observer.disconnect();
	};

	/* ------------------------------------------------------------------ */
	/* Totals, charts, settle-up                                           */
	/* ------------------------------------------------------------------ */

	/*
	 * Header and cell templates are functions that return strings (or plain
	 * strings). TanStack's own `FlexRender` also renders components; this
	 * table only needs text, so one small helper calls a template with the
	 * context the library provides and keeps the markup a plain <table>.
	 */
	type Template<C> = string | ((context: C) => unknown) | undefined;
	const render = <C,>(template: Template<C>, context: C, fallback: string) =>
		typeof template === 'function'
			? String(template(context) ?? '')
			: typeof template === 'string'
				? template
				: fallback;

	const total = $derived(rows.reduce((sum, r) => sum + r.amountMinor, 0));

	/*
	 * A balance can be negative, and `Intl` writes the sign as a hyphen,
	 * which sets "-€108.33" with a gap a minus sign does not have. U+2212 is
	 * the minus sign, as wide as a plus.
	 */
	const money = (minor: number) => formatMoney(minor, currency, locale).replace('-', '\u2212');

	/*
	 * The charts plot amounts in major units — euros, not cents; yen, which
	 * have no cents, as they are — so the axis reads like the table.
	 * `fromMinor` asks `Intl` how many decimals the currency has.
	 */
	const byDay = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built whole inside the derivation, never mutated after
		const map = new Map<string, number>();
		for (const r of rows) map.set(r.date, (map.get(r.date) ?? 0) + r.amountMinor);
		return [...map]
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([date, minor]) => ({
				date,
				label: formatDate(date, locale, 'short'),
				day: String(Number(date.slice(8))),
				total: fromMinor(minor, currency)
			}));
	});

	const byCategory = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built whole inside the derivation, never mutated after
		const map = new Map<ExpenseCategory, number>();
		for (const r of rows) map.set(r.category, (map.get(r.category) ?? 0) + r.amountMinor);
		return [...map].map(([category, minor]) => ({
			category,
			label: categoryLabels[category](),
			total: fromMinor(minor, currency)
		}));
	});

	/*
	 * THE BAR CHART'S AXES
	 * --------------------
	 * Under each bar, "May 10" while there is room for it and the day of the
	 * month alone when there is not: the box's width is measured, and below
	 * 56px a band, six "May 10"s run together into one string. The tooltip
	 * keeps the full date either way.
	 *
	 * Up the side, round amounts in the trip's currency with no decimals,
	 * and a top tick at or above the tallest bar. LayerChart rounds the
	 * domain and picks its ticks separately, so a 264 bar could rise past a
	 * top line at 250; here both come from one step — 1, 2, 2.5 or 5 times a
	 * power of ten — chosen for about four intervals.
	 */
	let barWidth = $state(0);
	const compact = $derived(barWidth > 0 && (barWidth - 48) / Math.max(byDay.length, 1) < 56);
	const dayOf = $derived(new Map(byDay.map((d) => [d.label, d.day])));

	const yTicks = $derived.by(() => {
		const max = Math.max(0, ...byDay.map((d) => d.total));
		if (max === 0) return [0, 1];
		const raw = max / 4;
		const magnitude = 10 ** Math.floor(Math.log10(raw));
		const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? raw;
		const top = Math.ceil(max / step) * step;
		return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
	});

	const whole = $derived(
		new Intl.NumberFormat(locale, {
			style: 'currency',
			currency,
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		})
	);

	/*
	 * CHART COLOURS FROM THE TOKENS
	 * -----------------------------
	 * LayerChart paints SVG from a list of colour strings, and a token is
	 * `light-dark(#…, #…)` until a browser resolves it for an element. So a
	 * probe does the resolving: an element off screen is given each kind as
	 * its `color`, and `getComputedStyle` hands back the plain `rgb(…)` the
	 * theme currently means. It runs again when `theme.resolved` changes,
	 * which is the one time those answers change.
	 *
	 * An effect that writes state — the thing effects are usually told not
	 * to do, and the right tool here, because the answer comes from the
	 * DOM. It needs a document, which a server render has not got, and a
	 * style resolution, which a `$derived` must not force in the middle of
	 * drawing. The server draws the slices in `currentColor`; the effect
	 * paints them once the page is in a browser.
	 */
	let colours = $state<Partial<Record<ExpenseCategory, string>>>({});

	$effect(() => {
		void theme.resolved;
		const probe = document.createElement('span');
		probe.style.position = 'absolute';
		probe.style.visibility = 'hidden';
		document.body.append(probe);
		const next: Partial<Record<ExpenseCategory, string>> = {};
		for (const category of EXPENSE_CATEGORIES) {
			probe.style.color = `var(--kind-${category}, var(--ink-3))`;
			next[category] = getComputedStyle(probe).color;
		}
		probe.remove();
		colours = next;
	});

	const cRange = $derived(byCategory.map((slice) => colours[slice.category] ?? 'currentColor'));

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
			toast.error(errorMessage(error));
		}
	}
</script>

<section class="expenses stack stack--lg">
	<header class="expenses__header">
		<h2 class="expenses__title">{m.expenses_title()}</h2>
		<!-- No total over nothing: "€0 / €0 per person" above an empty state says the same thing twice. -->
		{#if rows.length > 0}
			<p class="expenses__total">
				<strong class="expenses__amount tabular">{formatMoney(total, currency, locale)}</strong>
				{#if view.document.members.length > 0}
					<span class="expenses__each tabular">
						{formatMoney(Math.round(total / view.document.members.length), currency, locale)}
						{m.expenses_per_person()}
					</span>
				{/if}
			</p>
		{/if}
	</header>

	{#if rows.length === 0}
		<!-- "Add the first one below" only when there is a form below: a viewer gets a sentence that is true for them. -->
		<Empty
			icon={ReceiptIcon}
			title={m.expenses_empty()}
			body={editable ? m.expenses_empty_lede() : m.expenses_empty_readonly()}
		/>
	{:else}
		<div class="charts">
			<figure class="card card--pad chart">
				<figcaption class="overline">{m.expenses_by_day()}</figcaption>
				<div class="chart__box" bind:clientWidth={barWidth}>
					<BarChart
						data={byDay}
						x="label"
						y="total"
						yDomain={[0, yTicks.at(-1) ?? 1]}
						yNice={false}
						props={{
							bars: { rounded: 'top', radius: 4, class: 'chart__bar' },
							xAxis: {
								tickMarks: false,
								// With no tick marks drawn, the tick length is the gap between the baseline and the labels.
								tickLength: 8,
								format: (label: string) => (compact ? (dayOf.get(label) ?? label) : label)
							},
							yAxis: {
								tickMarks: false,
								ticks: yTicks,
								format: (value: number) => whole.format(value)
							}
						}}
					/>
				</div>
			</figure>
			<!--
				A donut with the total in the hole and a legend under it: five
				slices with labels around a 14rem circle are unreadable; five chips
				with dots are not.
			-->
			<figure class="card card--pad chart">
				<figcaption class="overline">{m.expenses_by_category()}</figcaption>
				<div class="chart__box chart__box--donut">
					<PieChart
						data={byCategory}
						key="category"
						label="label"
						value="total"
						innerRadius={-28}
						{cRange}
						legend={false}
					/>
					<p class="chart__centre tabular" aria-hidden="true">
						{formatMoney(total, currency, locale)}
					</p>
				</div>
				<ul class="legend" role="list">
					{#each byCategory as slice (slice.category)}
						<li class="chip" data-kind={slice.category}>
							<span class="kind-dot" aria-hidden="true"></span>
							{slice.label}
						</li>
					{/each}
				</ul>
			</figure>
		</div>

		<div class="table-wrap" data-overflow={overflowing ? '' : undefined} {@attach watchOverflow}>
			<table class="table">
				<thead>
					{#each table.getHeaderGroups() as group (group.id)}
						<tr>
							{#each group.headers as header (header.id)}
								{const sorted = $derived(header.column.getIsSorted())}
								<th
									class={['sortable', { num: header.column.columnDef.meta?.align === 'end' }]}
									aria-sort={sorted === 'asc'
										? 'ascending'
										: sorted === 'desc'
											? 'descending'
											: 'none'}
								>
									<!-- The caret shows only when sorted; otherwise the two-way arrow waits for a hover. -->
									<button
										class="sort"
										type="button"
										onclick={header.column.getToggleSortingHandler()}
									>
										{render(header.column.columnDef.header, header.getContext(), header.column.id)}
										{#if sorted === 'asc'}<CaretUpIcon size={12} aria-hidden="true" />
										{:else if sorted === 'desc'}<CaretDownIcon size={12} aria-hidden="true" />
										{:else}<ArrowsDownUpIcon size={12} aria-hidden="true" class="sort__idle" />{/if}
									</button>
								</th>
							{/each}
							<!-- The remove column has a name for a screen reader, and nothing to read for anyone else. -->
							{#if editable}<th><span class="visually-hidden">{m.expenses_remove()}</span></th>{/if}
						</tr>
					{/each}
				</thead>
				<tbody>
					{#each table.getRowModel().rows as row (row.id)}
						<tr>
							{#each row.getAllCells() as cell (cell.id)}
								<td
									class={{
										num: cell.column.columnDef.meta?.align === 'end',
										what: cell.column.id === 'title',
										amount: cell.column.id === 'amountMinor'
									}}
								>
									{#if cell.column.id === 'category'}
										<span class="category" data-kind={row.original.category}>
											<span class="kind-dot" aria-hidden="true"></span>
											{render(
												cell.column.columnDef.cell,
												cell.getContext(),
												String(cell.getValue())
											)}
										</span>
									{:else}
										{render(
											cell.column.columnDef.cell,
											cell.getContext(),
											String(cell.getValue() ?? '')
										)}
									{/if}
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

		<!--
			Two short lists, side by side from 64em and each no wider than 28rem
			— a balance 1,100px from its name is a balance the eye has to go and
			find — one against each edge of the card.
		-->
		<div class="card card--pad stack">
			<h3>{m.expenses_settle()}</h3>
			<div class="settle">
				<ul class="balances" role="list">
					{#each [...ledger] as [userId, amount] (userId)}
						<li class="balance">
							<span>{nameOf(userId)}{userId === viewerId ? ` (${m.companions_you()})` : ''}</span>
							<span class={['balance__amount tabular', { owed: amount > 0, owes: amount < 0 }]}>
								{money(amount)}
							</span>
						</li>
					{/each}
				</ul>
				{#if transfers.length === 0}
					<p class="muted">{m.expenses_square()}</p>
				{:else}
					<!--
					Each transfer is drawn as `from → to  amount`; the sentence the
					message file holds ("Ben pays Ana") is still in the row for a
					screen reader, visually hidden.
				-->
					<ol class="transfers" role="list">
						{#each transfers as t (t.from + t.to)}
							<li class="transfer">
								<span class="visually-hidden"
									>{m.expenses_owes({ from: nameOf(t.from), to: nameOf(t.to) })}</span
								>
								<span class="transfer__who" aria-hidden="true">
									<span>{nameOf(t.from)}</span>
									<ArrowRightIcon size={14} class="transfer__arrow" />
									<span>{nameOf(t.to)}</span>
								</span>
								<strong class="tabular">{formatMoney(t.amountMinor, currency, locale)}</strong>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		</div>
	{/if}

	{#if editable}
		<!--
			A remote `form`. Every field is rendered through `fields.x.as(...)`,
			which encodes the field's type into its name so the server can
			coerce it — the amount arrives as a number, the checked companions
			as an array — and works with JavaScript off.
		-->
		<!--
			`preflight` runs the form's own schema in the browser before anything
			is sent: a forgotten date is an issue under the date at once, in the
			page's language, and the other fields keep what was typed — no round
			trip that hands back a form with its selects emptied.
		-->
		<form class="card card--pad stack" {...addExpense.preflight(ExpenseFormSchema)}>
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
					<span class="label">{m.expenses_amount()}</span>
					<!-- The currency sits inside the field, trailing, so the number is typed and the unit is read. -->
					<span class="input-group">
						<input
							class="input tabular"
							{...addExpense.fields.amount.as('number')}
							step="0.01"
							min="0.01"
							inputmode="decimal"
							required
						/>
						<span class="input-group__adornment" aria-hidden="true">{currency}</span>
					</span>
					{#each addExpense.fields.amount.issues() ?? [] as issue (issue.message)}
						<span class="issue">{issue.message}</span>
					{/each}
				</label>
			</div>

			<div class="two">
				<label class="field">
					<span class="label">{m.expenses_category()}</span>
					<!--
						A select's value is given to `as()`, not to an `<option selected>`:
						the form re-renders its fields after a submission the server
						refused, and a select with no value of its own came back with
						nothing chosen — and was then left out of the next submission.
					-->
					<select class="select" {...addExpense.fields.category.as('select', 'food')}>
						{#each EXPENSE_CATEGORIES as category (category)}
							<option value={category}>{categoryLabels[category]()}</option>
						{/each}
					</select>
					{#each addExpense.fields.category.issues() ?? [] as issue (issue.message)}
						<span class="issue">{issue.message}</span>
					{/each}
				</label>
				<!-- The trip's own date field, in the page's language; its hidden input carries the name the form expects. -->
				<DateField
					label={m.expenses_date()}
					name={addExpense.fields.date.as('hidden', '').name}
					min={view.trip.startDate}
					max={view.trip.endDate}
					issues={addExpense.fields.date.issues() ?? []}
				/>
			</div>

			<label class="field">
				<span class="label">{m.expenses_paid_by()}</span>
				<select class="select" {...addExpense.fields.paidBy.as('select', payer)}>
					{#each view.document.members as member (member.userId)}
						<option value={member.userId}>{member.name}</option>
					{/each}
				</select>
				{#each addExpense.fields.paidBy.issues() ?? [] as issue (issue.message)}
					<span class="issue">{issue.message}</span>
				{/each}
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

			<div class="submit">
				<button class="btn btn--primary" type="submit" disabled={addExpense.pending > 0}>
					{m.expenses_add()}
				</button>
			</div>
		</form>
	{/if}
</section>

<style>
	.expenses__header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.expenses__title {
		font-size: var(--text-2xl);
		letter-spacing: var(--tracking-2xl);
	}

	/* The total in the display face, the per-person share quietly beneath it. */
	.expenses__total {
		display: grid;
		justify-items: end;
		text-align: end;
	}

	.expenses__amount {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 500;
		line-height: var(--leading-tight);
		letter-spacing: var(--tracking-2xl);
	}

	.expenses__each {
		color: var(--ink-2);
		font-size: var(--text-sm);
	}

	.charts {
		display: grid;
		gap: var(--space-4);
	}

	/* Sized before the data arrives, so nothing shifts when the chart draws. */
	.chart__box {
		position: relative;
		height: 14rem;
		margin-block-start: var(--space-3);
	}

	/* No stroke: LayerChart outlines a bar by default, and a dark rim on a teal bar is a border nobody asked for. */
	.chart :global(.chart__bar) {
		fill: var(--sea);
		stroke: none;
	}

	.chart :global(.chart__bar:hover) {
		fill: var(--sea-strong);
	}

	/*
	 * Axis text and grid lines in the quiet greys. LayerChart draws a 2px
	 * halo round each label in `--color-surface-100` — white, or black in
	 * dark — so a label stays legible over a bar; set to the card's own
	 * paper, the halo is there and invisible, instead of a black outline
	 * that embossed every label on a dark card.
	 */
	.chart {
		--color-surface-100: var(--paper-2);
	}

	.chart :global(text) {
		fill: var(--ink-3);
		font-size: var(--text-xs);
	}

	.chart :global(.tick line),
	.chart :global(.rule line),
	.chart :global(.grid line) {
		stroke: var(--line);
	}

	.chart__centre {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 500;
		pointer-events: none;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-1);
		margin-block-start: var(--space-3);
	}

	/*
	 * A sortable heading is a button that fills its cell, edge to edge, and
	 * is the height of a control: the label alone was 19px tall, a target
	 * nobody could hit on a phone. The cell gives its padding to the button,
	 * so the label sits where it did, the column is as wide as it was, and
	 * the whole cell — 44px tall — is the target.
	 */
	.table th.sortable {
		padding: 0;
	}

	.sort {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		width: 100%;
		min-height: var(--control);
		padding-inline: 0.75rem;
		border-radius: var(--radius-sm);
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
	}

	/*
	 * A numeric column is right-aligned, so its sort icon goes on the left
	 * of the label: the label's right edge then meets the right edge of the
	 * numbers under it instead of stopping an icon's width short.
	 */
	.table th.num .sort {
		flex-direction: row-reverse;
		justify-content: flex-start;
	}

	/* The idle sort icon shows on hover of its heading only. */
	.sort :global(.sort__idle) {
		color: var(--ink-4);
		opacity: 0;
		transition: opacity var(--dur-2) var(--ease-out);
	}

	.sort:hover :global(.sort__idle),
	.sort:focus-visible :global(.sort__idle) {
		opacity: 1;
	}

	/*
	 * The title column may wrap; the others stay on one line. On a phone it
	 * is 8rem, so the date, what it was for and the amount — the one figure
	 * the table exists for — fit before the right-hand fade, and only the
	 * category, the payer and the shares scroll. From 40em there is room
	 * for 12.
	 */
	.table td.what {
		white-space: normal;
		min-width: 8rem;
	}

	.table td.amount {
		font-weight: 600;
	}

	.category {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.settle {
		display: grid;
		gap: var(--space-3);
	}

	.balances,
	.transfers,
	.settle > .muted {
		max-inline-size: 28rem;
	}

	.balances {
		display: grid;
		gap: var(--space-1);
	}

	.balance {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: var(--text-sm);
	}

	.balance__amount {
		font-weight: 600;
	}

	.owed {
		color: var(--sea);
	}

	.owes {
		color: var(--coral);
	}

	.transfers {
		display: grid;
		gap: var(--space-2);
		padding-block-start: var(--space-2);
		border-top: 1px solid var(--line);
	}

	.transfer {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: var(--text-sm);
	}

	.transfer__who {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.transfer__who :global(.transfer__arrow) {
		color: var(--ink-4);
	}

	.two {
		display: grid;
		gap: var(--space-3);
	}

	.submit {
		display: grid;
	}

	@media (min-width: 40em) {
		.table td.what {
			min-width: 12rem;
		}
		.two {
			grid-template-columns: 1fr 1fr;
		}
		.charts {
			grid-template-columns: 3fr 2fr;
		}
		.submit {
			justify-content: end;
		}
	}

	/*
	 * Side by side, each list at most 28rem, pushed to the two edges of the
	 * card: the balances start at its left padding and the transfers end at
	 * its right, so neither leaves a third of the card empty beside it.
	 */
	@media (min-width: 64em) {
		.settle {
			grid-template-columns: repeat(2, minmax(0, 28rem));
			justify-content: space-between;
			align-items: start;
			column-gap: var(--space-7);
		}
		.transfers {
			padding-block-start: 0;
			border-top: 0;
		}
	}
</style>
