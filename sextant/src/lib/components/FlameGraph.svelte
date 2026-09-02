<script module lang="ts">
	import type { SpanNode as Node } from '#lib/trace/assemble.ts';

	/**
	 * How deep the tree goes.
	 *
	 * In the module script because it is a pure function of its argument and has
	 * no business being recreated per instance. Iterative rather than recursive
	 * for the reason everything else that walks a span tree is: a service retrying
	 * in a loop produces a chain thousands deep, and that trace is the bug report.
	 */
	function depthOf(root: Node, from: number): number {
		let deepest = from;
		const stack: { node: Node; depth: number }[] = [{ node: root, depth: from }];

		while (stack.length > 0) {
			const { node, depth } = stack.pop()!;
			if (depth > deepest) deepest = depth;
			// Bounded, so a pathological trace does not spend a second here measuring
			// something that will be truncated anyway.
			if (depth > 200) break;
			for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
		}

		return deepest;
	}
</script>

<script lang="ts">
	import type { SpanNode, Trace } from '#lib/trace/assemble.ts';
	import { formatDuration } from '#lib/time/range.ts';

	/**
	 * A FLAME GRAPH, BY A SNIPPET THAT RENDERS ITSELF
	 * ===============================================
	 *
	 * A trace is a tree, and a tree is the one shape a component system is
	 * traditionally bad at: rendering it means a component that imports itself,
	 * which works and produces a module cycle, a separate `<svelte:self>` dialect,
	 * or a flattening pass that throws away the structure and rebuilds it with
	 * `padding-left`.
	 *
	 * Svelte 5 snippets can recurse. `{@render flame(child, ...)}` inside the
	 * definition of `flame` is legal, terminates on the base case like any other
	 * recursion, and needs no second file. That is the single tidiest thing in
	 * this project, and it is why a flame graph is here rather than a bar chart.
	 *
	 * THE LAYOUT
	 * ----------
	 * Each row is a depth. A span's width is its share of the *root's* duration,
	 * and its offset is where it started — so the picture is time on the x axis
	 * and call depth on the y, which is what makes "this one span is the whole
	 * request" visible at a glance rather than derivable from a table.
	 *
	 * WHAT IS DELIBERATELY NOT HERE
	 * -----------------------------
	 * No zoom-on-click, no aggregation of sibling spans with the same name, no
	 * colour-by-self-time. Each is a good feature and each hides the thing this
	 * view exists for, which is the shape of one request exactly as it happened.
	 * The waterfall next to it is where the detail goes.
	 */
	interface Props {
		trace: Trace;
		/** The currently highlighted span, shared with the waterfall. */
		selected?: string | null;
		onselect?: (spanId: string) => void;
	}

	let { trace, selected = null, onselect }: Props = $props();

	const span = $derived(Math.max(1, trace.end - trace.start));

	/**
	 * A stable colour per service.
	 *
	 * Derived from the name rather than assigned from a pool, for the same reason
	 * presence colours were in the last project: assigning means the same service
	 * is teal in one trace and amber in the next, and "the teal one" stops being a
	 * way to refer to anything.
	 *
	 * Hue only — saturation and lightness are fixed — so every bar has the same
	 * contrast against the ground and against its own label. A palette that varies
	 * lightness produces bars whose text is unreadable on some of them.
	 */
	function hueFor(service: string): number {
		let hash = 2166136261;
		for (let i = 0; i < service.length; i += 1) {
			hash ^= service.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return (hash >>> 0) % 360;
	}

	/** Fraction of the trace's width. Clamped, and never narrower than a hairline. */
	function widthOf(node: SpanNode): number {
		return Math.min(100, Math.max(0.25, (node.duration / span) * 100));
	}

	function offsetOf(node: SpanNode): number {
		return Math.min(100, Math.max(0, ((node.start - trace.start) / span) * 100));
	}

	/**
	 * How deep to render.
	 *
	 * A flame graph past about twenty levels is a solid block: each bar is two
	 * pixels tall and none of them can be read or clicked. Truncating with a
	 * visible marker is more honest than rendering something unusable, and the
	 * waterfall — which is a list and scrolls — has no such limit.
	 */
	const MAX_DEPTH = 20;
</script>

<!--
	THE RECURSIVE SNIPPET

	`flame` renders one span and then renders itself for each child. The base case
	is a node with no children, and the depth guard is what stops a pathological
	trace producing thirty thousand nested elements.

	Note that the snippet is declared *before* it is used at the bottom of the
	file, which is not required — snippets hoist — but reads in the order somebody
	would want to understand it.
-->
{#snippet flame(node: SpanNode, depth: number)}
	{#if depth <= MAX_DEPTH}
		<button
			type="button"
			class="bar"
			class:bar--error={node.status === 'error'}
			class:bar--selected={selected === node.spanId}
			class:bar--synthetic={node.synthetic}
			style:left="{offsetOf(node)}%"
			style:width="{widthOf(node)}%"
			style:top="{depth * 20}px"
			style:--hue={hueFor(node.service)}
			onclick={() => onselect?.(node.spanId)}
			title="{node.service} · {node.name} · {formatDuration(node.duration)}"
		>
			<!--
				The label is inside the bar and clipped by it.

				A label that overflows its bar would be the only readable thing about a
				0.3% span, and would overlap its neighbours — so a narrow bar shows
				nothing, which is correct: the tooltip and the waterfall are where its
				name is.
			-->
			<span class="bar__label truncate">{node.name}</span>
		</button>

		{#each node.children as child (child.spanId)}
			{@render flame(child, depth + 1)}
		{/each}
	{/if}
{/snippet}

<div class="flame">
	<div
		class="flame__canvas"
		style:height="{Math.min(depthOf(trace.root, 0), MAX_DEPTH) * 20 + 24}px"
	>
		{@render flame(trace.root, 0)}
	</div>

	{#if depthOf(trace.root, 0) > MAX_DEPTH}
		<p class="flame__note">
			Showing {MAX_DEPTH} levels of {depthOf(trace.root, 0)}. The waterfall below has all of them.
		</p>
	{/if}
</div>

<style>
	.flame {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-2);
		overflow: hidden;
	}

	.flame__canvas {
		position: relative;
		width: 100%;
	}

	.bar {
		position: absolute;
		height: 18px;
		display: flex;
		align-items: center;
		padding-inline: var(--space-1);
		border-radius: var(--radius-sm);
		overflow: hidden;
		text-align: left;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);

		/*
		 * Hue from the service, fixed saturation and lightness.
		 *
		 * `oklch` rather than `hsl` so that two bars with different hues have the
		 * same *perceived* lightness — in HSL, yellow at 50% lightness is far
		 * brighter than blue at 50%, so a palette built from it has some bars whose
		 * text is unreadable and some that glare.
		 */
		background: oklch(0.45 0.09 var(--hue));
		color: oklch(0.96 0.02 var(--hue));
		border: 1px solid oklch(0.55 0.1 var(--hue));

		transition:
			filter var(--fast) var(--ease),
			outline-color var(--fast) var(--ease);
	}

	.bar:hover {
		filter: brightness(1.25);
	}

	.bar--error {
		/* Colour *and* a pattern: the difference between ok and error must not be
		   carried by hue alone. */
		background: repeating-linear-gradient(
			45deg,
			var(--danger-600),
			var(--danger-600) 4px,
			var(--danger-500) 4px,
			var(--danger-500) 8px
		);
		border-color: var(--danger-400);
		color: #fff;
	}

	.bar--selected {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		z-index: 1;
	}

	.bar--synthetic {
		/* A root this code invented, not one the sender reported. Drawn as an
		   outline so it is visibly not real data. */
		background: transparent;
		border-style: dashed;
		border-color: var(--border-strong);
		color: var(--text-faint);
	}

	.bar__label {
		pointer-events: none;
	}

	.flame__note {
		margin: var(--space-2) 0 0;
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
</style>
