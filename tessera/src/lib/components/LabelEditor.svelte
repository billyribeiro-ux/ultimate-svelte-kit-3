<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { BoardDocument } from '#lib/board/index.ts';
	import type { Stamp } from '#lib/crdt/index.ts';

	/**
	 * IN-PLACE COLLABORATIVE TEXT
	 * ===========================
	 *
	 * A plain `<textarea>`, not a contenteditable.
	 *
	 * Contenteditable gives you rich text you did not ask for, a different DOM in
	 * every browser, and an IME story that has to be rebuilt by hand. A textarea
	 * gives you `value`, `selectionStart`, native spellcheck, native undo inside
	 * the field, and composition events that already work. A node label is one run
	 * of plain text; anything more is a feature nobody requested.
	 *
	 * THE DIFF
	 * --------
	 * The textarea reports the whole new string, and the CRDT wants "insert these
	 * characters after that one". Bridging the two is a common-prefix and
	 * common-suffix scan, which is exactly right for how people actually edit: a
	 * keystroke, a paste, a selection replaced. It is wrong for a change that
	 * happens to move text around inside the field, and that is a trade worth
	 * making — the alternative is a real diff algorithm running on every keystroke.
	 */
	interface Props {
		document: BoardDocument;
		target: Stamp;
		/** The materialised text, so this re-renders when somebody else types. */
		value: string;
		readOnly?: boolean;
		onfinish?: () => void;
	}

	let { document: board, target, value, readOnly = false, onfinish }: Props = $props();

	let field = $state<HTMLTextAreaElement | null>(null);

	/**
	 * Take focus, and select what is there.
	 *
	 * Without this the field appears and the keystrokes go to the board, where
	 * they are tool shortcuts — so naming a new shape "Ledger" silently switches
	 * to the external-system tool twice and creates nothing. Selecting the
	 * existing text is what makes typing *replace* a name, which is what everybody
	 * expects from a rename.
	 *
	 * Declared as a `const` rather than written inline in the template. An
	 * attachment re-runs whenever its expression produces a new function, and an
	 * arrow function written in markup is new on every render — so an inline
	 * version would grab focus and reselect the text on every keystroke, including
	 * somebody else's.
	 */
	const takeFocus: Attachment<HTMLTextAreaElement> = (node) => {
		node.focus();
		node.select();
	};

	/**
	 * True between `compositionstart` and `compositionend`.
	 *
	 * Japanese, Chinese and Korean input builds a word from several keystrokes,
	 * and the textarea's value during that time is provisional — pre-edit text the
	 * person has not committed. Diffing it produces a stream of insertions and
	 * deletions that other replicas watch flicker, and it breaks the IME's own
	 * candidate window. So nothing is sent until composition ends.
	 */
	let composing = $state(false);

	/**
	 * The last text we know the document holds.
	 *
	 * Tracked separately from `value` because the diff must be against what the
	 * *document* had, not what the textarea last rendered — those differ for one
	 * frame after a remote edit lands.
	 */
	// svelte-ignore state_referenced_locally
	// Intentional. `mirror` is seeded from the current text once and then tracks
	// what the *document* holds, which is not the same thing as what this prop
	// last rendered — the two differ for one frame after a remote edit lands, and
	// that frame is exactly when the diff must not use the newer value.
	let mirror = $state(value);

	$effect(() => {
		// A remote edit arrived. Update the field without disturbing the caret more
		// than the change itself requires.
		if (!field || field.value === value) {
			mirror = value;
			return;
		}

		const anchor = board.label(target).idBefore(field.selectionStart);
		field.value = value;
		mirror = value;

		const offset = board.label(target).offsetAfter(anchor);
		const caret = offset ?? Math.min(field.selectionStart, value.length);
		field.setSelectionRange(caret, caret);
	});

	function commit(next: string) {
		if (next === mirror) return;

		// Common prefix, then common suffix, then the difference between them.
		let start = 0;
		while (start < mirror.length && start < next.length && mirror[start] === next[start])
			start += 1;

		let end = 0;
		while (
			end < mirror.length - start &&
			end < next.length - start &&
			mirror[mirror.length - 1 - end] === next[next.length - 1 - end]
		) {
			end += 1;
		}

		const removed = mirror.length - start - end;
		const added = next.slice(start, next.length - end);

		// Delete first, then insert. The other order would make the insertion's
		// anchor a character that is about to be tombstoned — which works, and
		// leaves the new text on the wrong side of it.
		if (removed > 0) board.deleteText(target, start, start + removed);
		if (added) board.insertText(target, start, added);

		mirror = next;
	}
</script>

<textarea
	bind:this={field}
	{@attach takeFocus}
	class="label-editor"
	{value}
	readonly={readOnly}
	spellcheck="false"
	rows="1"
	aria-label="Label"
	oncompositionstart={() => (composing = true)}
	oncompositionend={(event) => {
		composing = false;
		commit(event.currentTarget.value);
	}}
	oninput={(event) => {
		if (composing) return;
		commit(event.currentTarget.value);
	}}
	onblur={() => onfinish?.()}
	onkeydown={(event) => {
		// Escape and Enter both finish. Shift+Enter is a line break, because a
		// label describing a service sometimes wants two lines.
		if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
			event.preventDefault();
			event.stopPropagation();
			onfinish?.();
			return;
		}
		// Everything else is typing, and must not reach the board's shortcuts —
		// otherwise pressing "d" while renaming duplicates the shape.
		event.stopPropagation();
	}}
	onpointerdown={(event) => event.stopPropagation()}></textarea>

<style>
	.label-editor {
		width: 100%;
		height: 100%;
		border: none;
		background: none;
		padding: 0;
		resize: none;
		outline: none;
		text-align: center;
		font: inherit;
		color: inherit;
		overflow: hidden;
		/* The board sets `user-select: none`; inside the editor it must come back,
		   or selecting a word to replace it is impossible. */
		user-select: text;
		-webkit-user-select: text;
	}
</style>
