<script lang="ts">
	import { isHttpError } from '@sveltejs/kit';
	// A type, so erased: nothing from `$app/server` reaches the browser.
	import type { RemoteFormEnhanceInstance } from '$app/server';
	import { postComment, resolveThread, threads } from '#lib/remote/comments.remote.ts';
	import { requireMessages } from '#lib/i18n/context.ts';
	import Button from './Button.svelte';

	interface Props {
		boardId: string;
		/** The selected shape, so a new thread anchors to it. */
		anchor: string | null;
	}

	let { boardId, anchor }: Props = $props();

	const catalogue = requireMessages();
	const t = $derived(catalogue());

	/** Unique to this instance, for the `for`/`id` pairs below. */
	const uid = $props.id();

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

	/**
	 * Why the last thing this panel sent was refused, in the server's words, and
	 * where to say so: `'new'` for the new-thread form, or the thread it was about.
	 */
	let refusal = $state<{ at: string; message: string } | null>(null);

	/*
	 * `thrown.body.message`, not `thrown.message`.
	 *
	 * Something the server refuses — a viewer pressing Resolve, say — rejects with
	 * an `HttpError`: `{ status, body }`, where `body` is the `App.Error`. It is not
	 * an `Error` and has no `message` of its own, so reading one shows nothing.
	 * Anything that is not an `HttpError` is a request that never got an answer,
	 * and that gets the generic line.
	 */
	function refuse(at: string, thrown: unknown) {
		refusal = { at, message: isHttpError(thrown) ? thrown.body.message : t.errors.generic };
	}

	async function setResolved(id: string, done: boolean) {
		refusal = null;
		try {
			await resolveThread({ boardId, id, resolved: done });
		} catch (thrown) {
			refuse(id, thrown);
		}
	}

	/**
	 * What both comment forms do when submitted, via `enhance`.
	 *
	 * Without it, a submission the server refuses renders the nearest
	 * `+error.svelte` — and for a board, which resets its layout, that is the root
	 * error page, in place of the whole editor. A viewer who typed a comment would
	 * lose the board to find out they may not post one. With it, the refusal is a
	 * line under the form and the text they typed is still in the box.
	 *
	 * `enhance` hands over the reset too: the form is cleared only once the comment
	 * has landed.
	 */
	async function send(form: Pick<RemoteFormEnhanceInstance, 'element' | 'submit'>, at: string) {
		refusal = null;
		try {
			if (await form.submit()) form.element.reset();
		} catch (thrown) {
			refuse(at, thrown);
		}
	}
</script>

<section class="comments" aria-label={t.comments.heading}>
	<form {...postComment.enhance((form) => send(form, 'new'))} class="comments__new">
		<input {...postComment.fields.boardId.as('hidden', boardId)} />
		<input {...postComment.fields.anchor.as('hidden', anchor ?? '')} />

		<label class="visually-hidden" for="{uid}-new">{t.comments.placeholder}</label>
		<textarea
			id="{uid}-new"
			{...postComment.fields.body.as('text')}
			placeholder={t.comments.placeholder}
			rows="2"></textarea>

		{#if postComment.fields.issues()?.length}
			<p class="comments__error" role="alert">{postComment.fields.issues()?.[0]?.message}</p>
		{/if}

		<Button size="sm" variant="primary" type="submit">{t.comments.post}</Button>
	</form>

	{#if refusal?.at === 'new'}
		<p class="comments__error" role="alert">{refusal.message}</p>
	{/if}

	<!--
		The query awaited here, in this component's own markup and inside its own
		boundary — so the wait is this boundary's `pending` snippet and a failure is
		its `failed` one, and the rest of the editor never notices either.

		Each declaration tag is a `$derived`, so a refresh after a post or a resolve
		re-runs the split into open and resolved without re-running anything else.
	-->
	<svelte:boundary>
		{const all = $derived(await list)}
		{const open = $derived(all.filter((thread) => thread.resolvedAt === null))}
		{const resolved = $derived(all.filter((thread) => thread.resolvedAt !== null))}

		{#if all.length === 0}
			<p class="comments__empty">{t.comments.none}</p>
		{/if}

		{#each open as thread (thread.id)}
			{const reply = $derived(postComment.for(thread.id))}
			<article class="thread">
				<header class="thread__head">
					<strong>{thread.author}</strong>
					{#if thread.anchor}<span class="thread__anchor">{t.comments.onShape}</span>{/if}
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
				<form {...reply.enhance((form) => send(form, thread.id))} class="thread__reply-form">
					<input {...reply.fields.boardId.as('hidden', boardId)} />
					<input {...reply.fields.parentId.as('hidden', thread.id)} />
					<label class="visually-hidden" for="{uid}-reply-{thread.id}">{t.comments.reply}</label>
					<input
						id="{uid}-reply-{thread.id}"
						{...reply.fields.body.as('text')}
						placeholder={t.comments.replyPlaceholder}
					/>
					<Button size="sm" type="submit">{t.comments.post}</Button>
				</form>

				{#if reply.fields.issues()?.length}
					<p class="comments__error" role="alert">{reply.fields.issues()?.[0]?.message}</p>
				{/if}

				<Button size="sm" variant="ghost" onclick={() => setResolved(thread.id, true)}>
					{t.comments.resolve}
				</Button>

				{#if refusal?.at === thread.id}
					<p class="comments__error" role="alert">{refusal.message}</p>
				{/if}
			</article>
		{/each}

		{#if resolved.length > 0}
			<details class="comments__resolved">
				<summary>{t.comments.resolved} ({resolved.length})</summary>
				{#each resolved as thread (thread.id)}
					<article class="thread thread--done">
						<header class="thread__head"><strong>{thread.author}</strong></header>
						<p class="thread__body">{thread.body}</p>
						<Button size="sm" variant="ghost" onclick={() => setResolved(thread.id, false)}>
							{t.comments.reopen}
						</Button>

						{#if refusal?.at === thread.id}
							<p class="comments__error" role="alert">{refusal.message}</p>
						{/if}
					</article>
				{/each}
			</details>
		{/if}

		{#snippet pending()}
			<p class="comments__empty">{t.sync.connecting}</p>
		{/snippet}

		<!--
			An `App.Error`, already through `handleError`, so the text is its
			`message`. Svelte types `error` as `unknown` — it cannot know what
			SvelteKit's `transformError` returns — hence the cast.
		-->
		{#snippet failed(error)}
			<p class="comments__error" role="alert">
				{t.errors.generic} <small>{(error as App.Error).message}</small>
			</p>
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
