<script lang="ts">
	import { isHttpError } from '@sveltejs/kit';
	import type { RemoteFormEnhanceInstance } from '$app/server';
	import { restoreTo, revisions, saveCheckpoint } from '#lib/remote/history.remote.ts';
	import type { Locale } from '#lib/i18n/index.ts';
	import { requireMessages } from '#lib/i18n/context.ts';
	import Button from './Button.svelte';

	interface Props {
		boardId: string;
		locale: Locale;
		readOnly?: boolean;
	}

	let { boardId, locale, readOnly = false }: Props = $props();

	const catalogue = requireMessages();
	const t = $derived(catalogue());

	/** Unique to this instance, for the label's `for`. */
	const uid = $props.id();

	// `$derived` so that opening a different board re-runs the query. See the same
	// note in `Comments.svelte`. It is awaited inside the boundary below, so the
	// boundary's `pending` and `failed` snippets are the ones that run.
	const list = $derived(revisions(boardId));
	let restoring = $state<number | null>(null);
	/** Why the last restore was refused, in the server's words. */
	let refusal = $state<string | null>(null);

	async function restore(seq: number) {
		restoring = seq;
		refusal = null;
		try {
			await restoreTo({ boardId, seq });
		} catch (thrown) {
			/*
			 * `thrown.body.message`, not `thrown.message`.
			 *
			 * A command the server refuses rejects with an `HttpError`: `{ status,
			 * body }`, where `body` is the `App.Error` a boundary would have been
			 * handed. It is not an `Error` and has no `message` of its own. Anything
			 * that is not an `HttpError` is a request that never got an answer, and
			 * that gets the generic line.
			 */
			refusal = isHttpError(thrown) ? thrown.body.message : t.errors.generic;
		} finally {
			restoring = null;
		}
	}

	/**
	 * Save a checkpoint, via `enhance` — for the reason the comment forms use it.
	 *
	 * A refused submission would otherwise render the root error page in place
	 * of the editor. The form is shown only to people who may save, so a refusal
	 * here means the role changed while the board was open; it still deserves a
	 * sentence rather than a lost editor.
	 */
	async function save(form: Pick<RemoteFormEnhanceInstance, 'element' | 'submit'>) {
		refusal = null;
		try {
			if (await form.submit()) form.element.reset();
		} catch (thrown) {
			refusal = isHttpError(thrown) ? thrown.body.message : t.errors.generic;
		}
	}
</script>

<section class="history" aria-label={t.history.heading}>
	{#if !readOnly}
		<form {...saveCheckpoint.enhance(save)} class="history__save">
			<input {...saveCheckpoint.fields.boardId.as('hidden', boardId)} />
			<label class="visually-hidden" for="{uid}-checkpoint">{t.history.checkpoint}</label>
			<input
				id="{uid}-checkpoint"
				{...saveCheckpoint.fields.label.as('text')}
				placeholder={t.history.checkpoint}
			/>
			<Button size="sm" type="submit">{t.history.checkpoint}</Button>
		</form>

		{#if saveCheckpoint.fields.issues()?.length}
			<p class="history__error" role="alert">{saveCheckpoint.fields.issues()?.[0]?.message}</p>
		{/if}
	{/if}

	{#if refusal}
		<p class="history__error" role="alert">{refusal}</p>
	{/if}

	<svelte:boundary>
		<ol class="history__list">
			{#each await list as revision (revision.seq)}
				<li class={['history__item', { 'history__item--mark': revision.isCheckpoint }]}>
					<!--
						`revision.describe(...)` — a method on an object that came from the
						server.

						`BoardRevision` is registered with the `transport` hook, so what
						arrives in the browser is an instance rather than a bag of fields.
						The formatting rules live with the data instead of being
						re-implemented next to the markup.
					-->
					<span class="history__label">{revision.describe(locale, t)}</span>
					<span class="history__author">{revision.authorName}</span>

					{#if !readOnly}
						<Button
							size="sm"
							variant="ghost"
							disabled={restoring !== null}
							onclick={() => restore(revision.seq)}
						>
							{restoring === revision.seq ? '…' : t.history.restore}
						</Button>
					{/if}
				</li>
			{/each}
		</ol>

		{#snippet pending()}
			<p class="history__empty">{t.sync.connecting}</p>
		{/snippet}

		<!--
			An `App.Error`, already through `handleError`, so the text is its
			`message`. Svelte types `error` as `unknown` — it cannot know what
			SvelteKit's `transformError` returns — hence the cast.
		-->
		{#snippet failed(error)}
			<p class="history__empty">
				{t.errors.generic} <small>{(error as App.Error).message}</small>
			</p>
		{/snippet}
	</svelte:boundary>
</section>

<style>
	.history {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4);
		overflow-y: auto;
		height: 100%;
	}

	.history__save {
		display: flex;
		gap: var(--space-2);
	}

	.history__save input {
		flex: 1;
		min-width: 0;
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-raised);
	}

	.history__list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.history__item {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0 var(--space-2);
		padding: var(--space-2);
		border-radius: var(--radius-md);
		font-size: var(--fs-sm);
	}

	.history__item--mark {
		background: var(--surface-sunken);
	}

	.history__label {
		overflow-wrap: anywhere;
	}

	.history__author {
		grid-column: 1;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}

	.history__empty {
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}

	.history__error {
		color: var(--danger);
		font-size: var(--fs-sm);
	}
</style>
