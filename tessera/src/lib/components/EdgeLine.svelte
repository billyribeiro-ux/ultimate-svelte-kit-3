<script lang="ts">
	import type { BoardDocument, EdgeView } from '#lib/board/index.ts';
	import { roundedPath, route } from '#lib/board/index.ts';

	interface Props {
		edge: EdgeView;
		document: BoardDocument;
		selected: boolean;
	}

	let { edge, document: board, selected }: Props = $props();

	const from = $derived(board.nodes.get(edge.from));
	const to = $derived(board.nodes.get(edge.to));

	/**
	 * The path, recomputed when either end moves.
	 *
	 * `$derived` over the two nodes' rectangles means an edge re-renders when a
	 * shape it touches moves and at no other time — dragging a box on the far side
	 * of the board does not touch this.
	 */
	const path = $derived.by(() => {
		if (!from || !to) return '';
		return roundedPath(route(from.rect, to.rect, edge.fromPort, edge.toPort));
	});

	const midpoint = $derived.by(() => {
		if (!from || !to) return null;
		const points = route(from.rect, to.rect, edge.fromPort, edge.toPort);
		const a = points[1];
		const b = points[2];
		if (!a || !b) return null;
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	});
</script>

<!--
	An edge whose ends are missing renders nothing rather than a line to the
	origin. It happens legitimately for one frame: a `node.remove` can reach this
	replica before the `edge.remove` that accompanies it.
-->
{#if from && to && path}
	<g class="edge edge--{edge.kind}" class:edge--selected={selected} data-edge={edge.id}>
		<!--
			An invisible fat stroke under the visible one.

			A 1.5-pixel line is almost impossible to click, especially on a phone.
			This gives the edge a 14-pixel hit area without making it look like one —
			the standard trick, and the reason `pointer-events` is set so carefully
			on the two paths.
		-->
		<path class="edge__hit" d={path} />
		<path class="edge__line" d={path} marker-end="url(#tessera-arrow)" />

		{#if edge.label && midpoint}
			<text class="edge__label" x={midpoint.x} y={midpoint.y} text-anchor="middle" dy="-6">
				{edge.label}
			</text>
		{/if}
	</g>
{/if}

<style>
	.edge__hit {
		fill: none;
		stroke: transparent;
		stroke-width: 14;
		pointer-events: stroke;
		cursor: pointer;
	}

	.edge__line {
		fill: none;
		stroke: var(--border-strong);
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		pointer-events: none;
	}

	.edge--selected .edge__line {
		stroke: var(--accent);
		stroke-width: 2;
	}

	.edge--async .edge__line {
		stroke-dasharray: 6 5;
	}

	.edge--stream .edge__line {
		stroke-width: 3.5;
		stroke-dasharray: 1 6;
	}

	.edge--dependency .edge__line {
		stroke-dasharray: 2 4;
		marker-end: none;
		opacity: 0.7;
	}

	.edge__label {
		fill: var(--text-muted);
		font-size: 11px;
		font-family: var(--font-mono);
		pointer-events: none;
		/* `paint-order` puts the stroke behind the fill, so the halo does not eat
		   into the glyphs — without it the text looks bolder and slightly furry. */
		paint-order: stroke;
		stroke: var(--bg-canvas);
		stroke-width: 4;
		stroke-linejoin: round;
	}
</style>
