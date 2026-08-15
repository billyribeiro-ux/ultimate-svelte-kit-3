<script lang="ts">
	import type { DepthLevel } from '../../routes/terminal/market.remote.ts';
	import { flash, gsap, prefersReducedMotion, type Direction } from '#lib/motion/motion.ts';

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

	const spread = $derived(bids[0] && asks[0] ? asks[0].price - bids[0].price : undefined);

	/* ---------------------------------------------------------------------- */
	/* Remembering the last size, so a change can be shown as a change          */
	/* ---------------------------------------------------------------------- */

	/**
	 * What each level's size was last time we drew it.
	 *
	 * A plain `Map`, deliberately **not** `$state`. Nothing reads it during
	 * render — it exists only so `directionFor` can compare — and making it
	 * reactive would create a dependency cycle: reading it in the template makes
	 * the template depend on it, and writing it during that same render
	 * invalidates the thing being rendered.
	 *
	 * This is the general shape of "previous value" in a reactive system, and
	 * getting it wrong produces an infinite loop rather than a wrong answer,
	 * which is at least honest.
	 */
	// A `SvelteMap` here would be precisely the bug described above: nothing reads
	// this during render, and making it reactive creates the cycle.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const lastSize = new Map<number, number>();

	function directionFor(level: DepthLevel): Direction {
		const before = lastSize.get(level.price);
		lastSize.set(level.price, level.quantity);

		if (before === undefined || before === level.quantity) return 'neutral';

		/*
		 * Bigger size on a level is liquidity **arriving**, which reads as
		 * strengthening whichever side it is on. Smaller size means it was taken
		 * or pulled.
		 *
		 * Note the flash is about the *level*, not the market: a bid level growing
		 * is not "the price went up". Colouring it green because it grew would
		 * teach a false reflex, so the flash uses the side's own colour — a bid
		 * flashes in bid green, an ask in ask red — and brightness carries the
		 * change while hue carries the side.
		 */
		return level.quantity > before ? 'up' : 'down';
	}

	/**
	 * Ease the bar to its new length instead of jumping.
	 *
	 * This is the animation that earns its keep most clearly. A bar that
	 * teleports tells you the level is now this deep; a bar that visibly shrinks
	 * over 200ms tells you it is *being eaten*, and a trader watching the ask
	 * side drain can act on that a beat before the price moves.
	 *
	 * `overwrite: 'auto'` again, and for the same reason as the flash: on a busy
	 * instrument the next update arrives before this tween finishes, and it must
	 * continue from wherever the bar got to rather than snapping back to start.
	 */
	function bar(node: HTMLElement, fill: number) {
		if (prefersReducedMotion()) {
			node.style.transform = `scaleX(${fill})`;
			return {
				update: (next: number) => (node.style.transform = `scaleX(${next})`)
			};
		}

		gsap.set(node, { scaleX: fill });

		return {
			update(next: number) {
				gsap.to(node, { scaleX: next, duration: 0.22, ease: 'power2.out', overwrite: 'auto' });
			},
			destroy: () => gsap.killTweensOf(node)
		};
	}
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
						<tr class={column.side} use:flash={directionFor(level)}>
							<td class="cell">
								<!--
									The depth bar sits behind the row rather than beside it, so a
									level's price and size stay in a fixed column no matter how
									deep it is. A bar that pushes the numbers around is a bar you
									cannot read a price off while it moves.
								-->
								<span class="bar" use:bar={level.quantity / largest} aria-hidden="true"></span>
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

	/*
	 * The row is the flash target, and it needs somewhere for the colour to go.
	 * Without a starting `background-color` GSAP animates from the computed
	 * value, which is `rgba(0,0,0,0)` — fine — but declaring it makes the
	 * intent obvious to the next reader.
	 */
	tbody tr {
		background-color: transparent;
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
		   runs. Twenty of these changing per frame is free; twenty widths is not.
		   The value is set by the `bar` action rather than a CSS variable, so it
		   can be tweened rather than snapped. */
		transform: scaleX(0);
		transform-origin: left center;
		border-radius: 2px;
	}

	.buy .bar {
		background: var(--bid-soft);
	}
	.sell .bar {
		background: var(--ask-soft);
	}

	.price {
		position: relative;
		background: none;
		border: none;
		padding: 2px var(--space-2);
		min-block-size: auto;
		inline-size: 100%;
		text-align: start;
	}

	.buy .price {
		color: var(--bid);
	}
	.sell .price {
		color: var(--ask);
	}

	.size {
		text-align: end;
	}
	.orders {
		text-align: end;
		inline-size: 3ch;
	}

	.empty {
		padding-block: var(--space-3);
		font-size: var(--text-sm);
	}

	/*
	 * Tap targets.
	 *
	 * A ladder row on a phone is the smallest thing anybody will try to hit, and
	 * 44px per row would make a ten-level book taller than the screen. The
	 * compromise: the *button* grows its hit area with padding on coarse
	 * pointers without growing the row's visual height, using a pseudo-element
	 * that extends beyond the text.
	 */
	@media (pointer: coarse) {
		.price::after {
			content: '';
			position: absolute;
			/* A ladder row is ~26px and ten of them must fit on a phone screen, so
			   the row cannot be 44px tall. The expander takes the *hit area* to
			   ~44px while leaving the row's height alone — the tap lands, and the
			   book still fits. Adjacent rows' areas overlap slightly, which is
			   fine: the nearer centre wins, which is what a thumb aims at anyway. */
			inset-block: -9px;
			inset-inline: 0;
		}
	}
</style>
