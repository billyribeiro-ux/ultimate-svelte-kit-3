<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { Editor, type JSONContent } from '@tiptap/core';
	import Placeholder from '@tiptap/extension-placeholder';
	import StarterKit from '@tiptap/starter-kit';
	import * as v from 'valibot';
	import { toast } from 'svelte-sonner';
	import { errorMessage } from '#lib/ui/errors.ts';
	import {
		ListBulletsIcon,
		LockSimpleIcon,
		QuotesIcon,
		TextBIcon,
		TextHOneIcon,
		TextItalicIcon
	} from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { NoteDocSchema, type NoteDoc } from '#lib/domain/schemas.ts';
	import { saveNote } from '#lib/remote/notes.remote.ts';
	import type { TripState } from './state.svelte.ts';

	/**
	 * A RICH-TEXT NOTE, THROUGH AN ATTACHMENT
	 * =======================================
	 *
	 * Tiptap has no Svelte binding, and does not need one. Its `Editor` takes
	 * a DOM element and owns it — exactly the contract of an attachment:
	 * `{@attach tiptap()}` hands Tiptap the `<div>` when it is in the
	 * document and calls the cleanup, which destroys the editor, when it is
	 * not. No `onMount`, no `bind:this`, no lifecycle to get out of order.
	 *
	 * Saving is a debounce: type, pause, a `command` sends the JSON. The
	 * toolbar reads `editor.isActive(...)`, which is not reactive on its own;
	 * every transaction bumps a counter the toolbar depends on, so the
	 * buttons follow the cursor.
	 */
	interface Props {
		view: TripState;
		editable: boolean;
	}

	let { view, editable }: Props = $props();

	const EMPTY: NoteDoc = { type: 'doc', content: [] };

	let editor: Editor | undefined = $state.raw();
	let transactions = $state(0);
	let status: 'idle' | 'saving' | 'saved' = $state('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;

	function tiptap(): Attachment<HTMLElement> {
		return (element) => {
			const instance = new Editor({
				element,
				// The placeholder is a Tiptap extension (3KB): it writes `data-placeholder` on an empty first paragraph and the CSS below draws it.
				extensions: [StarterKit, Placeholder.configure({ placeholder: m.notes_empty() })],
				// Our `NoteDoc` is the same JSON, typed loosely on purpose; Tiptap validates it on load.
				content: (view.document.note ?? EMPTY) as JSONContent,
				editable,
				editorProps: { attributes: { class: 'prose notes__page', 'aria-label': m.notes_title() } },
				onUpdate: () => schedule(),
				onTransaction: () => {
					transactions += 1;
				}
			});
			editor = instance;
			return () => {
				clearTimeout(timer);
				instance.destroy();
				editor = undefined;
			};
		};
	}

	/*
	 * Somebody else saved: the live document carries a new note. Replace the
	 * editor's content — but only when this person is not mid-sentence, which
	 * is what `isFocused` stands for here. Last writer wins; project 4 is the
	 * one with the CRDT.
	 */
	$effect(() => {
		const remote = view.document.note;
		if (!editor || editor.isFocused || !remote) return;
		if (JSON.stringify(remote) !== JSON.stringify(editor.getJSON())) {
			editor.commands.setContent(remote as JSONContent, { emitUpdate: false });
		}
	});

	function schedule() {
		status = 'saving';
		clearTimeout(timer);
		timer = setTimeout(save, 800);
	}

	async function save() {
		if (!editor) return;
		try {
			const doc = v.parse(NoteDocSchema, editor.getJSON());
			await saveNote({ tripId: view.trip.id, doc });
			status = 'saved';
		} catch (error) {
			status = 'idle';
			toast.error(errorMessage(error));
		}
	}

	/** `transactions` is read so the derivation re-runs after every edit. */
	const active = $derived.by(() => {
		void transactions;
		return {
			bold: editor?.isActive('bold') ?? false,
			italic: editor?.isActive('italic') ?? false,
			heading: editor?.isActive('heading', { level: 2 }) ?? false,
			list: editor?.isActive('bulletList') ?? false,
			quote: editor?.isActive('blockquote') ?? false
		};
	});

	const tools = [
		{
			key: 'bold',
			label: m.notes_bold,
			icon: TextBIcon,
			run: () => editor?.chain().focus().toggleBold().run()
		},
		{
			key: 'italic',
			label: m.notes_italic,
			icon: TextItalicIcon,
			run: () => editor?.chain().focus().toggleItalic().run()
		},
		{
			key: 'heading',
			label: m.notes_heading,
			icon: TextHOneIcon,
			run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run()
		},
		{
			key: 'list',
			label: m.notes_list,
			icon: ListBulletsIcon,
			run: () => editor?.chain().focus().toggleBulletList().run()
		},
		{
			key: 'quote',
			label: m.notes_quote,
			icon: QuotesIcon,
			run: () => editor?.chain().focus().toggleBlockquote().run()
		}
	] as const;
</script>

<section class="notes stack">
	<header class="notes__header">
		<h2 class="notes__title">{m.notes_title()}</h2>
		<!-- The status is the exact word — "Saving…", "Saved" — with a dot before it: sun while saving, sea once saved. -->
		<p class="notes__status" role="status" data-status={status}>
			{#if status === 'saving'}{m.notes_saving()}{:else if status === 'saved'}{m.notes_saved()}{/if}
		</p>
	</header>

	{#if editable}
		<!-- A tier-2 track; the pressed tool lifts onto a tier-3 pill. Not the primary button: formatting is a state, not an action. -->
		<div class="toolbar no-print" role="toolbar" aria-label={m.notes_title()}>
			{#each tools as tool, i (tool.key)}
				{@const Icon = tool.icon}
				{#if i === 2}<span class="toolbar__sep" aria-hidden="true"></span>{/if}
				<button
					class="btn btn--icon btn--sm btn--ghost toolbar__tool"
					type="button"
					aria-pressed={active[tool.key]}
					title={tool.label()}
					aria-label={tool.label()}
					onclick={tool.run}
				>
					<Icon size={16} weight={active[tool.key] ? 'bold' : 'regular'} aria-hidden="true" />
				</button>
			{/each}
		</div>
	{:else}
		<p class="hint notes__readonly">
			<LockSimpleIcon size={14} aria-hidden="true" />
			{m.notes_readonly()}
		</p>
	{/if}

	<div class="card notes__editor" {@attach tiptap()}></div>
</section>

<style>
	.notes__header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.notes__title {
		font-size: var(--text-2xl);
		letter-spacing: var(--tracking-2xl);
	}

	.notes__status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--ink-2);
		font-size: var(--text-sm);
	}

	.notes__status[data-status='saving']::before,
	.notes__status[data-status='saved']::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--sun);
	}

	.notes__status[data-status='saved']::before {
		background: var(--sea);
	}

	.toolbar {
		display: inline-flex;
		align-items: center;
		gap: var(--space-0);
		padding: 2px;
		border-radius: var(--radius);
		background: var(--paper-3);
		align-self: start;
	}

	/*
	 * Under a finger the tools are 44px squares: they sit 2px apart in their
	 * track, with no room for a hit area to reach past what is drawn.
	 */
	@media (pointer: coarse) {
		.toolbar :global(.toolbar__tool) {
			width: var(--control);
			min-height: var(--control);
		}
	}

	.toolbar__sep {
		width: 1px;
		height: 1rem;
		margin-inline: var(--space-1);
		background: var(--line-2);
	}

	/*
	 * Pressed: a tier-3 pill with a 3:1 edge, and the icon in ink at a
	 * heavier weight. The tier step alone is 1.1:1 in dark — Bold looked
	 * the same on and off — so the state is drawn three ways, none of them
	 * colour alone.
	 */
	.toolbar__tool[aria-pressed='true'] {
		background: var(--paper-4);
		color: var(--ink);
		box-shadow:
			var(--shadow-1),
			inset 0 0 0 1px var(--segment-edge);
	}

	.notes__readonly {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
	}

	/* The page: a reading measure, prose leading, and the sea for the caret and the selection. */
	.notes__editor {
		min-height: 18rem;
		padding: var(--space-5);
		transition: border-color var(--dur-2) var(--ease-out);
	}

	.notes__editor:focus-within {
		border-color: var(--focus);
		box-shadow: 0 0 0 3px var(--focus-halo);
	}

	/* The card shows focus (above), so the editable itself wears neither the ring nor the reset's halo. */
	.notes__editor :global(.notes__page) {
		min-height: 16rem;
		max-inline-size: var(--measure);
		outline: none;
		box-shadow: none;
		caret-color: var(--sea);
	}

	.notes__editor :global(.notes__page ::selection) {
		background: var(--sea-soft);
	}

	.notes__editor :global(.notes__page p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		height: 0;
		color: var(--ink-3);
		pointer-events: none;
	}
</style>
