<script lang="ts">
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

	// `$derived` so that opening a different board re-runs the query. See the same
	// note in `Comments.svelte`.
	const list = $derived(revisions(boardId));
	let restoring = $state<number | null>(null);

	async function restore(seq: number) {
		restoring = seq;
		try {
			await restoreTo({ boardId, seq });
		} finally {
			restoring = null;
		}
	}
</script>

<section class="history" aria-label={t.history.heading}>
	{#if !readOnly}
		<form {...saveCheckpoint} class="history__save">
			<input {...saveCheckpoint.fields.boardId.as('hidden', boardId)} />
			<label class="visually-hidden" for="checkpoint-label">{t.history.checkpoint}</label>
			<input
				id="checkpoint-label"
				{...saveCheckpoint.fields.label.as('text')}
				placeholder={t.history.checkpoint}
			/>
			<Button size="sm" type="submit">{t.history.checkpoint}</Button>
		</form>
	{/if}

	<svelte:boundary>
		<ol class="history__list">
			{#each list.current ?? [] as revision (revision.seq)}
				<li class="history__item" class:history__item--mark={revision.isCheckpoint}>
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

		{#snippet failed(error)}
			<p class="history__empty">{t.errors.generic} <small>{String(error)}</small></p>
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
</style>
