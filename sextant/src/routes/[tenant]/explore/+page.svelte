<script lang="ts">
	import { settled, tick, untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { goto } from '$app/navigation';
	// Aliased: this page already has a `resolve` — the time-range one, from
	// `#lib/time/range.ts` — so the two `resolve`s cannot be confused.
	import { resolve as resolvePath } from '$app/paths';
	import { navigating, page } from '$app/state';
	import type { PageProps, Snapshot } from './$types.js';
	import LiveTail from '#lib/components/LiveTail.svelte';
	import MetricChart, { type Series } from '#lib/components/MetricChart.svelte';
	import QueryEditor from '#lib/components/QueryEditor.svelte';
	import RangePicker from '#lib/components/RangePicker.svelte';
	import ResultTable from '#lib/components/ResultTable.svelte';
	import TraceDrawer from '#lib/components/TraceDrawer.svelte';
	import { keepTyped } from '#lib/forms/keep-typed.ts';
	import { runQuery } from '#lib/remote/query.remote.ts';
	import { saveView } from '#lib/remote/settings.remote.ts';
	import { SOURCES, type Source } from '#lib/sqf/ast.ts';
	import type { Row } from '#lib/sqf/value.ts';
	import { Streamed } from '#lib/reactivity/streamed.svelte.ts';
	import { Workspace } from '#lib/state/workspace.svelte.ts';
	import { resolve } from '#lib/time/range.ts';

	let { data }: PageProps = $props();

	/** What a query sends back: its columns, its rows and how it ran. */
	type Answer = Awaited<ReturnType<typeof runQuery>>;

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
			new Workspace(
				{
					q: data.q,
					range: data.range,
					view: data.view === 'chart' ? 'chart' : 'table'
				},
				// This page's URL for a search string. `resolve` accepts a route id with
				// a query string, and types the result as a path this app can serve.
				(search) => resolvePath(`/[tenant]/explore?${search}`, { tenant: data.tenant })
			)
	);

	/*
	 * A WRITE THAT IS STILL SETTLING BELONGS TO THIS PAGE
	 * ---------------------------------------------------
	 * The workspace writes the address bar with a shallow `goto` and
	 * `replace: true`, up to 400ms after the edit that caused it. The write
	 * replaces whichever history entry is current *when it fires* — so if the
	 * person has moved on in those 400ms, it lands on somebody else's.
	 *
	 * The end-to-end suite found the expensive case under load. Arrive on a link
	 * with no `view`, open a trace, press "Open full page" — all inside the 400ms
	 * — and the write that adds `view=table` fired while the router was finishing
	 * the real navigation. A shallow `goto` is a navigation in SvelteKit 3 — the
	 * `replaceState` it replaced never touched the router — so it took that
	 * navigation over: the trace page rendered under `/explore?…&view=table`, and
	 * SvelteKit reported the navigation the person asked for as aborted.
	 *
	 * So the workspace writes only while the address bar is this page's, and
	 * only while the router is idle. `page.shallow` is what SvelteKit 3 says
	 * about a URL that a shallow `goto` put there — `page.url` goes on describing
	 * the page that is rendered — and while it names another route, which is
	 * what the drawer's trace URL does, the address bar belongs to the drawer.
	 */
	const ownsAddressBar = $derived(
		page.shallow === null || page.shallow.route?.id === page.route.id
	);

	/*
	 * Two effects, in opposite directions, and the pair is the whole mechanism.
	 *
	 * Out: local edits reach the address bar once they settle — while it is this
	 * page's, and while no navigation is in flight. `navigating` is the router's
	 * own word for the second: its fields are `null` when no navigation is
	 * occurring. Reading it here does two jobs. When a navigation starts (a link,
	 * the back button, the drawer opening), the effect runs again and its cleanup
	 * drops the timer that was waiting. When the router is idle again, it runs
	 * once more and schedules whatever is still unwritten. If the navigation came
	 * back to this page, the header's own Explore link for instance, that write
	 * lands on the entry the link made. If it went anywhere else, this page and
	 * its effect are gone, and nothing is written at all. The workspace's own
	 * writes and a selected row are navigations too, and only restart the wait.
	 * The drawer works the same way through `ownsAddressBar`: the write it held
	 * is made when it closes, to the entry it was always meant for.
	 *
	 * In: a back button, a forward button or a pasted link reaches the interface.
	 * It reads the address bar as it is *now* — `page.shallow.url` once a shallow
	 * `goto` has put a URL there — because `page.url` keeps the URL the page was
	 * rendered from. Reading `page.url` here would undo a zoom made just before a
	 * trace was opened: closing the drawer goes back to an entry SvelteKit
	 * re-renders from the page's first URL, and the effect would adopt that.
	 *
	 * Both are guarded on equality inside `Workspace`, which is what stops them
	 * from feeding each other forever.
	 */
	$effect(() => {
		if (!ownsAddressBar || navigating.type !== null) return;
		return workspace.sync();
	});
	$effect(() => {
		if (!ownsAddressBar) return;
		workspace.adopt((page.shallow?.url ?? page.url).search);
	});

	/**
	 * The run that is on screen: the query and range it asked for, and which
	 * press of Run or "Try again" asked.
	 *
	 * Separate from `workspace.q`, and the separation is the point. Typing changes
	 * the text; only pressing Run changes what is on screen. A query language with
	 * a live-as-you-type result sounds delightful and means every half-finished
	 * query — `from logs | where` — is sent to the server, and the results flicker
	 * through nonsense on the way to what somebody meant.
	 *
	 * `run` is new for every press, even of the same query: see `ask` below.
	 */
	let submitted = $state(untrack(() => ({ q: data.q, range: data.range, run: 0 })));

	/**
	 * The query for the run that is on screen — the request, not its answer.
	 *
	 * Nothing in this script reads its answer, and that is what keeps a refusal
	 * on this page. Where a refusal lands depends on where the answer is read.
	 * In the browser, an awaited value that rejects throws wherever it is read:
	 * read in the markup inside the results' boundary, it is caught there. A
	 * `$derived` in this script that read it would throw too, and a `$derived`
	 * reports what it throws to the boundary around where it is *declared* —
	 * past the results, to SvelteKit's error page. On the server it is blunter:
	 * every `await` in a script settles before anything renders, so a refusal
	 * there fails the whole render, and a shared link to a query with a typo came
	 * back as SvelteKit's error page, with no editor to fix it in.
	 */
	const query = $derived(runQuery({ tenant: data.tenant, q: submitted.q, range: submitted.range }));

	/**
	 * Which run is on screen, as one string. The results area is keyed on it
	 * below, so every run gets an area of its own.
	 *
	 * A string, and not `query` itself. Calling `runQuery(…)` makes a new object
	 * every time, even with the same arguments: the cached query behind it is
	 * shared, the object handed back is not. A key that is new each time it is
	 * read never settles. With two runs in flight, each one read it again, found
	 * a new key, and drew a new area, round and round, and the tab froze. A
	 * string equals itself.
	 */
	const asked = $derived(
		JSON.stringify([data.tenant, submitted.q, submitted.range, submitted.run])
	);

	/** How many runs are still waiting for their answer. */
	let waiting = $state(0);

	/**
	 * Run a query, and say so until its answer is drawn.
	 *
	 * The server is asked every time, even when the query on screen is the same
	 * one. A range like `-6h` means something new every minute, and an area
	 * that failed for a passing reason — a dropped connection, an expired session
	 * — is drawn again only from a fresh answer. The client keeps a query's last
	 * answer while it is on the page, so the new area would be drawn from that
	 * without a `refresh`.
	 *
	 * "Running…" needs one step the rest does not. Svelte holds an update back
	 * until the `await`s it started have settled — that is what keeps the old
	 * rows up until the new ones can replace them — and a status set in the same
	 * update would be held back with it, appearing only once there was nothing
	 * left to wait for. So the count goes up first, `tick()` lets it paint, and
	 * `settled()` says when the run's own update has landed. Both are what the
	 * Svelte documentation reaches for to show that an update is in progress.
	 */
	async function ask(q: string, range: string): Promise<void> {
		waiting += 1;
		try {
			await tick();
			submitted = { q, range, run: submitted.run + 1 };
			void query.refresh();
			await settled();
		} finally {
			waiting -= 1;
		}
	}

	function run(): void {
		workspace.flush();
		handBack = false;
		void ask(workspace.q, workspace.range);
	}

	/**
	 * "Try again" runs the query on screen again — not the text in the editor,
	 * which may have changed since — and puts the keyboard where its answer is.
	 *
	 * The button cannot keep the focus itself. Each run draws a new results area,
	 * so the button that was pressed is gone once the answer is in, and focus
	 * that was on a removed element falls back to the page body: a keyboard or
	 * screen reader user would be thrown to the top of the page after every try.
	 * So once the answer has landed, the focus goes to the area it drew — the new
	 * "Try again" if the server refused again, the results if it did not.
	 *
	 * After `settled()`, and not from the new area as it is made. Svelte builds
	 * the next area out of sight and swaps it in once its `await` has settled, so
	 * an element that focused itself as it was created would be focusing
	 * something not yet in the document, and the browser ignores that.
	 *
	 * One try at a time: a second press while the first is waiting would only
	 * ask the same question twice. A Run in the meantime keeps the focus where
	 * the person put it.
	 */
	let handBack = false;

	async function retry(): Promise<void> {
		if (waiting > 0) return;
		handBack = true;
		await ask(submitted.q, submitted.range);
		if (handBack) focusable?.focus();
		handBack = false;
	}

	/** The newest results area's place for the focus: the results, or its "Try again". */
	let focusable: HTMLElement | null = null;

	const offerFocus: Attachment<HTMLElement> = (element) => {
		focusable = element;
		return () => {
			if (focusable === element) focusable = null;
		};
	};

	// From the script, which runs before the template is hydrated: the server's
	// controls are still on the page as somebody left them, so a view name typed
	// while the bundle loaded is read from them here and survives hydration.
	keepTyped(saveView.fields.name);

	const window_ = $derived(resolve(submitted.range));

	/**
	 * The service names completion offers, streamed by the `load`: none until
	 * they land, then the list. Read as state rather than through an `{#await}`
	 * block, so the editor is in the server's HTML and stays mounted when they
	 * arrive. Why a class: `streamed.svelte.ts`.
	 */
	const services = $derived(new Streamed(data.services, []));

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
	function chartOf({ columns, rows }: Answer): { series: Series[]; problem: string | null } {
		const timeColumn = columns.find((column) => column === 'bucket' || column === 'timestamp');
		const valueColumns = columns.filter(
			(column) => column !== timeColumn && rows.some((row) => typeof row[column] === 'number')
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

		for (const row of rows) {
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
	}

	/* ---- Live tail ---- */

	let tailing = $state(false);
	let tailRows = $state.raw<Row[]>([]);

	/* ---- Shallow routing ---- */

	/**
	 * Opening a trace does not navigate.
	 *
	 * A shallow `goto` with a `state` payload adds a history entry — so the back
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
		// `shallow: true` is what `pushState` used to mean. SvelteKit 3 made it an
		// option of `goto`, so one function owns every change to the address bar.
		void goto(
			resolvePath('/[tenant]/traces/[traceId]', {
				tenant: data.tenant,
				traceId: encodeURIComponent(traceId)
			}),
			{ shallow: true, state: { trace: traceId } }
		);
	}

	function openRow(index: number, row: Row | undefined): void {
		// `trace_id`, the name SQF uses — not Drizzle's `traceId`. The storage layer
		// projects rows into the schema's names precisely so that this file, the
		// query text and the documentation all say the same word.
		const traceId = row?.trace_id;

		// A row with a trace opens the trace; one without opens the row detail —
		// on this page's own URL, with the current params, and only `page.state`
		// changed.
		if (typeof traceId === 'string' && traceId !== '') openTrace(traceId);
		else {
			void goto(resolvePath(`/[tenant]/explore?${workspace.search}`, { tenant: data.tenant }), {
				shallow: true,
				state: { row: index }
			});
		}
	}

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
	 * `history.pushState` — which would break navigation itself rather than
	 * degrade it.
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
			The editor is drawn at once, by the server too, with whatever service
			names have landed so far: none in the first paint, the streamed list a
			moment later. Completion is the only thing that reads them, and nobody
			asks for a completion in the first moment of a page.
		-->
		<QueryEditor
			bind:value={workspace.q}
			catalogue={{ source, services: services.current }}
			onrun={run}
			serverError={null}
		/>

		<div class="explore__controls">
			<button type="button" class="btn btn--primary" onclick={run}>
				Run
				<kbd>⌘↵</kbd>
			</button>

			<!--
				Present and empty when nothing is running, so that a screen reader
				already knows the region when "Running…" is written into it.
			-->
			<span class="explore__status" role="status">{waiting > 0 ? 'Running…' : ''}</span>

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
		ONE BOUNDARY FOR THE WHOLE RESULT AREA, MADE AFRESH FOR EACH RUN.

		`failed` renders when the result throws — including a 400 from the checker,
		which is the common case and is not an exceptional condition at all. Doing
		this with flags would mean three states threaded through four components;
		doing it with a boundary means the components below can be written as
		though the data is simply there.

		Keyed on the run, because a boundary that has failed has no content left
		to hear the next answer. Key blocks "destroy and recreate their contents
		when the value of an expression changes", so each run gets a boundary of
		its own. The old area stays on screen while the new one waits for its
		answer, and the two change places when it lands: rows, or the next
		refusal.
	-->
	{#key asked}
		<!--
			No `pending` snippet, on purpose. During server-side rendering a boundary
			with one renders that snippet and nothing else of its content, so the
			server waited for the query and then sent "Running…" in place of the rows
			it had. Without one, the server awaits the query here and renders the
			rows. A refusal goes through `handleError` to this boundary's `failed`,
			still on the server, so the page that comes back is this one, with the
			reason in place of the rows, not SvelteKit's error page. Its status is
			the refusal's, a 400, which is the truth about a link to a broken query.

			SvelteKit also sets `page.error` and `page.status` from an error that a
			boundary catches, on the server and again in the browser, and leaves
			them there after the next run succeeds. Nothing here reads them, and on
			a page with boundaries like this one `page.error` does not mean "this is
			an error page".
		-->
		<svelte:boundary>
			<!--
				EVERYTHING MADE FROM THE RESULT IS DECLARED HERE, NOT IN THE SCRIPT.

				An awaited value that rejects throws wherever it is read, but a
				`$derived` that throws reports to the boundary around where it was
				declared. In the script, these three took a refused query past this
				boundary to SvelteKit's error page — the editor and the Run button
				with it. Declared here, they report to this boundary, and so does the
				`await`.
			-->
			{const result = $derived(await query)}
			{const rows = $derived(tailing ? tailRows : result.rows)}
			{const columns = $derived(
				tailing && tailRows.length > 0 ? Object.keys(tailRows[0]!) : result.columns
			)}
			{const chart = $derived(chartOf(result))}

			<!--
				`tabindex="-1"`: not a stop for Tab, but somewhere "Try again" can put
				the focus when its answer is rows.
			-->
			<section
				class="explore__results"
				aria-label="Results"
				aria-busy={waiting > 0}
				tabindex="-1"
				{@attach offerFocus}
			>
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
						onselect={(index) => openRow(index, rows[index])}
					/>
				{/if}
			</section>

			{#if !tailing}
				<footer class="explore__stats">
					<span>{result.rows.length.toLocaleString()} rows</span>
					<span>{result.scanned.toLocaleString()} scanned</span>
					<!--
						Whether the filter ran in SQLite or in the evaluator.

						Exposed rather than hidden because it is the difference between a
						query that stays fast as the data grows and one that does not — and
						knowing *which* is how somebody learns to write the first kind.
					-->
					<span class={['chip', { 'chip--ok': result.pushed }]}>
						{result.pushed ? 'pushed to SQL' : 'filtered in memory'}
					</span>
				</footer>
			{/if}

			<!--
				The same region as the rows it replaces, so the reason is where the
				answer would have been. `error` is SvelteKit's `App.Error`, made by
				`handleError`, so the checker's sentence is on `message`.

				`aria-disabled` rather than `disabled` while a run is waiting: a
				disabled button drops the keyboard focus that just pressed it, before
				there is anywhere for it to go.
			-->
			{#snippet failed(error)}
				<section class="explore__results" aria-label="Results" aria-busy={waiting > 0}>
					<p class="notice notice--error" role="alert">{(error as App.Error).message}</p>
					<button
						type="button"
						class="btn btn--sm explore__retry"
						aria-disabled={waiting > 0}
						onclick={() => void retry()}
						{@attach offerFocus}
					>
						Try again
					</button>
				</section>
			{/snippet}
		</svelte:boundary>
	{/key}
</div>

<!--
	The drawer is driven entirely by `page.state`.

	Not by a local `open` variable that the shallow `goto` also sets — because
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

	.explore__status {
		font-size: var(--fs-xs);
		color: var(--text-muted);
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

	.explore__retry {
		align-self: flex-start;
		margin-top: var(--space-2);
	}

	.explore__retry[aria-disabled='true'] {
		opacity: 0.5;
		cursor: progress;
	}
</style>
