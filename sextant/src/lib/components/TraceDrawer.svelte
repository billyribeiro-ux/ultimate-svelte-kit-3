<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { resolve } from '$app/paths';
	import FlameGraph from './FlameGraph.svelte';
	import Waterfall from './Waterfall.svelte';
	import { trace as traceQuery } from '#lib/remote/query.remote.ts';
	import { serviceTotals } from '#lib/trace/assemble.ts';
	import { formatDuration } from '#lib/time/range.ts';

	/**
	 * THE TRACE DRAWER
	 * ================
	 *
	 * Opened by shallow routing from a result row, closed by the back button.
	 *
	 * WHY A DRAWER AND NOT A PAGE
	 * ---------------------------
	 * Because of what somebody is doing when they open it. They ran a query, found
	 * a slow request, and want to see why — and then they want to look at the next
	 * one. A full navigation loses the query, the scroll position and the place in
	 * the list, and getting back means the browser's back button *and* re-finding
	 * the row.
	 *
	 * The URL still changes, so the link is shareable and a reload lands on the
	 * real trace page. That is the combination shallow routing exists for: shallow
	 * within a session, real when shared.
	 *
	 * CLOSING
	 * -------
	 * Escape, the button, the backdrop, and the back button all do the same thing —
	 * `history.back()` — rather than three of them clearing a variable and one of
	 * them navigating. Anything else leaves the history entry behind, so the back
	 * button reopens a drawer somebody just closed.
	 */
	interface Props {
		tenant: string;
		traceId: string;
	}

	let { tenant, traceId }: Props = $props();

	let selected = $state<string | null>(null);

	function close(): void {
		// `history.back()` and not a shallow `goto` to an empty state, because the
		// drawer *was* opened with a push: going back removes that entry, where a
		// second push would add another and make the back button reopen it.
		history.back();
	}

	/**
	 * Focus the panel when it opens, and put focus back when it closes.
	 *
	 * A dialog that opens without moving focus leaves a screen reader reading the
	 * page behind it, and leaves a keyboard user tabbing through the results table
	 * that is now covered. It is the minimum: Tab can still walk out of the panel
	 * into the page behind it, and stopping that would take `inert` on everything
	 * the drawer covers.
	 *
	 * An attachment, because this is about one element's time on the page: it
	 * runs when the panel is mounted, and what it returns runs when the panel is
	 * removed. A `bind:this` and an `$effect` said the same thing in two places.
	 * `document.activeElement` is typed `Element | null`, and `instanceof`
	 * narrows it where a cast would only have asserted what it was.
	 */
	const holdFocus: Attachment<HTMLElement> = (panel) => {
		const previous = document.activeElement;
		panel.focus();

		return () => {
			if (previous instanceof HTMLElement) previous.focus();
		};
	};
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') close();
	}}
/>

<!--
	The backdrop is a `<button>`, not a `<div>` with a click handler.

	It is a real, focusable control that does something, and making it one means it
	is announced, reachable and operable without a special case. The visually
	hidden label is what a screen reader says when it lands on it.
-->
<button type="button" class="backdrop" onclick={close}>
	<span class="visually-hidden">Close the trace</span>
</button>

<!--
	A `<div>` with `role="dialog"`, not an `<aside>` and not a `<dialog>`.

	`<aside>` carries the `complementary` role, and overriding a landmark role with
	`dialog` is the thing the a11y rule is right to object to. The native
	`<dialog>` element would be better still and cannot be used here: it must be
	opened with `showModal()` from script, which means the drawer could not be
	rendered by `{#if page.state.trace}` — the browser's back button would remove
	the element from the DOM without ever closing the dialog, leaving the page
	permanently inert.
-->
<div
	class="drawer"
	role="dialog"
	aria-modal="true"
	aria-label="Trace {traceId}"
	tabindex="-1"
	{@attach holdFocus}
>
	<header class="drawer__head">
		<div>
			<h2>Trace</h2>
			<p class="drawer__id mono">{traceId}</p>
		</div>

		<div class="drawer__actions">
			<!--
				A link, and nothing else — no `onclick`.

				The first version hijacked the click: it prevented the default and pushed
				shallow state for the URL the address bar already showed, a no-op that
				*looked* like navigation. Migrating `pushState` to SvelteKit 3's
				`goto(url, { shallow: true })` is what made that visible — `shallow` is
				now a word in the call, and the word was wrong: leaving the drawer for the
				full page is the one *real* navigation in this file. The router does that
				from a plain `href`, and keeps a modifier-click or a middle-click meaning
				what it always means — "open in a new tab" is exactly what somebody does
				with a trace they want to keep while they look at the next one.
			-->
			<a
				class="btn btn--sm"
				href={resolve('/[tenant]/traces/[traceId]', {
					tenant,
					traceId: encodeURIComponent(traceId)
				})}
			>
				Open full page
			</a>
			<button type="button" class="btn btn--sm" onclick={close}>Close</button>
		</div>
	</header>

	<!--
		The trace is awaited inside this boundary, so the drawer opens at once and
		says it is loading. Awaited in the script instead, the drawer appeared only
		once the trace had arrived, and this `pending` snippet never showed: an
		`await` in a component's script is waited for by whatever boundary holds the
		component, not by the boundaries it draws. The drawer is only ever drawn in
		the browser, from `page.state`, so the server's way with `pending` does not
		come into it.
	-->
	<svelte:boundary>
		{const assembled = $derived(await traceQuery({ tenant, traceId }))}

		{#if assembled}
			{const totals = $derived(serviceTotals(assembled))}

			<div class="drawer__body">
				<!--
					Self time per service, above everything.

					The single most useful number in a trace and the one a waterfall makes
					hardest to see: "the gateway spent 900ms" is obvious from a bar, and
					"of that, 860ms was its own work rather than waiting on anybody" is
					what says where to look.
				-->
				<ul class="totals">
					{#each totals.slice(0, 6) as total (total.service)}
						<li>
							<span class="totals__service truncate">{total.service}</span>
							<span class="totals__value">{formatDuration(total.total)}</span>
						</li>
					{/each}
				</ul>

				<FlameGraph trace={assembled} {selected} onselect={(spanId) => (selected = spanId)} />

				<Waterfall trace={assembled} {selected} onselect={(spanId) => (selected = spanId)} />
			</div>
		{:else}
			<p class="drawer__empty">
				No spans for this trace. They may still be arriving, or they may have aged out of retention.
			</p>
		{/if}

		{#snippet pending()}
			<p class="drawer__empty" role="status">Loading the trace…</p>
		{/snippet}

		<!-- An `App.Error`, not an `HttpError`: the server's words are on `message`. Why: the traces page. -->
		{#snippet failed(error)}
			<p class="drawer__empty" role="alert">{(error as App.Error).message}</p>
		{/snippet}
	</svelte:boundary>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-drawer);
		border: 0;
		padding: 0;
		background: rgb(0 0 0 / 0.45);
		cursor: pointer;
	}

	.drawer {
		position: fixed;
		z-index: var(--z-drawer);
		/*
		 * Mobile first: a sheet that covers most of the screen from the bottom.
		 *
		 * A side panel at 390px wide is a side panel four centimetres across. The
		 * gesture people expect on a phone is a sheet, and the direction it arrives
		 * from is the direction it can be dismissed towards.
		 */
		inset: 15dvh 0 0;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border-top: 1px solid var(--border-strong);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}

	.drawer:focus {
		outline: none;
	}

	.drawer__head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3);
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font-size: var(--fs-lg);
	}

	.drawer__id {
		margin: 0;
		color: var(--text-faint);
		font-size: var(--fs-xs);
		overflow-wrap: anywhere;
	}

	.drawer__actions {
		display: flex;
		gap: var(--space-1);
		flex: none;
	}

	.drawer__body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
	}

	.drawer__empty {
		padding: var(--space-5);
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.totals {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.totals li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-size: var(--fs-xs);
		max-width: 14rem;
	}

	.totals__service {
		color: var(--text-muted);
	}

	.totals__value {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}

	/* From 60rem it becomes a side panel, which is what a wide screen has room for. */
	@media (min-width: 60rem) {
		.drawer {
			inset: 0 0 0 auto;
			width: min(64rem, 72vw);
			border-top: 0;
			border-inline-start: 1px solid var(--border-strong);
			border-radius: var(--radius-lg) 0 0 var(--radius-lg);
		}
	}
</style>
