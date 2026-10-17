import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { BoardDocument, type Operation } from '#lib/board/index.ts';
import { MIDDLE, newActorId } from '#lib/crdt/index.ts';
import LabelEditor from './LabelEditor.svelte';

/**
 * Two replicas of one board, kept in step by hand: whatever either does locally
 * is applied to the other. The network, minus the network.
 */
function pair() {
	const mine = new BoardDocument(newActorId());
	const theirs = new BoardDocument(newActorId());

	mine.onLocalOperation((operation: Operation) => theirs.apply(operation));
	theirs.onLocalOperation((operation: Operation) => mine.apply(operation));

	return { mine, theirs };
}

describe('the label editor', () => {
	it('keeps the caret on its character when somebody types before it', async () => {
		const { mine, theirs } = pair();
		const id = mine.addNode({ x: 0, y: 0, order: MIDDLE });
		mine.insertText(id, 0, 'world');

		const label = () => mine.nodes.get(id)?.label ?? '';
		// Under `props`, because `target` is also the name of a mount option.
		const screen = await render(LabelEditor, {
			props: { document: mine, target: id, value: label() }
		});
		const field = screen.container.querySelector('textarea');
		expect(field).not.toBeNull();
		if (!field) return;

		// The caret after "wor", in the middle of the word.
		field.setSelectionRange(3, 3);

		/*
		 * Somebody else types at the start of the same label, and the new text
		 * arrives as a new `value` — exactly how `NodeShape` hands it over.
		 *
		 * The caret belongs after the same "r", now three places further on. The
		 * bug this guards against put it at the end of the field instead: Svelte
		 * writes a changed `value` into the textarea, and assigning a textarea's
		 * value moves its caret to the end — before any code that meant to
		 * preserve the caret had run.
		 */
		theirs.insertText(id, 0, 'hello ');
		await screen.rerender({ value: label() });

		expect(field.value).toBe('hello world');
		expect(field.selectionStart).toBe(9);
	});

	it('opens with the whole label selected, so typing replaces it', async () => {
		const { mine } = pair();
		const id = mine.addNode({ x: 0, y: 0, order: MIDDLE });
		mine.insertText(id, 0, 'Orders');

		const screen = await render(LabelEditor, {
			props: { document: mine, target: id, value: mine.nodes.get(id)?.label ?? '' }
		});
		const field = screen.container.querySelector('textarea');

		expect(field?.value).toBe('Orders');
		expect([field?.selectionStart, field?.selectionEnd]).toEqual([0, 6]);
		expect(document.activeElement).toBe(field);
	});
});
