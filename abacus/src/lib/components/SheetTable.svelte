<script lang="ts">
	import { colName } from '#lib/sheet/address.ts';
	import type { Rendered } from '#lib/sheet/render.ts';

	/**
	 * A sheet as a plain table: no grid, no JavaScript, prints well. The
	 * published page, the embed and the template previews all use it, with
	 * the rows computed on the server by `tabulate`.
	 */
	let { rendered, caption }: { rendered: Rendered; caption: string } = $props();
</script>

<div class="wrap">
	<table class="sheet">
		<caption class="visually-hidden">{caption}</caption>
		<thead>
			<tr>
				<th scope="col" class="corner"></th>
				{#each { length: rendered.columns }, c (c)}
					<th scope="col">{colName(c)}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rendered.rows as row, r (r)}
				<tr>
					<th scope="row">{r + 1}</th>
					{#each row as cell, c (c)}
						<td class={{ num: cell.numeric, error: cell.error }} title={cell.formula ?? undefined}
							>{cell.text}</td
						>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.wrap {
		overflow-x: auto;
		border: 1px solid var(--grid-line);
		border-radius: var(--radius-md);
	}

	.sheet {
		border-collapse: collapse;
		font-size: var(--fs-sm);
		min-width: 100%;
	}

	th,
	td {
		padding: var(--space-1) var(--space-2);
		border-right: 1px solid var(--grid-line);
		border-bottom: 1px solid var(--grid-line);
		white-space: nowrap;
		text-align: left;
	}

	th {
		background: var(--grid-head);
		color: var(--grid-head-text);
		font-weight: var(--weight-medium);
		font-size: var(--fs-xs);
	}

	thead th {
		text-align: center;
		min-width: 5rem;
	}

	.corner {
		min-width: 2.5rem;
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.error {
		color: var(--danger);
	}

	@media print {
		.wrap {
			overflow: visible;
			border: 0;
		}
	}
</style>
