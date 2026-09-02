<script lang="ts">
	import type { Snippet } from 'svelte';
	import { importCsv, type Progress } from '#lib/csv/import.ts';
	import { downloadText, sheetToCsv } from '#lib/csv/export.ts';
	import type { Edit } from '#lib/engine/engine.ts';
	import type { Address } from '#lib/sheet/address.ts';
	import type { Sheet } from '#lib/sheet/sheet.svelte.ts';
	import { toast } from '#lib/toast/toast.ts';
	import FindReplace from './FindReplace.svelte';
	import FormulaBar from './FormulaBar.svelte';
	import Grid from './Grid.svelte';
	import Toolbar from './Toolbar.svelte';

	/**
	 * THE WORKBENCH
	 * =============
	 *
	 * Toolbar, formula bar, grid, and the two things that need a file: CSV
	 * import through the worker and CSV export to a download. The stored
	 * sheet page and the local sheet page both render this and differ only
	 * in what they put in the `extra` slot and where the export goes.
	 */
	let {
		sheet,
		readonly = false,
		cursors = [],
		exportHref,
		onactivate,
		extra,
		status
	}: {
		sheet: Sheet;
		readonly?: boolean;
		cursors?: { client: string; name: string; cell: string | null }[];
		/** A server URL for the export, or none to build the file in the browser. */
		exportHref?: string;
		onactivate?: (cell: Address) => void;
		extra?: Snippet;
		status?: Snippet;
	} = $props();

	let fileInput = $state<HTMLInputElement>();
	let files = $state<FileList>();
	let progress = $state<Progress | null>(null);
	let finding = $state(false);

	/**
	 * `bind:files` gives a `FileList`; clearing it means assigning the files
	 * of an empty `DataTransfer` — the one way to make one — so the same file
	 * can be chosen twice in a row.
	 */
	async function imported() {
		const file = files?.[0];
		if (!file) return;
		const controller = new AbortController();
		try {
			const { rows, delimiter } = await importCsv(file, (p) => (progress = p), controller.signal);
			const at = sheet.anchor;
			const edits: Edit[] = [];
			rows.forEach((row, r) =>
				row.forEach((value, c) => edits.push({ row: at.row + r, col: at.col + c, input: value }))
			);
			if (edits.length > 200_000) {
				toast(
					'That file is larger than a sheet may be — the first 200,000 cells were imported',
					'error'
				);
				edits.length = 200_000;
			}
			sheet.edit(edits, `Import ${file.name}`);
			toast(
				`Imported ${rows.length.toLocaleString()} rows (${delimiter === '\t' ? 'tab' : delimiter}-separated)`
			);
		} catch (e) {
			toast((e as Error).message, 'error');
		} finally {
			progress = null;
			files = new DataTransfer().files;
		}
	}

	function exportCsv() {
		if (exportHref) {
			location.href = exportHref;
			return;
		}
		downloadText(sheetToCsv(sheet), `${sheet.title || 'sheet'}.csv`);
	}

	function keydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && !readonly) {
			event.preventDefault();
			finding = true;
		}
	}
</script>

<svelte:window onkeydown={keydown} />

<div class="workbench">
	<div class="workbench__tools no-print">
		<Toolbar
			{sheet}
			{readonly}
			onimport={readonly ? undefined : () => fileInput?.click()}
			onexport={exportCsv}
			onfind={readonly ? undefined : () => (finding = true)}
			{extra}
		/>
		<div class="workbench__bar">
			<FormulaBar {sheet} {readonly} />
			{@render status?.()}
		</div>
		{#if progress}
			<p class="hint" role="status">
				Importing… {Math.round((progress.bytes / Math.max(1, progress.total)) * 100)}% ({progress.rows.toLocaleString()}
				rows)
			</p>
		{/if}
		{#if finding}
			<FindReplace {sheet} onclose={() => (finding = false)} />
		{/if}
	</div>

	<div class="workbench__grid">
		<Grid {sheet} {readonly} {cursors} {onactivate} />
	</div>

	<input
		bind:this={fileInput}
		class="visually-hidden"
		type="file"
		accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
		aria-label="Import a CSV file"
		bind:files
		onchange={imported}
	/>
</div>

<style>
	.workbench {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		height: 100%;
		min-height: 0;
	}

	.workbench__tools {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.workbench__bar {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.workbench__grid {
		flex: 1;
		min-height: 24rem;
	}
</style>
