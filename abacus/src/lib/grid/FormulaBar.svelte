<script lang="ts">
	import { FunctionIcon } from 'phosphor-svelte';
	import { FUNCTIONS, FUNCTION_NAMES } from '#lib/formula/functions.ts';
	import { highlights } from '#lib/formula/highlight.ts';
	import { FormulaSyntaxError, tokenize } from '#lib/formula/lexer.ts';
	import { parse } from '#lib/formula/parser.ts';
	import { ErrorValue } from '#lib/formula/values.ts';
	import { toA1 } from '#lib/sheet/address.ts';
	import type { Sheet } from '#lib/sheet/sheet.svelte.ts';

	/**
	 * THE FORMULA BAR
	 * ===============
	 *
	 * The address of the active cell, and its input — editable. While a
	 * formula is being typed, every reference is coloured, function names
	 * are completed, and a syntax error says where it is.
	 *
	 * THE COLOURED TEXT IS A MIRROR
	 * -----------------------------
	 * A text input cannot colour its own characters. Underneath the input
	 * there is a `<div>` showing the same text as coloured spans, in the same
	 * font and padding, and the input's text is transparent — the caret and
	 * the selection are the input's, the colours are the mirror's. Old trick,
	 * still the right one.
	 *
	 * The input binds to `sheet.editing.text`, the same `$state` the in-cell
	 * editor binds to. Type in either; both show it.
	 */
	let { sheet, readonly = false }: { sheet: Sheet; readonly?: boolean } = $props();

	/*
	 * The element, because completion and the keys act on it from handlers, after
	 * it has mounted: focus, the caret, blur. `bind:this` is the handle for that;
	 * an attachment, which the autofixer suggests, would only rebuild it.
	 */
	let input = $state<HTMLInputElement>();
	let caret = $state(0);

	/** Unique per instance and the same on server and client, so the ARIA ids below cannot collide. */
	const uid = $props.id();
	const listId = `${uid}-suggestions`;

	/** What the bar shows: the edit in progress, or the anchor cell's input. */
	const text = $derived.by(() => {
		if (sheet.editing) return sheet.editing.text;
		void sheet.version;
		return sheet.input(sheet.anchor.row, sheet.anchor.col);
	});

	const isFormula = $derived(text.startsWith('='));

	/** The text as coloured segments for the mirror. */
	const segments = $derived.by(() => {
		if (!isFormula) return [{ text, hue: null as number | null }];
		const marks = highlights(text.slice(1));
		const out: { text: string; hue: number | null }[] = [{ text: '=', hue: null }];
		let at = 1;
		for (const mark of marks) {
			const start = mark.start + 1;
			const end = mark.end + 1;
			if (start > at) out.push({ text: text.slice(at, start), hue: null });
			out.push({ text: text.slice(start, end), hue: mark.hue });
			at = end;
		}
		if (at < text.length) out.push({ text: text.slice(at), hue: null });
		return out;
	});

	/** A syntax error in the formula being typed, with its position. */
	const problem = $derived.by(() => {
		if (!sheet.editing || !isFormula || text.length < 2) return null;
		try {
			parse(text.slice(1));
			return null;
		} catch (e) {
			return e instanceof FormulaSyntaxError
				? { message: e.message, at: e.position + 1 }
				: { message: String(e), at: 0 };
		}
	});

	/** When not editing: why the anchor cell shows an error, if it does. */
	const cellProblem = $derived.by(() => {
		if (sheet.editing) return null;
		void sheet.version;
		const cell = sheet.engine.get(sheet.anchor.row, sheet.anchor.col);
		if (!cell) return null;
		if (cell.error) return cell.error;
		return cell.value instanceof ErrorValue
			? `${cell.value.code} ${cell.value.message}`.trim()
			: null;
	});

	/* ---------------------------------------------------------------- */
	/* Completion                                                        */
	/* ---------------------------------------------------------------- */

	/** The function-name prefix under the caret, if the caret is in one. */
	const prefix = $derived.by(() => {
		if (!sheet.editing || !isFormula) return null;
		let tokens;
		try {
			tokens = tokenize(text.slice(1));
		} catch {
			return null;
		}
		const at = caret - 1;
		const token = tokens.find((t) => t.type === 'name' && t.start < at && at <= t.end);
		if (!token) return null;
		// Already followed by "(": it is a call, not a name being typed.
		if (text[token.end + 1] === '(') return null;
		return { text: token.text.toUpperCase(), start: token.start + 1, end: token.end + 1 };
	});

	const suggestions = $derived(
		prefix ? FUNCTION_NAMES.filter((name) => name.startsWith(prefix.text)).slice(0, 8) : []
	);
	/**
	 * Which suggestion the arrow keys have reached. A `$derived` that a key
	 * handler assigns to: the assignment holds until `suggestions` changes,
	 * at which point the expression runs again and the choice resets to the
	 * first — a reset without an `$effect`.
	 */
	let highlighted = $derived.by(() => {
		void suggestions;
		return 0;
	});

	/**
	 * THE ACTIVE-DESCENDANT PATTERN
	 * The caret never leaves the input — a person is still typing — so the
	 * suggestion the arrow keys reach cannot take focus. Instead the input
	 * names it: `aria-activedescendant` holds the id of the highlighted option,
	 * and a screen reader announces that option as though it were focused.
	 * The ids exist only while the list does, and so do the attributes that
	 * point at them.
	 */
	const open = $derived(suggestions.length > 0);
	const optionId = (i: number) => `${listId}-${i}`;

	function accept(name: string) {
		if (!sheet.editing || !prefix) return;
		const before = text.slice(0, prefix.start);
		const after = text.slice(prefix.end);
		const inserted = `${name}(`;
		sheet.editing.text = before + inserted + after;
		const position = before.length + inserted.length;
		queueMicrotask(() => {
			input?.focus();
			input?.setSelectionRange(position, position);
			caret = position;
		});
	}

	/* ---------------------------------------------------------------- */
	/* Keys                                                              */
	/* ---------------------------------------------------------------- */

	function focus() {
		if (readonly) return;
		if (!sheet.editing) sheet.beginEdit();
	}

	function keydown(event: KeyboardEvent) {
		if (suggestions.length > 0) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				highlighted = (highlighted + 1) % suggestions.length;
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				highlighted = (highlighted - 1 + suggestions.length) % suggestions.length;
				return;
			}
			if (event.key === 'Tab' || event.key === 'Enter') {
				event.preventDefault();
				accept(suggestions[highlighted]!);
				return;
			}
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			const cell = sheet.commitEdit();
			if (cell) sheet.select(cell);
			input?.blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			sheet.cancelEdit();
			input?.blur();
		}
	}

	function updateCaret() {
		caret = input?.selectionStart ?? 0;
	}
</script>

<div class="bar">
	<output class="address mono" aria-label="Active cell">{toA1(sheet.anchor)}</output>
	<span class="fx" aria-hidden="true"><FunctionIcon size={14} /></span>

	<div class="field">
		<div class="mirror mono" aria-hidden="true">
			{#each segments as segment, i (i)}
				{#if segment.hue === null}{segment.text}{:else}<span
						class="ref"
						style:--hl="var(--ref-hue-{segment.hue})">{segment.text}</span
					>{/if}
			{/each}
		</div>
		<input
			bind:this={input}
			class={['input-line mono', { 'input-line--formula': isFormula }]}
			type="text"
			role="combobox"
			aria-label="Formula"
			aria-autocomplete="list"
			aria-expanded={open}
			aria-controls={open ? listId : undefined}
			aria-activedescendant={open ? optionId(highlighted) : undefined}
			spellcheck="false"
			autocomplete="off"
			{readonly}
			value={text}
			oninput={(event) => {
				if (!sheet.editing) sheet.beginEdit(event.currentTarget.value);
				else sheet.editing.text = event.currentTarget.value;
				updateCaret();
			}}
			onfocus={focus}
			onkeydown={keydown}
			onkeyup={updateCaret}
			onclick={updateCaret}
		/>

		{#if open}
			<!--
				An option is the thing that is chosen, so it takes the pointer itself.
				A <button> inside it would be a second control where the pattern has
				one — and an option's children are presentational, so assistive
				technology would hear a button that is not there. The keys belong to
				the input (see `keydown`), which is why the options need no handler
				of their own and no place in the tab order.
			-->
			<ul class="suggestions" id={listId} role="listbox" aria-label="Functions">
				{#each suggestions as name, i (name)}
					{const spec = FUNCTIONS.get(name)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id={optionId(i)}
						role="option"
						tabindex="-1"
						aria-selected={i === highlighted}
						class={['suggestion', { 'suggestion--active': i === highlighted }]}
						onpointerdown={(e) => e.preventDefault()}
						onclick={() => accept(name)}
					>
						<span class="mono">{spec?.signature}</span>
						<span class="hint">{spec?.description}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

{#if problem}
	<p class="issue problem" role="alert">{problem.message} — at character {problem.at}</p>
{:else if cellProblem}
	<p class="issue problem" role="status">{cellProblem}</p>
{/if}

<style>
	.bar {
		display: flex;
		align-items: stretch;
		gap: var(--space-2);
		min-height: 2.25rem;
	}

	.address {
		display: flex;
		align-items: center;
		min-width: 4.5rem;
		padding: 0 var(--space-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--surface);
		font-size: var(--fs-sm);
	}

	.fx {
		display: flex;
		align-items: center;
		color: var(--text-faint);
	}

	.field {
		position: relative;
		flex: 1;
	}

	.mirror,
	.input-line {
		width: 100%;
		height: 100%;
		padding: 0 var(--space-2);
		font-size: var(--fs-sm);
		line-height: 2.25rem;
		white-space: pre;
		overflow: hidden;
	}

	.mirror {
		position: absolute;
		inset: 0;
		pointer-events: none;
		color: var(--text);
		border: 1px solid transparent;
	}

	.input-line {
		position: relative;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text);
		caret-color: var(--text);
	}

	/* A formula shows through the mirror; plain text is the input's own. */
	.input-line--formula {
		color: transparent;
	}

	.input-line:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}

	.ref {
		color: oklch(45% 0.18 var(--hl));
		background: oklch(92% 0.06 var(--hl));
		border-radius: 3px;
	}

	.suggestions {
		position: absolute;
		z-index: var(--z-dialog);
		top: 100%;
		left: 0;
		right: 0;
		max-width: 32rem;
		margin: 2px 0 0;
		padding: var(--space-1);
		list-style: none;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		box-shadow: var(--shadow-lg);
	}

	.suggestion {
		display: flex;
		flex-direction: column;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.suggestion--active,
	.suggestion:hover {
		background: var(--surface-hover);
	}

	.problem {
		margin-top: var(--space-1);
	}
</style>
