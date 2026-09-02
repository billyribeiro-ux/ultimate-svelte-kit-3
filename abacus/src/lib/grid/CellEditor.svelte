<script lang="ts">
	import type { Sheet } from '#lib/sheet/sheet.svelte.ts';

	/**
	 * THE IN-CELL EDITOR
	 * ==================
	 *
	 * An input drawn over the cell being edited. It has no state of its own:
	 * the text lives in `sheet.editing.text`, which the formula bar binds to
	 * as well — type in either and the other follows, because they are two
	 * views of one `$state` object rather than two copies kept in sync.
	 *
	 * The grid decides when editing starts and what happens on commit; this
	 * component reports the keys that end it.
	 */
	let {
		sheet,
		oncommit,
		oncancel
	}: {
		sheet: Sheet;
		/** Enter, Tab, or a click elsewhere: the direction says where the selection goes next. */
		oncommit: (direction: 'down' | 'up' | 'right' | 'left' | 'stay') => void;
		oncancel: () => void;
	} = $props();

	let input = $state<HTMLInputElement>();

	/**
	 * `{@attach}` rather than `autofocus`: the attachment runs when the element
	 * is in the DOM and can put the caret at the end, which an attribute cannot.
	 * It also selects nothing, so typing continues the text rather than
	 * replacing it — the way F2 works in every spreadsheet.
	 */
	const focusAtEnd = (node: HTMLInputElement) => {
		node.focus();
		node.setSelectionRange(node.value.length, node.value.length);
	};

	function keydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'Enter':
				event.preventDefault();
				oncommit(event.shiftKey ? 'up' : 'down');
				break;
			case 'Tab':
				event.preventDefault();
				oncommit(event.shiftKey ? 'left' : 'right');
				break;
			case 'Escape':
				event.preventDefault();
				oncancel();
				break;
		}
		// Arrow keys stay inside the input: moving the caret through a long
		// formula matters more than moving the selection, and Enter is one key away.
		event.stopPropagation();
	}

	/** Exposed so the grid can insert a reference at the caret when a cell is clicked mid-formula. */
	export function insertAtCaret(
		text: string,
		replace: { start: number; end: number } | null
	): {
		start: number;
		end: number;
	} {
		if (!input || !sheet.editing) return { start: 0, end: 0 };
		const current = sheet.editing.text;
		const start = replace ? replace.start : (input.selectionStart ?? current.length);
		const end = replace ? replace.end : (input.selectionEnd ?? current.length);
		sheet.editing.text = current.slice(0, start) + text + current.slice(end);
		const caret = start + text.length;
		queueMicrotask(() => {
			input?.focus();
			input?.setSelectionRange(caret, caret);
		});
		return { start, end: caret };
	}
</script>

{#if sheet.editing}
	<input
		bind:this={input}
		class={['editor', { 'editor--formula': sheet.editing.text.startsWith('=') }]}
		type="text"
		aria-label="Cell editor"
		spellcheck="false"
		autocomplete="off"
		bind:value={sheet.editing.text}
		onkeydown={keydown}
		{@attach focusAtEnd}
	/>
{/if}

<style>
	.editor {
		position: absolute;
		inset: 0;
		min-width: 100%;
		width: max-content;
		max-width: 60vw;
		height: 100%;
		padding: 0 6px;
		border: 2px solid var(--selection-border);
		border-radius: 0;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		outline: none;
		box-shadow: var(--shadow-sm);
	}

	.editor--formula {
		font-family: var(--font-mono);
		font-size: 0.92em;
	}
</style>
