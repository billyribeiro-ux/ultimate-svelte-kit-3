<script lang="ts">
	import type { Peer } from '#lib/sync/protocol.ts';
	import type { Messages } from '#lib/i18n/index.ts';

	interface Props {
		peers: readonly Peer[];
		t: Messages;
		onfollow?: (peer: Peer) => void;
	}

	let { peers, t, onfollow }: Props = $props();

	/** Four faces, then a count. Beyond that they stop being recognisable anyway. */
	const shown = $derived(peers.slice(0, 4));
	const extra = $derived(Math.max(0, peers.length - shown.length));

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => [...part][0]?.toUpperCase() ?? '')
			.join('');
	}
</script>

<div class="peers">
	{#if peers.length === 0}
		<span class="peers__alone">{t.presence.alone}</span>
	{:else}
		<ul class="peers__list" aria-label={t.presence.others(peers.length)}>
			{#each shown as peer (peer.actor)}
				<li>
					<button
						type="button"
						class="peers__face"
						style="--hue: {peer.hue}"
						title={t.presence.follow(peer.name)}
						aria-label={t.presence.follow(peer.name)}
						onclick={() => onfollow?.(peer)}
					>
						{initials(peer.name)}
					</button>
				</li>
			{/each}
		</ul>
		{#if extra > 0}
			<span class="peers__extra">+{extra}</span>
		{/if}
	{/if}
</div>

<style>
	.peers {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.peers__alone {
		font-size: var(--fs-sm);
		color: var(--text-faint);
	}

	.peers__list {
		display: flex;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	/* Overlap, with each face lifting on hover so the one you are aiming at is
	   fully visible before you click it. */
	.peers__list li + li {
		margin-left: -8px;
	}

	.peers__face {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		border: 2px solid var(--surface);
		background: hsl(var(--hue) 62% 45%);
		color: #fff;
		font-size: 11px;
		font-weight: var(--weight-semibold);
		letter-spacing: 0;
	}

	.peers__face:hover,
	.peers__face:focus-visible {
		z-index: 1;
		border-color: var(--accent);
	}

	.peers__extra {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
</style>
