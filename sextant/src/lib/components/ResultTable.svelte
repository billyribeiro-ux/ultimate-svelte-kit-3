<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { Row, Value } from '#lib/sqf/value.ts';
	import { formatDuration, formatTimestamp, type Resolved } from '#lib/time/range.ts';
	import { Virtualizer } from './Virtualizer.svelte.ts';

	/**
	 * THE RESULTS TABLE
	 * =================
	 *
	 * Every query lands here, whatever its shape: a hundred thousand log lines, a
	 * six-row summary, one column of numbers. Rather than three components with a
	 * conditional between them, this renders whatever columns the result has and
	 * formats each cell by what the value *is*.
	 *
	 * That is a deliberate constraint on the query language too: because the table
	 * is generic, a new SQF function needs no interface work at all.
	 */
	interface Props {
		columns: readonly string[];
		rows: readonly Row[];
		range: Resolved;
		/** Marked in the header, so a truncated result never looks complete. */
		truncated?: boolean;
		/** Opens the detail drawer. The row index, so shallow routing can address it. */
		onselect?: (index: number) => void;
		/** The row the drawer is currently showing, for the selected style. */
		selected?: number | null;
	}

	let { columns, rows, range, truncated = false, onselect, selected = null }: Props = $props();

	const virtualizer = new Virtualizer({ estimate: 26, overscan: 4 });

	let container = $state<HTMLElement | null>(null);
	/** How many rows there were last time, so an insertion at the top can be anchored. */
	let previousCount = 0;

	$effect(() => {
		/*
		 * A new result set: forget every measurement.
		 *
		 * Keeping them would apply row 40's height to a completely different row 40,
		 * which produces a scrollbar that is wrong by however much the two differ —
		 * and, because the error is per row, wrong by a lot.
		 */
		if (rows.length < previousCount || columns.length === 0) {
			virtualizer.reset(rows.length);
			previousCount = rows.length;
			return;
		}

		/*
		 * Rows appeared at the top, which is what a tail does.
		 *
		 * Anchoring keeps the line somebody is reading in the same place. Without
		 * it the browser preserves the scroll *offset*, the content grows above,
		 * and the view jumps by exactly the height of what arrived — several times
		 * a second during an incident, which makes a tail unreadable.
		 */
		const inserted = rows.length - previousCount;
		virtualizer.count = rows.length;

		if (inserted > 0 && container) virtualizer.anchor(inserted, container);
		previousCount = rows.length;
	});

	/**
	 * Measure a row after it renders, and remember it.
	 *
	 * A `ResizeObserver` rather than a one-off `getBoundingClientRect`: a row's
	 * height changes when the window is resized and a long message re-wraps, and a
	 * cached height that no longer matches puts every row below it in the wrong
	 * place.
	 *
	 * Declared as a factory returning an attachment rather than written inline in
	 * the markup: an attachment re-runs whenever its expression produces a new
	 * function, and an arrow written in markup is new on every render — so an
	 * inline version would detach and reattach an observer per row per frame.
	 */
	function measure(index: number): Attachment<HTMLElement> {
		return (element) => {
			const observer = new ResizeObserver(([entry]) => {
				if (entry) virtualizer.measure(index, entry.contentRect.height);
			});
			observer.observe(element);
			virtualizer.measure(index, element.getBoundingClientRect().height);
			return () => observer.disconnect();
		};
	}

	const trackViewport: Attachment<HTMLElement> = (element) => {
		const observer = new ResizeObserver(([entry]) => {
			if (entry) virtualizer.viewport = entry.contentRect.height;
		});
		observer.observe(element);
		// Measured once immediately: the observer fires asynchronously, and the
		// first frame otherwise renders with a zero-height viewport, which means
		// zero visible rows and a table that appears empty until you scroll.
		virtualizer.viewport = element.getBoundingClientRect().height;
		return () => observer.disconnect();
	};

	/**
	 * How to render a value, decided by what it is rather than by its column name.
	 *
	 * A column called `duration` is a duration; so is one called `p95` produced by
	 * `percentile(duration, 95)`, and so is `slowest` from `max(duration)`. Keying
	 * off the name would format the first and miss the other two, which is exactly
	 * the case where a raw number is least readable.
	 */
	function classOf(column: string, value: Value): string {
		if (column === 'level') return `cell cell--level level--${String(value)}`;
		if (typeof value === 'number') return 'cell cell--number';
		if (value === null) return 'cell cell--null';
		return 'cell';
	}

	function render(column: string, value: Value): string {
		if (value === null) return '—';
		if (column === 'timestamp' || column === 'bucket') {
			return formatTimestamp(Number(value), range);
		}
		if (isDurationColumn(column) && typeof value === 'number') return formatDuration(value);
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	/**
	 * A heuristic, and an honest one.
	 *
	 * The evaluator knows a column's SQF type and this component does not — the
	 * result crosses the wire as plain rows. Threading the type through would be
	 * the correct fix and would mean the result shape carries a schema; for now
	 * this covers the columns durations actually appear in, and formats the rest
	 * as numbers, which is never wrong so much as less helpful.
	 */
	function isDurationColumn(column: string): boolean {
		return /duration|latency|^p\d+$|elapsed|took/i.test(column);
	}
</script>

<div class="table" data-results>
	<div class="table__head" role="presentation">
		{#each columns as column (column)}
			<div class="th truncate" title={column}>{column}</div>
		{/each}
	</div>

	<div
		class="table__body"
		bind:this={container}
		onscroll={(event) => (virtualizer.offset = event.currentTarget.scrollTop)}
		{@attach trackViewport}
	>
		{#if rows.length === 0}
			<p class="empty">No rows matched.</p>
		{:else}
			<!--
				`role="grid"` with explicit row indices.

				A virtualized table renders a window of rows, so a screen reader that
				counted the DOM would announce "row 3 of 12" while the person is at row
				4,000 of 100,000. `aria-rowcount` on the grid and `aria-rowindex` on each
				row tell it the truth, and are the reason a virtualizer does not have to
				choose between being usable and being fast.
			-->
			<div
				class="table__scroller"
				role="grid"
				aria-rowcount={rows.length}
				aria-colcount={columns.length}
				style="height: {virtualizer.total}px"
			>
				{#each virtualizer.visible as slot (slot.index)}
					{@const row = rows[slot.index]}
					{#if row}
						<div
							class="tr"
							class:tr--selected={selected === slot.index}
							role="row"
							aria-rowindex={slot.index + 1}
							tabindex={0}
							style="transform: translateY({slot.top}px)"
							onclick={() => onselect?.(slot.index)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									onselect?.(slot.index);
								}
							}}
							{@attach measure(slot.index)}
						>
							{#each columns as column (column)}
								<div class={classOf(column, row[column] ?? null)} role="gridcell">
									{render(column, row[column] ?? null)}
								</div>
							{/each}
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	{#if truncated}
		<!--
			Said plainly, and never hidden behind a tooltip.

			A truncated result that looks complete is how somebody concludes an error
			stopped happening. The count is the *shown* count, because the true one is
			not known — and saying "of many" is more honest than a number that would
			have to be guessed.
		-->
		<p class="table__note" role="status">
			Showing the first {rows.length.toLocaleString()} rows. Narrow the range or add a
			<code>take</code> to see a complete result.
		</p>
	{/if}
</div>

<style>
	.table {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	/*
	 * The header and the rows share one grid definition through a custom property
	 * so their columns line up. Defining it twice is how a table ends up with a
	 * header that drifts from its body by a pixel per column.
	 */
	.table__head,
	.tr {
		display: grid;
		grid-template-columns: var(--result-columns, repeat(auto-fit, minmax(6rem, 1fr)));
		gap: var(--space-3);
		padding: 0 var(--space-3);
		align-items: start;
	}

	.table__head {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky);
		background: var(--surface-raised);
		border-bottom: 1px solid var(--border);
		padding-block: var(--space-2);
	}

	.th {
		font-size: var(--fs-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}

	.table__body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		/* Stops a sideways swipe on a phone triggering the browser's back gesture,
		   which otherwise loses the query several times an hour. */
		overscroll-behavior: contain;
	}

	.table__scroller {
		position: relative;
		width: 100%;
	}

	.tr {
		position: absolute;
		inset-inline: 0;
		top: 0;
		/*
		 * `transform` rather than `top`.
		 *
		 * A transform is a compositor property: moving thirty rows is one paint.
		 * Setting `top` invalidates layout for each one, which on a fast scroll is
		 * the difference between smooth and visibly stepping.
		 */
		will-change: transform;
		padding-block: var(--space-1);
		border-bottom: 1px solid var(--border);
		font-family: var(--font-mono);
		font-size: var(--fs-sm);
		line-height: var(--leading-data);
		cursor: pointer;
	}

	.tr:hover {
		background: var(--surface-hover);
	}

	.tr--selected {
		background: var(--surface-active);
		box-shadow: inset 2px 0 0 var(--accent);
	}

	.cell {
		overflow-wrap: anywhere;
		color: var(--text);
	}

	.cell--number {
		/* Right-aligned so the digits line up in a column somebody scans downwards. */
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.cell--null {
		color: var(--text-faint);
	}

	.cell--level {
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		font-size: var(--fs-xs);
		letter-spacing: 0.04em;
	}

	.level--debug {
		color: var(--level-debug);
	}
	.level--info {
		color: var(--level-info);
	}
	.level--warn {
		color: var(--level-warn);
	}
	.level--error {
		color: var(--level-error);
	}
	.level--fatal {
		color: var(--level-fatal);
	}

	.empty,
	.table__note {
		padding: var(--space-4);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		margin: 0;
	}

	.table__note {
		border-top: 1px solid var(--border);
		background: var(--warn-bg);
		color: var(--text);
	}

	/*
	 * On a phone the grid collapses to one column per row and the header goes
	 * away: a six-column grid at 390px gives each column sixty pixels, which is
	 * narrower than a timestamp. Stacked, each row is a small record — which is
	 * how a log line reads on a phone anyway.
	 */
	@media (max-width: 47.99rem) {
		.table__head {
			display: none;
		}

		.tr {
			grid-template-columns: 1fr;
			gap: 0;
			padding-block: var(--space-2);
		}

		.cell--number {
			text-align: left;
		}
	}
</style>
