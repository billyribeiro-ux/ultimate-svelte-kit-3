<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import DepthLadder from '#lib/components/DepthLadder.svelte';
	import {
		cancelOrder,
		getInstruments,
		getMyOrders,
		getMyPositions,
		placeOrder,
		watchMarket
	} from './market.remote.ts';

	let { data }: { data: { accountIds: string[] } } = $props();

	/*
	 * Ticket state, declared ABOVE the awaited deriveds below.
	 *
	 * The order is load-bearing. A component that binds to a member of a $state
	 * object emits a getter that runs before the part of the script following the
	 * first awaited $derived — declare the state after them and it is still
	 * undefined when the getter runs, and server rendering dies with "Cannot read
	 * properties of undefined". Binding to a plain $state variable is unaffected,
	 * which is what makes it so easy to walk into.
	 */
	let ticket = $state({
		side: 'buy' as 'buy' | 'sell',
		price: '',
		quantity: '100',
		timeInForce: 'gtc' as 'gtc' | 'day' | 'ioc' | 'fok'
	});

	let sending = $state(false);
	let lastError = $state<string | null>(null);
	let lastSent = $state<string | null>(null);

	const instruments = $derived(await getInstruments());

	const chosen = $derived(
		page.url.searchParams.get('symbol') ?? instruments[0]?.instrumentId ?? ''
	);

	const instrument = $derived(instruments.find((row) => row.instrumentId === chosen));

	// The live one. Everything else on this page is a plain query, because
	// nothing else changes while somebody is looking at it.
	const market = $derived(chosen ? await watchMarket({ instrumentId: chosen }) : null);

	const orders = $derived(await getMyOrders());
	const positions = $derived(await getMyPositions());

	function pick(symbol: string) {
		const url = new URL(page.url.href);
		url.searchParams.set('symbol', symbol);
		// `reset: false` keeps scroll and focus. SvelteKit 3 merged Kit 2's
		// `noScroll` and `keepFocus` into this one option.
		void goto(url, { reset: false });
	}

	function useLevel(side: 'buy' | 'sell', priceUnits: number) {
		// Clicking the book fills the ticket rather than sending anything. A
		// ladder that fires orders on click is a ladder that fires orders when
		// somebody scrolls with a trackpad.
		ticket.side = side === 'buy' ? 'sell' : 'buy';
		ticket.price = (priceUnits / 10_000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
	}

	async function send() {
		lastError = null;
		sending = true;

		try {
			const accountId = data.accountIds[0];
			if (!accountId) throw new Error('You are not assigned to a trading account.');

			const clientOrderId = `T-${Date.now().toString(36)}-${Math.trunc(Math.random() * 1e6).toString(36)}`;

			await placeOrder({
				accountId,
				instrumentId: chosen,
				clientOrderId,
				side: ticket.side,
				orderType: 'limit',
				price: Math.round(Number(ticket.price) * 10_000),
				quantity: Number(ticket.quantity),
				timeInForce: ticket.timeInForce
			});

			lastSent = clientOrderId;
		} catch (thrown) {
			// SvelteKit's HttpError does not extend Error, so `instanceof Error`
			// takes the else branch for every deliberate error() the server threw.
			lastError = messageFrom(thrown);
		} finally {
			sending = false;
		}
	}

	function messageFrom(thrown: unknown): string {
		if (typeof thrown === 'object' && thrown !== null) {
			const body = (thrown as { body?: { message?: unknown } }).body;
			if (body && typeof body.message === 'string') return body.message;
			const message = (thrown as { message?: unknown }).message;
			if (typeof message === 'string' && message) return message;
		}
		return 'That did not work.';
	}
</script>

<div class="container terminal">
	<header class="row head">
		<div class="row">
			<label class="sr-only" for="symbol">Instrument</label>
			<select id="symbol" value={chosen} onchange={(event) => pick(event.currentTarget.value)}>
				{#each instruments as row (row.instrumentId)}
					<option value={row.instrumentId}>{row.instrumentId} — {row.name}</option>
				{/each}
			</select>
		</div>

		{#if instrument}
			<div class="row small">
				<span class="badge">{instrument.phase.replace('_', ' ')}</span>
				{#if market?.last}
					<span class="mono last">{market.last.label}</span>
					<span class="faint mono">× {market.last.quantity}</span>
				{:else}
					<span class="faint">no trades yet</span>
				{/if}
			</div>
		{/if}
	</header>

	<div class="grid">
		{#if market}
			<DepthLadder bids={market.bids} asks={market.asks} onPick={useLevel} />
		{/if}

		<section class="card stack ticket">
			<h3>Order</h3>

			{#if lastError}
				<p class="error" role="alert">{lastError}</p>
			{:else if lastSent}
				<p class="sent small muted">
					Sent {lastSent}. The venue has accepted the command; the engine decides the
					outcome and it appears below.
				</p>
			{/if}

			<div class="sides">
				<button
					type="button"
					class:active={ticket.side === 'buy'}
					class="buy"
					onclick={() => (ticket.side = 'buy')}
					aria-pressed={ticket.side === 'buy'}>Buy</button
				>
				<button
					type="button"
					class:active={ticket.side === 'sell'}
					class="sell"
					onclick={() => (ticket.side = 'sell')}
					aria-pressed={ticket.side === 'sell'}>Sell</button
				>
			</div>

			<label>
				Price
				<input bind:value={ticket.price} inputmode="decimal" placeholder="45.5000" />
			</label>

			<label>
				Quantity
				<input bind:value={ticket.quantity} inputmode="numeric" />
			</label>

			<label>
				Time in force
				<select bind:value={ticket.timeInForce}>
					<option value="gtc">Good till cancelled</option>
					<option value="day">Day</option>
					<option value="ioc">Immediate or cancel</option>
					<option value="fok">Fill or kill</option>
				</select>
			</label>

			<button type="button" onclick={() => void send()} disabled={sending || !ticket.price}>
				{sending ? 'Sending…' : `${ticket.side === 'buy' ? 'Buy' : 'Sell'} ${ticket.quantity}`}
			</button>
		</section>

		<section class="card tape">
			<h3>Tape</h3>
			<ul role="list">
				{#each market?.tape ?? [] as trade (trade.tradeId)}
					<li class="row small">
						<span class="mono {trade.aggressor === 'buy' ? 'up' : trade.aggressor === 'sell' ? 'down' : ''}"
							>{trade.label}</span
						>
						<span class="mono faint">{trade.quantity}</span>
						<span class="faint">{trade.aggressor ?? 'auction'}</span>
					</li>
				{:else}
					<li class="muted small">No trades yet today.</li>
				{/each}
			</ul>
		</section>
	</div>

	<section class="card">
		<h3>Your orders</h3>
		<table>
			<thead>
				<tr>
					<th scope="col">Reference</th>
					<th scope="col">Instrument</th>
					<th scope="col">Side</th>
					<th scope="col">Price</th>
					<th scope="col">Filled</th>
					<th scope="col">Status</th>
					<th scope="col"><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each orders as order (order.orderId)}
					<tr>
						<td class="mono small">{order.clientOrderId}</td>
						<td class="mono small">{order.instrumentId}</td>
						<td class={order.side === 'buy' ? 'up' : 'down'}>{order.side}</td>
						<td class="mono">{order.priceLabel}</td>
						<td class="mono">{order.filled} / {order.quantity}</td>
						<td class="small">
							{order.status}{order.cancelReason ? ` (${order.cancelReason.replace(/_/g, ' ')})` : ''}
						</td>
						<td>
							{#if order.status === 'working'}
								<button
									type="button"
									class="link"
									onclick={() => void cancelOrder({ clientOrderId: order.clientOrderId })}
									aria-label="Cancel {order.clientOrderId}">Cancel</button
								>
							{/if}
						</td>
					</tr>
				{:else}
					<tr><td colspan="7" class="muted small">Nothing sent yet.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="card">
		<h3>Positions</h3>
		<table>
			<thead>
				<tr>
					<th scope="col">Account</th>
					<th scope="col">Instrument</th>
					<th scope="col">Quantity</th>
					<th scope="col">Average</th>
					<th scope="col">Realised</th>
				</tr>
			</thead>
			<tbody>
				{#each positions as position (position.accountId + position.instrumentId)}
					<tr>
						<td class="mono small">{position.accountId}</td>
						<td class="mono small">{position.instrumentId}</td>
						<td class="mono {position.quantity > 0 ? 'up' : position.quantity < 0 ? 'down' : ''}"
							>{position.quantity}</td
						>
						<td class="mono">{position.averageLabel}</td>
						<td class="mono {position.realisedPnl > 0 ? 'up' : position.realisedPnl < 0 ? 'down' : ''}">
							{position.realisedPnl < 0 ? '−' : ''}{position.realisedLabel}
						</td>
					</tr>
				{:else}
					<tr><td colspan="5" class="muted small">Flat.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>

<style>
	.terminal { display: flex; flex-direction: column; gap: var(--space-4); }
	.head { justify-content: space-between; }
	.head select { inline-size: auto; }
	.last { font-size: var(--text-lg); }

	.grid {
		display: grid;
		/* Mobile first: stacked. Three columns only when there is room. */
		grid-template-columns: 1fr;
		gap: var(--space-4);
	}

	@media (min-width: 64rem) {
		.grid { grid-template-columns: 2fr 1fr 1fr; align-items: start; }
	}

	.ticket .sides { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
	.ticket .buy.active { border-color: var(--bid); color: var(--bid); }
	.ticket .sell.active { border-color: var(--ask); color: var(--ask); }
	.ticket label { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm); }

	.tape ul { list-style: none; padding: 0; margin-block-start: var(--space-2); display: flex; flex-direction: column; gap: 2px; max-block-size: 18rem; overflow-y: auto; }
	.tape li { justify-content: space-between; }

	table { inline-size: 100%; border-collapse: collapse; margin-block-start: var(--space-2); }
	th { text-align: start; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-faint); font-weight: 500; }
	td, th { padding-block: var(--space-1); border-block-end: 1px solid var(--line); }

	.up { color: var(--bid); }
	.down { color: var(--ask); }

	.link { background: none; border: none; padding: 0; min-block-size: auto; color: var(--accent); text-decoration: underline; }

	.error { color: var(--ask); border: 1px solid var(--ask); border-radius: var(--radius); padding: var(--space-2); font-size: var(--text-sm); }
	.sent { border-inline-start: 2px solid var(--accent); padding-inline-start: var(--space-2); }
</style>
