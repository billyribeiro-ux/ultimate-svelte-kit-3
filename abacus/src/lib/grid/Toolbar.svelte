<script lang="ts">
	import {
		ArrowUUpLeftIcon,
		ArrowUUpRightIcon,
		ColumnsIcon,
		CurrencyDollarIcon,
		DownloadSimpleIcon,
		ListNumbersIcon,
		MagnifyingGlassIcon,
		PercentIcon,
		RowsIcon,
		SnowflakeIcon,
		SortAscendingIcon,
		SortDescendingIcon,
		UploadSimpleIcon
	} from 'phosphor-svelte';
	import type { Snippet } from 'svelte';
	import type { CellFormat } from '#lib/sheet/format.ts';
	import type { Sheet } from '#lib/sheet/sheet.svelte.ts';

	/**
	 * THE TOOLBAR
	 * ===========
	 *
	 * Buttons that call the sheet model. Every one is a command, so every one
	 * undoes. The format menu is a native popover — `popovertarget` and a
	 * `popover` attribute, no JavaScript, dismissed by a click outside or
	 * Escape by the browser itself — which is the state of the art for a
	 * menu in 2026 and the reason there is no `Menu` component in this
	 * project.
	 *
	 * Import and export are the page's business (one needs a worker, the
	 * other a URL), so they arrive as callbacks; the `extra` snippet is where
	 * a page puts what only it has — publish, share, sign in.
	 */
	let {
		sheet,
		readonly = false,
		onimport,
		onexport,
		onfind,
		extra
	}: {
		sheet: Sheet;
		readonly?: boolean;
		onimport?: () => void;
		onexport?: () => void;
		onfind?: () => void;
		extra?: Snippet;
	} = $props();

	const formats: { label: string; format: CellFormat }[] = [
		{ label: 'General', format: { kind: 'general' } },
		{ label: 'Number, 2 places', format: { kind: 'number', decimals: 2, grouping: true } },
		{ label: 'Whole number', format: { kind: 'number', decimals: 0, grouping: true } },
		{ label: 'Percent', format: { kind: 'percent', decimals: 1 } },
		{ label: 'Currency (USD)', format: { kind: 'currency', currency: 'USD', decimals: 2 } },
		{ label: 'Currency (EUR)', format: { kind: 'currency', currency: 'EUR', decimals: 2 } },
		{ label: 'Date', format: { kind: 'date', style: 'short' } },
		{ label: 'Date, long', format: { kind: 'date', style: 'long' } },
		{ label: 'Date and time', format: { kind: 'datetime' } },
		{ label: 'Text', format: { kind: 'text' } }
	];

	const selection = $derived(sheet.selection);
	const rowsSelected = $derived(selection.bottom - selection.top + 1);
	const colsSelected = $derived(selection.right - selection.left + 1);

	function freeze() {
		// Freeze everything above and left of the anchor — or unfreeze if it is already so.
		const { row, col } = sheet.anchor;
		if (sheet.frozen.rows === row && sheet.frozen.cols === col) sheet.frozen = { rows: 0, cols: 0 };
		else sheet.frozen = { rows: Math.min(10, row), cols: Math.min(10, col) };
		sheet.dirty = true;
	}
</script>

<div class="toolbar" role="toolbar" aria-label="Sheet tools">
	<div class="group">
		<button
			type="button"
			class="btn btn--sm btn--icon"
			aria-label="Undo"
			title="Undo (Ctrl+Z)"
			disabled={readonly || !sheet.canUndo}
			onclick={() => sheet.undo()}
		>
			<ArrowUUpLeftIcon size={16} />
		</button>
		<button
			type="button"
			class="btn btn--sm btn--icon"
			aria-label="Redo"
			title="Redo (Ctrl+Y)"
			disabled={readonly || !sheet.canRedo}
			onclick={() => sheet.redo()}
		>
			<ArrowUUpRightIcon size={16} />
		</button>
	</div>

	{#if !readonly}
		<div class="group">
			<button
				type="button"
				class="btn btn--sm"
				popovertarget="format-menu"
				aria-label="Number format"
			>
				<ListNumbersIcon size={16} /> Format
			</button>
			<div id="format-menu" class="menu" popover="auto">
				{#each formats as { label, format } (label)}
					<button type="button" class="menu__item" onclick={() => sheet.setFormat(format)}>
						{label}
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="btn btn--sm btn--icon"
				aria-label="Percent format"
				title="Percent"
				onclick={() => sheet.setFormat({ kind: 'percent', decimals: 1 })}
			>
				<PercentIcon size={16} />
			</button>
			<button
				type="button"
				class="btn btn--sm btn--icon"
				aria-label="Currency format"
				title="Currency"
				onclick={() => sheet.setFormat({ kind: 'currency', currency: 'USD', decimals: 2 })}
			>
				<CurrencyDollarIcon size={16} />
			</button>
		</div>

		<div class="group">
			<button
				type="button"
				class="btn btn--sm"
				popovertarget="rows-menu"
				aria-label="Rows and columns"
			>
				<RowsIcon size={16} /> Rows
			</button>
			<div id="rows-menu" class="menu" popover="auto">
				<button
					type="button"
					class="menu__item"
					onclick={() => sheet.insertRows(selection.top, rowsSelected)}
				>
					Insert {rowsSelected} row{rowsSelected > 1 ? 's' : ''} above
				</button>
				<button
					type="button"
					class="menu__item"
					onclick={() => sheet.insertRows(selection.bottom + 1, rowsSelected)}
				>
					Insert {rowsSelected} row{rowsSelected > 1 ? 's' : ''} below
				</button>
				<button
					type="button"
					class="menu__item menu__item--danger"
					onclick={() => sheet.deleteRows(selection.top, rowsSelected)}
				>
					Delete {rowsSelected} row{rowsSelected > 1 ? 's' : ''}
				</button>
			</div>
			<button type="button" class="btn btn--sm" popovertarget="cols-menu" aria-label="Columns">
				<ColumnsIcon size={16} /> Columns
			</button>
			<div id="cols-menu" class="menu" popover="auto">
				<button
					type="button"
					class="menu__item"
					onclick={() => sheet.insertColumns(selection.left, colsSelected)}
				>
					Insert {colsSelected} column{colsSelected > 1 ? 's' : ''} left
				</button>
				<button
					type="button"
					class="menu__item"
					onclick={() => sheet.insertColumns(selection.right + 1, colsSelected)}
				>
					Insert {colsSelected} column{colsSelected > 1 ? 's' : ''} right
				</button>
				<button
					type="button"
					class="menu__item menu__item--danger"
					onclick={() => sheet.deleteColumns(selection.left, colsSelected)}
				>
					Delete {colsSelected} column{colsSelected > 1 ? 's' : ''}
				</button>
			</div>
			<button
				type="button"
				class={[
					'btn btn--sm btn--icon',
					{ 'btn--primary': sheet.frozen.rows > 0 || sheet.frozen.cols > 0 }
				]}
				aria-label="Freeze rows and columns above and left of the active cell"
				aria-pressed={sheet.frozen.rows > 0 || sheet.frozen.cols > 0}
				title="Freeze panes"
				onclick={freeze}
			>
				<SnowflakeIcon size={16} />
			</button>
		</div>

		<div class="group">
			<button
				type="button"
				class="btn btn--sm btn--icon"
				aria-label="Sort selection ascending by its first column"
				title="Sort A → Z"
				disabled={rowsSelected < 2}
				onclick={() => sheet.sort(selection, selection.left, 'asc')}
			>
				<SortAscendingIcon size={16} />
			</button>
			<button
				type="button"
				class="btn btn--sm btn--icon"
				aria-label="Sort selection descending by its first column"
				title="Sort Z → A"
				disabled={rowsSelected < 2}
				onclick={() => sheet.sort(selection, selection.left, 'desc')}
			>
				<SortDescendingIcon size={16} />
			</button>
			{#if onfind}
				<button
					type="button"
					class="btn btn--sm btn--icon"
					aria-label="Find and replace"
					title="Find (Ctrl+F)"
					onclick={onfind}
				>
					<MagnifyingGlassIcon size={16} />
				</button>
			{/if}
		</div>
	{/if}

	<div class="group group--end">
		{#if onimport && !readonly}
			<button type="button" class="btn btn--sm" onclick={onimport}>
				<UploadSimpleIcon size={16} /> Import CSV
			</button>
		{/if}
		{#if onexport}
			<button type="button" class="btn btn--sm" onclick={onexport}>
				<DownloadSimpleIcon size={16} /> Export CSV
			</button>
		{/if}
		{@render extra?.()}
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.group {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.group--end {
		margin-inline-start: auto;
	}

	/*
	 * A native popover: the browser positions nothing, so `position-area`
	 * anchors the menu under its button where anchor positioning exists, and
	 * the fallback is a centred sheet — which on a phone is the better menu
	 * anyway.
	 */
	.menu {
		position: fixed;
		inset: auto;
		min-width: 14rem;
		margin: 0;
		padding: var(--space-1);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		color: var(--text);
		box-shadow: var(--shadow-lg);
	}

	.menu:popover-open {
		display: flex;
		flex-direction: column;
	}

	.menu::backdrop {
		background: transparent;
	}

	.menu__item {
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		text-align: left;
		font-size: var(--fs-sm);
		cursor: pointer;
	}

	.menu__item:hover,
	.menu__item:focus-visible {
		background: var(--surface-hover);
	}

	.menu__item--danger {
		color: var(--danger);
	}
</style>
