<script lang="ts">
	import { tick } from 'svelte';
	import { check } from '#lib/sqf/check.ts';
	import { parse } from '#lib/sqf/parser.ts';
	import type { SqfError } from '#lib/sqf/errors.ts';
	import { completionsAt, type Catalogue, type Completion } from '#lib/editor/completion.ts';
	import { highlight, marks, splitAt } from '#lib/editor/highlight.ts';

	/**
	 * THE QUERY EDITOR
	 * ================
	 *
	 * A textarea with syntax highlighting, completion and error underlines, and no
	 * editor library.
	 *
	 * WHY NOT CODEMIRROR
	 * ------------------
	 * Because the thing that makes an editor good for a query language is not the
	 * editing — it is that the highlighting, the completion and the errors all come
	 * from the *same* front end that will run the query. Wiring a general-purpose
	 * editor to a language means writing a grammar for its highlighter, a source
	 * for its completion and a linter for its diagnostics: three adapters, each
	 * able to drift from the compiler. Here there are no adapters, because there is
	 * only one lexer, one parser and one checker, and this file calls them.
	 *
	 * The cost is real and worth naming: no multi-cursor, no bracket matching, no
	 * code folding, no undo beyond the browser's own. For a one-line pipeline —
	 * which is what every SQF query is — that list is entirely things nobody would
	 * use.
	 *
	 * HOW THE OVERLAY WORKS
	 * ---------------------
	 * Three layers in one grid cell, all with identical text metrics:
	 *
	 *   1. the error underlay — the source in transparent text with a wavy
	 *      underline under the bad parts;
	 *   2. the highlight layer — the source in coloured spans;
	 *   3. the textarea — transparent text, visible caret, all the interaction.
	 *
	 * The grid cell sizes to the tallest, which is the `<pre>`, so the editor grows
	 * with the query and never scrolls independently of its own highlighting. The
	 * one rule that must never be broken is that every layer renders the *exact*
	 * same characters with the *exact* same font, size, padding and wrapping —
	 * because a single missing space shifts every character after it and the
	 * illusion collapses.
	 */
	interface Props {
		/** The query text. Bindable, because the parent owns it and puts it in the URL. */
		value: string;
		catalogue: Catalogue;
		/** Run the query. Fired by ⌘/Ctrl + Enter and by the Run button next to this. */
		onrun?: () => void;
		/** Errors from the server, shown alongside the ones found here. */
		serverError?: string | null;
		disabled?: boolean;
	}

	let {
		value = $bindable(),
		catalogue,
		onrun,
		serverError = null,
		disabled = false
	}: Props = $props();

	let textarea = $state<HTMLTextAreaElement | null>(null);
	let anchor = $state<HTMLElement | null>(null);
	let caret = $state(0);

	let open = $state(false);
	let active = $state(0);
	let popupAt = $state({ x: 0, y: 0 });

	const chunks = $derived(highlight(value));
	const parts = $derived(splitAt(chunks, caret));

	/**
	 * Parse and check on every keystroke.
	 *
	 * The whole front end runs in well under a millisecond on a query of this size
	 * — it is a few hundred characters — so there is no debounce and no worker. A
	 * debounce would be the reflex, and it would make the underline appear a
	 * quarter of a second after the mistake, which is exactly long enough to have
	 * started typing the next thing.
	 *
	 * This is not premature: the alternative was measured. Debouncing is for work
	 * that is slow, and hiding a fast thing behind a timer makes it feel slow.
	 */
	const problems = $derived.by((): readonly SqfError[] => {
		if (value.trim() === '') return [];

		const parsed = parse(value);
		if (parsed.errors.length > 0) return parsed.errors;
		if (!parsed.query) return [];

		return check(parsed.query).errors;
	});

	const underlines = $derived(
		marks(
			value,
			problems.map((problem) => problem.span)
		)
	);

	const suggestions = $derived.by(() => {
		if (!open) return { from: caret, to: caret, prefix: '', items: [] as Completion[] };
		return completionsAt(value, caret, catalogue);
	});

	/** Keep the highlighted item in range when the list shrinks under it. */
	$effect(() => {
		if (active >= suggestions.items.length) active = 0;
	});

	/**
	 * Where to draw the popup.
	 *
	 * Measured from the zero-width anchor that the highlight layer renders at the
	 * caret. No hidden mirror div, no character-width arithmetic, no assumption
	 * that the font is monospace — it just asks the browser where that element
	 * ended up, which is the only reliable answer once text wraps.
	 */
	$effect(() => {
		if (!open || !anchor) return;
		popupAt = { x: anchor.offsetLeft, y: anchor.offsetTop + anchor.offsetHeight };
	});

	function sync(): void {
		if (!textarea) return;
		caret = textarea.selectionStart;
	}

	function accept(item: Completion): void {
		const { from, to } = suggestions;
		const next = value.slice(0, from) + item.insert + value.slice(to);
		const at = from + item.caret;

		value = next;
		open = false;

		/*
		 * The caret has to be set after Svelte has written the new value into the
		 * DOM, or the browser puts it at the end of the text.
		 *
		 * `tick()` and not `flushSync()`: this runs from a keyboard handler and
		 * nothing downstream needs the DOM synchronously, so an await is both
		 * sufficient and cheaper. `flushSync` in the virtualizer is there because a
		 * *layout read* follows immediately; there is no read here.
		 */
		void tick().then(() => {
			if (!textarea) return;
			textarea.setSelectionRange(at, at);
			textarea.focus();
			caret = at;
		});
	}

	function onkeydown(event: KeyboardEvent): void {
		// Run, from anywhere, with or without the popup open.
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			open = false;
			onrun?.();
			return;
		}

		// Explicit request for completion, the same chord as every other editor.
		if ((event.metaKey || event.ctrlKey) && event.key === ' ') {
			event.preventDefault();
			sync();
			open = true;
			active = 0;
			return;
		}

		if (!open || suggestions.items.length === 0) {
			if (event.key === 'Escape') open = false;
			return;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				active = (active + 1) % suggestions.items.length;
				break;
			case 'ArrowUp':
				event.preventDefault();
				active = (active - 1 + suggestions.items.length) % suggestions.items.length;
				break;
			case 'Enter':
			case 'Tab': {
				/*
				 * Enter accepts, and this is a real trade-off.
				 *
				 * It means Enter cannot insert a newline while the popup is open. SQF
				 * queries are one line often enough that accepting is the common intent,
				 * and Escape then Enter gets the newline — whereas the alternative
				 * (Tab only) means every completion costs a reach to a key that in a
				 * browser also means "leave this field".
				 */
				const item = suggestions.items[active];
				if (item) {
					event.preventDefault();
					accept(item);
				}
				break;
			}
			case 'Escape':
				event.preventDefault();
				open = false;
				break;
		}
	}

	function oninput(): void {
		sync();
		// Opened by typing, never closed by it: somebody who dismissed the popup with
		// Escape and kept typing does not want it back on the next character.
		if (!open) open = true;
		active = 0;
	}

	/** Put the caret on a problem, so clicking the message goes to the mistake. */
	function goTo(problem: SqfError): void {
		if (!textarea) return;
		textarea.focus();
		textarea.setSelectionRange(problem.span.start, problem.span.end);
		caret = problem.span.start;
	}
</script>

<div class="editor">
	<div class="editor__box" class:editor__box--invalid={problems.length > 0}>
		<!--
			Layer 1: the error underlay.

			Transparent text with a wavy underline. `text-decoration` still paints when
			the text itself is transparent, which is what makes this a single element
			rather than a set of absolutely positioned rectangles that would have to be
			re-measured on every resize.
		-->
		<pre
			class="layer layer--marks"
			aria-hidden="true">{#each underlines as mark, i (i)}{#if mark.marked}<span class="mark"
						>{mark.text}</span
					>{:else}{mark.text}{/if}{/each}<br /></pre>

		<!--
			Layer 2: the highlighting, split at the caret so the anchor can be measured.

			The `<br>` at the end gives the layer a final empty line, so that pressing
			Enter at the end of the query grows the box before the caret moves onto a
			line that does not exist yet.
		-->
		<pre class="layer layer--code" aria-hidden="true">{#each parts[0] as chunk, i (i)}<span
					class="tok tok--{chunk.category}">{chunk.text}</span
				>{/each}<span class="anchor" bind:this={anchor}></span>{#each parts[1] as chunk, i (i)}<span
					class="tok tok--{chunk.category}">{chunk.text}</span
				>{/each}<br /></pre>

		<!--
			Layer 3: the real control.

			`role="combobox"` with `aria-expanded`, `aria-controls` and
			`aria-activedescendant` is the ARIA pattern for exactly this: an input whose
			suggestions live in a listbox that never takes focus. Focus staying in the
			textarea is not a detail — it is what lets somebody keep typing while the
			list narrows, and it is why `aria-activedescendant` exists rather than
			moving focus into the list.
		-->
		<textarea
			bind:this={textarea}
			bind:value
			class="layer layer--input"
			spellcheck="false"
			autocapitalize="off"
			autocomplete="off"
			rows="1"
			{disabled}
			aria-label="Query"
			role="combobox"
			aria-expanded={open && suggestions.items.length > 0}
			aria-controls="sqf-completions"
			aria-autocomplete="list"
			aria-activedescendant={open && suggestions.items[active]
				? `sqf-completion-${active}`
				: undefined}
			placeholder="from logs | where level == &quot;error&quot; | summarize n = count() by service"
			{oninput}
			{onkeydown}
			onclick={sync}
			onkeyup={sync}
			onblur={() => {
				// A short delay, because a click on an option blurs the textarea before
				// the click lands. `mousedown` prevention on the list would be tidier and
				// breaks text selection inside it.
				setTimeout(() => (open = false), 120);
			}}></textarea>

		{#if open && suggestions.items.length > 0}
			<ul
				class="popup"
				id="sqf-completions"
				role="listbox"
				aria-label="Completions"
				style:left="{popupAt.x}px"
				style:top="{popupAt.y}px"
			>
				{#each suggestions.items.slice(0, 12) as item, index (item.kind + item.label)}
					<li
						id="sqf-completion-{index}"
						class="option"
						class:option--active={index === active}
						role="option"
						aria-selected={index === active}
					>
						<button type="button" tabindex="-1" onclick={() => accept(item)}>
							<span class="option__kind option__kind--{item.kind}" aria-hidden="true"
								>{item.kind[0]}</span
							>
							<span class="option__label">{item.label}</span>
							<span class="option__detail">{item.detail}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!--
		Problems, as text, under the editor.

		The underline says *where*; this says *what* and *what to do about it*. Both
		are needed: a squiggle with the message only in a tooltip is unreachable from
		a keyboard and invisible on a touch screen, which between them is most people
		most of the time.
	-->
	{#if problems.length > 0}
		<ul class="problems" aria-live="polite">
			{#each problems.slice(0, 3) as problem, i (i)}
				<li>
					<button type="button" class="problem" onclick={() => goTo(problem)}>
						<span class="problem__message">{problem.message}</span>
						{#if problem.hint}
							<span class="problem__hint">{problem.hint}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else if serverError}
		<p class="problems problems--server" aria-live="polite">{serverError}</p>
	{/if}
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.editor__box {
		/*
		 * One grid cell, three children stacked in it.
		 *
		 * This is what makes the box auto-grow with no JavaScript: the `<pre>` has
		 * real content and therefore a real height, the textarea is stretched to
		 * match, and the cell is as tall as the tallest. Setting the textarea's
		 * height from its `scrollHeight` in an effect is the usual approach and is a
		 * layout read per keystroke that fights the browser for the same answer.
		 */
		display: grid;
		position: relative;
		background: var(--surface-sunken);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		overflow: visible;
	}

	.editor__box:focus-within {
		border-color: var(--border-focus);
	}

	.editor__box--invalid {
		border-color: color-mix(in oklab, var(--danger) 50%, var(--border-strong));
	}

	/*
	 * EVERY METRIC HERE MUST MATCH IN ALL THREE LAYERS.
	 *
	 * Font, size, line height, letter spacing, padding, wrapping, tab size. A
	 * single mismatch and the highlighting drifts from the caret by a fraction of a
	 * character per line, which looks like a browser bug and is not.
	 *
	 * Declared once, on a shared selector, for exactly that reason. Two nearly
	 * identical rule blocks is how this breaks six months later.
	 */
	.layer {
		grid-area: 1 / 1;
		margin: 0;
		padding: var(--space-3);
		font-family: var(--font-mono);
		font-size: var(--fs-sm);
		line-height: var(--leading-data);
		letter-spacing: normal;
		tab-size: 2;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		border: 0;
		background: transparent;
		min-height: 3.5rem;
	}

	.layer--marks {
		color: transparent;
	}

	.mark {
		/* Wavy, and thick enough to be seen at 13px. `text-decoration-skip-ink` off,
		   because a squiggle that breaks around descenders reads as two errors. */
		text-decoration: underline wavy var(--danger);
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
		text-decoration-skip-ink: none;
	}

	.layer--code {
		pointer-events: none;
		color: var(--text);
	}

	.layer--input {
		/*
		 * Transparent text over the highlighted copy, with a visible caret.
		 *
		 * `-webkit-text-fill-color` as well as `color`, because Safari ignores a
		 * transparent `color` on a textarea and renders the text anyway — which
		 * shows both copies at once, very slightly offset.
		 */
		color: transparent;
		-webkit-text-fill-color: transparent;
		caret-color: var(--accent);
		resize: none;
		outline: none;
		/* The selection is the one thing that should show through from this layer. */
		&::selection {
			background: color-mix(in oklab, var(--accent) 35%, transparent);
		}
	}

	.layer--input::placeholder {
		color: var(--text-faint);
		-webkit-text-fill-color: var(--text-faint);
	}

	.anchor {
		display: inline-block;
		width: 0;
	}

	/* ---- Token colours ------------------------------------------------ */

	.tok--keyword {
		color: var(--accent);
		font-weight: var(--weight-semibold);
	}

	.tok--function {
		color: var(--info);
	}

	.tok--string {
		color: var(--ok);
	}

	.tok--number,
	.tok--duration {
		color: var(--warn);
	}

	.tok--operator,
	.tok--punctuation {
		color: var(--text-muted);
	}

	/* ---- The popup ---------------------------------------------------- */

	.popup {
		position: absolute;
		z-index: var(--z-sticky);
		margin: var(--space-1) 0 0;
		padding: var(--space-1);
		list-style: none;
		min-width: 16rem;
		max-width: min(24rem, 90vw);
		max-height: 15rem;
		overflow-y: auto;
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
	}

	.option button {
		display: grid;
		grid-template-columns: 1rem 1fr auto;
		gap: var(--space-2);
		align-items: baseline;
		width: 100%;
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
	}

	.option--active button,
	.option button:hover {
		background: var(--surface-active);
	}

	.option__kind {
		display: grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		border-radius: var(--radius-sm);
		font-size: 0.6rem;
		text-transform: uppercase;
		background: var(--surface-active);
		color: var(--text-faint);
	}

	.option__kind--column {
		color: var(--accent);
	}
	.option__kind--function {
		color: var(--info);
	}
	.option__kind--stage,
	.option__kind--source {
		color: var(--warn);
	}
	.option__kind--value {
		color: var(--ok);
	}

	.option__detail {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		white-space: nowrap;
	}

	/* ---- Problems ------------------------------------------------------ */

	.problems {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.problem {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-left: 2px solid var(--danger);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		background: var(--danger-bg);
		color: var(--text);
		font-size: var(--fs-sm);
		text-align: left;
		cursor: pointer;
	}

	.problem__hint {
		color: var(--text-muted);
	}

	.problems--server {
		padding: var(--space-2);
		border-left: 2px solid var(--warn);
		background: var(--warn-bg);
		font-size: var(--fs-sm);
	}
</style>
