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
	 *
	 * The board is *awaited* in the markup below, not read through
	 * `board.current`. `.current` never throws: a query that fails leaves it
	 * `undefined` and puts the error on `board.error`, so a boundary around
	 * `{#if board.current}` never reaches its `failed` snippet, and a board that
	 * does not exist renders as an empty screen. `await` is what hands the
	 * rejection — `openBoard`'s "No such board." — to the boundary.
	 */
	const board = openBoard(page.params.board!);

	/** The headline above the server's own message, by status. */
	const heading = (status: number) =>
		status === 404 ? t.errors.notFound : status === 403 ? t.errors.forbidden : t.errors.generic;
</script>

<svelte:head>
	<title>{board.current?.title ?? t.board.untitled} — {t.app.name}</title>
	<!-- A board is private by definition. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:boundary>
	<Workspace loaded={await board} {t} locale={data.locale} />

	{#snippet pending()}
		<p class="state">{t.sync.connecting}</p>
	{/snippet}

	<!--
		`error` is an `App.Error` — `{ status, message }` plus this app's `id` —
		because SvelteKit runs everything a boundary catches through `handleError`
		first. So the server's words are its `message`; `String(error)` prints
		"[object Object]". Svelte types `error` as `unknown`, since it cannot know
		what SvelteKit's `transformError` returns, which is what the cast is for.
	-->
	{#snippet failed(error)}
		{const caught = $derived(error as App.Error)}
		<div class="state">
			<p>{heading(caught.status)}</p>
			<p class="state__detail">{caught.message}</p>
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
