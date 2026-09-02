<script lang="ts">
	import { untrack } from 'svelte';
	import { highlights as formulaHighlights } from '#lib/formula/highlight.ts';
	import {
		colName,
		inRect,
		key,
		parseA1,
		rect,
		rectToA1,
		toA1,
		type Address,
		type Rect
	} from '#lib/sheet/address.ts';
	import { DEFAULT_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT } from '#lib/sheet/document.ts';
	import type { Sheet } from '#lib/sheet/sheet.svelte.ts';
	import { Axis } from './axis.ts';
	import CellEditor from './CellEditor.svelte';

	/**
	 * THE GRID
	 * ========
	 *
	 * A million rows and sixteen thousand columns, of which about a thousand
	 * cells are on screen. Only those exist in the DOM: the grid works out
	 * which rows and columns the scroll position reveals, renders exactly
	 * those, and positions each one absolutely inside a canvas the size of the
	 * whole sheet. Scrolling changes two numbers, and the two numbers change
	 * which cells are rendered.
	 *
	 * WHAT IS REACTIVE HERE, AND WHAT IS NOT
	 * --------------------------------------
	 * `scrollTop`, `scrollLeft`, the viewport size, the selection, the frozen
	 * counts and `sheet.version` are `$state`. Cell *values* are not: the
	 * body reads `sheet.version` once, which subscribes it, and then reads
	 * every visible cell straight from the engine. One signal redraws the
	 * viewport; the engine is never proxied.
	 *
	 * EVERYTHING IS A CELL CLASS
	 * --------------------------
	 * Selection, the formula-reference colours, other people's cursors and
	 * the "changed by somebody else" flash are all classes on cells, not
	 * overlays drawn on top. Overlays would need their own copy of the
	 * geometry and would come apart at the frozen panes, where a cell's
	 * screen position is not its canvas position.
	 */
	let {
		sheet,
		readonly = false,
		cursors = [],
		onactivate
	}: {
		sheet: Sheet;
		readonly?: boolean;
		/** Other people's selections, from the live query. */
		cursors?: { client: string; name: string; cell: string | null }[];
		/** The active cell changed — the page sends it to the room. */
		onactivate?: (cell: Address) => void;
	} = $props();

	const HEADER_HEIGHT = 26;
	const HEADER_WIDTH = 52;

	let viewport = $state<HTMLDivElement>();
	let grid = $state<HTMLDivElement>();
	let editor = $state<CellEditor>();
	let width = $state(0);
	let height = $state(0);
	let scrollTop = $state(0);
	let scrollLeft = $state(0);

	/* ---------------------------------------------------------------- */
	/* Geometry                                                          */
	/* ---------------------------------------------------------------- */

	// Iterating a SvelteMap is tracked, so a resize rebuilds the axis.
	const rowAxis = $derived(new Axis(DEFAULT_ROW_HEIGHT, sheet.rows));
	const colAxis = $derived(new Axis(DEFAULT_COLUMN_WIDTH, sheet.columns));

	/** The sheet is as big as its contents, plus room to grow, plus what has been scrolled to. */
	const rowCount = $derived.by(() => {
		void sheet.version;
		const extent = sheet.engine.extent();
		return Math.max(
			100,
			(extent?.row ?? 0) + 40,
			rowAxis.indexAt(scrollTop + height) + 40,
			sheet.anchor.row + 20
		);
	});
	const colCount = $derived.by(() => {
		void sheet.version;
		const extent = sheet.engine.extent();
		return Math.max(
			26,
			(extent?.col ?? 0) + 10,
			colAxis.indexAt(scrollLeft + width) + 10,
			sheet.anchor.col + 5
		);
	});

	const totalHeight = $derived(rowAxis.total(rowCount));
	const totalWidth = $derived(colAxis.total(colCount));

	const frozenHeight = $derived(rowAxis.total(sheet.frozen.rows));
	const frozenWidth = $derived(colAxis.total(sheet.frozen.cols));

	/** The rows and columns the scroll position reveals, with a little overscan. */
	const rows = $derived.by(() => {
		const first = Math.max(sheet.frozen.rows, rowAxis.indexAt(scrollTop + frozenHeight) - 2);
		const last = Math.min(rowCount - 1, rowAxis.indexAt(scrollTop + height) + 2);
		return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
	});
	const cols = $derived.by(() => {
		const first = Math.max(sheet.frozen.cols, colAxis.indexAt(scrollLeft + frozenWidth) - 1);
		const last = Math.min(colCount - 1, colAxis.indexAt(scrollLeft + width) + 1);
		return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
	});
	const frozenRows = $derived(Array.from({ length: sheet.frozen.rows }, (_, i) => i));
	const frozenCols = $derived(Array.from({ length: sheet.frozen.cols }, (_, i) => i));

	/* ---------------------------------------------------------------- */
	/* Decorations                                                       */
	/* ---------------------------------------------------------------- */

	const selection = $derived(sheet.selection);

	/** The formula being typed, with its references coloured. */
	const highlights = $derived(
		sheet.editing?.text.startsWith('=') ? formulaHighlights(sheet.editing.text.slice(1)) : []
	);

	/** Other people's cursors, by cell key, with a stable hue per person. */
	const cursorsByCell = $derived.by(() => {
		// A plain Map is right here: it is filled once and returned; the derived
		// value as a whole is what components read, not the entries.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<number, { name: string; hue: number }>();
		for (const cursor of cursors) {
			const a = cursor.cell ? parseA1(cursor.cell) : null;
			if (a) map.set(key(a.row, a.col), { name: cursor.name, hue: hueOf(cursor.client) });
		}
		return map;
	});

	function hueOf(text: string): number {
		let h = 0;
		for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
		return h;
	}

	/** Cells somebody else changed flash for a moment, then the set is cleared. */
	$effect(() => {
		if (sheet.flashes.size === 0) return;
		const timer = setTimeout(() => sheet.flashes.clear(), 900);
		return () => clearTimeout(timer);
	});

	/** Keep the active cell on screen. */
	$effect(() => {
		const { row, col } = sheet.anchor;
		const el = untrack(() => viewport);
		if (!el) return;
		untrack(() => {
			const top = rowAxis.offset(row);
			const bottom = top + rowAxis.size(row);
			const left = colAxis.offset(col);
			const right = left + colAxis.size(col);
			const viewTop = scrollTop + frozenHeight;
			const viewBottom = scrollTop + height - HEADER_HEIGHT;
			const viewLeft = scrollLeft + frozenWidth;
			const viewRight = scrollLeft + width - HEADER_WIDTH;
			if (row >= sheet.frozen.rows) {
				if (top < viewTop) el.scrollTop = top - frozenHeight;
				else if (bottom > viewBottom) el.scrollTop = bottom - (height - HEADER_HEIGHT);
			}
			if (col >= sheet.frozen.cols) {
				if (left < viewLeft) el.scrollLeft = left - frozenWidth;
				else if (right > viewRight) el.scrollLeft = right - (width - HEADER_WIDTH);
			}
		});
		onactivate?.({ row, col });
	});

	/* ---------------------------------------------------------------- */
	/* Editing                                                           */
	/* ---------------------------------------------------------------- */

	function startEditing(text?: string) {
		if (readonly) return;
		sheet.beginEdit(text);
		insertedRef = null;
	}

	function commit(direction: 'down' | 'up' | 'right' | 'left' | 'stay') {
		const cell = sheet.commitEdit();
		if (!cell) return;
		sheet.select(cell);
		if (direction === 'down') sheet.move(1, 0);
		else if (direction === 'up') sheet.move(-1, 0);
		else if (direction === 'right') sheet.move(0, 1);
		else if (direction === 'left') sheet.move(0, -1);
		grid?.focus();
	}

	function cancel() {
		sheet.cancelEdit();
		grid?.focus();
	}

	/** The reference the last click inserted, so a drag or another click replaces it. */
	let insertedRef = $state<{ start: number; end: number } | null>(null);

	/** While typing a formula, clicking a cell inserts its address instead of moving. */
	function insertReference(target: Rect) {
		if (!editor || !sheet.editing) return;
		const text = sheet.editing.text;
		const atInsertionPoint = insertedRef !== null || /[=+\-*/^&(,<>]\s*$/.test(text);
		if (!atInsertionPoint) return false;
		insertedRef = editor.insertAtCaret(rectToA1(target), insertedRef);
		return true;
	}

	/* ---------------------------------------------------------------- */
	/* Keyboard                                                          */
	/* ---------------------------------------------------------------- */

	function keydown(event: KeyboardEvent) {
		if (sheet.editing) return; // the editor handles its own keys
		const shift = event.shiftKey;
		const mod = event.metaKey || event.ctrlKey;

		const jump = (dRow: number, dCol: number) => {
			event.preventDefault();
			if (mod) {
				// Ctrl+arrow: to the edge of the data, like every spreadsheet.
				const from = shift ? sheet.focus : sheet.anchor;
				const extent = sheet.engine.extent();
				const target = {
					row: dRow === 0 ? from.row : dRow < 0 ? 0 : Math.max(from.row, extent?.row ?? 0),
					col: dCol === 0 ? from.col : dCol < 0 ? 0 : Math.max(from.col, extent?.col ?? 0)
				};
				if (shift) sheet.focus = target;
				else sheet.select(target);
			} else {
				sheet.move(dRow, dCol, shift);
			}
		};

		switch (event.key) {
			case 'ArrowDown':
				return jump(1, 0);
			case 'ArrowUp':
				return jump(-1, 0);
			case 'ArrowRight':
				return jump(0, 1);
			case 'ArrowLeft':
				return jump(0, -1);
			case 'Tab':
				event.preventDefault();
				return sheet.move(0, shift ? -1 : 1);
			case 'Enter':
				event.preventDefault();
				if (readonly) return sheet.move(shift ? -1 : 1, 0);
				return startEditing();
			case 'F2':
				event.preventDefault();
				return startEditing();
			case 'Home':
				event.preventDefault();
				return mod
					? sheet.select({ row: 0, col: 0 })
					: sheet.select({ row: sheet.anchor.row, col: 0 });
			case 'End': {
				event.preventDefault();
				const extent = sheet.engine.extent();
				return mod
					? sheet.select({ row: extent?.row ?? 0, col: extent?.col ?? 0 })
					: sheet.select({ row: sheet.anchor.row, col: extent?.col ?? 0 });
			}
			case 'PageDown':
				return jump(Math.max(1, Math.floor(height / DEFAULT_ROW_HEIGHT) - 2), 0);
			case 'PageUp':
				return jump(-Math.max(1, Math.floor(height / DEFAULT_ROW_HEIGHT) - 2), 0);
			case 'Delete':
			case 'Backspace':
				event.preventDefault();
				if (!readonly) sheet.clear();
				return;
			case 'Escape':
				return sheet.select(sheet.anchor);
			case 'a':
			case 'A':
				if (mod) {
					event.preventDefault();
					const extent = sheet.engine.extent();
					sheet.select({ row: 0, col: 0 }, { row: extent?.row ?? 0, col: extent?.col ?? 0 });
				}
				return;
			case 'z':
			case 'Z':
				if (mod) {
					event.preventDefault();
					if (readonly) return;
					if (shift) sheet.redo();
					else sheet.undo();
				}
				return;
			case 'y':
			case 'Y':
				if (mod) {
					event.preventDefault();
					if (!readonly) sheet.redo();
				}
				return;
		}

		// Any printable character starts editing with that character, replacing the cell.
		if (!mod && event.key.length === 1 && !readonly) {
			event.preventDefault();
			startEditing(event.key);
		}
	}

	/* ---------------------------------------------------------------- */
	/* Clipboard                                                         */
	/* ---------------------------------------------------------------- */

	const MIME = 'application/x-abacus-cells+json';

	function oncopy(event: ClipboardEvent) {
		if (sheet.editing || !event.clipboardData) return;
		event.preventDefault();
		const payload = sheet.copy();
		event.clipboardData.setData('text/plain', payload.text);
		event.clipboardData.setData(MIME, JSON.stringify(payload));
	}

	function oncut(event: ClipboardEvent) {
		if (readonly) return oncopy(event);
		if (sheet.editing || !event.clipboardData) return;
		event.preventDefault();
		const payload = sheet.cut();
		event.clipboardData.setData('text/plain', payload.text);
		event.clipboardData.setData(MIME, JSON.stringify(payload));
	}

	function onpaste(event: ClipboardEvent) {
		if (readonly || sheet.editing || !event.clipboardData) return;
		event.preventDefault();
		const own = event.clipboardData.getData(MIME);
		if (own) {
			try {
				sheet.paste(JSON.parse(own));
				return;
			} catch {
				// fall through to text
			}
		}
		const text = event.clipboardData.getData('text/plain');
		if (text) sheet.pasteText(text);
	}

	/* ---------------------------------------------------------------- */
	/* Pointer                                                           */
	/* ---------------------------------------------------------------- */

	/** The cell under a pointer, accounting for headers, scrolling and frozen panes. */
	/**
	 * The cell under a pointer. The scroll offsets are read from the element,
	 * not from the `scrollTop`/`scrollLeft` state: `scroll` events arrive a
	 * frame after the scroll, and a pointer can land in that frame — the phone
	 * profile of the end-to-end suite did exactly that, and typed into B2.
	 * For hit-testing, the DOM is the truth.
	 */
	function cellAt(clientX: number, clientY: number): Address | null {
		if (!viewport) return null;
		const box = viewport.getBoundingClientRect();
		const x = clientX - box.left - HEADER_WIDTH;
		const y = clientY - box.top - HEADER_HEIGHT;
		if (x < 0 || y < 0) return null;
		const col = x < frozenWidth ? colAxis.indexAt(x) : colAxis.indexAt(x + viewport.scrollLeft);
		const row = y < frozenHeight ? rowAxis.indexAt(y) : rowAxis.indexAt(y + viewport.scrollTop);
		return { row: Math.min(row, rowCount - 1), col: Math.min(col, colCount - 1) };
	}

	type Drag =
		| { kind: 'select'; from: Address }
		| { kind: 'reference'; from: Address }
		| { kind: 'fill'; source: Rect; target: Rect }
		| { kind: 'resize'; col: number; startX: number; startWidth: number; width: number };

	let drag = $state<Drag | null>(null);

	function pointerdown(event: PointerEvent) {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;

		const handle = target.closest<HTMLElement>('[data-resize]');
		if (handle) {
			event.preventDefault();
			const col = Number(handle.dataset.resize);
			drag = {
				kind: 'resize',
				col,
				startX: event.clientX,
				startWidth: colAxis.size(col),
				width: colAxis.size(col)
			};
			viewport?.setPointerCapture(event.pointerId);
			return;
		}

		if (target.closest('[data-fill]')) {
			event.preventDefault();
			drag = { kind: 'fill', source: selection, target: selection };
			viewport?.setPointerCapture(event.pointerId);
			return;
		}

		const colHead = target.closest<HTMLElement>('[data-colhead]');
		if (colHead) {
			event.preventDefault();
			const col = Number(colHead.dataset.colhead);
			commitIfEditing();
			sheet.select({ row: 0, col }, { row: rowCount - 1, col });
			grid?.focus();
			return;
		}
		const rowHead = target.closest<HTMLElement>('[data-rowhead]');
		if (rowHead) {
			event.preventDefault();
			const row = Number(rowHead.dataset.rowhead);
			commitIfEditing();
			sheet.select({ row, col: 0 }, { row, col: colCount - 1 });
			grid?.focus();
			return;
		}

		if (target.closest('input')) return; // the editor keeps the click

		const cell = cellAt(event.clientX, event.clientY);
		if (!cell) return;

		if (sheet.editing?.text.startsWith('=')) {
			// Mid-formula: a click on a cell inserts a reference rather than moving.
			if (insertReference(rect(cell, cell))) {
				event.preventDefault();
				drag = { kind: 'reference', from: cell };
				viewport?.setPointerCapture(event.pointerId);
				return;
			}
		}

		event.preventDefault();
		commitIfEditing();
		if (event.shiftKey) sheet.focus = cell;
		else sheet.select(cell);
		drag = { kind: 'select', from: cell };
		viewport?.setPointerCapture(event.pointerId);
		grid?.focus();
	}

	function commitIfEditing() {
		if (sheet.editing) commit('stay');
	}

	function pointermove(event: PointerEvent) {
		if (!drag) return;
		const cell = cellAt(event.clientX, event.clientY);
		switch (drag.kind) {
			case 'select':
				if (cell) sheet.focus = cell;
				break;
			case 'reference':
				if (cell) insertReference(rect(drag.from, cell));
				break;
			case 'fill': {
				if (!cell) break;
				const s = drag.source;
				// Extend along whichever axis the pointer has left the source on.
				const dRow =
					cell.row < s.top ? cell.row - s.top : cell.row > s.bottom ? cell.row - s.bottom : 0;
				const dCol =
					cell.col < s.left ? cell.col - s.left : cell.col > s.right ? cell.col - s.right : 0;
				const vertical = Math.abs(dRow) >= Math.abs(dCol);
				drag.target = vertical
					? {
							top: Math.min(s.top, cell.row),
							bottom: Math.max(s.bottom, cell.row),
							left: s.left,
							right: s.right
						}
					: {
							top: s.top,
							bottom: s.bottom,
							left: Math.min(s.left, cell.col),
							right: Math.max(s.right, cell.col)
						};
				break;
			}
			case 'resize':
				drag.width = Math.max(24, drag.startWidth + event.clientX - drag.startX);
				break;
		}
	}

	function pointerup() {
		if (!drag) return;
		if (drag.kind === 'fill' && !readonly) {
			const { source, target } = drag;
			if (
				target.top !== source.top ||
				target.bottom !== source.bottom ||
				target.left !== source.left ||
				target.right !== source.right
			) {
				sheet.fill(source, target);
			}
		}
		if (drag.kind === 'resize' && !readonly) sheet.resizeColumn(drag.col, drag.width);
		drag = null;
	}

	function dblclick(event: MouseEvent) {
		if (readonly) return;
		if ((event.target as HTMLElement).closest('[data-resize]')) return;
		const cell = cellAt(event.clientX, event.clientY);
		if (!cell) return;
		sheet.select(cell);
		startEditing();
	}

	/** The width a column is drawn at: the one being dragged, or its own. */
	const widthOf = (col: number) =>
		drag?.kind === 'resize' && drag.col === col ? drag.width : colAxis.size(col);
	const fillTarget = $derived(drag?.kind === 'fill' ? drag.target : null);

	/* ---------------------------------------------------------------- */
	/* What the screen reader hears                                      */
	/* ---------------------------------------------------------------- */

	const announcement = $derived.by(() => {
		void sheet.version;
		const a = sheet.anchor;
		const text = sheet.display(a.row, a.col);
		const input = sheet.input(a.row, a.col);
		const formula = input.startsWith('=') ? `, formula ${input}` : '';
		return `${toA1(a)}${text ? `: ${text}` : ', empty'}${formula}`;
	});
</script>

<!--
	The grid is the keyboard target; the viewport scrolls; the canvas is the
	size of the sheet. Sticky, zero-size layers hold the headers and the frozen
	panes in place while their absolutely positioned children move with the
	canvas — which is the whole trick, and the reason no overlay is needed.
-->
<div
	bind:this={grid}
	class={['grid', { 'grid--readonly': readonly, 'grid--dragging': drag !== null }]}
	role="grid"
	aria-label="Spreadsheet"
	aria-rowcount={rowCount}
	aria-colcount={colCount}
	aria-multiselectable="true"
	aria-activedescendant="cell-{sheet.anchor.row}-{sheet.anchor.col}"
	aria-readonly={readonly || undefined}
	tabindex="0"
	onkeydown={keydown}
	{oncopy}
	{oncut}
	{onpaste}
>
	<div
		bind:this={viewport}
		class="viewport"
		role="presentation"
		bind:clientWidth={width}
		bind:clientHeight={height}
		onscroll={(event) => {
			scrollTop = event.currentTarget.scrollTop;
			scrollLeft = event.currentTarget.scrollLeft;
		}}
		onpointerdown={pointerdown}
		onpointermove={pointermove}
		onpointerup={pointerup}
		onpointercancel={pointerup}
		ondblclick={dblclick}
	>
		<div
			class="canvas"
			style:width="{HEADER_WIDTH + totalWidth}px"
			style:height="{HEADER_HEIGHT + totalHeight}px"
		>
			{#snippet cell(r: number, c: number, top: number, left: number)}
				{@const k = key(r, c)}
				{@const value = sheet.value(r, c)}
				{@const selected = inRect(selection, { row: r, col: c })}
				{@const anchor = sheet.anchor.row === r && sheet.anchor.col === c}
				{@const highlight = highlights.find((h) => inRect(h.rect, { row: r, col: c }))}
				{@const cursor = cursorsByCell.get(k)}
				{@const editing = sheet.editing?.row === r && sheet.editing.col === c}
				{@const filling =
					fillTarget !== null && inRect(fillTarget, { row: r, col: c }) && !selected}
				<div
					id="cell-{r}-{c}"
					class={[
						'cell',
						{
							'cell--num': typeof value === 'number',
							'cell--bool': typeof value === 'boolean',
							'cell--error': value !== null && typeof value === 'object',
							'cell--selected': selected,
							'cell--anchor': anchor,
							'cell--editing': editing,
							'cell--flash': sheet.flashes.has(k),
							'cell--filling': filling,
							'cell--top': selected && r === selection.top,
							'cell--bottom': selected && r === selection.bottom,
							'cell--left': selected && c === selection.left,
							'cell--right': selected && c === selection.right,
							'cell--hl-top': highlight && r === highlight.rect.top,
							'cell--hl-bottom': highlight && r === highlight.rect.bottom,
							'cell--hl-left': highlight && c === highlight.rect.left,
							'cell--hl-right': highlight && c === highlight.rect.right
						}
					]}
					role="gridcell"
					aria-rowindex={r + 1}
					aria-colindex={c + 1}
					aria-selected={selected}
					style:top="{top}px"
					style:left="{left}px"
					style:width="{widthOf(c)}px"
					style:height="{rowAxis.size(r)}px"
					style:--hl={highlight ? `var(--ref-hue-${highlight.hue})` : undefined}
					style:--cursor-hue={cursor?.hue}
				>
					{#if editing && !readonly}
						<CellEditor bind:this={editor} {sheet} oncommit={commit} oncancel={cancel} />
					{:else}
						{sheet.display(r, c)}
					{/if}
					{#if cursor && !editing}
						<span class="cursor-name" style:--cursor-hue={cursor.hue}>{cursor.name}</span>
					{/if}
					{#if !readonly && selected && r === selection.bottom && c === selection.right && !editing}
						<span class="fill-handle" data-fill aria-hidden="true"></span>
					{/if}
				</div>
			{/snippet}

			<!-- Column headers: sticky to the top, scrolling sideways with the canvas. -->
			<div class="layer layer--top">
				{#each [...frozenCols, ...cols] as c (c)}
					<div
						class={[
							'colhead',
							{ 'colhead--selected': c >= selection.left && c <= selection.right }
						]}
						data-colhead={c}
						role="columnheader"
						style:left="{HEADER_WIDTH + colAxis.offset(c)}px"
						style:width="{widthOf(c)}px"
						style:height="{HEADER_HEIGHT}px"
					>
						{colName(c)}
						{#if !readonly}<span class="resize" data-resize={c} aria-hidden="true"></span>{/if}
					</div>
				{/each}
			</div>

			<!-- Row headers: sticky to the left. -->
			<div class="layer layer--left">
				{#each [...frozenRows, ...rows] as r (r)}
					<div
						class={[
							'rowhead',
							{ 'rowhead--selected': r >= selection.top && r <= selection.bottom }
						]}
						data-rowhead={r}
						role="rowheader"
						style:top="{HEADER_HEIGHT + rowAxis.offset(r)}px"
						style:width="{HEADER_WIDTH}px"
						style:height="{rowAxis.size(r)}px"
					>
						{r + 1}
					</div>
				{/each}
			</div>

			<!-- The corner, above everything. -->
			<div class="layer layer--corner">
				<div class="corner" style:width="{HEADER_WIDTH}px" style:height="{HEADER_HEIGHT}px"></div>
			</div>

			<!-- Frozen rows: sticky below the column headers. -->
			{#if sheet.frozen.rows > 0}
				<div class="layer layer--frozen-rows" style:top="{HEADER_HEIGHT}px">
					{#each frozenRows as r (r)}
						{#each cols as c (c)}
							{@render cell(r, c, rowAxis.offset(r), HEADER_WIDTH + colAxis.offset(c))}
						{/each}
					{/each}
				</div>
			{/if}

			<!-- Frozen columns: sticky right of the row headers. -->
			{#if sheet.frozen.cols > 0}
				<div class="layer layer--frozen-cols" style:left="{HEADER_WIDTH}px">
					{#each rows as r (r)}
						{#each frozenCols as c (c)}
							{@render cell(r, c, HEADER_HEIGHT + rowAxis.offset(r), colAxis.offset(c))}
						{/each}
					{/each}
				</div>
			{/if}

			<!-- Where frozen rows and columns meet. -->
			{#if sheet.frozen.rows > 0 && sheet.frozen.cols > 0}
				<div
					class="layer layer--frozen-corner"
					style:top="{HEADER_HEIGHT}px"
					style:left="{HEADER_WIDTH}px"
				>
					{#each frozenRows as r (r)}
						{#each frozenCols as c (c)}
							{@render cell(r, c, rowAxis.offset(r), colAxis.offset(c))}
						{/each}
					{/each}
				</div>
			{/if}

			<!-- The body: every cell the scroll position reveals. -->
			<div class="body">
				{#each rows as r (r)}
					{#each cols as c (c)}
						{@render cell(
							r,
							c,
							HEADER_HEIGHT + rowAxis.offset(r),
							HEADER_WIDTH + colAxis.offset(c)
						)}
					{/each}
				{/each}
			</div>
		</div>
	</div>

	<div class="visually-hidden" aria-live="polite">{announcement}</div>
</div>

<style>
	.grid {
		position: relative;
		height: 100%;
		min-height: 20rem;
		outline: none;
		background: var(--grid-cell);
		border: 1px solid var(--grid-line);
		user-select: none;
	}

	.grid:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.grid--dragging {
		cursor: crosshair;
	}

	.viewport {
		position: absolute;
		inset: 0;
		overflow: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
	}

	.canvas {
		position: relative;
	}

	/*
	 * The sticky layers. Each is zero-sized so it takes no space in the
	 * canvas's flow; its absolutely positioned children overflow visibly and
	 * move with the canvas on the other axis.
	 */
	.layer {
		position: sticky;
		width: 0;
		height: 0;
	}

	.layer--top {
		top: 0;
		z-index: 4;
	}

	.layer--left {
		left: 0;
		z-index: 3;
	}

	.layer--corner {
		top: 0;
		left: 0;
		z-index: 6;
	}

	.layer--frozen-rows {
		z-index: 2;
	}

	.layer--frozen-cols {
		z-index: 2;
	}

	.layer--frozen-corner {
		z-index: 5;
	}

	.body {
		position: absolute;
		inset: 0;
	}

	.colhead,
	.rowhead,
	.corner {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--grid-head);
		color: var(--grid-head-text);
		font-size: var(--fs-xs);
		font-weight: var(--weight-medium);
		border-right: 1px solid var(--grid-line);
		border-bottom: 1px solid var(--grid-line);
	}

	.colhead {
		top: 0;
		cursor: s-resize;
	}

	.rowhead {
		left: 0;
		cursor: e-resize;
	}

	.corner {
		top: 0;
		left: 0;
	}

	.colhead--selected,
	.rowhead--selected {
		background: var(--accent-soft);
		color: var(--accent-strong);
	}

	.resize {
		position: absolute;
		top: 0;
		right: -4px;
		width: 8px;
		height: 100%;
		cursor: col-resize;
		z-index: 1;
	}

	.resize:hover {
		background: var(--selection-border);
		opacity: 0.6;
	}

	.cell {
		position: absolute;
		overflow: hidden;
		padding: 0 6px;
		display: flex;
		align-items: center;
		white-space: nowrap;
		font-size: var(--fs-sm);
		border-right: 1px solid var(--grid-line);
		border-bottom: 1px solid var(--grid-line);
		background: var(--grid-cell);
		box-sizing: border-box;
		cursor: cell;
	}

	.cell--num {
		justify-content: flex-end;
		font-variant-numeric: tabular-nums;
	}

	.cell--bool {
		justify-content: center;
		text-transform: uppercase;
		font-size: var(--fs-xs);
	}

	.cell--error {
		color: var(--danger);
		font-weight: var(--weight-medium);
	}

	.cell--selected {
		background: var(--selection);
	}

	/* Selection borders, drawn on the cells at the edge of the rectangle. */
	.cell--top {
		box-shadow: inset 0 1px 0 var(--selection-border);
	}
	.cell--bottom {
		border-bottom-color: var(--selection-border);
	}
	.cell--left {
		box-shadow: inset 1px 0 0 var(--selection-border);
	}
	.cell--right {
		border-right-color: var(--selection-border);
	}
	.cell--top.cell--left {
		box-shadow:
			inset 0 1px 0 var(--selection-border),
			inset 1px 0 0 var(--selection-border);
	}

	.cell--anchor {
		background: var(--grid-cell);
		outline: 2px solid var(--selection-border);
		outline-offset: -2px;
		z-index: 1;
	}

	.cell--editing {
		overflow: visible;
		z-index: 7;
		padding: 0;
	}

	.cell--filling {
		background: var(--accent-soft);
		outline: 1px dashed var(--selection-border);
		outline-offset: -1px;
	}

	/* Formula references: a coloured tint and border on the referenced cells. */
	.cell[style*='--hl'] {
		background: oklch(92% 0.06 var(--hl));
	}
	.cell--hl-top {
		box-shadow: inset 0 2px 0 oklch(60% 0.18 var(--hl));
	}
	.cell--hl-bottom {
		border-bottom: 2px solid oklch(60% 0.18 var(--hl));
	}
	.cell--hl-left {
		box-shadow: inset 2px 0 0 oklch(60% 0.18 var(--hl));
	}
	.cell--hl-right {
		border-right: 2px solid oklch(60% 0.18 var(--hl));
	}
	.cell--hl-top.cell--hl-left {
		box-shadow:
			inset 0 2px 0 oklch(60% 0.18 var(--hl)),
			inset 2px 0 0 oklch(60% 0.18 var(--hl));
	}

	.cell--flash {
		animation: flash 0.9s var(--ease-out);
	}

	@keyframes flash {
		from {
			background: var(--remote-flash);
		}
	}

	.cell[style*='--cursor-hue'] {
		outline: 2px solid oklch(65% 0.2 calc(var(--cursor-hue) * 1deg));
		outline-offset: -2px;
	}

	.cursor-name {
		position: absolute;
		top: -1.1rem;
		left: -2px;
		padding: 0 4px;
		border-radius: 3px 3px 3px 0;
		background: oklch(65% 0.2 calc(var(--cursor-hue) * 1deg));
		color: white;
		font-size: 10px;
		line-height: 1.1rem;
		white-space: nowrap;
		pointer-events: none;
	}

	.fill-handle {
		position: absolute;
		right: -4px;
		bottom: -4px;
		width: 8px;
		height: 8px;
		background: var(--selection-border);
		border: 1px solid var(--grid-cell);
		cursor: crosshair;
		z-index: 2;
	}

	@media (forced-colors: active) {
		.cell--selected {
			background: Highlight;
			color: HighlightText;
		}
		.cell--anchor {
			outline-color: Highlight;
		}
	}

	@media print {
		.grid {
			border: 0;
		}
		.viewport {
			position: static;
			overflow: visible;
		}
	}
</style>
