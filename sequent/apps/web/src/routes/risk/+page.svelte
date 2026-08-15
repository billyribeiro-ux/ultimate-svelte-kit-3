<script lang="ts">
	import { reveal, sweep } from '#lib/motion/motion.ts';
	import { getExposure, getTrialBalance, setKillSwitch } from './risk.remote.ts';

	let { data }: { data: { canStop: boolean; canSeeLedger: boolean } } = $props();

	/*
	 * Declared above the awaited deriveds, for the same reason as the terminal's
	 * ticket state: a binding to a `$state` member emits a getter that runs before
	 * the code following the first `await`, and reading it there during SSR gets
	 * `undefined`.
	 */
	let busy = $state(false);
	let lastError = $state<string | null>(null);

	/**
	 * The confirmation step.
	 *
	 * ## Why a destructive action needs two
	 *
	 * Stopping the firm cancels every order it has resting. That is not
	 * reversible — the orders are gone, and resuming does not put them back;
	 * somebody has to send them again, at whatever the market is by then.
	 *
	 * A one-click control for that is a fat-finger accident waiting to happen,
	 * which is a strange thing to ship in a venue that spends a whole module of
	 * `risk.ts` preventing fat-finger *orders*. The engine will not let a trader
	 * buy at ten times the reference price by mistake; the console should not let
	 * a risk manager cancel their firm's whole book by brushing a trackpad.
	 *
	 * The confirmation also does something a plain `confirm()` cannot: it says
	 * **how many orders** are about to go. "Cancel 47 working orders" is a
	 * different decision from "Cancel 0", and the number is the most useful thing
	 * on the screen at that moment.
	 */
	let confirming = $state(false);

	const exposure = $derived(await getExposure());
	const books = $derived(data.canSeeLedger ? await getTrialBalance() : null);

	const workingCount = $derived(
		exposure.working.reduce((total, row) => total + row.quantity, 0)
	);

	async function toggle() {
		busy = true;
		lastError = null;

		try {
			const engaging = !exposure.stopped;
			await setKillSwitch({ engaged: engaging, reason: 'From the risk console' });

			// The venue's one dramatic gesture. A firm-wide halt is exactly the kind
			// of thing a toast in the corner under-states, and somebody needs to feel
			// that every order they had resting has just gone.
			sweep(engaging ? 'halt' : 'open');
			confirming = false;
		} catch (thrown) {
			lastError = messageFrom(thrown);
		} finally {
			busy = false;
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

<div class="container stack risk">
	<h1>Risk</h1>

	{#if lastError}
		<p class="error" role="alert">{lastError}</p>
	{/if}

	{#if data.canStop}
		<section class="card stack halt" class:armed={confirming} use:reveal>
			<header class="row">
				<h3>Trading</h3>
				<span class="badge" class:stopped={exposure.stopped}>
					{exposure.stopped ? 'Stopped' : 'Trading'}
				</span>
			</header>

			<p class="muted small">
				Engaging the stop cancels every order this firm has resting and refuses new ones.
				It takes effect on the next command the engine reads — there is no window in which
				some orders are stopped and others are not.
			</p>

			{#if exposure.stopped}
				<button type="button" onclick={() => void toggle()} disabled={busy}>
					{busy ? 'Resuming…' : 'Resume trading'}
				</button>
			{:else if !confirming}
				<button type="button" class="danger" onclick={() => (confirming = true)}>
					Stop all trading
				</button>
			{:else}
				<!--
					The armed state. `role="alertdialog"` rather than a plain region:
					this demands a decision before anything else happens, and that is
					precisely what the role means to a screen reader.
				-->
				<div class="confirm stack" role="alertdialog" aria-label="Confirm the trading stop">
					<p class="small">
						This cancels
						<strong class="mono">{workingCount.toLocaleString('en-GB')}</strong>
						working {workingCount === 1 ? 'order' : 'orders'} across
						<strong class="mono">{exposure.working.length}</strong>
						{exposure.working.length === 1 ? 'book' : 'books'}. They are not restored when you
						resume — somebody has to send them again, at whatever the market is by then.
					</p>
					<div class="row">
						<!--
							The confirming button is NOT autofocused.
							Focus goes to the cancel, so that somebody who arrived here by
							accident and hits Enter — the most likely accident — gets out
							rather than in.
						-->
						<!-- svelte-ignore a11y_autofocus -->
						<button type="button" autofocus onclick={() => (confirming = false)}>
							Never mind
						</button>
						<button type="button" class="danger" onclick={() => void toggle()} disabled={busy}>
							{busy ? 'Stopping…' : `Yes — stop ${exposure.working.length ? 'and cancel' : ''}`}
						</button>
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<section class="card" use:reveal={{ delay: 0.05 }}>
		<h3>Exposure</h3>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="scroller" tabindex="0" role="region" aria-label="Exposure, scrollable">
			<table>
				<thead>
					<tr>
						<th scope="col" class="pin">Account</th>
						<th scope="col">Instrument</th>
						<th scope="col">Position</th>
						<th scope="col">Value</th>
					</tr>
				</thead>
				<tbody>
					{#each exposure.positions as row (row.accountId + row.instrumentId)}
						<tr>
							<td class="mono small pin">{row.accountId}</td>
							<td class="mono small">{row.instrumentId}</td>
							<td class="mono {row.quantity > 0 ? 'up' : row.quantity < 0 ? 'down' : ''}">
								{row.quantity.toLocaleString('en-GB')}
							</td>
							<td class="mono">{row.exposureLabel}</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="muted small">No positions.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="card" use:reveal={{ delay: 0.09 }}>
		<h3>Working orders</h3>
		<ul role="list" class="small working">
			{#each exposure.working as row (row.accountId + row.side)}
				<li class="row">
					<span class="mono">{row.accountId}</span>
					<span class={row.side === 'buy' ? 'up' : 'down'}>{row.side}</span>
					<span class="mono">{row.quantity.toLocaleString('en-GB')}</span>
				</li>
			{:else}
				<li class="muted">Nothing resting.</li>
			{/each}
		</ul>
	</section>

	{#if books}
		<section class="card" use:reveal={{ delay: 0.13 }}>
			<h3>Books</h3>
			<p class="small muted">
				Every ledger transaction sums to zero by construction, so this total is zero or
				something has written to the ledger outside the one function that may.
			</p>
			<p class="mono total" class:bad={books.total !== 0}>
				trial balance: {books.total}
			</p>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="scroller" tabindex="0" role="region" aria-label="Trial balance, scrollable">
				<table>
					<thead>
						<tr>
							<th scope="col" class="pin">Account</th>
							<th scope="col">Kind</th>
							<th scope="col">Balance</th>
						</tr>
					</thead>
					<tbody>
						{#each books.accounts as account (account.accountId)}
							<tr>
								<td class="mono small pin">{account.accountId}</td>
								<td class="small muted">{account.kind.replace('_', ' ')}</td>
								<td class="mono" class:down={account.negative}>
									{account.negative ? '−' : ''}{account.label}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>

<style>
	.risk header { justify-content: space-between; }

	.working {
		list-style: none;
		padding: 0;
		margin-block-start: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.working li { justify-content: space-between; }

	.up { color: var(--bid); }
	.down { color: var(--ask); }

	.badge.stopped { color: var(--ask); border-color: var(--ask); }

	button.danger { border-color: var(--warn); color: var(--warn); }
	button.danger:hover:not(:disabled) { border-color: var(--ask); color: var(--ask); }

	/*
	 * The armed panel gets a visible border rather than a modal overlay.
	 *
	 * A modal would darken the exposure table behind it — which is the
	 * information somebody needs in order to answer the question the modal is
	 * asking. Keeping the numbers visible while the confirmation is up is the
	 * whole point of not using a dialog element here.
	 */
	.halt.armed { border-color: var(--warn); }

	.confirm {
		border-inline-start: 3px solid var(--warn);
		padding-inline-start: var(--space-3);
	}

	.total { margin-block: var(--space-2); }
	.total.bad { color: var(--ask); }

	.error {
		color: var(--ask);
		border: 1px solid var(--ask);
		border-radius: var(--radius);
		padding: var(--space-2);
	}

	/* Buttons go full-width and stack on a phone; side by side once there is room. */
	.confirm .row button { flex: 1 1 12rem; }
</style>
