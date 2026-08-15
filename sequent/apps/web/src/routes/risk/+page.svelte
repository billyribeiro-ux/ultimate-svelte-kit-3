<script lang="ts">
	import { getExposure, getTrialBalance, setKillSwitch } from './risk.remote.ts';

	let { data }: { data: { canStop: boolean; canSeeLedger: boolean } } = $props();

	let busy = $state(false);
	let lastError = $state<string | null>(null);

	const exposure = $derived(await getExposure());
	const books = $derived(data.canSeeLedger ? await getTrialBalance() : null);

	async function toggle() {
		busy = true;
		lastError = null;
		try {
			await setKillSwitch({ engaged: !exposure.stopped, reason: 'From the risk console' });
		} catch (thrown) {
			lastError = thrown instanceof Error ? thrown.message : 'That did not work.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="container stack">
	<h1>Risk</h1>

	{#if lastError}
		<p class="error" role="alert">{lastError}</p>
	{/if}

	{#if data.canStop}
		<section class="card stack">
			<h3>Trading</h3>
			<p class="muted small">
				Engaging the stop cancels every order this firm has resting and refuses new ones.
				It takes effect on the next command the engine reads — there is no window in which
				some orders are stopped and others are not.
			</p>
			<div class="row">
				<span class="badge" class:stopped={exposure.stopped}>
					{exposure.stopped ? 'Stopped' : 'Trading'}
				</span>
				<button type="button" onclick={() => void toggle()} disabled={busy} class:danger={!exposure.stopped}>
					{exposure.stopped ? 'Resume trading' : 'Stop all trading'}
				</button>
			</div>
		</section>
	{/if}

	<section class="card">
		<h3>Exposure</h3>
		<table>
			<thead>
				<tr>
					<th scope="col">Account</th>
					<th scope="col">Instrument</th>
					<th scope="col">Position</th>
					<th scope="col">Value</th>
				</tr>
			</thead>
			<tbody>
				{#each exposure.positions as row (row.accountId + row.instrumentId)}
					<tr>
						<td class="mono small">{row.accountId}</td>
						<td class="mono small">{row.instrumentId}</td>
						<td class="mono">{row.quantity}</td>
						<td class="mono">{row.exposureLabel}</td>
					</tr>
				{:else}
					<tr><td colspan="4" class="muted small">No positions.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="card">
		<h3>Working orders</h3>
		<ul role="list" class="small">
			{#each exposure.working as row (row.accountId + row.side)}
				<li class="row">
					<span class="mono">{row.accountId}</span>
					<span class={row.side === 'buy' ? 'up' : 'down'}>{row.side}</span>
					<span class="mono">{row.quantity}</span>
				</li>
			{:else}
				<li class="muted">Nothing resting.</li>
			{/each}
		</ul>
	</section>

	{#if books}
		<section class="card">
			<h3>Books</h3>
			<p class="small muted">
				Every ledger transaction sums to zero by construction, so this total is zero or
				something has written to the ledger outside the one function that may.
			</p>
			<p class="mono total" class:bad={books.total !== 0}>
				trial balance: {books.total}
			</p>
			<table>
				<thead>
					<tr><th scope="col">Account</th><th scope="col">Kind</th><th scope="col">Balance</th></tr>
				</thead>
				<tbody>
					{#each books.accounts as account (account.accountId)}
						<tr>
							<td class="mono small">{account.accountId}</td>
							<td class="small muted">{account.kind.replace('_', ' ')}</td>
							<td class="mono" class:down={account.negative}>
								{account.negative ? '−' : ''}{account.label}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</div>

<style>
	table { inline-size: 100%; border-collapse: collapse; margin-block-start: var(--space-2); }
	th { text-align: start; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-faint); font-weight: 500; }
	td, th { padding-block: var(--space-1); border-block-end: 1px solid var(--line); }
	ul { list-style: none; padding: 0; margin-block-start: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1); }
	.up { color: var(--bid); }
	.down { color: var(--ask); }
	.badge.stopped { color: var(--ask); border-color: var(--ask); }
	button.danger { border-color: var(--warn); color: var(--warn); }
	.total { margin-block: var(--space-2); }
	.total.bad { color: var(--ask); }
	.error { color: var(--ask); border: 1px solid var(--ask); border-radius: var(--radius); padding: var(--space-2); }
</style>
