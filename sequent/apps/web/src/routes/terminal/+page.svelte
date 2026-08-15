<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import DepthLadder from '#lib/components/DepthLadder.svelte';
	import { count, reveal, revealChildren, sweep } from '#lib/motion/motion.ts';
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

	/** Whether the order ticket is open, on phones where it is a sheet. */
	let ticketOpen = $state(false);

	/** The phase we last saw, so a change can be announced rather than just shown. */
	let seenPhase = $state<string | null>(null);

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

	/*
	 * Announce a phase change with the venue's one dramatic gesture.
	 *
	 * `$effect` and not a derived, because this *does something to the world*
	 * rather than computing a value. A derived that fired an animation would run
	 * again on every unrelated re-read, which is the difference between "when
	 * this changes" and "whenever anybody looks".
	 *
	 * The guard on `seenPhase` being non-null is what stops the sweep firing on
	 * first load: arriving at an open market is not the market opening.
	 */
	$effect(() => {
		const phase = market?.phase;
		if (!phase) return;

		if (seenPhase !== null && seenPhase !== phase) {
			sweep(phase === 'continuous' || phase === 'auction' ? 'open' : 'halt');
		}

		seenPhase = phase;
	});

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

		// On a phone the ticket is a sheet, and tapping a price should open it —
		// otherwise the tap appears to do nothing at all.
		ticketOpen = true;
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
			ticketOpen = false;
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

	/** Scaled integer units to a price string. Never a float, anywhere. */
	const priceLabel = (units: number) =>
		`£${(units / 10_000).toFixed(2)}${String(units % 100).padStart(2, '0') === '00' ? '' : ''}`;
</script>

<div class="container terminal">
	<header class="head">
		<div class="row">
			<label class="sr-only" for="symbol">Instrument</label>
			<select id="symbol" value={chosen} onchange={(event) => pick(event.currentTarget.value)}>
				{#each instruments as row (row.instrumentId)}
					<option value={row.instrumentId}>{row.instrumentId} — {row.name}</option>
				{/each}
			</select>
		</div>

		{#if instrument}
			<div class="row small quote">
				<span class="badge phase" data-phase={market?.phase ?? instrument.phase}>
					{(market?.phase ?? instrument.phase).replace('_', ' ')}
				</span>
				{#if market?.last}
					<!--
						The one number on this page that rolls.
						`count` animates the underlying value and reformats each frame,
						which is the only way to do it — there is no CSS property for
						text content. Every other number on the screen snaps, because a
						price somebody is about to type into an order must never be
						mid-animation when they read it.
					-->
					<span
						class="mono last"
						use:count={{ value: market.last.price, format: priceLabel }}
						aria-live="off"
					></span>
					<span class="faint mono">× {market.last.quantity.toLocaleString('en-GB')}</span>
				{:else}
					<span class="faint">no trades yet</span>
				{/if}
			</div>
		{/if}
	</header>

	<div class="grid">
		{#if market}
			<div class="book" use:reveal={{ delay: 0.04 }}>
				<DepthLadder bids={market.bids} asks={market.asks} onPick={useLevel} />
			</div>
		{/if}

		<!--
			The ticket is a normal panel on a desktop and a bottom sheet on a phone.
			One element, two layouts — rather than two elements and a media query
			hiding one of them, which would put the order form in the DOM twice and
			give a screen reader two of everything.
		-->
		<!--
			No `use:reveal` here, and that is deliberate.

			Everything else on this page fades in; the order ticket does not. It is
			the one control somebody might need to reach in the first half second,
			and an element that is still moving is an element you aim at wrong.
			An entrance animation on this panel is an animation that can cost money.
		-->
		<section class="card stack ticket" class:open={ticketOpen} aria-label="Order ticket">
			<header class="row ticket-head">
				<h3>Order</h3>
				<button type="button" class="link close" onclick={() => (ticketOpen = false)}>
					Close
				</button>
			</header>

			{#if lastError}
				<p class="error" role="alert">{lastError}</p>
			{:else if lastSent}
				<p class="sent small muted" role="status">
					Sent {lastSent}. The venue has accepted the command; the engine decides the outcome and it
					appears below.
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

			<button
				type="button"
				class="send"
				class:buying={ticket.side === 'buy'}
				onclick={() => void send()}
				disabled={sending || !ticket.price}
			>
				{sending ? 'Sending…' : `${ticket.side === 'buy' ? 'Buy' : 'Sell'} ${ticket.quantity}`}
			</button>
		</section>

		<section class="card tape" use:reveal={{ delay: 0.08 }}>
			<h3>Tape</h3>
			<ul role="list" use:revealChildren={{ selector: 'li', distance: -8 }}>
				{#each market?.tape ?? [] as trade (trade.tradeId)}
					<li class="row small">
						<span
							class="mono {trade.aggressor === 'buy'
								? 'up'
								: trade.aggressor === 'sell'
									? 'down'
									: ''}">{trade.label}</span
						>
						<span class="mono faint">{trade.quantity.toLocaleString('en-GB')}</span>
						<span class="faint">{trade.aggressor ?? 'auction'}</span>
					</li>
				{:else}
					<li class="muted small">No trades yet today.</li>
				{/each}
			</ul>
		</section>
	</div>

	<section class="card" use:reveal={{ delay: 0.12 }}>
		<h3>Your orders</h3>

		<!--
			A scroll container, not a stacked card layout.
			These are dense numeric rows that exist to be *compared* down a column —
			stacking them into cards preserves the data and destroys the reason for
			the table. So on a narrow screen it scrolls sideways, with the reference
			column pinned so you never lose track of which row you are reading.
		-->
		<!--
			svelte-ignore a11y_no_noninteractive_tabindex
			The rule is a good heuristic and wrong here. A container that scrolls
			must be reachable by keyboard, or a keyboard-only user cannot see the
			columns past the edge at all — WCAG 2.1.1, and the exact pattern the
			ARIA authoring practices recommend for a scrollable region. Removing the
			tabindex silences a warning by introducing a real failure that nobody
			testing with a mouse would ever notice.
		-->
		<div class="scroller" tabindex="0" role="region" aria-label="Your orders, scrollable">
			<table>
				<thead>
					<tr>
						<th scope="col" class="pin">Reference</th>
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
							<td class="mono small pin">{order.clientOrderId}</td>
							<td class="mono small">{order.instrumentId}</td>
							<td class={order.side === 'buy' ? 'up' : 'down'}>{order.side}</td>
							<td class="mono">{order.priceLabel}</td>
							<td class="mono">{order.filled} / {order.quantity}</td>
							<td class="small">
								{order.status}{order.cancelReason
									? ` (${order.cancelReason.replace(/_/g, ' ')})`
									: ''}
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
		</div>
	</section>

	<section class="card" use:reveal={{ delay: 0.16 }}>
		<h3>Positions</h3>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="scroller" tabindex="0" role="region" aria-label="Positions, scrollable">
			<table>
				<thead>
					<tr>
						<th scope="col" class="pin">Account</th>
						<th scope="col">Instrument</th>
						<th scope="col">Quantity</th>
						<th scope="col">Average</th>
						<th scope="col">Realised</th>
					</tr>
				</thead>
				<tbody>
					{#each positions as position (position.accountId + position.instrumentId)}
						<tr>
							<td class="mono small pin">{position.accountId}</td>
							<td class="mono small">{position.instrumentId}</td>
							<td class="mono {position.quantity > 0 ? 'up' : position.quantity < 0 ? 'down' : ''}"
								>{position.quantity.toLocaleString('en-GB')}</td
							>
							<td class="mono">{position.averageLabel}</td>
							<td
								class="mono {position.realisedPnl > 0
									? 'up'
									: position.realisedPnl < 0
										? 'down'
										: ''}"
							>
								{position.realisedPnl < 0 ? '−' : ''}{position.realisedLabel}
							</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="muted small">Flat.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<!--
	The bar that opens the ticket on a phone.
	Fixed to the bottom because that is where a thumb is, and `env(safe-area-...)`
	because on a notched phone the bottom of the viewport is behind the home
	indicator and a button there cannot be pressed.
-->
<div class="ticket-bar" class:hidden={ticketOpen}>
	<button
		type="button"
		class="open-ticket buy"
		onclick={() => {
			ticket.side = 'buy';
			ticketOpen = true;
		}}
	>
		Buy
	</button>
	<button
		type="button"
		class="open-ticket sell"
		onclick={() => {
			ticket.side = 'sell';
			ticketOpen = true;
		}}
	>
		Sell
	</button>
</div>

<style>
	.terminal {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		/* Room for the fixed ticket bar, so the last row is not hidden behind it. */
		padding-block-end: calc(4.5rem + env(safe-area-inset-bottom, 0px));
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: flex-start;
	}

	.head select {
		inline-size: 100%;
	}
	.quote {
		gap: var(--space-3);
	}
	.last {
		font-size: var(--text-lg);
	}

	.phase[data-phase='halted'] {
		color: var(--ask);
		border-color: var(--ask);
	}
	.phase[data-phase='continuous'] {
		color: var(--bid);
		border-color: var(--bid);
	}

	.grid {
		display: grid;
		/* Mobile first: stacked, book first — it is the thing you look at. */
		grid-template-columns: 1fr;
		gap: var(--space-4);
	}

	/* ---------------------------------------------------------------------- */
	/* The ticket: a sheet on phones, a panel on everything else               */
	/* ---------------------------------------------------------------------- */

	.ticket {
		position: fixed;
		inset-inline: 0;
		inset-block-end: 0;
		z-index: 40;
		border-start-start-radius: var(--radius-lg);
		border-start-end-radius: var(--radius-lg);
		border-end-start-radius: 0;
		border-end-end-radius: 0;
		padding-block-end: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
		max-block-size: 85dvh;
		overflow-y: auto;

		/*
		 * Off-screen by default, and `translateY` rather than `display: none`.
		 *
		 * A sheet that is display:none cannot be animated in, and one that is
		 * `visibility: hidden` is still in the accessibility tree in some
		 * browsers. Translating it away keeps it composited and cheap, and
		 * `visibility` on the transition end takes it out of the tab order.
		 */
		transform: translateY(101%);
		visibility: hidden;
		transition:
			transform var(--sheet-duration, 0.3s) cubic-bezier(0.32, 0.72, 0, 1),
			visibility 0s linear var(--sheet-duration, 0.3s);
		box-shadow: 0 -12px 40px oklch(0% 0 0 / 0.45);
	}

	.ticket.open {
		transform: translateY(0);
		visibility: visible;
		transition-delay: 0s;
	}

	.ticket-head {
		justify-content: space-between;
	}

	.ticket-bar {
		position: fixed;
		inset-inline: 0;
		inset-block-end: 0;
		z-index: 30;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
		padding: var(--space-2);
		padding-block-end: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
		background: oklch(from var(--bg) l c h / 0.92);
		backdrop-filter: blur(8px);
		border-block-start: 1px solid var(--line);
		transition: transform 0.25s ease;
	}

	.ticket-bar.hidden {
		transform: translateY(110%);
	}

	.open-ticket.buy {
		border-color: var(--bid);
		color: var(--bid);
	}
	.open-ticket.sell {
		border-color: var(--ask);
		color: var(--ask);
	}

	/*
	 * From `md` up the ticket stops being a sheet and becomes an ordinary column.
	 * Everything the sheet needed is unset explicitly rather than left to
	 * cascade — a half-unset fixed element is the classic source of a panel that
	 * floats over the page on exactly one screen size.
	 */
	@media (min-width: 64rem) {
		.terminal {
			padding-block-end: 0;
		}
		.head {
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
		}
		.head select {
			inline-size: auto;
		}

		.grid {
			grid-template-columns: 2fr 1fr 1fr;
			align-items: start;
		}

		.ticket {
			position: static;
			transform: none;
			visibility: visible;
			max-block-size: none;
			overflow-y: visible;
			border-radius: var(--radius-lg);
			padding-block-end: var(--space-4);
			box-shadow: none;
			transition: none;
		}

		.ticket-bar,
		.close {
			display: none;
		}
	}

	.ticket .sides {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}
	.ticket .buy.active {
		border-color: var(--bid);
		color: var(--bid);
	}
	.ticket .sell.active {
		border-color: var(--ask);
		color: var(--ask);
	}
	.ticket label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
	}

	.send.buying {
		border-color: var(--bid);
	}
	.send:not(.buying) {
		border-color: var(--ask);
	}

	/* ---------------------------------------------------------------------- */

	.tape ul {
		list-style: none;
		padding: 0;
		margin-block-start: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-block-size: 18rem;
		overflow-y: auto;
	}

	.tape li {
		justify-content: space-between;
	}

	/*
	 * The horizontal scroll container.
	 *
	 * `tabindex="0"` because a region that scrolls must be reachable by keyboard —
	 * without it, a keyboard user simply cannot see the columns past the edge.
	 * That is a WCAG failure and it is invisible to anybody testing with a mouse.
	 */
	.scroller {
		overflow-x: auto;
		margin-block-start: var(--space-2);
		/* Momentum scrolling, and a scroll edge that does not chain to the page. */
		overscroll-behavior-x: contain;
	}

	.scroller:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	table {
		inline-size: 100%;
		border-collapse: collapse;
		min-inline-size: 34rem;
	}
	th {
		text-align: start;
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-faint);
		font-weight: 500;
		white-space: nowrap;
	}
	td,
	th {
		padding-block: var(--space-1);
		padding-inline-end: var(--space-3);
		border-block-end: 1px solid var(--line);
	}
	td {
		white-space: nowrap;
	}

	/* The pinned first column, so a sideways scroll never loses the row's identity. */
	.pin {
		position: sticky;
		inset-inline-start: 0;
		background: var(--surface);
		z-index: 1;
	}

	@media (min-width: 48rem) {
		table {
			min-inline-size: 0;
		}
		.pin {
			position: static;
		}
	}

	.up {
		color: var(--bid);
	}
	.down {
		color: var(--ask);
	}

	.error {
		color: var(--ask);
		border: 1px solid var(--ask);
		border-radius: var(--radius);
		padding: var(--space-2);
		font-size: var(--text-sm);
	}
	.sent {
		border-inline-start: 2px solid var(--accent);
		padding-inline-start: var(--space-2);
	}

	@media (prefers-reduced-motion: reduce) {
		.ticket {
			--sheet-duration: 0.01s;
		}
	}
</style>
