<script lang="ts">
	import { postComment, resolveThread, threads } from '#lib/remote/comments.remote.ts';
	import type { Messages } from '#lib/i18n/index.ts';
	import Button from './Button.svelte';

	interface Props {
		boardId: string;
		/** The selected shape, so a new thread anchors to it. */
		anchor: string | null;
		t: Messages;
	}

	let { boardId, anchor, t }: Props = $props();

	/*
	 * `$derived`, not a plain `const`.
	 *
	 * `threads(boardId)` called once captures whichever board was open when this
	 * component mounted. Deriving it means navigating to another board re-runs the
	 * query — and, less obviously, it is what makes the compiler stop warning that
	 * the reference only captures the initial value, which is a warning worth
	 * listening to rather than silencing.
	 */
	const list = $derived(threads(boardId));
	const open = $derived((list.current ?? []).filter((thread) => thread.resolvedAt === null));
	const resolved = $derived((list.current ?? []).filter((thread) => thread.resolvedAt !== null));
</script>

<section class="comments" aria-label={t.comments.heading}>
	<form {...postComment} class="comments__new">
		<input {...postComment.fields.boardId.as('hidden', boardId)} />
		<input {...postComment.fields.anchor.as('hidden', anchor ?? '')} />

		<label class="visually-hidden" for="new-comment">{t.comments.placeholder}</label>
		<textarea
			id="new-comment"
			{...postComment.fields.body.as('text')}
			placeholder={t.comments.placeholder}
			rows="2"></textarea>

		{#if postComment.fields.issues()?.length}
			<p class="comments__error" role="alert">{postComment.fields.issues()?.[0]?.message}</p>
		{/if}

		<Button size="sm" variant="primary" type="submit">{t.comments.post}</Button>
	</form>

	<svelte:boundary>
		{#if open.length === 0 && resolved.length === 0}
			<p class="comments__empty">{t.comments.none}</p>
		{/if}

		{#each open as thread (thread.id)}
			{@const reply = postComment.for(thread.id)}
			<article class="thread">
				<header class="thread__head">
					<strong>{thread.author}</strong>
					{#if thread.anchor}<span class="thread__anchor">on a shape</span>{/if}
				</header>
				<p class="thread__body">{thread.body}</p>

				{#each thread.replies as item (item.id)}
					<p class="thread__reply"><strong>{item.author}</strong> {item.body}</p>
				{/each}

				<!--
					`postComment.for(thread.id)` — one form instance per thread, from one
					definition. Each keeps its own pending state and its own validation
					issues, so a failed reply in one thread does not put an error message
					under every other one. Spreading the bare `postComment` into a loop
					gives every thread the same instance and exactly that bug.
				-->
				<form {...reply} class="thread__reply-form">
					<input {...reply.fields.boardId.as('hidden', boardId)} />
					<input {...reply.fields.parentId.as('hidden', thread.id)} />
					<label class="visually-hidden" for="reply-{thread.id}">Reply</label>
					<input id="reply-{thread.id}" {...reply.fields.body.as('text')} placeholder="Reply…" />
					<Button size="sm" type="submit">{t.comments.post}</Button>
				</form>

				<Button
					size="sm"
					variant="ghost"
					onclick={() => resolveThread({ boardId, id: thread.id, resolved: true })}
				>
					{t.comments.resolve}
				</Button>
			</article>
		{/each}

		{#if resolved.length > 0}
			<details class="comments__resolved">
				<summary>{t.comments.resolved} ({resolved.length})</summary>
				{#each resolved as thread (thread.id)}
					<article class="thread thread--done">
						<header class="thread__head"><strong>{thread.author}</strong></header>
						<p class="thread__body">{thread.body}</p>
						<Button
							size="sm"
							variant="ghost"
							onclick={() => resolveThread({ boardId, id: thread.id, resolved: false })}
						>
							{t.comments.reopen}
						</Button>
					</article>
				{/each}
			</details>
		{/if}

		{#snippet pending()}
			<p class="comments__empty">{t.sync.connecting}</p>
		{/snippet}

		{#snippet failed(error)}
			<p class="comments__error">{t.errors.generic} <small>{String(error)}</small></p>
		{/snippet}
	</svelte:boundary>
</section>

<style>
	.comments {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		overflow-y: auto;
		height: 100%;
	}

	.comments__new {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	textarea,
	input[type='text'] {
		width: 100%;
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		resize: vertical;
		min-height: 40px;
	}

	.comments__empty {
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}

	.comments__error {
		color: var(--danger);
		font-size: var(--fs-sm);
	}

	.thread {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
		font-size: var(--fs-sm);
	}

	.thread--done {
		opacity: 0.65;
	}

	.thread__head {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
	}

	.thread__anchor {
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}

	.thread__body,
	.thread__reply {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.thread__reply {
		padding-left: var(--space-3);
		border-left: 2px solid var(--border);
		color: var(--text-muted);
	}

	.thread__reply-form {
		display: flex;
		gap: var(--space-2);
	}

	.comments__resolved summary {
		cursor: pointer;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		min-height: 36px;
		display: flex;
		align-items: center;
	}
</style>
