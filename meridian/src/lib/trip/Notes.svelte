<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { Editor, type JSONContent } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import * as v from 'valibot';
	import { toast } from 'svelte-sonner';
	import {
		ListBulletsIcon,
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
				extensions: [StarterKit],
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
			toast.error(error instanceof Error ? error.message : String(error));
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
	<header class="cluster cluster--between">
		<h2>{m.notes_title()}</h2>
		<p class="muted" role="status">
			{#if status === 'saving'}{m.notes_saving()}{:else if status === 'saved'}{m.notes_saved()}{/if}
		</p>
	</header>

	{#if editable}
		<div class="toolbar no-print" role="toolbar" aria-label={m.notes_title()}>
			{#each tools as tool (tool.key)}
				{@const Icon = tool.icon}
				<button
					class="btn btn--icon btn--sm"
					class:btn--primary={active[tool.key]}
					type="button"
					aria-pressed={active[tool.key]}
					title={tool.label()}
					aria-label={tool.label()}
					onclick={tool.run}
				>
					<Icon size={16} aria-hidden="true" />
				</button>
			{/each}
		</div>
	{:else}
		<p class="hint">{m.notes_readonly()}</p>
	{/if}

	<div class="card notes__editor" {@attach tiptap()}></div>
</section>

<style>
	.toolbar {
		display: flex;
		gap: var(--space-1);
	}

	.notes__editor {
		min-height: 18rem;
		padding: var(--space-4) var(--space-5);
	}

	.notes__editor :global(.notes__page) {
		min-height: 16rem;
		outline: none;
	}

	.notes__editor :global(.notes__page p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--ink-3);
	}
</style>
