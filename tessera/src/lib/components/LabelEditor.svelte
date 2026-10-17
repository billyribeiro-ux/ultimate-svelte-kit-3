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
	 *
	 * A plain `let`, like `mirror` and `ids` below: they are read only by the
	 * event handlers, `commit` and the attachment, never by the markup, a
	 * `$derived` or an `$effect`, so there is nothing for a signal to notify.
	 */
	let composing = false;

	/**
	 * The last text we know the document holds, and the id of each of its
	 * characters, in order.
	 *
	 * Tracked separately from `value` because the diff must be against what the
	 * *document* had, not what the textarea last rendered — those differ for one
	 * frame after a remote edit lands. The ids are what an offset in the field
	 * *meant* while the two were in step: by the time a remote edit reaches this
	 * component the document already holds the new text, so asking it which
	 * character sits at the caret's old offset would answer about the wrong text.
	 */
	// svelte-ignore state_referenced_locally
	// Intentional. `mirror` is seeded from the current text once and then tracks
	// what the *document* holds, which is not the same thing as what this prop
	// last rendered — the two differ for one frame after a remote edit lands, and
	// that frame is exactly when the diff must not use the newer value.
	let mirror = value;
	let ids: readonly Stamp[] = [];

	/** The field and the document now agree on `text`. */
	function inStep(text: string) {
		mirror = text;
		ids = board
			.label(target)
			.visible()
			.map((item) => item.id);
	}

	/**
	 * Put the document's text into the field, keeping the caret on its character.
	 *
	 * The field has no `value={value}` in the markup, and that is the point.
	 * Svelte writes a changed `value` into the textarea before any effect runs,
	 * and assigning a textarea's value moves its caret to the end — so by the
	 * time code meant to keep the caret still got to look, the text already
	 * matched and the caret had already gone. This attachment is the only thing
	 * that writes the value, and it reads the caret before it does.
	 *
	 * An attachment, not `bind:this` and an `$effect`: it is handed the element,
	 * so there is no variable that is `null` until mount, and it runs in an
	 * effect of its own — reading `value` is what re-runs it when somebody else's
	 * edit lands. Like `takeFocus`, it is a `const`, so that read is the only
	 * thing that does.
	 */
	const followDocument: Attachment<HTMLTextAreaElement> = (field) => {
		if (field.value === value) {
			inStep(value);
			return;
		}

		// Not focused yet — the first run, on mount. Nothing to keep in place.
		if (field.ownerDocument.activeElement !== field) {
			field.value = value;
			inStep(value);
			return;
		}

		// The character the caret sat after, by id, read from the text the field
		// still shows. Chapter 11's `offsetAfter` then says where it is now.
		const before = field.selectionStart;
		const anchor = before > 0 ? (ids[before - 1] ?? null) : null;

		field.value = value;
		inStep(value);

		const offset = board.label(target).offsetAfter(anchor);
		const caret = offset ?? Math.min(before, value.length);
		field.setSelectionRange(caret, caret);
	};

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

		inStep(next);
	}
</script>

<!--
	`followDocument` before `takeFocus`: the text has to be in the field before
	there is anything to select.
-->
<textarea
	{@attach followDocument}
	{@attach takeFocus}
	class="label-editor"
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
