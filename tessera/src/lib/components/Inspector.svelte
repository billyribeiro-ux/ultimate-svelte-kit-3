<script lang="ts">
	import CopyIcon from 'phosphor-svelte/lib/Copy';
	import TrashIcon from 'phosphor-svelte/lib/Trash';
	import ArrowLineUpIcon from 'phosphor-svelte/lib/ArrowLineUp';
	import ArrowLineDownIcon from 'phosphor-svelte/lib/ArrowLineDown';
	import { FILLS, NODE_KINDS, type Fill, type NodeKind } from '#lib/board/index.ts';
	import type { BoardEditor } from '#lib/canvas/editor.svelte.ts';
	import { requireMessages } from '#lib/i18n/context.ts';

	interface Props {
		editor: BoardEditor;
	}

	let { editor }: Props = $props();

	const catalogue = requireMessages();
	const t = $derived(catalogue());

	const selected = $derived(editor.selectedNodes);
	const one = $derived(selected.length === 1 ? selected[0] : null);

	/**
	 * The shared value of a property across the selection, or null for "mixed".
	 *
	 * Showing the first shape's colour as though it were the selection's colour is
	 * the classic inspector bug: you glance at it, believe everything is jade, and
	 * only find out otherwise after pressing something else.
	 */
	function shared<T>(pick: (node: (typeof selected)[number]) => T): T | null {
		if (selected.length === 0) return null;
		const first = pick(selected[0]!);
		return selected.every((node) => pick(node) === first) ? first : null;
	}

	const fill = $derived(shared((node) => node.fill));
	const kind = $derived(shared((node) => node.kind));
</script>

<aside class="inspector" aria-label="Properties">
	{#if selected.length === 0}
		<p class="inspector__empty">Select a shape to edit it.</p>
	{:else}
		<header class="inspector__header">
			<h2 class="inspector__title truncate">
				{one ? one.label || t.board.untitled : `${selected.length} shapes`}
			</h2>
		</header>

		<section class="inspector__section">
			<h3 class="inspector__legend">{t.editing.colour}</h3>
			<div class="inspector__swatches" role="group" aria-label={t.editing.colour}>
				{#each FILLS as option (option)}
					<button
						type="button"
						class="inspector__swatch"
						class:inspector__swatch--on={fill === option}
						style="--hue: var(--fill-{option}-h)"
						aria-label={option}
						aria-pressed={fill === option}
						disabled={editor.readOnly}
						onclick={() => editor.setFill(option as Fill)}
					></button>
				{/each}
			</div>
		</section>

		{#if one}
			<section class="inspector__section">
				<h3 class="inspector__legend">Kind</h3>
				<select
					class="inspector__select"
					value={kind ?? ''}
					disabled={editor.readOnly}
					aria-label="Kind"
					onchange={(event) =>
						editor.document.setNode(one.id, 'kind', event.currentTarget.value as NodeKind)}
				>
					{#each NODE_KINDS as option (option)}
						<option value={option}>{t.tools[option]}</option>
					{/each}
				</select>
			</section>

			<section class="inspector__section">
				<h3 class="inspector__legend">Position</h3>
				<dl class="inspector__grid">
					<div>
						<dt>X</dt>
						<dd>{Math.round(one.x)}</dd>
					</div>
					<div>
						<dt>Y</dt>
						<dd>{Math.round(one.y)}</dd>
					</div>
					<div>
						<dt>W</dt>
						<dd>{Math.round(one.w)}</dd>
					</div>
					<div>
						<dt>H</dt>
						<dd>{Math.round(one.h)}</dd>
					</div>
				</dl>
			</section>
		{/if}

		<section class="inspector__section inspector__actions">
			<button
				type="button"
				class="inspector__action"
				disabled={editor.readOnly}
				onclick={() => editor.restack('forward')}
			>
				<ArrowLineUpIcon size={16} />
				{t.editing.bringForward}
			</button>
			<button
				type="button"
				class="inspector__action"
				disabled={editor.readOnly}
				onclick={() => editor.restack('backward')}
			>
				<ArrowLineDownIcon size={16} />
				{t.editing.sendBackward}
			</button>
			<button
				type="button"
				class="inspector__action"
				disabled={editor.readOnly}
				onclick={() => editor.duplicateSelection()}
			>
				<CopyIcon size={16} />
				{t.editing.duplicate}
			</button>
			<button
				type="button"
				class="inspector__action inspector__action--danger"
				disabled={editor.readOnly}
				onclick={() => editor.deleteSelection()}
			>
				<TrashIcon size={16} />
				{t.editing.delete}
			</button>
		</section>
	{/if}
</aside>

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		overflow-y: auto;
		height: 100%;
	}

	.inspector__empty {
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}

	.inspector__title {
		font-size: var(--fs-md);
		font-weight: var(--weight-semibold);
	}

	.inspector__section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.inspector__legend {
		font-size: var(--fs-xs);
		font-weight: var(--weight-medium);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--text-faint);
	}

	.inspector__swatches {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.inspector__swatch {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		border: 2px solid transparent;
		background: hsl(var(--hue) var(--fill-chroma) var(--fill-edge-lightness));
	}

	.inspector__swatch--on {
		border-color: var(--text);
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.inspector__select {
		width: 100%;
		min-height: 36px;
		padding: 0 var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
	}

	.inspector__grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-2);
		margin: 0;
	}

	.inspector__grid div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
	}

	.inspector__grid dt {
		color: var(--text-faint);
	}

	.inspector__grid dd {
		margin: 0;
	}

	.inspector__actions {
		gap: var(--space-1);
	}

	.inspector__action {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 36px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-md);
		font-size: var(--fs-sm);
		color: var(--text-muted);
		text-align: left;
	}

	.inspector__action:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}

	.inspector__action--danger:hover:not(:disabled) {
		color: var(--danger);
	}

	.inspector__action:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
