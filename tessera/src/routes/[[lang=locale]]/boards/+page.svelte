<script lang="ts">
	import PlusIcon from 'phosphor-svelte/lib/Plus';
	import { ago, messages } from '#lib/i18n/index.ts';
	import { createBoard, myBoards } from '#lib/remote/boards.remote.ts';
	import Button from '#lib/components/Button.svelte';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const t = $derived(messages(data.locale));
	const prefix = $derived(data.locale === 'en' ? '' : `/${data.locale}`);

	/**
	 * A live query, so a board created in another tab — or by a colleague in a
	 * workspace you belong to — appears here without a reload.
	 *
	 * `boards.current` is the latest value the stream has yielded. It is
	 * `undefined` until the first arrives, which is what the boundary below is
	 * for.
	 */
	const boards = myBoards();
</script>

<svelte:head>
	<title>{t.nav.boards} — {t.app.name}</title>
</svelte:head>

<div class="boards container">
	<header class="boards__header">
		<h1>{t.nav.boards}</h1>
		<!--
			A plain form, spread from the remote function.

			`{...createBoard}` supplies the action, the method and the progressive
			enhancement. With JavaScript it submits in the background and follows the
			server's redirect without a page load; without it, the browser posts the
			form and follows the same redirect itself.
		-->
		<form {...createBoard}>
			<!--
				Even hidden inputs go through `fields.x.as(...)`.

				An enhanced form refuses a field it did not create: "Form contained a
				field that wasn't created with form.fields.as(...)". It is a good rule —
				it is what lets the form know its own shape, report per-field issues and
				keep values across a failed submission — and it is easy to trip over,
				because a hand-written `<input type="hidden">` looks like the most
				harmless markup in the file. Without JavaScript it submits fine, so the
				failure only appears once hydration has finished.
			-->
			<input {...createBoard.fields.workspaceId.as('hidden', data.workspaceId ?? '')} />
			<input {...createBoard.fields.title.as('hidden', t.board.untitled)} />
			<Button variant="primary" type="submit" icon={plusIcon}>{t.board.create}</Button>
		</form>
	</header>

	<svelte:boundary>
		{#if boards.current && boards.current.length > 0}
			<ul class="boards__list auto-grid" style="--min-column: 15rem">
				{#each boards.current as board (board.id)}
					<li>
						<a class="boards__card" href="{prefix}/boards/{board.id}">
							<span class="boards__title truncate">{board.title}</span>
							<span class="boards__meta">
								{board.workspaceName} · {t.board.lastEdited(ago(data.locale, board.updatedAt))}
							</span>
							<span class="boards__role">{board.role}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else if boards.current}
			<p class="boards__empty">{t.board.empty}</p>
		{/if}

		{#snippet pending()}
			<p class="boards__empty">{t.sync.connecting}</p>
		{/snippet}

		{#snippet failed(error)}
			<p class="boards__empty">{t.errors.generic} <small>{String(error)}</small></p>
		{/snippet}
	</svelte:boundary>
</div>

{#snippet plusIcon()}
	<PlusIcon size={16} />
{/snippet}

<style>
	.boards {
		padding-block: var(--space-6) var(--space-8);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.boards__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.boards__list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.boards__card {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		height: 100%;
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		text-decoration: none;
		color: inherit;
		transition: border-color var(--fast) var(--ease-out);
	}

	.boards__card:hover {
		border-color: var(--accent);
	}

	.boards__title {
		font-weight: var(--weight-semibold);
	}

	.boards__meta {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.boards__role {
		align-self: flex-start;
		margin-top: var(--space-2);
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
		background: var(--surface-sunken);
		font-size: var(--fs-xs);
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}

	.boards__empty {
		color: var(--text-faint);
		padding: var(--space-6) 0;
	}
</style>
