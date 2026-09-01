<script lang="ts">
	import { messages } from '#lib/i18n/index.ts';
	import { openBoard } from '#lib/remote/boards.remote.ts';
	import Workspace from '#lib/components/Workspace.svelte';
	import { page } from '$app/state';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const t = $derived(messages(data.locale));

	/**
	 * `+page@.svelte` — the `@` resets the layout.
	 *
	 * This page inherits the root layout only, skipping the marketing chrome from
	 * `[[lang=locale]]/+layout.svelte`. An editor that is meant to fill the screen
	 * should not have a site header above it, and the alternative — a layout that
	 * hides itself when the URL looks like a board — is a conditional in a
	 * component that has no business knowing about routes.
	 */
	const board = openBoard(page.params.board!);
</script>

<svelte:head>
	<title>{board.current?.title ?? t.board.untitled} — {t.app.name}</title>
	<!-- A board is private by definition. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:boundary>
	{#if board.current}
		<Workspace loaded={board.current} {t} locale={data.locale} />
	{/if}

	{#snippet pending()}
		<p class="state">{t.sync.connecting}</p>
	{/snippet}

	{#snippet failed(error)}
		<div class="state">
			<p>{t.errors.notFound}</p>
			<p class="state__detail">{String(error)}</p>
		</div>
	{/snippet}
</svelte:boundary>

<style>
	.state {
		display: grid;
		place-content: center;
		gap: var(--space-2);
		height: 100dvh;
		text-align: center;
		color: var(--text-muted);
	}

	.state__detail {
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
</style>
