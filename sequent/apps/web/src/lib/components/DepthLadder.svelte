<script lang="ts">
	import type { DepthLevel } from '../../routes/terminal/market.remote.ts';

	/**
	 * The depth ladder.
	 *
	 * The one component in this project with a genuine performance problem, and
	 * it is worth being precise about what the problem is — because the obvious
	 * answer solves the wrong half.
	 *
	 * The obvious answer is "virtualise it": only render the rows on screen. That
	 * matters for a list of ten thousand orders and does nothing here, because a
	 * ladder shows ten levels a side. The actual cost is **update rate**, not row
	 * count: the same twenty rows re-rendering many times a second.
	 *
	 * Three things keep that cheap, in the order they matter:
	 *
	 *   1. **The server coalesces.** `watchMarket` drains every waiting event and
	 *      yields one snapshot, so the component is asked to update once per
	 *      batch rather than once per trade. That is the biggest win and it does
	 *      not happen here at all — the fastest render is the one nobody asked
	 *      for.
	 *
	 *   2. **Keyed by price.** `{#each levels as level (level.price)}` means a
	 *      level that survives an update keeps its DOM node and Svelte writes
	 *      only the numbers that changed. Keyed by index, every row's text would
	 *      be rewritten whenever a level appeared or vanished, which is most
	 *      updates.
	 *
	 *   3. **The bar is a transform, not a width.** Changing `width` on twenty
	 *      elements is twenty layout invalidations per frame; `scaleX` is handled
	 *      by the compositor and never touches layout at all.
	 */

	let {
		bids,
		asks,
		onPick
	}: {
		bids: DepthLevel[];
		asks: DepthLevel[];
		onPick?: (side: 'buy' | 'sell', price: number) => void;
	} = $props();

	/**
	 * The scale for the depth bars.
	 *
	 * Both sides share one maximum, so a bar's length is comparable across the
	 * spread. Scaling each side to its own maximum would make a thin bid side
	 * look as deep as a heavy ask side — a chart that is technically accurate
	 * and actively misleading, which is the worst kind.
	 */
	const largest = $derived(
		Math.max(1, ...bids.map((level) => level.quantity), ...asks.map((level) => level.quantity))
	);

	const spread = $derived(
		bids[0] && asks[0] ? asks[0].price - bids[0].price : undefined
	);
</script>

<div class="ladder card">
	<header class="row">
		<h3>Book</h3>
		{#if spread !== undefined}
			<span class="badge mono">spread {spread}</span>
		{:else}
			<span class="badge">one-sided</span>
		{/if}
	</header>

	<div class="sides">
		{#each [{ label: 'Bids', levels: bids, side: 'buy' as const }, { label: 'Asks', levels: asks, side: 'sell' as const }] as column (column.side)}
			<table>
				<caption class="sr-only">{column.label}</caption>
				<thead>
					<tr>
						<th scope="col">Price</th>
						<th scope="col">Size</th>
						<th scope="col"><span class="sr-only">Orders</span>#</th>
					</tr>
				</thead>
				<tbody>
					{#each column.levels as level (level.price)}
						<tr class={column.side}>
							<td class="cell">
								<!--
									The depth bar sits behind the row rather than beside it, so a
									level's price and size stay in a fixed column no matter how
									deep it is. A bar that pushes the numbers around is a bar you
									cannot read a price off while it moves.
								-->
								<span
									class="bar"
									style="--fill: {level.quantity / largest}"
									aria-hidden="true"
								></span>
								<button
									type="button"
									class="price mono"
									onclick={() => onPick?.(column.side, level.price)}
									aria-label="Use {level.label} as the price"
								>
									{level.label}
								</button>
							</td>
							<td class="mono size">{level.quantity.toLocaleString('en-GB')}</td>
							<td class="mono orders faint">{level.orders}</td>
						</tr>
					{:else}
						<tr><td colspan="3" class="empty muted">Nothing resting</td></tr>
					{/each}
				</tbody>
			</table>
		{/each}
	</div>
</div>

<style>
	.ladder header {
		justify-content: space-between;
		margin-block-end: var(--space-3);
	}

	.sides {
		display: grid;
		/* Mobile first: one column, and two only when there is room for both. */
		grid-template-columns: 1fr;
		gap: var(--space-4);
	}

	@media (min-width: 40rem) {
		.sides {
			grid-template-columns: 1fr 1fr;
		}
	}

	table {
		inline-size: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th {
		text-align: start;
		font-weight: 500;
		color: var(--ink-faint);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding-block-end: var(--space-1);
	}

	td {
		padding-block: 1px;
	}

	.cell {
		position: relative;
		inline-size: 50%;
	}

	.bar {
		position: absolute;
		inset-block: 1px;
		inset-inline-start: 0;
		inline-size: 100%;
		/* A transform, not a width: the compositor handles it and layout never
		   runs. Twenty of these changing per frame is free; twenty widths is not. */
		transform: scaleX(var(--fill));
		transform-origin: left center;
		border-radius: 2px;
	}

	.buy .bar { background: var(--bid-soft); }
	.sell .bar { background: var(--ask-soft); }

	.price {
		position: relative;
		background: none;
		border: none;
		padding: 2px var(--space-2);
		min-block-size: auto;
		inline-size: 100%;
		text-align: start;
	}

	.buy .price { color: var(--bid); }
	.sell .price { color: var(--ask); }

	.size { text-align: end; }
	.orders { text-align: end; inline-size: 3ch; }

	.empty {
		padding-block: var(--space-3);
		font-size: var(--text-sm);
	}
</style>
