<script lang="ts">
	import { untrack } from 'svelte';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageProps, Snapshot } from './$types.js';
	import LiveTail from '#lib/components/LiveTail.svelte';
	import MetricChart, { type Series } from '#lib/components/MetricChart.svelte';
	import QueryEditor from '#lib/components/QueryEditor.svelte';
	import RangePicker from '#lib/components/RangePicker.svelte';
	import ResultTable from '#lib/components/ResultTable.svelte';
	import TraceDrawer from '#lib/components/TraceDrawer.svelte';
	import { runQuery } from '#lib/remote/query.remote.ts';
	import { saveView } from '#lib/remote/settings.remote.ts';
	import { SOURCES, type Source } from '#lib/sqf/ast.ts';
	import type { Row } from '#lib/sqf/value.ts';
	import { Workspace } from '#lib/state/workspace.svelte.ts';
	import { resolve } from '#lib/time/range.ts';

	let { data }: PageProps = $props();

	/**
	 * The workspace, seeded from the URL that rendered this page.
	 *
	 * Seeded from `data` rather than from `page.url` because the server already
	 * read those parameters and applied its defaults — reading the URL again here
	 * would mean the defaulting logic exists twice and can disagree, which shows
	 * up as the query box being empty on a link with no `q`.
	 */
	const workspace = untrack(
		() =>
			new Workspace({
				q: data.q,
				range: data.range,
				view: data.view === 'chart' ? 'chart' : 'table'
			})
	);

	/*
	 * Two effects, in opposite directions, and the pair is the whole mechanism.
	 *
	 * Out: local edits reach the address bar once they settle.
	 * In: a back button, a forward button or a pasted link reaches the interface.
	 *
	 * Both are guarded on equality inside `Workspace`, which is what stops them
	 * from feeding each other forever.
	 */
	$effect(() => workspace.sync());
	$effect(() => workspace.adopt(page.url.search));

	/**
	 * The query that has actually been *run*.
	 *
	 * Separate from `workspace.q`, and the separation is the point. Typing changes
	 * the text; only pressing Run changes what is on screen. A query language with
	 * a live-as-you-type result sounds delightful and means every half-finished
	 * query — `from logs | where` — is sent to the server, and the results flicker
	 * through nonsense on the way to what somebody meant.
	 */
	let submitted = $state(untrack(() => ({ q: data.q, range: data.range })));

	function run(): void {
		workspace.flush();
		submitted = { q: workspace.q, range: workspace.range };
	}

	/**
	 * `await` in a `$derived`, inside a `<svelte:boundary>`.
	 *
	 * This is what the async compiler option buys: the result of a query is
	 * *literally* the awaited value, with no `loading` flag, no `error` field and
	 * no effect that assigns into state. The boundary below supplies the pending
	 * and failed states for the whole subtree, which means those two states are
	 * declared once rather than in every component that can be waiting.
	 */
	const result = $derived(
		await runQuery({ tenant: data.tenant, q: submitted.q, range: submitted.range })
	);

	const window_ = $derived(resolve(submitted.range));

	/** Which table the query reads, for completion. Cheap enough to redo per keystroke. */
	const source = $derived.by((): Source => {
		const word = workspace.q.trim().split(/\s+/)[1] ?? '';
		return SOURCES.includes(word as Source) ? (word as Source) : 'logs';
	});

	/**
	 * A chart needs a time column and a number column.
	 *
	 * Rather than a chart mode that only works on queries written a particular
	 * way, this looks at the result and says what is missing. "Add `by bucket =
	 * bin(timestamp, 1m)`" is a sentence somebody can act on; a blank chart is not.
	 */
	const chart = $derived.by((): { series: Series[]; problem: string | null } => {
		const columns = result.columns;
		const timeColumn = columns.find((column) => column === 'bucket' || column === 'timestamp');
		const valueColumns = columns.filter(
			(column) =>
				column !== timeColumn && result.rows.some((row) => typeof row[column] === 'number')
		);

		if (!timeColumn) {
			return {
				series: [],
				problem: 'This result has no time column. Add `by bucket = bin(timestamp, 1m)`.'
			};
		}
		if (valueColumns.length === 0) {
			return { series: [], problem: 'This result has no numeric column to plot.' };
		}

		/*
		 * One series per numeric column, or one per group when the result is grouped.
		 *
		 * The grouped case is the common one — `summarize n = count() by service,
		 * bucket` — and it needs the rows split by the non-numeric, non-time columns
		 * rather than by column name.
		 */
		const groupColumns = columns.filter(
			(column) => column !== timeColumn && !valueColumns.includes(column)
		);

		// Local to this derived and discarded when it returns. A `SvelteMap` would
		// make every `set` in the loop below a reactive write, inside the very
		// derived that is building it.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const byKey = new Map<string, { label: string; points: { x: number; y: number }[] }>();

		for (const row of result.rows) {
			const at = Number(row[timeColumn]);
			if (!Number.isFinite(at)) continue;

			for (const column of valueColumns) {
				const value = row[column];
				if (typeof value !== 'number') continue;

				const groupLabel = groupColumns.map((group) => String(row[group] ?? '')).join(' · ');
				const label = groupLabel ? `${groupLabel} · ${column}` : column;

				const entry = byKey.get(label) ?? { label, points: [] };
				entry.points.push({ x: at, y: value });
				byKey.set(label, entry);
			}
		}

		return {
			series: [...byKey].map(([key, entry]) => ({
				key,
				label: entry.label,
				// Sorted here rather than trusted from the query: LTTB requires ordered
				// input and says so, and a `summarize` without a `sort` makes no promise
				// about row order at all.
				points: entry.points.sort((a, b) => a.x - b.x)
			})),
			problem: null
		};
	});

	/* ---- Live tail ---- */

	let tailing = $state(false);
	let tailRows = $state.raw<Row[]>([]);

	/* ---- Shallow routing ---- */

	/**
	 * Opening a trace does not navigate.
	 *
	 * `pushState` with a `page.state` payload adds a history entry — so the back
	 * button closes the drawer — without running a single `load` function. The
	 * query results stay exactly as they were, which matters because the whole
	 * point of the drawer is to look at a trace *without losing the search that
	 * found it*.
	 *
	 * A real navigation to `/[tenant]/traces/[id]` also exists and is what the URL
	 * in the address bar becomes, so the link is shareable and a reload lands on a
	 * full page. That combination — shallow within a session, real when shared —
	 * is what shallow routing is for, and it is why the drawer is not just a
	 * component with an `open` prop.
	 */
	function openTrace(traceId: string): void {
		pushState(`/${data.tenant}/traces/${encodeURIComponent(traceId)}`, { trace: traceId });
	}

	function openRow(index: number): void {
		const row = rows[index];
		// `trace_id`, the name SQF uses — not Drizzle's `traceId`. The storage layer
		// projects rows into the schema's names precisely so that this file, the
		// query text and the documentation all say the same word.
		const traceId = row?.trace_id;

		// A row with a trace opens the trace; one without opens the row detail.
		if (typeof traceId === 'string' && traceId !== '') openTrace(traceId);
		else pushState('', { row: index });
	}

	const rows = $derived(tailing ? tailRows : result.rows);
	const columns = $derived(
		tailing && tailRows.length > 0 ? Object.keys(tailRows[0]!) : result.columns
	);

	/**
	 * `export const snapshot` — what survives leaving the page and coming back.
	 *
	 * SvelteKit calls `capture` before a navigation away and `restore` when the
	 * back button brings this exact history entry back. It is stored in
	 * `history.state`, so it survives a reload of the tab but not a new tab.
	 *
	 * WHAT IS AND IS NOT WORTH CAPTURING
	 * ----------------------------------
	 * The **draft** is: a half-written query that somebody left to go and look at a
	 * trace is work, and losing it is the kind of small betrayal that makes people
	 * stop trusting a tool. It is not in the URL precisely because it is
	 * half-written — putting every keystroke in the address bar would be a hundred
	 * history entries and a link to a broken query.
	 *
	 * The **results** are not. They could be tens of megabytes, `history.state` has
	 * a size limit measured in low megabytes, and exceeding it throws on
	 * `pushState` — which would break navigation itself rather than degrade it.
	 * They are re-fetched, which takes milliseconds and is always current.
	 *
	 * The **tail** is not either, and that is a product decision rather than a
	 * technical one: coming back to a tail that has been "live" while nobody was
	 * watching would show a gap, and a gap in a live view reads as an outage.
	 */
	export const snapshot: Snapshot<{ draft: string; tailing: boolean }> = {
		capture: () => ({ draft: workspace.q, tailing }),
		restore: (value) => {
			workspace.q = value.draft;
			tailing = value.tailing;
		}
	};
</script>

<svelte:head>
	<title>Explore · {data.tenant} · Sextant</title>
</svelte:head>

<div class="explore">
	<!--
		Labelled "Query editor", not "Query".

		The textarea inside it is already labelled "Query", and two things with the
		same accessible name in one region is genuinely ambiguous — a screen reader
		announces the landmark and the control identically, and there is no way to
		tell from the announcement which one has focus. An end-to-end test found it
		by resolving the name to two elements, which is the same ambiguity said in a
		different voice.
	-->
	<section class="explore__query" aria-label="Query editor">
		<!--
			The catalogue is streamed, so completion is behind an `#await`.

			`then` with no `pending` branch: there is nothing to show while it is in
			flight, because the editor is fully usable without completion. A spinner
			over a working editor would be a worse experience than no spinner.
		-->
		{#await data.services then services}
			<QueryEditor
				bind:value={workspace.q}
				catalogue={{ source, services }}
				onrun={run}
				serverError={null}
			/>
		{/await}

		<div class="explore__controls">
			<button type="button" class="btn btn--primary" onclick={run}>
				Run
				<kbd>⌘↵</kbd>
			</button>

			<RangePicker bind:value={workspace.range} />

			<div class="explore__views" role="group" aria-label="View">
				<button
					type="button"
					class="btn btn--sm"
					aria-pressed={workspace.view === 'table'}
					onclick={() => (workspace.view = 'table')}>Table</button
				>
				<button
					type="button"
					class="btn btn--sm"
					aria-pressed={workspace.view === 'chart'}
					onclick={() => (workspace.view = 'chart')}>Chart</button
				>
			</div>

			<button
				type="button"
				class="btn btn--sm"
				aria-pressed={tailing}
				onclick={() => {
					tailing = !tailing;
					tailRows = [];
				}}
			>
				{tailing ? 'Stop tail' : 'Live tail'}
			</button>

			<!--
				Saving a view is a form, and the hidden fields carry the *current* query
				rather than the submitted one.

				Somebody who has edited the box and not pressed Run still means the thing
				they can see. A form that saved `submitted` would silently store the
				previous query, which is the kind of quiet wrongness people discover
				weeks later when the view opens something they never wrote.
			-->
			<form {...saveView} class="explore__save">
				<input {...saveView.fields.tenant.as('hidden', data.tenant)} />
				<input {...saveView.fields.query.as('hidden', workspace.q)} />
				<input {...saveView.fields.range.as('hidden', workspace.range)} />
				<input
					class="input btn--sm"
					placeholder="Save this view as…"
					aria-label="Name for the saved view"
					required
					{...saveView.fields.name.as('text')}
				/>
				<button type="submit" class="btn btn--sm">Save</button>
			</form>
		</div>
	</section>

	{#if tailing}
		<LiveTail tenant={data.tenant} q={submitted.q} bind:rows={tailRows} />
	{/if}

	<!--
		ONE BOUNDARY FOR THE WHOLE RESULT AREA.

		`pending` renders while the awaited query is in flight, and `failed` renders
		when it throws — including a 400 from the checker, which is the common case
		and is not an exceptional condition at all. Doing this with flags would mean
		three states threaded through four components; doing it with a boundary means
		the components below can be written as though the data is simply there.
	-->
	<svelte:boundary>
		<section class="explore__results" aria-label="Results">
			{#if workspace.view === 'chart' && !tailing}
				{#if chart.problem}
					<p class="notice">{chart.problem}</p>
				{:else}
					<MetricChart
						series={chart.series}
						from={window_.from}
						to={window_.to}
						height={280}
						label="Query result over time"
					/>
				{/if}
			{:else}
				<ResultTable
					{columns}
					{rows}
					range={window_}
					truncated={!tailing && result.truncated}
					selected={page.state.row ?? null}
					onselect={openRow}
				/>
			{/if}
		</section>

		{#if !tailing}
			<footer class="explore__stats">
				<span>{result.rows.length.toLocaleString()} rows</span>
				<span>{result.scanned.toLocaleString()} scanned</span>
				<!--
					Whether the filter ran in SQLite or in the evaluator.

					Exposed rather than hidden because it is the difference between a query
					that stays fast as the data grows and one that does not — and knowing
					*which* is how somebody learns to write the first kind.
				-->
				<span class="chip" class:chip--ok={result.pushed}>
					{result.pushed ? 'pushed to SQL' : 'filtered in memory'}
				</span>
			</footer>
		{/if}

		{#snippet pending()}
			<div class="explore__results">
				<p class="notice" role="status">Running…</p>
			</div>
		{/snippet}

		{#snippet failed(error, reset)}
			<div class="explore__results">
				<p class="notice notice--error" role="alert">
					{(error as { body?: { message?: string } })?.body?.message ??
						(error as Error)?.message ??
						'The query failed.'}
				</p>
				<button type="button" class="btn btn--sm" onclick={reset}>Try again</button>
			</div>
		{/snippet}
	</svelte:boundary>
</div>

<!--
	The drawer is driven entirely by `page.state`.

	Not by a local `open` variable that `pushState` also happens to set — because
	then the back button would change the history entry and leave the variable
	true. Reading the state directly means there is exactly one source of truth and
	the browser's own navigation is it.
-->
{#if page.state.trace}
	<TraceDrawer tenant={data.tenant} traceId={page.state.trace} />
{/if}

<style>
	.explore {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		flex: 1;
		min-height: 0;
		padding: var(--space-3);
	}

	.explore__query {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.explore__controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.explore__views {
		display: flex;
		gap: 2px;
	}

	.explore__save {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}

	.explore__save .input {
		width: 12rem;
		min-height: 1.75rem;
		font-size: var(--fs-xs);
	}

	.explore__views .btn[aria-pressed='true'],
	.explore__controls .btn[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}

	kbd {
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		opacity: 0.7;
	}

	.explore__results {
		flex: 1;
		min-height: 18rem;
		display: flex;
		flex-direction: column;
	}

	.explore__stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		font-size: var(--fs-xs);
		color: var(--text-faint);
		font-family: var(--font-mono);
	}

	.notice {
		margin: 0;
		padding: var(--space-4);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.notice--error {
		border-color: var(--danger);
		background: var(--danger-bg);
		color: var(--text);
	}
</style>
