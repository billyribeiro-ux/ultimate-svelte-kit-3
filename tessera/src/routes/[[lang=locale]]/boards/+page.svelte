<script lang="ts">
	import PlusIcon from 'phosphor-svelte/lib/Plus';
	import { ago, langParam, messages } from '#lib/i18n/index.ts';
	import { createBoard, myBoards } from '#lib/remote/boards.remote.ts';
	import Button from '#lib/components/Button.svelte';
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';

	let { data }: PageProps = $props();
	const t = $derived(messages(data.locale));
	// See the layout for why links are built with `resolve()` and `langParam`.
	const lang = $derived(langParam(data.locale));

	/**
	 * A live query, so a board created in another tab — or by a colleague in a
	 * workspace you belong to — appears here without a reload.
	 *
	 * Awaited in the markup, inside the boundary, rather than read through
	 * `boards.current`. Awaiting a live query is not a one-off: every value the
	 * stream yields resolves it again, so the list still updates in place. What
	 * `await` adds is that the boundary sees the wait (its `pending` snippet) and
	 * the failure (its `failed` snippet). `.current` is `undefined` in both cases
	 * and says nothing — a stream that fails just leaves an empty page.
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

				A remote form refuses a field it did not create. A field made by
				`.as(...)` carries the form's id in its `name`, and a hand-written one
				does not: with JavaScript the error is "Form contained a field that
				wasn't created with form.fields.as(...)", and without it the server
				rejects the whole submission. It is a good rule — it is what lets the
				form know its own shape, report per-field issues and keep values
				across a failed submission — and it is easy to trip over, because a
				hand-written `<input type="hidden">` looks like the most harmless
				markup in the file.
			-->
			<input {...createBoard.fields.workspaceId.as('hidden', data.workspaceId ?? '')} />
			<input {...createBoard.fields.title.as('hidden', t.board.untitled)} />
			<Button variant="primary" type="submit" icon={plusIcon}>{t.board.create}</Button>
		</form>
	</header>

	<svelte:boundary>
		{const list = $derived(await boards)}
		{#if list.length > 0}
			<ul class="boards__list auto-grid" style="--min-column: 15rem">
				{#each list as board (board.id)}
					<li>
						<a
							class="boards__card"
							href={resolve('/[[lang=locale]]/boards/[board]', { lang, board: board.id })}
						>
							<span class="boards__title truncate">{board.title}</span>
							<span class="boards__meta">
								{board.workspaceName} · {t.board.lastEdited(ago(data.locale, board.updatedAt))}
							</span>
							<span class="boards__role">{board.role}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="boards__empty">{t.board.empty}</p>
		{/if}

		{#snippet pending()}
			<p class="boards__empty">{t.sync.connecting}</p>
		{/snippet}

		<!--
			An `App.Error`, already through `handleError`, so the text is its
			`message`. Svelte types `error` as `unknown` — it cannot know what
			SvelteKit's `transformError` returns — hence the cast.
		-->
		{#snippet failed(error)}
			<p class="boards__empty">
				{t.errors.generic} <small>{(error as App.Error).message}</small>
			</p>
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
