<script lang="ts">
	import CursorIcon from 'phosphor-svelte/lib/Cursor';
	import CubeIcon from 'phosphor-svelte/lib/Cube';
	import DatabaseIcon from 'phosphor-svelte/lib/Database';
	import QueueIcon from 'phosphor-svelte/lib/Queue';
	import CloudIcon from 'phosphor-svelte/lib/Cloud';
	import NoteIcon from 'phosphor-svelte/lib/Note';
	import FrameCornersIcon from 'phosphor-svelte/lib/FrameCorners';
	import FlowArrowIcon from 'phosphor-svelte/lib/FlowArrow';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwise';
	import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwise';
	import CornersOutIcon from 'phosphor-svelte/lib/CornersOut';
	import type { Component } from 'svelte';
	import type { BoardEditor, Tool } from '#lib/canvas/editor.svelte.ts';
	import type { Messages } from '#lib/i18n/index.ts';

	interface Props {
		editor: BoardEditor;
		t: Messages;
	}

	let { editor, t }: Props = $props();

	/**
	 * The tools, as data.
	 *
	 * A row of nine near-identical buttons written out by hand is nine places to
	 * forget an `aria-label` — and one of them will be the one somebody needs.
	 * `key` is the single-key shortcut, shown in the tooltip so the interface
	 * teaches its own keyboard.
	 */
	const tools: { tool: Tool; icon: Component<{ size?: number }>; label: string; key: string }[] =
		$derived([
			{ tool: 'select', icon: CursorIcon, label: t.tools.select, key: 'V' },
			{ tool: 'service', icon: CubeIcon, label: t.tools.service, key: 'N' },
			{ tool: 'datastore', icon: DatabaseIcon, label: t.tools.datastore, key: 'S' },
			{ tool: 'queue', icon: QueueIcon, label: t.tools.queue, key: 'Q' },
			{ tool: 'external', icon: CloudIcon, label: t.tools.external, key: 'E' },
			{ tool: 'note', icon: NoteIcon, label: t.tools.note, key: 'T' },
			{ tool: 'group', icon: FrameCornersIcon, label: t.tools.group, key: 'G' },
			{ tool: 'connect', icon: FlowArrowIcon, label: t.tools.connect, key: 'C' }
		]);
</script>

<!--
	`role="toolbar"` with `aria-orientation`.

	It makes a screen reader announce this as one control with several options
	rather than eight unrelated buttons, and it is what tells assistive technology
	that arrow keys are expected to move within it.
-->
<div class="toolbar" role="toolbar" aria-orientation="horizontal" aria-label={t.tools.select}>
	<div class="toolbar__group">
		{#each tools as { tool, icon: Icon, label, key } (tool)}
			<button
				type="button"
				class="toolbar__button"
				class:toolbar__button--active={editor.tool === tool}
				aria-pressed={editor.tool === tool}
				aria-label={label}
				title="{label} · {key}"
				disabled={editor.readOnly && tool !== 'select'}
				onclick={() => (editor.tool = tool)}
			>
				<Icon size={18} />
			</button>
		{/each}
	</div>

	<div class="toolbar__divider" role="separator"></div>

	<div class="toolbar__group">
		<button
			type="button"
			class="toolbar__button"
			aria-label={t.editing.undo}
			title="{t.editing.undo} · ⌘Z"
			disabled={!editor.history.canUndo}
			onclick={() => editor.history.undo()}
		>
			<ArrowCounterClockwiseIcon size={18} />
		</button>
		<button
			type="button"
			class="toolbar__button"
			aria-label={t.editing.redo}
			title="{t.editing.redo} · ⇧⌘Z"
			disabled={!editor.history.canRedo}
			onclick={() => editor.history.redo()}
		>
			<ArrowClockwiseIcon size={18} />
		</button>
		<button
			type="button"
			class="toolbar__button"
			aria-label="Fit to view"
			title="Fit to view · 1"
			onclick={() => editor.fit()}
		>
			<CornersOutIcon size={18} />
		</button>
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow-panel);
		/*
			A horizontal scroll rather than a wrap.

			On a narrow phone eight tools do not fit, and wrapping to a second row
			eats a third of the viewport of a drawing application. Scrolling keeps the
			bar one row high and keeps the tools in a fixed, learnable order.
		*/
		overflow-x: auto;
		scrollbar-width: none;
		max-width: 100%;
	}

	.toolbar::-webkit-scrollbar {
		display: none;
	}

	.toolbar__group {
		display: flex;
		gap: var(--space-1);
	}

	.toolbar__divider {
		width: 1px;
		align-self: stretch;
		margin-inline: var(--space-1);
		background: var(--border);
		flex: none;
	}

	.toolbar__button {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		flex: none;
		border-radius: var(--radius-md);
		color: var(--text-muted);
		transition:
			background-color var(--fast) var(--ease-out),
			color var(--fast) var(--ease-out);
	}

	.toolbar__button:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}

	.toolbar__button--active {
		background: var(--accent-wash);
		color: var(--accent);
	}

	.toolbar__button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	@media (min-width: 48rem) {
		.toolbar__button {
			width: 36px;
			height: 36px;
		}
	}
</style>
