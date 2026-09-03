<script lang="ts">
	import type { Peer } from '#lib/sync/protocol.ts';
	import type { Camera } from '#lib/canvas/camera.svelte.ts';

	interface Props {
		peers: readonly Peer[];
		camera: Camera;
	}

	let { peers, camera }: Props = $props();

	/**
	 * Cursors are positioned in *screen* space, outside the transformed layer.
	 *
	 * Putting them inside it would be simpler and would scale them with the zoom —
	 * a collaborator's pointer would become a postage stamp at 10% and fill the
	 * screen at 400%. A cursor is a piece of interface, not a piece of the
	 * document, so it keeps its size and only its position is transformed.
	 */
	const positioned = $derived(
		peers
			.filter((peer) => peer.cursor !== null)
			.map((peer) => ({ peer, at: camera.toScreen(peer.cursor!) }))
	);
</script>

<div class="presence" aria-hidden="true">
	{#each positioned as { peer, at } (peer.actor)}
		<div
			class="presence__cursor"
			style="transform: translate({at.x}px, {at.y}px); --hue: {peer.hue}"
		>
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
				<path
					d="M2 1.5 L2 14 L5.6 10.7 L8.1 15.9 L10.6 14.7 L8.1 9.6 L13 9.6 Z"
					fill="hsl(var(--hue) 70% 55%)"
					stroke="var(--bg-app)"
					stroke-width="1.2"
					stroke-linejoin="round"
				/>
			</svg>
			<span class="presence__name">{peer.name}</span>
		</div>
	{/each}
</div>

<style>
	.presence {
		position: absolute;
		inset: 0;
		/* The whole layer is inert. A cursor that intercepts clicks would make a
		   colleague's pointer a hole in your own board. */
		pointer-events: none;
		z-index: var(--z-presence);
		overflow: hidden;
	}

	.presence__cursor {
		position: absolute;
		top: 0;
		left: 0;
		display: flex;
		align-items: flex-start;
		gap: 2px;
		/*
			Interpolate between the positions we are told about.

			Presence arrives at about twenty updates a second, which without this
			reads as a cursor teleporting. A short linear transition on `transform`
			turns the same data into continuous movement. Linear rather than eased:
			an eased interpolation between a stream of positions arrives late at every
			one of them and looks like lag.
		*/
		transition: transform 90ms linear;
	}

	@media (prefers-reduced-motion: reduce) {
		.presence__cursor {
			transition: none;
		}
	}

	.presence__name {
		margin-top: 10px;
		padding: 1px var(--space-2);
		border-radius: var(--radius-full);
		background: hsl(var(--hue) 70% 45%);
		color: #fff;
		font-size: var(--fs-xs);
		font-weight: var(--weight-medium);
		white-space: nowrap;
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
