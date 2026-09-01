<!--
	A NOTE ON `options_missing_custom_element`
	=========================================

	The compile option *is* set — just not anywhere `svelte-check` looks.

	`vite.config.ts` turns `customElement` on for this folder only, through
	`dynamicCompileOptions`, so the rest of the application is not wrapped in
	custom-element machinery it has no use for. `svelte-check` resolves compiler
	options for itself and does not run the Vite plugin, so it sees the options
	below with the flag apparently off and warns.

	A `svelte-ignore` comment does not help: the warning is attached to the
	`customElement` attribute inside `<svelte:options>`, which is analysed before
	the element tree the ignore would apply to. The supported answer is
	`--compiler-warnings "options_missing_custom_element:ignore"`, which the
	`check` script in `package.json` passes.
-->
<svelte:options
	customElement={{
		tag: 'tessera-board',
		/*
			An open shadow root.

			Closed would be tidier and would make the element impossible to style or
			inspect from the host page — which, for something people embed in a wiki
			we do not control, is the wrong trade. Open still isolates the styles; it
			just does not pretend the internals are secret.
		*/
		shadow: 'open',
		props: {
			board: { attribute: 'board', reflect: true },
			height: { attribute: 'height', type: 'Number' }
		}
	}}
/>

<script lang="ts">
	import { onMount } from 'svelte';
	import { bounds, roundedPath, route } from '#lib/board/index.ts';
	import type { BoardSnapshot, NodeFields } from '#lib/board/index.ts';

	/**
	 * THE EMBEDDABLE VIEWER
	 * =====================
	 *
	 * A real custom element: `<tessera-board board="…">` in anybody's HTML, with
	 * no framework on the host page and no iframe.
	 *
	 * It deliberately shares almost nothing with the editor. No CRDT, no sync
	 * engine, no IndexedDB — it fetches one snapshot and draws it. An embed that
	 * pulled in the whole editing stack would be several hundred kilobytes to
	 * render a picture, and every one of those kilobytes would run inside a page
	 * we do not control.
	 *
	 * The read is authenticated by the viewer's own cookie, which makes this an
	 * intranet-embedding feature: a wiki page inside the same organisation shows
	 * the board to people who already have access, and shows everybody else
	 * nothing at all. A public share token is the obvious next step and is a
	 * deliberate omission rather than an oversight — it changes who can read a
	 * board, and that is a decision rather than a feature.
	 */
	interface Props {
		/** The board id, from the `board` attribute. */
		board?: string;
		height?: number;
	}

	let { board = '', height = 320 }: Props = $props();

	let snapshot = $state<BoardSnapshot | null>(null);
	let failed = $state(false);

	onMount(async () => {
		if (!board) return;
		try {
			const response = await fetch(`/api/boards/${encodeURIComponent(board)}/snapshot`, {
				credentials: 'include'
			});
			if (!response.ok) throw new Error(String(response.status));
			snapshot = (await response.json()) as BoardSnapshot;
		} catch {
			failed = true;
		}
	});

	/**
	 * Present nodes, read straight out of the snapshot.
	 *
	 * The membership rule is the OR-Set's, restated in eight lines: an element is
	 * present when at least one of its add stamps has not been removed. Importing
	 * `OrSet` to answer that would drag the whole CRDT into a bundle whose only
	 * job is to draw a picture.
	 */
	const nodes = $derived.by(() => {
		const current = snapshot;
		if (!current) return [];

		return Object.entries(current.nodes.added)
			.filter(([id, added]) => {
				const removed = new Set(current.nodes.removed[id] ?? []);
				return added.some((stamp) => !removed.has(stamp));
			})
			.map(([id]) => {
				const fields = current.nodeFields[id] ?? {};
				const read = <K extends keyof NodeFields>(key: K) =>
					fields[key]?.[0] as NodeFields[K] | undefined;

				return {
					id,
					x: read('x') ?? 0,
					y: read('y') ?? 0,
					w: read('w') ?? 168,
					h: read('h') ?? 88,
					fill: read('fill') ?? 'slate',
					kind: read('kind') ?? 'service',
					label: (current.labels[id]?.items ?? [])
						.filter(([, , , deleted]) => deleted === 0)
						.map(([, , character]) => character)
						.join('')
				};
			})
			.sort((a, b) => (a.id < b.id ? -1 : 1));
	});

	const edges = $derived.by(() => {
		const current = snapshot;
		if (!current) return [];
		const byId = new Map(nodes.map((node) => [node.id, node]));

		return Object.entries(current.edges.added)
			.filter(([id, added]) => {
				const removed = new Set(current.edges.removed[id] ?? []);
				return added.some((stamp) => !removed.has(stamp));
			})
			.flatMap(([id]) => {
				const fields = current.edgeFields[id] ?? {};
				const from = byId.get(String(fields.from?.[0] ?? ''));
				const to = byId.get(String(fields.to?.[0] ?? ''));
				if (!from || !to) return [];
				return [{ id, d: roundedPath(route(from, to, 'auto', 'auto')) }];
			});
	});

	/** The viewBox, so the whole diagram fits whatever box the host gives it. */
	const frame = $derived(bounds(nodes) ?? { x: 0, y: 0, w: 100, h: 100 });
	const view = $derived(`${frame.x - 24} ${frame.y - 24} ${frame.w + 48} ${frame.h + 48}`);
</script>

{#if failed}
	<p class="message">This board is not available.</p>
{:else if snapshot}
	<svg viewBox={view} style="height: {height}px" role="img" aria-label="Board {board}">
		{#each edges as edge (edge.id)}
			<path d={edge.d} class="edge" />
		{/each}

		{#each nodes as node (node.id)}
			<g class="node" style="--hue: var(--fill-{node.fill}-h, 220)">
				<rect x={node.x} y={node.y} width={node.w} height={node.h} rx="8" />
				<text x={node.x + node.w / 2} y={node.y + node.h / 2} text-anchor="middle" dy="0.35em">
					{node.label}
				</text>
			</g>
		{/each}
	</svg>
{:else}
	<p class="message">Loading…</p>
{/if}

<style>
	/*
		`:host` and nothing global.

		Everything here is inside a shadow root, so these rules cannot leak into the
		page that embedded us and the page's own stylesheet cannot reach in. That
		isolation is the best reason to reach for a custom element rather than
		shipping a widget as a `<div>` and hoping.
	*/
	:host {
		display: block;
		font-family: ui-sans-serif, system-ui, sans-serif;
		color-scheme: light dark;
		--fill-slate-h: 220;
		--fill-indigo-h: 255;
		--fill-jade-h: 162;
		--fill-amber-h: 38;
		--fill-rose-h: 348;
		--fill-cyan-h: 194;
	}

	svg {
		width: 100%;
		display: block;
	}

	rect {
		fill: hsl(var(--hue) 40% 92%);
		stroke: hsl(var(--hue) 40% 45%);
		stroke-width: 1.5;
	}

	text {
		font-size: 13px;
		fill: #171d27;
	}

	.edge {
		fill: none;
		stroke: #7d8794;
		stroke-width: 1.5;
	}

	.message {
		margin: 0;
		padding: 1rem;
		color: #7d8794;
		font-size: 0.875rem;
	}

	@media (prefers-color-scheme: dark) {
		rect {
			fill: hsl(var(--hue) 30% 20%);
			stroke: hsl(var(--hue) 40% 60%);
		}

		text {
			fill: #e3e8ee;
		}
	}
</style>
