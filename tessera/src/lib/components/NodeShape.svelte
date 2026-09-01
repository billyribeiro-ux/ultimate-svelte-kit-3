<script lang="ts">
	import type { BoardDocument, NodeView } from '#lib/board/index.ts';
	import LabelEditor from './LabelEditor.svelte';

	interface Props {
		node: NodeView;
		document: BoardDocument;
		selected: boolean;
		editing: boolean;
		readOnly?: boolean;
		onfinishEditing?: () => void;
	}

	let {
		node,
		document: board,
		selected,
		editing,
		readOnly = false,
		onfinishEditing
	}: Props = $props();

	/**
	 * Position via `translate`, size via width and height.
	 *
	 * `left`/`top` would work and would put every drag through layout. A transform
	 * is handled by the compositor, so moving fifty shapes is fifty matrix updates
	 * rather than fifty reflows of a document that contains them all.
	 */
	const style = $derived(
		`transform: translate(${node.x}px, ${node.y}px); width: ${node.w}px; height: ${node.h}px; --hue: var(--fill-${node.fill}-h);`
	);
</script>

<div class="node node--{node.kind}" class:node--selected={selected} data-node={node.id} {style}>
	{#if node.kind === 'datastore'}
		<!-- The cylinder's top ellipse. A pseudo-element cannot be given its own
		     border radius independent of the box, so it is a real element. -->
		<span class="node__cap" aria-hidden="true"></span>
	{/if}

	<div class="node__body">
		{#if editing && !readOnly}
			<LabelEditor
				document={board}
				target={node.id}
				value={node.label}
				onfinish={onfinishEditing}
			/>
		{:else}
			<!--
				No `ondblclick` here.

				It would never fire: the canvas captures the pointer for dragging, and a
				captured pointer sends its compatibility mouse events to the capturing
				element rather than to whatever is under it. `Board.svelte` detects the
				double-click from `event.detail` on the pointer event instead.
			-->
			<span class="node__label" class:node__label--empty={node.label === ''}>
				{node.label || 'Untitled'}
			</span>
		{/if}
	</div>
</div>

<style>
	.node {
		position: absolute;
		top: 0;
		left: 0;
		display: grid;
		place-items: center;
		border: 1.5px solid hsl(var(--hue) var(--fill-chroma) var(--fill-edge-lightness));
		border-radius: var(--radius-md);
		background: hsl(var(--hue) var(--fill-chroma) var(--fill-lightness));
		color: var(--text);
		box-shadow: var(--shadow-node);
		/*
			`will-change` is deliberately absent.

			It promotes the element to its own compositor layer permanently, and a
			board with a thousand nodes then holds a thousand layers — which is how a
			canvas that was fast becomes a canvas that exhausts GPU memory. The parent
			layer is promoted instead; these move with it for free.
		*/
	}

	.node--selected {
		border-color: var(--accent);
		box-shadow:
			var(--shadow-node),
			0 0 0 1.5px var(--accent);
	}

	.node__body {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		padding: var(--space-2) var(--space-3);
	}

	.node__label {
		font-size: var(--fs-sm);
		font-weight: var(--weight-medium);
		text-align: center;
		line-height: var(--lh-snug);
		/* Two lines, then an ellipsis. A label that grows the shape makes the
		   diagram reflow while somebody is typing into it. */
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}

	.node__label--empty {
		color: var(--text-faint);
		font-style: italic;
	}

	/* ---- Kinds ---------------------------------------------------- */

	.node--datastore {
		border-radius: var(--radius-md) var(--radius-md) 40% 40% / var(--radius-md) var(--radius-md) 14%
			14%;
	}

	.node__cap {
		position: absolute;
		inset: -1.5px auto auto -1.5px;
		width: calc(100% + 3px);
		height: 16px;
		border: 1.5px solid hsl(var(--hue) var(--fill-chroma) var(--fill-edge-lightness));
		border-radius: 50%;
		background: hsl(var(--hue) var(--fill-chroma) calc(var(--fill-lightness) + 4%));
	}

	.node--queue {
		border-radius: var(--radius-full);
	}

	.node--external {
		border-style: dashed;
		background: transparent;
	}

	.node--note {
		border-radius: var(--radius-sm);
		/* The folded corner. One clip-path rather than a stack of pseudo-elements,
		   so it scales with the shape without a second set of measurements. */
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
	}

	.node--group {
		border-style: dashed;
		background: color-mix(
			in oklab,
			hsl(var(--hue) var(--fill-chroma) var(--fill-lightness)) 40%,
			transparent
		);
		place-items: start;
	}

	.node--group .node__body {
		place-items: start;
		height: auto;
	}
</style>
