<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { SpanNode, Trace } from '#lib/trace/assemble.ts';
	import { hueFor } from '#lib/trace/colour.ts';
	import { formatDuration } from '#lib/time/range.ts';

	/**
	 * THE WATERFALL
	 * =============
	 *
	 * The flame graph next to this shows the *shape* of a request in one glance.
	 * This shows the detail: every span, in order, indented by depth, with its
	 * name, its service, how long it took and how much of that was its own work.
	 *
	 * The two views deliberately overlap. A single view that tried to do both ends
	 * up being bad at both — a flame graph with labels on 0.3% bars is unreadable,
	 * and a waterfall zoomed out far enough to show shape is a wall of text.
	 *
	 * WHY THIS IS A FLAT LIST AND NOT A RECURSIVE COMPONENT
	 * ----------------------------------------------------
	 * The flame graph recurses because it draws a tree and the tree is the point.
	 * A waterfall is a *list* that happens to be indented, and rendering it as a
	 * list is what makes three things possible at once: collapsing a subtree is a
	 * filter over one array, keyboard navigation is `index ± 1`, and the browser
	 * can skip the rows that are off screen. The assembler already produced
	 * `trace.flat` in depth-first order with a `depth` on each node, precisely so
	 * that this file never has to walk the tree again.
	 *
	 * WHY NOT THE VIRTUALIZER
	 * -----------------------
	 * `Virtualizer.svelte.ts` exists a few files away and would work. It is the
	 * right tool when rows have unpredictable heights, which log lines do and these
	 * rows do not — every row here is exactly one line. For fixed-height rows,
	 * `content-visibility: auto` gets the same result from the browser for free:
	 * it skips layout, paint and style for subtrees that are off screen, while
	 * leaving them in the DOM for find-in-page, for screen readers and for
	 * `scrollIntoView`. Reaching for the hand-written virtualizer here would be
	 * carrying a data structure to solve a problem CSS already solved.
	 *
	 * The one thing it needs is `contain-intrinsic-size`, so the browser knows how
	 * tall a skipped row would have been. Without it the scrollbar is wrong and
	 * jumps as you scroll — the same bug the virtualizer's averaging solves, from
	 * the same cause.
	 */
	interface Props {
		trace: Trace;
		/** Shared with the flame graph, so clicking in either highlights in both. */
		selected?: string | null;
		onselect?: (spanId: string) => void;
	}

	let { trace, selected = null, onselect }: Props = $props();

	/**
	 * Which subtrees are collapsed.
	 *
	 * A `SvelteSet` rather than a plain `Set` in `$state.raw`, and this is the
	 * mirror image of the decision in the virtualizer: this set is *mutated*, one
	 * entry at a time, in response to a click. That is exactly one reactive write
	 * per user action, which is what `SvelteSet` is for. The virtualizer's map is
	 * written thirty times per frame by a measurement loop, which is what it is
	 * not for.
	 */
	const collapsed = new SvelteSet<string>();

	/** Roving tabindex: the one row that is reachable with Tab. */
	let focused = $state<string | null>(null);

	let list = $state<HTMLElement | null>(null);

	const span = $derived(Math.max(1, trace.end - trace.start));

	interface Line {
		readonly node: SpanNode;
		/** Fraction of the trace's width, in [0, 1]. */
		readonly offset: number;
		readonly width: number;
		/** How many descendants this row is hiding. Zero unless it is collapsed. */
		hidden: number;
	}

	/**
	 * The rows to draw.
	 *
	 * One pass over the flat list. Because it is depth-first, every descendant of a
	 * collapsed node sits immediately after it and has a greater depth — so
	 * "collapse" is: remember a depth, skip while deeper, stop at the first row
	 * that is not. No tree walk, no recursion, no second index.
	 */
	const lines = $derived.by((): Line[] => {
		const out: Line[] = [];
		let skipDeeperThan = Infinity;
		let hiding = -1;

		for (const node of trace.flat) {
			if (node.depth > skipDeeperThan) {
				// Counted rather than merely skipped, so the collapsed row can say how
				// much it is hiding. A collapse that silently removes forty spans is
				// how somebody concludes a trace is smaller than it is.
				if (hiding >= 0) out[hiding]!.hidden += 1;
				continue;
			}

			skipDeeperThan = Infinity;
			hiding = -1;

			out.push({
				node,
				offset: Math.min(1, Math.max(0, (node.start - trace.start) / span)),
				// Never narrower than a hairline: a 0.2ms span in a 4s trace is 0.005%
				// of the width, which rounds to zero pixels and vanishes. A span that
				// exists must be visible, even when its bar stops being proportional.
				width: Math.min(1, Math.max(0.002, node.duration / span)),
				hidden: 0
			});

			if (node.children.length > 0 && collapsed.has(node.spanId)) {
				skipDeeperThan = node.depth;
				hiding = out.length - 1;
			}
		}

		return out;
	});

	/** Five gridlines, as fractions. Enough to read a position, few enough to ignore. */
	const ticks = [0, 0.25, 0.5, 0.75, 1];

	function toggle(node: SpanNode): void {
		if (node.children.length === 0) return;
		if (collapsed.has(node.spanId)) collapsed.delete(node.spanId);
		else collapsed.add(node.spanId);
	}

	function collapseAll(): void {
		for (const node of trace.flat) {
			// Not the root: collapsing it leaves one row and no way to see that the
			// button did anything other than empty the panel.
			if (node.children.length > 0 && node !== trace.root) collapsed.add(node.spanId);
		}
	}

	function select(node: SpanNode): void {
		focused = node.spanId;
		onselect?.(node.spanId);
	}

	/**
	 * Tree keyboard behaviour, as the ARIA practices define it.
	 *
	 * Down/Up move, Right expands or descends, Left collapses or goes to the
	 * parent, Home/End jump to the ends. This is not a nicety on a trace viewer:
	 * the row somebody wants is often the four-hundredth, and finding it by
	 * scrolling and clicking is slower than holding an arrow key.
	 */
	function onRowKey(event: KeyboardEvent, node: SpanNode): void {
		const at = lines.findIndex((line) => line.node.spanId === node.spanId);
		if (at === -1) return;

		const isCollapsed = collapsed.has(node.spanId);
		let next = at;

		switch (event.key) {
			case 'ArrowDown':
				next = Math.min(lines.length - 1, at + 1);
				break;
			case 'ArrowUp':
				next = Math.max(0, at - 1);
				break;
			case 'ArrowRight':
				if (node.children.length > 0 && isCollapsed) {
					collapsed.delete(node.spanId);
				} else if (node.children.length > 0) {
					next = at + 1;
				}
				break;
			case 'ArrowLeft':
				if (node.children.length > 0 && !isCollapsed) {
					collapsed.add(node.spanId);
				} else {
					// Walk back to the first row shallower than this one — which, in a
					// depth-first list, is the parent.
					for (let i = at - 1; i >= 0; i -= 1) {
						if (lines[i]!.node.depth < node.depth) {
							next = i;
							break;
						}
					}
				}
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = lines.length - 1;
				break;
			case 'Enter':
			case ' ':
				select(node);
				event.preventDefault();
				return;
			default:
				return;
		}

		event.preventDefault();

		const target = lines[next]?.node;
		if (!target) return;

		focused = target.spanId;
		// The focus has to actually move, not just the style: a roving tabindex that
		// only changes classes leaves the screen reader announcing the old row.
		list?.querySelector<HTMLElement>(`[data-span="${cssEscape(target.spanId)}"]`)?.focus();
	}

	/** Span ids come from senders, so they can contain anything a CSS selector cares about. */
	function cssEscape(value: string): string {
		return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value;
	}

	/**
	 * Follow a selection made somewhere else.
	 *
	 * Clicking a bar in the flame graph selects a span that may be scrolled out of
	 * this list, or inside a subtree that is collapsed. Both have to be undone, in
	 * that order, or the scroll lands on a row that is not rendered.
	 */
	$effect(() => {
		const id = selected;
		if (!id) return;

		// Expand whatever is hiding it. Walking up by parent id rather than by depth,
		// because the collapsed ancestor may be several levels above.
		const byId = new Map(trace.flat.map((node) => [node.spanId, node]));
		let node = byId.get(id);
		// A local cycle guard, thrown away when this effect finishes. Not state, so
		// not a `SvelteSet` — making it one would create a reactive dependency inside
		// the effect that writes it, which is how an effect ends up re-running itself.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const guard = new Set<string>();
		while (node?.parentId && !guard.has(node.spanId)) {
			guard.add(node.spanId);
			collapsed.delete(node.parentId);
			node = byId.get(node.parentId);
		}

		list
			?.querySelector<HTMLElement>(`[data-span="${cssEscape(id)}"]`)
			?.scrollIntoView({ block: 'nearest' });
	});
</script>

<section class="waterfall" aria-label="Span waterfall">
	<header class="waterfall__bar">
		<p class="waterfall__stats">
			<strong>{trace.spanCount.toLocaleString()}</strong> spans ·
			<strong>{trace.services.length}</strong>
			{trace.services.length === 1 ? 'service' : 'services'} ·
			<strong>{formatDuration(span)}</strong>
			{#if trace.errorCount > 0}
				· <span class="waterfall__errors">{trace.errorCount} errors</span>
			{/if}
		</p>

		<div class="waterfall__actions">
			<button type="button" class="btn btn--ghost btn--sm" onclick={collapseAll}
				>Collapse all</button
			>
			<button type="button" class="btn btn--ghost btn--sm" onclick={() => collapsed.clear()}
				>Expand all</button
			>
		</div>
	</header>

	<!--
		Data-quality facts, said out loud.

		The assembler works these out and nothing else would ever show them. A trace
		with a missing root renders perfectly well as a tree under a synthetic one —
		which is the right thing to draw and the wrong thing to draw *silently*,
		because "the gateway span is missing" is frequently the answer.
	-->
	{#if trace.orphanCount > 0 || trace.hadCycle}
		<p class="waterfall__warning" role="status">
			{#if trace.orphanCount > 0}
				{trace.orphanCount}
				{trace.orphanCount === 1 ? 'span has' : 'spans have'} no parent in this trace — the sender may
				not have reported it, or it may still be arriving.
			{/if}
			{#if trace.hadCycle}
				A parent chain looped and was cut to render this. That is always a bug in the sender.
			{/if}
		</p>
	{/if}

	<div class="waterfall__axis" aria-hidden="true">
		{#each ticks as tick (tick)}
			<span class="tick" style:left="{tick * 100}%">{formatDuration(span * tick)}</span>
		{/each}
	</div>

	<!--
		The handler is on each row rather than on the tree.

		Both work — key events bubble — and the per-row version is the one that keeps
		its promise to a11y tooling, which checks that the element carrying `onclick`
		can also be operated from the keyboard. That check is not pedantry here: the
		container version depends on focus having been tracked correctly, and the
		row version cannot get out of step with itself.
	-->
	<div class="waterfall__list" role="tree" aria-label="Spans" bind:this={list}>
		{#each lines as line (line.node.spanId)}
			{@const node = line.node}
			<div
				class="row"
				class:row--error={node.status === 'error'}
				class:row--selected={selected === node.spanId}
				role="treeitem"
				aria-level={node.depth + 1}
				aria-selected={selected === node.spanId}
				aria-expanded={node.children.length > 0 ? !collapsed.has(node.spanId) : undefined}
				data-span={node.spanId}
				tabindex={focused === node.spanId || (focused === null && line === lines[0]) ? 0 : -1}
				onclick={() => select(node)}
				onkeydown={(event) => onRowKey(event, node)}
				onfocus={() => (focused = node.spanId)}
			>
				<div class="row__name" style:padding-inline-start="{Math.min(node.depth, 12) * 0.75}rem">
					{#if node.children.length > 0}
						<button
							type="button"
							class="twisty"
							aria-hidden="true"
							tabindex="-1"
							onclick={(event) => {
								// The row itself selects; only the twisty folds. Without this the
								// click bubbles and every fold also changes the selection.
								event.stopPropagation();
								toggle(node);
							}}
						>
							{collapsed.has(node.spanId) ? '▸' : '▾'}
						</button>
					{:else}
						<span class="twisty twisty--leaf" aria-hidden="true"></span>
					{/if}

					{#if node.service}
						<span class="service" style:--hue={hueFor(node.service)} title="Service: {node.service}"
							>{node.service}</span
						>
					{/if}

					<span class="name truncate" title={node.name}>{node.name}</span>

					{#if line.hidden > 0}
						<span class="hidden-count">+{line.hidden}</span>
					{/if}
				</div>

				<div class="row__track">
					<div
						class="bar"
						class:bar--synthetic={node.synthetic}
						style:--hue={hueFor(node.service)}
						style:left="{line.offset * 100}%"
						style:width="{line.width * 100}%"
					></div>
				</div>

				<!--
					Two numbers as text, and no geometry for the second one.

					The tempting design is a darker segment inside the bar sized to self
					time. It is wrong: self time is not one contiguous interval — it is
					whatever was left over between the children — so drawing it as a block
					puts it at a *position in time* where nothing happened. Saying the
					number is less pretty and is not a lie.
				-->
				<p class="row__timing">
					<span class="duration">{formatDuration(node.duration)}</span>
					{#if node.children.length > 0}
						<span class="self" title="Time not accounted for by children">
							self {formatDuration(node.selfTime)}
						</span>
					{/if}
				</p>
			</div>
		{/each}
	</div>
</section>

<style>
	.waterfall {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.waterfall__bar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--surface-raised);
	}

	.waterfall__stats {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.waterfall__stats strong {
		color: var(--text);
		font-weight: var(--weight-semibold);
	}

	.waterfall__errors {
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}

	.waterfall__actions {
		display: flex;
		gap: var(--space-1);
	}

	.waterfall__warning {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--warn-bg);
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-sm);
		color: var(--text);
	}

	.waterfall__axis {
		position: relative;
		height: 1.25rem;
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-xs);
		color: var(--text-faint);
		font-family: var(--font-mono);
	}

	.tick {
		position: absolute;
		top: 0.15rem;
		transform: translateX(-50%);
		white-space: nowrap;
	}

	/* The first and last labels would hang off the ends. */
	.tick:first-child {
		transform: none;
		padding-inline-start: var(--space-1);
	}

	.tick:last-child {
		transform: translateX(-100%);
		padding-inline-end: var(--space-1);
	}

	.waterfall__list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.row {
		display: grid;
		/*
		 * Mobile first: the name gets the full width, the track and the timing share
		 * the line below it. A three-column grid at 390px gives the track about
		 * ninety pixels, which is not a chart — it is a smear.
		 */
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			'name name'
			'track timing';
		gap: var(--space-1) var(--space-2);
		align-items: center;
		padding: var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--border);
		cursor: pointer;

		/*
		 * Skip the rows that are off screen.
		 *
		 * `contain-intrinsic-size` is the half people leave out: it tells the browser
		 * how tall a skipped row would be, so the scrollbar is right before anything
		 * has been laid out. Without it, scrolling a five-thousand-span trace makes
		 * the scrollbar resize under the thumb.
		 */
		content-visibility: auto;
		contain-intrinsic-size: auto 3rem;
	}

	.row:hover {
		background: var(--surface-hover);
	}

	.row:focus-visible {
		outline: 2px solid var(--border-focus);
		outline-offset: -2px;
	}

	.row--selected {
		background: var(--surface-active);
		box-shadow: inset 2px 0 0 var(--accent);
	}

	.row--error .name {
		color: var(--danger);
	}

	.row__name {
		grid-area: name;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		font-size: var(--fs-sm);
	}

	.twisty {
		flex: none;
		width: 1rem;
		height: 1rem;
		display: grid;
		place-items: center;
		font-size: 0.6rem;
		color: var(--text-faint);
		background: none;
		border: 0;
		cursor: pointer;
	}

	.twisty--leaf {
		cursor: default;
	}

	.service {
		flex: none;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		padding: 0 var(--space-1);
		border-radius: var(--radius-sm);
		color: oklch(0.92 0.03 var(--hue));
		background: oklch(0.35 0.06 var(--hue));
	}

	.name {
		font-family: var(--font-mono);
		color: var(--text);
	}

	.hidden-count {
		flex: none;
		font-size: var(--fs-xs);
		color: var(--text-faint);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-full);
		padding: 0 var(--space-1);
	}

	.row__track {
		grid-area: track;
		position: relative;
		height: 0.65rem;
		min-width: 0;
		background: var(--surface-sunken);
		border-radius: var(--radius-sm);
	}

	.bar {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: var(--radius-sm);
		background: oklch(0.5 0.1 var(--hue));
	}

	.row--error .bar {
		/* Pattern as well as colour: the difference between ok and error must never
		   be carried by hue alone. */
		background: repeating-linear-gradient(
			45deg,
			var(--danger-600),
			var(--danger-600) 3px,
			var(--danger-500) 3px,
			var(--danger-500) 6px
		);
	}

	.bar--synthetic {
		background: transparent;
		border: 1px dashed var(--border-strong);
	}

	.row__timing {
		grid-area: timing;
		margin: 0;
		display: flex;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.duration {
		color: var(--text);
	}

	.self {
		color: var(--text-faint);
	}

	/*
	 * From 48rem the three parts sit on one line, which is what makes it a
	 * waterfall: the bars line up in a column and the shape of the request is
	 * readable down the page.
	 */
	@media (min-width: 48rem) {
		.row {
			grid-template-columns: minmax(12rem, 2fr) minmax(0, 3fr) auto;
			grid-template-areas: 'name track timing';
			contain-intrinsic-size: auto 1.75rem;
		}
	}
</style>
