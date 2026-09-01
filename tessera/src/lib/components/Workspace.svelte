<script lang="ts">
	import { untrack } from 'svelte';
	import { LoadedBoard } from '#lib/board/index.ts';
	import { Camera } from '#lib/canvas/camera.svelte.ts';
	import { BoardEditor } from '#lib/canvas/editor.svelte.ts';
	import { History } from '#lib/history/undo.svelte.ts';
	import { connect, type SyncClient } from '#lib/sync/client.svelte.ts';
	import { save, toPng, toSvg } from '#lib/export/index.ts';
	import { theme } from '#lib/theme.svelte.ts';
	import Button from './Button.svelte';
	import type { Locale, Messages } from '#lib/i18n/index.ts';
	import type { Peer } from '#lib/sync/protocol.ts';
	import Board from './Board.svelte';
	import Toolbar from './Toolbar.svelte';
	import Inspector from './Inspector.svelte';
	import Outline from './Outline.svelte';
	import SyncBadge from './SyncBadge.svelte';
	import Peers from './Peers.svelte';
	import Comments from './Comments.svelte';
	/*
	 * Aliased, because `History` is already the undo stack imported above.
	 *
	 * The clash is worth a moment: they are genuinely different things — one is
	 * this replica's undo stack, the other is the board's shared version history —
	 * and giving them the same name in one file would be confusing even if the
	 * compiler allowed it.
	 */
	import HistoryPanel from './History.svelte';

	interface Props {
		loaded: LoadedBoard;
		t: Messages;
		locale: Locale;
	}

	let { loaded, t, locale }: Props = $props();

	/*
	 * The camera and the history stack outlive any one connection, so they are
	 * created here and handed to the editor. A reconnect must not reset where
	 * somebody was looking.
	 *
	 * `Camera` builds a `Tween` in its constructor, which has to happen inside an
	 * effect root — component initialisation is one, which is why this is not
	 * lazily created inside the effect below.
	 */
	const camera = new Camera();
	const history = new History();

	let sync = $state<SyncClient | null>(null);
	let editor = $state<BoardEditor | null>(null);
	let panel = $state<'inspector' | 'outline' | 'comments' | 'history'>('inspector');

	/** The shape a new comment thread anchors to, if exactly one is selected. */
	const anchor = $derived(
		editor && editor.selection.size === 1 ? ([...editor.selection][0] ?? null) : null
	);

	$effect(() => {
		/*
		 * Opening is asynchronous — IndexedDB, then a stream — and the effect can be
		 * torn down before it finishes. Navigating away from a board while it is
		 * still opening is not exotic; it is what happens when somebody clicks the
		 * wrong one and immediately goes back.
		 *
		 * Without the `cancelled` flag the late-arriving client is assigned to a
		 * component that no longer exists, opens an `EventSource` nothing will ever
		 * close, and keeps sending presence for a board nobody is looking at.
		 */
		let cancelled = false;
		let client: SyncClient | null = null;

		void connect(loaded).then((opened) => {
			if (cancelled) {
				opened.stop();
				return;
			}
			client = opened;
			sync = opened;
			editor = new BoardEditor(opened.document, camera, history, loaded.readOnly);
		});

		return () => {
			cancelled = true;
			client?.stop();
			history.clear();
		};
	});

	/**
	 * Frame the board the first time it has both content and a measured viewport.
	 *
	 * Opening a diagram at 1:1 in the top-left corner is how a board that is
	 * perfectly fine looks empty — most of it is simply off screen, and on a phone
	 * that is nearly all of it. It also interacts with the renderer's culling:
	 * shapes outside the viewport are not in the DOM at all, so "the board did not
	 * load" and "the board is not in view" look identical.
	 *
	 * Once, not on every change. `framed` is an ordinary `let` rather than
	 * `$state` precisely because nothing should react to it, and the `untrack`
	 * keeps the camera movement this triggers from re-entering the effect.
	 */
	let framed = false;

	$effect(() => {
		if (framed) return;
		if (!editor || camera.size.w === 0 || editor.document.nodes.size === 0) return;

		framed = true;
		untrack(() => editor?.fit());
	});

	let exporting = $state(false);

	/**
	 * Export the *document*, not the screen.
	 *
	 * The nodes come from the model rather than from the DOM, so an export
	 * contains the whole board — including everything the viewport has culled —
	 * and none of the editor's selection outlines, guides or cursors.
	 */
	async function exportPng() {
		if (!editor || exporting) return;
		exporting = true;

		try {
			const nodes = editor.document.painted();
			const edges = [...editor.document.edges.values()];
			const blob = await toPng(nodes, edges, { theme: theme.resolved });
			save(blob, `${loaded.title || 'board'}.png`);
		} catch (thrown) {
			// Reported rather than swallowed: an export that silently does nothing is
			// indistinguishable from a button that is not wired up.
			console.error('[tessera] export failed', thrown);
		} finally {
			exporting = false;
		}
	}

	function exportSvg() {
		if (!editor) return;
		const nodes = editor.document.painted();
		const edges = [...editor.document.edges.values()];
		const svg = toSvg(nodes, edges, { theme: theme.resolved });
		save(new Blob([svg], { type: 'image/svg+xml' }), `${loaded.title || 'board'}.svg`);
	}

	function follow(peer: Peer) {
		if (!peer.viewport) return;
		void camera.fit(peer.viewport, 24);
	}
</script>

<div class="workspace">
	<header class="workspace__bar">
		<h1 class="workspace__title truncate">{loaded.title}</h1>

		<div class="workspace__status">
			{#if sync}
				<SyncBadge {sync} {t} />
				<Peers peers={sync.peers} {t} onfollow={follow} />
			{/if}

			<div class="workspace__export">
				<Button size="sm" onclick={exportSvg}>SVG</Button>
				<Button size="sm" disabled={exporting} onclick={exportPng}>
					{exporting ? 'Exporting…' : 'PNG'}
				</Button>
			</div>
		</div>
	</header>

	<div class="workspace__body">
		<main class="workspace__canvas">
			{#if editor && sync}
				<Board {editor} {sync} {t} />

				<div class="workspace__toolbar">
					<Toolbar {editor} {t} />
				</div>
			{:else}
				<!--
					The board is coming out of IndexedDB. This is usually a single frame,
					and it is occasionally not — a cold start on a slow phone with a large
					board. Saying so beats an empty canvas that looks like a bug.
				-->
				<p class="workspace__loading">{t.sync.connecting}</p>
			{/if}
		</main>

		{#if editor}
			<aside class="workspace__panel">
				<div class="workspace__tabs" role="tablist" aria-label="Panel">
					{#each [['inspector', 'Properties'], ['outline', t.a11y.outline], ['comments', t.comments.heading], ['history', t.history.heading]] as const as [key, label] (key)}
						<button
							type="button"
							role="tab"
							aria-selected={panel === key}
							class:workspace__tab--on={panel === key}
							onclick={() => (panel = key)}
						>
							{label}
						</button>
					{/each}
				</div>

				{#if panel === 'inspector'}
					<Inspector {editor} {t} />
				{:else if panel === 'outline'}
					<Outline {editor} {t} />
				{:else if panel === 'comments'}
					<Comments boardId={loaded.id} {anchor} {t} />
				{:else}
					<HistoryPanel boardId={loaded.id} {locale} {t} readOnly={loaded.readOnly} />
				{/if}
			</aside>
		{/if}
	</div>
</div>

<style>
	.workspace {
		display: flex;
		flex-direction: column;
		/* `100dvh` so the board does not sit under a phone's collapsing address bar,
		   which `100vh` cheerfully allows. */
		height: 100dvh;
		background: var(--bg-app);
	}

	.workspace__bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--border);
		min-height: 52px;
	}

	.workspace__title {
		font-size: var(--fs-md);
		font-weight: var(--weight-semibold);
	}

	.workspace__status {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-width: 0;
	}

	.workspace__export {
		display: flex;
		gap: var(--space-1);
	}

	/* The export buttons are the first thing to go on a narrow screen: nobody
	   downloads a diagram on a phone, and the sync state has to stay visible. */
	@media (max-width: 47.99rem) {
		.workspace__export {
			display: none;
		}
	}

	/*
	 * Mobile first, and the direction is the whole layout.
	 *
	 * `display: flex` with the default `row` puts the panel *beside* the canvas at
	 * every width — so on a 412-pixel phone the board gets 200 pixels and the
	 * camera fits the diagram at the minimum zoom. It looks like a rendering bug
	 * and is a missing `flex-direction`.
	 */
	.workspace__body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.workspace__canvas {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	.workspace__toolbar {
		position: absolute;
		left: 50%;
		bottom: max(var(--space-4), env(safe-area-inset-bottom));
		transform: translateX(-50%);
		max-width: calc(100% - var(--space-6));
		z-index: var(--z-toolbar);
	}

	.workspace__loading {
		display: grid;
		place-content: center;
		height: 100%;
		color: var(--text-faint);
	}

	/*
		The panel is a bottom sheet on a phone and a sidebar from 62rem up.

		Mobile-first, and `min-width` only. The sheet is short enough to leave most
		of the board visible, because on a phone the board is the thing you are
		editing and the panel is the thing you consult.
	*/
	.workspace__panel {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--border);
		background: var(--surface);
		height: 40dvh;
		flex: none;
	}

	.workspace__tabs {
		display: flex;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		/* Four tabs do not fit an 18rem sidebar or a narrow phone; scrolling keeps
		   them one row high and in a fixed, learnable order. */
		overflow-x: auto;
		scrollbar-width: none;
	}

	.workspace__tabs::-webkit-scrollbar {
		display: none;
	}

	.workspace__tabs button {
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md) var(--radius-md) 0 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		min-height: 40px;
	}

	.workspace__tab--on {
		background: var(--surface-raised);
		color: var(--text);
	}

	@media (min-width: 62rem) {
		.workspace__body {
			flex-direction: row;
		}

		.workspace__panel {
			height: auto;
			width: 18rem;
			border-top: none;
			border-left: 1px solid var(--border);
		}
	}
</style>
