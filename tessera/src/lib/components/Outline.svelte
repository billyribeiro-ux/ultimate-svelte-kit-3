<script lang="ts">
	import type { BoardEditor } from '#lib/canvas/editor.svelte.ts';
	import type { Messages } from '#lib/i18n/index.ts';
	import type { NodeView } from '#lib/board/index.ts';

	interface Props {
		editor: BoardEditor;
		t: Messages;
	}

	let { editor, t }: Props = $props();

	/**
	 * THE BOARD, AS A TREE
	 * ====================
	 *
	 * This is not a summary of the canvas. It is the same document, rendered as
	 * something a screen reader and a keyboard can already use, and every action
	 * available here is available there.
	 *
	 * That is what makes `role="application"` on the canvas an honest claim rather
	 * than an excuse. Declaring that role tells assistive technology to stop
	 * interpreting keys and hand them over — which is only defensible if there is
	 * a path through the same content where it does not have to.
	 *
	 * It is also genuinely useful with a mouse, which is the sign the design is
	 * right: a list of every shape, grouped, that scrolls to and selects one.
	 */
	const roots = $derived(editor.ordered.filter((node) => node.parent === null));

	function childrenOf(parent: NodeView): NodeView[] {
		return editor.ordered.filter((node) => node.parent === parent.id);
	}

	function focus(node: NodeView) {
		editor.selectOnly([node.id]);
		void editor.camera.centreOn({ x: node.x + node.w / 2, y: node.y + node.h / 2 });
	}
</script>

<nav class="outline" aria-label={t.a11y.outline}>
	{#if roots.length === 0}
		<p class="outline__empty">{t.board.empty}</p>
	{:else}
		<ul class="outline__list" role="tree" aria-label={t.a11y.outline}>
			{#each roots as node (node.id)}
				{@const children = childrenOf(node)}
				<li
					role="treeitem"
					aria-selected={editor.selection.has(node.id)}
					aria-expanded={children.length > 0 ? true : undefined}
				>
					<button
						type="button"
						class="outline__item"
						class:outline__item--selected={editor.selection.has(node.id)}
						style="--hue: var(--fill-{node.fill}-h)"
						onclick={() => focus(node)}
					>
						<span class="outline__swatch" aria-hidden="true"></span>
						<span class="outline__label truncate">{node.label || t.board.untitled}</span>
						<span class="outline__kind">{t.tools[node.kind]}</span>
					</button>

					{#if children.length > 0}
						<ul role="group">
							{#each children as child (child.id)}
								<li role="treeitem" aria-selected={editor.selection.has(child.id)}>
									<button
										type="button"
										class="outline__item outline__item--child"
										class:outline__item--selected={editor.selection.has(child.id)}
										style="--hue: var(--fill-{child.fill}-h)"
										onclick={() => focus(child)}
									>
										<span class="outline__swatch" aria-hidden="true"></span>
										<span class="outline__label truncate">{child.label || t.board.untitled}</span>
										<span class="outline__kind">{t.tools[child.kind]}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</nav>

<style>
	.outline {
		padding: var(--space-3);
		overflow-y: auto;
		height: 100%;
	}

	.outline__empty {
		color: var(--text-faint);
		font-size: var(--fs-sm);
		padding: var(--space-3);
	}

	.outline__list,
	.outline ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.outline ul ul {
		padding-left: var(--space-4);
	}

	.outline__item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: 36px;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		text-align: left;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.outline__item:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.outline__item--selected {
		background: var(--accent-wash);
		color: var(--text);
	}

	.outline__swatch {
		width: 10px;
		height: 10px;
		flex: none;
		border-radius: 2px;
		background: hsl(var(--hue) var(--fill-chroma) var(--fill-edge-lightness));
	}

	.outline__label {
		flex: 1;
	}

	.outline__kind {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		flex: none;
	}
</style>
