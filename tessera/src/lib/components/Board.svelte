<script lang="ts">
	import { untrack } from 'svelte';
	import { inflate, intersects, type NodeKind, type Point } from '#lib/board/index.ts';
	import { isTyping, panZoom, pointOf, viewportSize } from '#lib/canvas/gestures.ts';
	import type { BoardEditor } from '#lib/canvas/editor.svelte.ts';
	import type { SyncClient } from '#lib/sync/client.svelte.ts';
	import type { Messages } from '#lib/i18n/index.ts';
	import NodeShape from './NodeShape.svelte';
	import EdgeLine from './EdgeLine.svelte';
	import PresenceLayer from './PresenceLayer.svelte';

	interface Props {
		editor: BoardEditor;
		sync: SyncClient;
		t: Messages;
	}

	let { editor, sync, t }: Props = $props();

	/*
	 * Read once, deliberately.
	 *
	 * `editor` is created when the board is opened and lives as long as this
	 * component; its `document` and `camera` are `readonly` and never reassigned.
	 * Making these `$derived` would add a signal read to every one of the hundreds
	 * of places below that touch them, to track a value that cannot change.
	 */
	// svelte-ignore state_referenced_locally
	const board = editor.document;
	// svelte-ignore state_referenced_locally
	const camera = editor.camera;

	let surface = $state<HTMLElement | null>(null);
	let pointerDown = $state(false);

	/**
	 * VIRTUALISATION
	 * ==============
	 *
	 * Only the shapes inside the viewport, plus a margin, are rendered at all.
	 *
	 * The margin matters as much as the culling. Culled exactly to the edge, a
	 * shape is created the frame it becomes visible — so panning produces a
	 * constant stream of element creation right at the edge of vision, which is
	 * both the most expensive place to do work and the most noticeable. Two
	 * hundred board units of slack means the work happens before anybody is
	 * looking at it.
	 */
	const visible = $derived(inflate(camera.visible, 200));

	const nodes = $derived(board.painted().filter((node) => intersects(visible, node.rect)));

	/**
	 * Edges are culled by their endpoints, not by a bounding box of the line.
	 *
	 * An edge between two off-screen shapes can still cross the middle of the
	 * viewport, so testing the line's own bounds would drop it. Testing whether
	 * *either* end is near keeps that case, at the cost of drawing a few paths
	 * whose visible portion is nothing.
	 */
	const edges = $derived(
		[...board.edges.values()].filter((edge) => {
			const from = board.nodes.get(edge.from);
			const to = board.nodes.get(edge.to);
			if (!from || !to) return false;
			return intersects(visible, from.rect) || intersects(visible, to.rect);
		})
	);

	/**
	 * The dot grid, drawn with a gradient rather than elements.
	 *
	 * A thousand `<div>`s would be a thousand nodes the browser has to lay out and
	 * paint. One background on one element scales and offsets with the camera for
	 * free, and stays a single paint however far you zoom out.
	 */
	const gridStyle = $derived.by(() => {
		const { x, y, scale } = camera.transform;
		const size = 24 * scale;
		return `background-size: ${size}px ${size}px; background-position: ${x}px ${y}px; opacity: ${scale < 0.4 ? 0 : 1}`;
	});

	/*
	 * ATTACHMENTS, CREATED ONCE
	 * =========================
	 *
	 * `{@attach viewportSize(camera)}` looks harmless and is a loop.
	 *
	 * The expression inside `{@attach}` is reactive: when it evaluates to a new
	 * function, the old attachment is torn down and the new one runs. Calling
	 * `viewportSize(camera)` in the template produces a *new* closure on every
	 * render — so every render disconnects the `ResizeObserver` and creates
	 * another, and creating one writes `camera.size`, which causes a render. The
	 * result is `effect_update_depth_exceeded` and a blank board, from two lines
	 * that read perfectly.
	 *
	 * Hoisting them to `const` makes the references stable, so each attachment
	 * runs exactly once. Anything inside that genuinely needs fresh state reads it
	 * through a getter — which is why `panZoom` takes `enabled` as a function
	 * rather than a boolean.
	 */
	const attachViewport = viewportSize(camera);
	const attachPanZoom = panZoom(camera, { enabled: () => !pointerDown });

	function boardPoint(event: PointerEvent): Point {
		if (!surface) return { x: 0, y: 0 };
		return camera.toBoard(pointOf(event, surface));
	}

	/* ---- Presence, throttled --------------------------------------- */

	let lastPresence = 0;

	function announce(cursor: Point | null) {
		const now = performance.now();
		// Twenty a second. Faster is imperceptible; slower reads as lag on the
		// other end even with the receiving side interpolating.
		if (cursor && now - lastPresence < 50) return;
		lastPresence = now;

		sync.present({
			cursor,
			selection: [...editor.selection],
			viewport: camera.visible
		});
	}

	/**
	 * Announce a selection change immediately — a colleague watching the halo
	 * appear is the point of presence.
	 *
	 * `untrack` is not optional here, and the reason is worth knowing: **a remote
	 * function call is reactive state**. `announcePresence(...)` updates its own
	 * pending count, so calling it inside an effect makes the effect depend on
	 * something it just wrote. The effect re-runs, calls it again, and Svelte stops
	 * the runaway with `effect_update_depth_exceeded` — which surfaces as a blank
	 * board and a stack trace pointing at the framework rather than at this line.
	 *
	 * The same applies to everything else `announce` reads: the camera moves sixty
	 * times a second during a pan, and this effect has no business firing then.
	 * Pointer movement announces itself, throttled, from the handler below.
	 */
	$effect(() => {
		void editor.selection.size;
		untrack(() => announce(null));
	});

	/* ---- Pointer --------------------------------------------------- */

	function onPointerDown(event: PointerEvent) {
		// Only the primary button starts an edit; middle and right belong to
		// panning and to the context menu.
		if (event.button !== 0) return;
		if (!surface) return;

		const at = boardPoint(event);

		/*
		 * A creation tool: drop a shape and start naming it.
		 *
		 * `preventDefault`, and no `surface.focus()` on this path. Both matter, and
		 * the reason took a while to find: the new shape opens its label editor,
		 * which takes focus — and then the browser finishes handling the same press
		 * by focusing the element that was pressed, which is the canvas. That blurs
		 * the editor, `onfinish` closes it, and the shape appears unnamed while
		 * everything the person types goes to the board's tool shortcuts.
		 *
		 * The symptom is maddening: creating a shape works, naming it silently does
		 * not, and nothing errors.
		 */
		if (editor.tool !== 'select' && editor.tool !== 'connect') {
			event.preventDefault();
			editor.addNode(editor.tool as NodeKind, at);
			editor.tool = 'select';
			return;
		}

		surface.focus();
		const hit = editor.hitTest(at);

		if (editor.tool === 'connect') {
			if (hit) {
				editor.connectingFrom = hit.id;
				editor.connectingTo = at;
				surface.setPointerCapture(event.pointerId);
				pointerDown = true;
			}
			return;
		}

		if (hit) {
			const additive = event.shiftKey || event.metaKey || event.ctrlKey;
			if (!editor.selection.has(hit.id) || additive) editor.select(hit.id, additive);
			editor.beginDrag(at);
		} else {
			editor.beginMarquee(at, event.shiftKey);
		}

		surface.setPointerCapture(event.pointerId);
		pointerDown = true;
	}

	function onPointerMove(event: PointerEvent) {
		const at = boardPoint(event);
		announce(at);

		if (!pointerDown) return;

		if (editor.connectingFrom) {
			editor.connectingTo = at;
			return;
		}

		if (editor.dragging) {
			editor.updateDrag(at, event.altKey);
			return;
		}

		editor.updateMarquee(at);
	}

	function onPointerUp(event: PointerEvent) {
		if (!pointerDown) return;
		pointerDown = false;

		const at = boardPoint(event);

		if (editor.connectingFrom) {
			const target = editor.hitTest(at);
			if (target) editor.connect(editor.connectingFrom, target.id);
			editor.connectingFrom = null;
			editor.connectingTo = null;
			editor.tool = 'select';
		} else if (editor.dragging) {
			editor.endDrag(at, event.altKey);
		} else {
			editor.endMarquee();
		}

		if (surface?.hasPointerCapture(event.pointerId)) {
			surface.releasePointerCapture(event.pointerId);
		}
	}

	/**
	 * DOUBLE-CLICK TO RENAME
	 * ======================
	 *
	 * On the canvas, and as a `dblclick` — two decisions that both took a wrong
	 * turn first.
	 *
	 * It is not on the shape, because `setPointerCapture` (which the drag needs, or
	 * a quick drag off the element strands the gesture) redirects every subsequent
	 * event for that pointer to the capturing element — compatibility mouse events
	 * included. A `ondblclick` on the label is dead code that looks alive.
	 *
	 * It is not `event.detail` on `pointerdown` either. The Pointer Events
	 * specification requires `detail` to be 0 on pointer events; the click count
	 * lives only on the mouse events. Reading it there is a condition that is
	 * simply never true, with nothing to see in the console.
	 *
	 * By the time `dblclick` fires, the browser has already done its own focusing
	 * for the press, so opening the editor here needs no `preventDefault` — the
	 * editor takes focus last and keeps it.
	 */
	function onDoubleClick(event: MouseEvent) {
		if (editor.readOnly || !surface) return;

		const hit = editor.hitTest(camera.toBoard(pointOf(event, surface)));
		if (!hit) return;

		editor.selectOnly([hit.id]);
		editor.editing = hit.id;
	}

	/* ---- Keyboard -------------------------------------------------- */

	function onKeyDown(event: KeyboardEvent) {
		if (isTyping(event.target)) return;

		const step = event.shiftKey ? 40 : 8;
		const meta = event.metaKey || event.ctrlKey;

		switch (event.key) {
			case 'ArrowUp':
				event.preventDefault();
				editor.nudge(0, -step);
				return;
			case 'ArrowDown':
				event.preventDefault();
				editor.nudge(0, step);
				return;
			case 'ArrowLeft':
				event.preventDefault();
				editor.nudge(-step, 0);
				return;
			case 'ArrowRight':
				event.preventDefault();
				editor.nudge(step, 0);
				return;
			case 'Backspace':
			case 'Delete':
				event.preventDefault();
				editor.deleteSelection();
				return;
			case 'Escape':
				editor.clearSelection();
				editor.tool = 'select';
				editor.connectingFrom = null;
				return;
			case 'Enter':
				if (editor.selection.size === 1) {
					event.preventDefault();
					editor.editing = [...editor.selection][0] ?? null;
				}
				return;
		}

		if (meta && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) editor.history.redo();
			else editor.history.undo();
			return;
		}

		if (meta && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			editor.selectAll();
			return;
		}

		if (meta && event.key.toLowerCase() === 'd') {
			event.preventDefault();
			editor.duplicateSelection();
			return;
		}

		// Single-key tool shortcuts, the way every drawing tool does it.
		const tools: Record<string, NodeKind | 'select' | 'connect'> = {
			v: 'select',
			n: 'service',
			s: 'datastore',
			q: 'queue',
			e: 'external',
			t: 'note',
			g: 'group',
			c: 'connect'
		};

		const tool = tools[event.key.toLowerCase()];
		if (tool && !meta) {
			event.preventDefault();
			editor.tool = tool;
			return;
		}

		if (event.key === '1' && !meta) {
			event.preventDefault();
			editor.fit();
		}
	}
</script>

<!--
	A11Y NOTE, and the two suppressions below
	=========================================

	`role="application"` tells a screen reader to stop interpreting keystrokes
	itself and pass them through, which is required for a canvas whose entire
	interface is keys. It is a strong claim, and the obligation that comes with it
	is to offer the same capabilities another way: `Outline.svelte` is that — a
	real tree of real buttons over the same document, where a screen reader's own
	navigation works normally.

	The two rules being suppressed are correct in general and wrong here. This
	element *is* the interactive control, and it has to be focusable for any of its
	shortcuts to reach it.

	Note the comma in the directive. In runes mode the compiler reads codes
	separated by commas and treats everything after the first gap as prose, so a
	space-separated list silently suppresses only the first warning. And the
	directive carries codes and nothing else: `eslint-plugin-svelte` reads every
	word after `svelte-ignore` as a code and reports each one it cannot match, so
	prose belongs in a comment of its own — this one.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	bind:this={surface}
	class="board"
	class:board--connecting={editor.tool === 'connect'}
	data-canvas
	role="application"
	aria-label={t.a11y.canvas}
	tabindex="0"
	{@attach attachViewport}
	{@attach attachPanZoom}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	ondblclick={onDoubleClick}
	onkeydown={onKeyDown}
	onpointerleave={() => announce(null)}
>
	<div class="board__grid" style={gridStyle} aria-hidden="true"></div>

	<!--
		One boundary around the whole scene.

		A single malformed shape — a width that arrived as NaN from an older
		client, a label with a lone surrogate — must not blank the board. The
		`failed` snippet keeps the chrome, the toolbar and the sync indicator
		alive, so the person can still see that their work is saved and can
		reload deliberately rather than losing the tab.
	-->
	<svelte:boundary>
		<div class="board__scene" style="transform: {camera.css}">
			<svg class="board__edges" aria-hidden="true" overflow="visible">
				<defs>
					<marker
						id="tessera-arrow"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M0 1 L9 5 L0 9 z" fill="var(--border-strong)" />
					</marker>
				</defs>

				{#each edges as edge (edge.id)}
					<EdgeLine {edge} document={board} selected={editor.selection.has(edge.id)} />
				{/each}

				{#if editor.connectingFrom && editor.connectingTo}
					{@const source = board.nodes.get(editor.connectingFrom)}
					{#if source}
						<line
							class="board__wire"
							x1={source.x + source.w / 2}
							y1={source.y + source.h / 2}
							x2={editor.connectingTo.x}
							y2={editor.connectingTo.y}
						/>
					{/if}
				{/if}

				{#each editor.guides as guide, index (index)}
					{#if guide.axis === 'x'}
						<line class="board__guide" x1={guide.at} y1={guide.from} x2={guide.at} y2={guide.to} />
					{:else}
						<line class="board__guide" x1={guide.from} y1={guide.at} x2={guide.to} y2={guide.at} />
					{/if}
				{/each}
			</svg>

			{#each nodes as node (node.id)}
				<NodeShape
					{node}
					document={board}
					selected={editor.selection.has(node.id)}
					editing={editor.editing === node.id}
					readOnly={editor.readOnly}
					onfinishEditing={() => (editor.editing = null)}
				/>
			{/each}

			{#if editor.marquee}
				<div
					class="board__marquee"
					style="transform: translate({editor.marquee.x}px, {editor.marquee.y}px); width: {editor
						.marquee.w}px; height: {editor.marquee.h}px"
					aria-hidden="true"
				></div>
			{/if}
		</div>

		{#snippet failed(error, reset)}
			<div class="board__failed">
				<p><strong>{t.errors.generic}</strong></p>
				<p class="board__failed-detail">{String(error)}</p>
				<button type="button" onclick={reset}>Try rendering again</button>
			</div>
		{/snippet}
	</svelte:boundary>

	<PresenceLayer peers={sync.peers} {camera} />
</div>

<style>
	.board {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: var(--bg-canvas);
		cursor: default;
		outline-offset: -3px;
	}

	.board--connecting {
		cursor: crosshair;
	}

	/* Set by the pan gesture while space is held. */
	.board:global([data-grabbing]) {
		cursor: grab;
	}

	.board__grid {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(circle at 1px 1px, var(--grid-line) 1px, transparent 0);
		transition: opacity var(--normal) var(--ease-out);
		pointer-events: none;
	}

	.board__scene {
		position: absolute;
		top: 0;
		left: 0;
		/*
			The one promoted layer.

			Everything in the document is a child of this element, so panning and
			zooming a board of any size is a single matrix change on a single
			compositor layer. Promoting the shapes individually instead would be a
			layer each, and a thousand layers is how a fast canvas runs out of GPU
			memory.
		*/
		transform-origin: 0 0;
		will-change: transform;
	}

	.board__edges {
		position: absolute;
		top: 0;
		left: 0;
		width: 1px;
		height: 1px;
		/* `overflow: visible` plus a 1px box: the SVG is a coordinate system, not a
		   container. Sizing it to the board's extent would mean re-measuring it
		   every time a shape moves. */
		pointer-events: none;
	}

	.board__edges :global(.edge) {
		pointer-events: auto;
	}

	.board__wire {
		stroke: var(--accent);
		stroke-width: 1.5;
		stroke-dasharray: 4 4;
	}

	.board__guide {
		stroke: var(--accent);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		opacity: 0.8;
	}

	.board__marquee {
		position: absolute;
		top: 0;
		left: 0;
		border: 1px solid var(--accent);
		background: var(--accent-wash);
		pointer-events: none;
	}

	.board__failed {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		gap: var(--space-3);
		padding: var(--space-6);
		text-align: center;
	}

	.board__failed-detail {
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		color: var(--text-faint);
		max-width: 40ch;
	}
</style>
