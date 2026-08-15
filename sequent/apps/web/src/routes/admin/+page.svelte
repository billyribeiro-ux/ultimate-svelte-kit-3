<script lang="ts">
	import { reveal, sweep } from '#lib/motion/motion.ts';
	import {
		addWebhook,
		createKey,
		getApiKeys,
		getBilling,
		getOps,
		getQueue,
		getVenue,
		getWebhooks,
		listInstrument,
		removeWebhook,
		retryDead,
		revokeKey,
		setFeatureFlag,
		setPhase
	} from './admin.remote.ts';

	let {
		data
	}: {
		data: {
			canManageKeys: boolean;
			canRunVenue: boolean;
			canSeeQueue: boolean;
			canSeeLedger: boolean;
			firmId: string;
		};
	} = $props();

	/*
	 * All state above the awaited deriveds — the SSR getter-ordering rule again.
	 * A `$state` object whose members are bound in the template emits getters
	 * that run before the code after the first `await`.
	 */
	let busy = $state(false);
	let lastError = $state<string | null>(null);

	/** The one time a key's secret exists outside the holder's hands. */
	let mintedKey = $state<{ keyId: string; secret: string } | null>(null);
	let mintedHook = $state<{ endpointId: string; secret: string } | null>(null);

	let newKey = $state({
		label: '',
		read: true,
		trade: false,
		admin: false,
		accountId: '',
		rate: '20'
	});
	let newHook = $state({ url: '', events: ['trade.executed'] as string[] });

	const keys = $derived(data.canManageKeys ? await getApiKeys() : null);
	const hooks = $derived(data.canManageKeys ? await getWebhooks() : null);
	const queue = $derived(data.canSeeQueue ? await getQueue() : null);
	const billing = $derived(data.canSeeLedger ? await getBilling() : null);
	const ops = $derived(data.canSeeQueue ? await getOps() : null);
	const venue = $derived(data.canRunVenue ? await getVenue() : null);

	const PHASES = ['closed', 'pre_open', 'auction', 'continuous', 'halted'] as const;

	async function run(work: () => Promise<void>) {
		busy = true;
		lastError = null;
		try {
			await work();
		} catch (thrown) {
			lastError = messageFrom(thrown);
		} finally {
			busy = false;
		}
	}

	/**
	 * Scaled integer units to a readable amount.
	 *
	 * Divided only here, at the very edge, for display. Every amount that travels
	 * or is stored stays an integer — the moment a float touches money it starts
	 * losing pennies in ways that take an auditor to find.
	 */
	const money = (units: number) =>
		`£${(units / 10_000).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

	function messageFrom(thrown: unknown): string {
		if (typeof thrown === 'object' && thrown !== null) {
			const body = (thrown as { body?: { message?: unknown } }).body;
			if (body && typeof body.message === 'string') return body.message;
			const message = (thrown as { message?: unknown }).message;
			if (typeof message === 'string' && message) return message;
		}
		return 'That did not work.';
	}

	async function mint() {
		await run(async () => {
			const scopes = [
				...(newKey.read ? ['read' as const] : []),
				...(newKey.trade ? ['trade' as const] : []),
				...(newKey.admin ? ['admin' as const] : [])
			];

			mintedKey = await createKey({
				label: newKey.label,
				scopes,
				ratePerSecond: Number(newKey.rate),
				...(newKey.accountId ? { accountId: newKey.accountId } : {})
			});

			newKey.label = '';
		});
	}

	async function addHook() {
		await run(async () => {
			mintedHook = await addWebhook({ url: newHook.url, events: newHook.events });
			newHook.url = '';
		});
	}

	function toggleEvent(event: string) {
		newHook.events = newHook.events.includes(event)
			? newHook.events.filter((name) => name !== event)
			: [...newHook.events, event];
	}

	async function movePhase(instrumentId: string, phase: (typeof PHASES)[number]) {
		await run(async () => {
			await setPhase({ instrumentId, phase, reason: 'From the venue console' });
			// The market opening or halting is one of the three moments that earns
			// the venue's dramatic gesture.
			sweep(phase === 'continuous' || phase === 'auction' ? 'open' : 'halt');
		});
	}

	/**
	 * Flip a flag, with a reason.
	 *
	 * The reason is prompted for rather than optional, because "why is
	 * `deliver_webhooks` off" is the question somebody has six weeks later and a
	 * blank field cannot answer it. A prompt is crude; a mandatory field that
	 * people fill with "." is worse.
	 */
	async function toggleFlag(name: string, enabled: boolean) {
		const reason = globalThis.prompt(
			`Why are you turning ${name} ${enabled ? 'on' : 'off'}?`,
			enabled ? 'resolved' : 'incident'
		);

		if (!reason) return;

		await run(async () => void (await setFeatureFlag({ name, enabled, reason })));
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// Clipboard access is refused in plenty of ordinary situations —
			// an insecure origin, a browser policy, a user who said no. The secret
			// is on screen and selectable either way, so there is nothing to
			// recover from and nothing worth interrupting somebody about.
		}
	}
</script>

<div class="container stack admin">
	<h1>Admin</h1>
	<!-- Which firm this page is administering. A venue operator can be looking
	     at any of them, and "revoke this key" is a different action depending on
	     whose it is. -->
	<p class="small muted mono">{data.firmId}</p>

	{#if lastError}
		<p class="error" role="alert">{lastError}</p>
	{/if}

	<!-- ------------------------------------------------------------------ -->
	{#if data.canRunVenue && venue}
		<section class="card stack" use:reveal>
			<h2>The market</h2>
			<p class="small muted">
				Phases are not labels. <strong>pre-open</strong> accumulates orders without matching,
				<strong>auction</strong> clears all of them at one price, and
				<strong>continuous</strong> matches arrival by arrival. The engine uncrosses the book on the way
				into continuous, so trading never begins on a crossed market.
			</p>

			<div class="instruments">
				{#each venue as instrument (instrument.instrumentId)}
					<article class="instrument stack">
						<header class="row">
							<div>
								<strong class="mono">{instrument.instrumentId}</strong>
								<span class="muted small">{instrument.name}</span>
							</div>
							<span class="badge phase" data-phase={instrument.phase}>
								{instrument.phase.replace('_', ' ')}
							</span>
						</header>

						<div class="phases" role="group" aria-label="Phase for {instrument.instrumentId}">
							{#each PHASES as phase (phase)}
								<button
									type="button"
									class="phase-button"
									class:current={instrument.phase === phase}
									disabled={busy || instrument.phase === phase}
									onclick={() => void movePhase(instrument.instrumentId, phase)}
								>
									{phase.replace('_', ' ')}
								</button>
							{/each}
						</div>
					</article>
				{:else}
					<p class="muted small">Nothing listed yet.</p>
				{/each}
			</div>
		</section>

		<section class="card stack" use:reveal={{ delay: 0.05 }}>
			<h2>List an instrument</h2>
			<form {...listInstrument} class="stack">
				{#if listInstrument.fields.allIssues()?.length}
					<p class="error" role="alert">{listInstrument.fields.allIssues()?.[0]?.message}</p>
				{/if}

				<div class="fields">
					<label>
						Symbol
						<input {...listInstrument.fields.symbol.as('text')} placeholder="TSCO.L" required />
					</label>
					<label>
						Name
						<input {...listInstrument.fields.name.as('text')} placeholder="Tesco plc" required />
					</label>
					<label>
						Currency
						<input {...listInstrument.fields.currency.as('text')} value="GBP" required />
					</label>
					<label>
						Reference price
						<input
							{...listInstrument.fields.referencePrice.as('text')}
							inputmode="decimal"
							placeholder="285.40"
							required
						/>
					</label>
					<label>
						Tick size
						<!-- In scaled units: 25 is a quarter of a penny. -->
						<input
							{...listInstrument.fields.tickSize.as('text')}
							value="25"
							inputmode="numeric"
							required
						/>
					</label>
					<label>
						Lot size
						<input
							{...listInstrument.fields.lotSize.as('text')}
							value="1"
							inputmode="numeric"
							required
						/>
					</label>
				</div>

				<button type="submit">List it</button>
			</form>
		</section>
	{/if}

	<!-- ------------------------------------------------------------------ -->
	{#if data.canSeeLedger && billing}
		<section class="card stack" use:reveal={{ delay: 0.07 }}>
			<header class="row">
				<h2>Billing</h2>
				<span class="badge">{billing.plan.name}</span>
			</header>

			<div class="stats">
				<div class="stat">
					<span class="mono big">{billing.usage.seats}</span>
					<span class="small faint">seats · {billing.plan.includedSeats} included</span>
				</div>
				<div class="stat">
					<span class="mono big">{billing.usage.orders.toLocaleString('en-GB')}</span>
					<span class="small faint">
						orders · {billing.plan.includedOrders.toLocaleString('en-GB')} included
					</span>
				</div>
				<div class="stat">
					<span class="mono big">{billing.usage.trades.toLocaleString('en-GB')}</span>
					<span class="small faint">trades</span>
				</div>
				<div class="stat">
					<span class="mono big">{money(billing.preview.total)}</span>
					<span class="small faint">this month so far</span>
				</div>
			</div>

			<p class="small muted">
				A preview, built by the same function that builds the invoice — so what you see mid-month is
				what you will be charged, rather than an estimate from a second implementation that drifts.
				Trading fees are settled per trade through the ledger and appear at zero here so they are
				not billed twice.
			</p>

			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="scroller" tabindex="0" role="region" aria-label="This month's charges">
				<table>
					<thead>
						<tr>
							<th scope="col" class="pin">Item</th>
							<th scope="col">Quantity</th>
							<th scope="col">Unit</th>
							<th scope="col">Amount</th>
						</tr>
					</thead>
					<tbody>
						{#each billing.preview.lines as line, index (line.description + index)}
							<tr>
								<td class="small pin">{line.description}</td>
								<td class="mono small">{line.quantity.toLocaleString('en-GB')}</td>
								<td class="mono small">{line.unitAmount === 0 ? '—' : money(line.unitAmount)}</td>
								<td class="mono">{money(line.amount)}</td>
							</tr>
						{/each}
						<tr class="total-row">
							<td class="pin"><strong>Total</strong></td>
							<td></td>
							<td></td>
							<td class="mono"><strong>{money(billing.preview.total)}</strong></td>
						</tr>
					</tbody>
				</table>
			</div>

			{#if billing.invoices.length}
				<h3>Issued invoices</h3>
				<ul role="list" class="invoices">
					{#each billing.invoices as issued (issued.invoiceId)}
						<li class="row">
							<span class="mono small"
								>{new Date(issued.periodStart).toISOString().slice(0, 7)}</span
							>
							<span class="mono">{money(issued.total)}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="small muted">Nothing issued yet — the first invoice closes at month end.</p>
			{/if}
		</section>
	{/if}

	<!-- ------------------------------------------------------------------ -->
	{#if data.canManageKeys && keys}
		<section class="card stack" use:reveal={{ delay: 0.09 }}>
			<h2>API keys</h2>

			{#if mintedKey}
				<!--
					Shown once, and the panel says so plainly.
					A message that hedges — "keep this somewhere safe" — leaves people
					assuming they can come back for it. There is no endpoint that can
					return it, so the copy has to be unambiguous.
				-->
				<div class="minted stack" role="status">
					<strong>Copy this now. It will not be shown again.</strong>
					<code class="secret mono">{mintedKey.secret}</code>
					<div class="row">
						<button type="button" onclick={() => void copy(mintedKey!.secret)}>Copy</button>
						<button type="button" class="link" onclick={() => (mintedKey = null)}>Done</button>
					</div>
				</div>
			{/if}

			<div class="fields">
				<label>
					Label
					<input bind:value={newKey.label} placeholder="Systematic desk algo" />
				</label>

				<label>
					Trading account
					<select bind:value={newKey.accountId}>
						<option value="">All of the firm's accounts</option>
						{#each keys.accounts as account (account.accountId)}
							<option value={account.accountId}>{account.name}</option>
						{/each}
					</select>
				</label>

				<label>
					Requests per second
					<input bind:value={newKey.rate} inputmode="numeric" />
				</label>
			</div>

			<fieldset class="scopes">
				<legend class="small muted">Scopes — a key is never more than a trader at your firm</legend>
				<label class="check"><input type="checkbox" bind:checked={newKey.read} /> read</label>
				<label class="check"><input type="checkbox" bind:checked={newKey.trade} /> trade</label>
				<label class="check"><input type="checkbox" bind:checked={newKey.admin} /> admin</label>
			</fieldset>

			<button type="button" onclick={() => void mint()} disabled={busy || !newKey.label}>
				{busy ? 'Creating…' : 'Create key'}
			</button>

			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="scroller" tabindex="0" role="region" aria-label="API keys, scrollable">
				<table>
					<thead>
						<tr>
							<th scope="col" class="pin">Label</th>
							<th scope="col">Key</th>
							<th scope="col">Scopes</th>
							<th scope="col">Rate</th>
							<th scope="col">Last used</th>
							<th scope="col"><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each keys.keys as key (key.keyId)}
							<tr class:revoked={key.revoked}>
								<td class="pin small">{key.label}</td>
								<td class="mono small">{key.keyId}</td>
								<td class="small">{key.scopes.join(' ')}</td>
								<td class="mono small">{key.ratePerSecond}/s</td>
								<td class="small muted">{key.lastUsedLabel}</td>
								<td>
									{#if key.revoked}
										<span class="badge">revoked</span>
									{:else}
										<button
											type="button"
											class="link"
											onclick={() =>
												void run(async () => void (await revokeKey({ keyId: key.keyId })))}
											aria-label="Revoke {key.label}">Revoke</button
										>
									{/if}
								</td>
							</tr>
						{:else}
							<tr><td colspan="6" class="muted small">No keys yet.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<!-- -------------------------------------------------------------- -->
		{#if hooks}
			<section class="card stack" use:reveal={{ delay: 0.13 }}>
				<h2>Webhooks</h2>
				<p class="small muted">
					Every delivery is signed <code class="mono">t=…,v1=…</code> over
					<code class="mono">timestamp.body</code>. Verify it in constant time, and reject anything
					with a timestamp more than a few minutes old — that is what stops a captured delivery
					being replayed at you.
				</p>

				{#if mintedHook}
					<div class="minted stack" role="status">
						<strong>The signing secret for this endpoint.</strong>
						<code class="secret mono">{mintedHook.secret}</code>
						<div class="row">
							<button type="button" onclick={() => void copy(mintedHook!.secret)}>Copy</button>
							<button type="button" class="link" onclick={() => (mintedHook = null)}>Done</button>
						</div>
					</div>
				{/if}

				<label>
					Endpoint URL
					<input
						bind:value={newHook.url}
						inputmode="url"
						placeholder="https://api.yourfirm.example/sequent"
					/>
				</label>

				<fieldset class="scopes">
					<legend class="small muted">Events</legend>
					{#each hooks.available as event (event)}
						<label class="check">
							<input
								type="checkbox"
								checked={newHook.events.includes(event)}
								onchange={() => toggleEvent(event)}
							/>
							{event}
						</label>
					{/each}
				</fieldset>

				<button type="button" onclick={() => void addHook()} disabled={busy || !newHook.url}>
					{busy ? 'Adding…' : 'Add endpoint'}
				</button>

				<ul role="list" class="endpoints">
					{#each hooks.endpoints as endpoint (endpoint.endpointId)}
						<li class="endpoint stack">
							<div class="row">
								<span class="mono small url">{endpoint.url}</span>
								{#if !endpoint.isActive}
									<span class="badge stopped">disabled</span>
								{:else if endpoint.consecutiveFailures > 0}
									<span class="badge warn">{endpoint.consecutiveFailures} failing</span>
								{/if}
								<button
									type="button"
									class="link"
									onclick={() =>
										void run(
											async () => void (await removeWebhook({ endpointId: endpoint.endpointId }))
										)}
									aria-label="Remove {endpoint.url}">Remove</button
								>
							</div>
							<span class="small faint">{endpoint.events.join(' · ')}</span>
							<span class="small faint">last success: {endpoint.lastSuccessLabel}</span>
						</li>
					{:else}
						<li class="muted small">No endpoints. Nothing is being notified.</li>
					{/each}
				</ul>

				{#if hooks.deliveries.length}
					<h3>Recent deliveries</h3>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						class="scroller"
						tabindex="0"
						role="region"
						aria-label="Recent deliveries, scrollable"
					>
						<table>
							<thead>
								<tr>
									<th scope="col" class="pin">At</th>
									<th scope="col">Event</th>
									<th scope="col">Status</th>
									<th scope="col">Took</th>
								</tr>
							</thead>
							<tbody>
								{#each hooks.deliveries as delivery (delivery.deliveryId)}
									<tr>
										<td class="mono small pin">{delivery.at}</td>
										<td class="small">{delivery.event}</td>
										<td class="small" class:down={delivery.status !== 'delivered'}>
											{delivery.statusCode ?? delivery.status}
										</td>
										<td class="mono small">{delivery.durationMs}ms</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		{/if}
	{/if}

	<!-- ------------------------------------------------------------------ -->
	{#if data.canSeeQueue && ops}
		<section class="card stack" use:reveal={{ delay: 0.15 }}>
			<header class="row">
				<h2>Health</h2>
				<span class="badge level" data-level={ops.verdict.level}>{ops.verdict.level}</span>
			</header>

			<p class="small" class:down={ops.verdict.level !== 'ok'}>{ops.verdict.summary}</p>

			<div class="stats">
				<div class="stat" class:bad={ops.health.engineLag > 500}>
					<span class="mono big">{ops.health.engineLag}</span>
					<span class="small faint">engine lag</span>
				</div>
				<div class="stat" class:bad={ops.health.projectorLag > 1000}>
					<span class="mono big">{ops.health.projectorLag}</span>
					<span class="small faint">projector lag</span>
				</div>
				<div class="stat" class:bad={ops.health.outboxAgeMs > 120_000}>
					<span class="mono big">{Math.round(ops.health.outboxAgeMs / 1000)}s</span>
					<span class="small faint">oldest queued</span>
				</div>
				<div class="stat" class:bad={ops.health.trialBalance !== 0}>
					<span class="mono big">{ops.health.trialBalance}</span>
					<span class="small faint">trial balance</span>
				</div>
			</div>

			<p class="small muted">
				Lag, not throughput. A venue processing ten thousand commands a second while falling two
				thousand behind is not healthy, and a throughput graph makes it look magnificent. The trial
				balance is zero by construction — anything else means something wrote to the ledger outside
				the one function that may.
			</p>

			{#if data.canRunVenue}
				<h3>Feature flags</h3>
				<p class="small muted">
					A flag may change what the venue <em>offers</em>. It may never change what the engine
					<em>decides</em> — a flag inside the engine would mean replaying the log produced different
					history depending on when you ran it.
				</p>

				<ul role="list" class="flags">
					{#each ops.flags as flag (flag.name)}
						<li class="flag stack">
							<div class="row">
								<code class="mono small">{flag.name}</code>
								<button
									type="button"
									class:danger={flag.enabled}
									disabled={busy}
									onclick={() => void toggleFlag(flag.name, !flag.enabled)}
								>
									{flag.enabled ? 'Turn off' : 'Turn on'}
								</button>
							</div>
							<span class="small faint">{flag.description}</span>
							{#if !flag.isDefault}
								<span class="small faint">
									{flag.enabled ? 'on' : 'off'} — {flag.reason}
								</span>
							{/if}
						</li>
					{/each}
				</ul>

				{#if ops.flagHistory.length}
					<h3>Recent flag changes</h3>
					<ul role="list" class="dead">
						{#each ops.flagHistory as change, index (change.name + change.changedAt + index)}
							<li class="stack tight">
								<span class="small mono">
									{change.name} → {change.enabled ? 'on' : 'off'}
								</span>
								<span class="small faint">{change.reason}</span>
							</li>
						{/each}
					</ul>
				{/if}

				<h3>Schema</h3>
				<p class="small muted">
					At migration <strong class="mono">{ops.migrations.current}</strong>,
					{ops.migrations.pending.length} pending. Changes are forward-only: the recovery path for a bad
					migration is a new migration, because a rollback that drops a column destroys the data written
					since the deploy.
				</p>
			{/if}
		</section>
	{/if}

	<!-- ------------------------------------------------------------------ -->
	{#if data.canSeeQueue && queue}
		<section class="card stack" use:reveal={{ delay: 0.17 }}>
			<h2>The queue</h2>

			<div class="stats">
				<div class="stat">
					<span class="mono big">{queue.stats.pending}</span>
					<span class="small faint">pending</span>
				</div>
				<div class="stat">
					<span class="mono big">{queue.stats.delivered.toLocaleString('en-GB')}</span>
					<span class="small faint">delivered</span>
				</div>
				<div class="stat" class:bad={queue.stats.dead > 0}>
					<span class="mono big">{queue.stats.dead}</span>
					<span class="small faint">dead</span>
				</div>
				<div class="stat" class:bad={queue.stats.oldestPendingAgeMs > 60_000}>
					<span class="mono big">{Math.round(queue.stats.oldestPendingAgeMs / 1000)}s</span>
					<span class="small faint">oldest pending</span>
				</div>
			</div>

			<p class="small muted">
				<strong>Oldest pending</strong> is the number to alert on, not depth. A queue of ten thousand
				that drains in a second is healthy; a queue of one that has been stuck for an hour is not.
			</p>

			{#if queue.dead.length}
				<h3>Dead letters</h3>
				<ul role="list" class="dead">
					{#each queue.dead as message (message.outboxId)}
						<li class="stack tight">
							<span class="small mono">{message.kind} · {message.attempts} attempts</span>
							<span class="small faint">{message.lastError}</span>
						</li>
					{/each}
				</ul>
				<button
					type="button"
					disabled={busy}
					onclick={() =>
						void run(
							async () => void (await retryDead({ outboxIds: queue.dead.map((m) => m.outboxId) }))
						)}
				>
					Retry all {queue.dead.length}
				</button>
			{:else}
				<p class="small muted">Nothing has been given up on.</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.admin h2 {
		font-size: var(--text-lg);
	}
	.admin h3 {
		margin-block-start: var(--space-3);
	}

	.tight {
		gap: var(--space-1);
	}

	/* Mobile first: one column of fields, more once there is room. */
	.fields {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
	}

	@media (min-width: 40rem) {
		.fields {
			grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		}
	}

	.fields label,
	.admin > section > label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
	}

	.scopes {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-3);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.scopes legend {
		padding-inline: var(--space-2);
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		/* A checkbox and its label are one target, and the target is 44px tall. */
		min-block-size: 2.75rem;
	}

	/*
	 * The box itself, not just its label.
	 *
	 * The 44px belongs to the `<label>`, and tapping a label does toggle the
	 * checkbox — so strictly the target is already big enough. But people aim at
	 * the box: a 13px square next to a 44px label invites a miss that feels like
	 * the control is broken rather than like the tap was off.
	 *
	 * `accent-color` tints the native control instead of replacing it with a
	 * `<div>`. A custom checkbox has to reimplement focus, the indeterminate
	 * state, high-contrast mode and every screen reader's expectations; this is
	 * one line and gets all of them right.
	 */
	.check input {
		inline-size: 1.15rem;
		block-size: 1.15rem;
		min-block-size: auto;
		accent-color: var(--accent);
	}

	.instruments {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
	}

	@media (min-width: 48rem) {
		.instruments {
			grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		}
	}

	.instrument {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-3);
	}

	.instrument header {
		justify-content: space-between;
		align-items: flex-start;
	}

	.phases {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.phase-button {
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-2);
		min-block-size: 2.25rem;
	}

	.phase-button.current {
		border-color: var(--accent);
		color: var(--accent);
	}

	.phase[data-phase='continuous'] {
		color: var(--bid);
		border-color: var(--bid);
	}
	.phase[data-phase='halted'],
	.phase[data-phase='closed'] {
		color: var(--ask);
		border-color: var(--ask);
	}
	.phase[data-phase='auction'] {
		color: var(--warn);
		border-color: var(--warn);
	}

	.minted {
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		padding: var(--space-3);
	}

	.secret {
		display: block;
		background: var(--bg);
		border-radius: var(--radius);
		padding: var(--space-2);
		font-size: var(--text-sm);
		/* Long, and must be selectable in one go rather than scrolled. */
		word-break: break-all;
	}

	.endpoints,
	.dead {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.endpoint {
		border-inline-start: 2px solid var(--line);
		padding-inline-start: var(--space-3);
		gap: var(--space-1);
	}

	.endpoint .row {
		justify-content: space-between;
	}
	.url {
		word-break: break-all;
	}

	.dead li {
		border-inline-start: 2px solid var(--ask);
		padding-inline-start: var(--space-3);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-3);
	}

	@media (min-width: 40rem) {
		.stats {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.stat {
		display: flex;
		flex-direction: column;
	}
	.big {
		font-size: var(--text-xl);
	}
	.stat.bad .big {
		color: var(--ask);
	}

	.revoked {
		opacity: 0.5;
	}

	.total-row td {
		border-block-start: 2px solid var(--line);
		border-block-end: none;
	}

	.flags {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.flag {
		border-inline-start: 2px solid var(--line);
		padding-inline-start: var(--space-3);
		gap: var(--space-1);
	}

	.flag .row {
		justify-content: space-between;
	}

	.level[data-level='ok'] {
		color: var(--bid);
		border-color: var(--bid);
	}
	.level[data-level='degraded'] {
		color: var(--warn);
		border-color: var(--warn);
	}
	.level[data-level='down'] {
		color: var(--ask);
		border-color: var(--ask);
	}

	.invoices {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.invoices li {
		justify-content: space-between;
	}

	.badge.stopped,
	.down {
		color: var(--ask);
	}
	.badge.stopped {
		border-color: var(--ask);
	}
	.badge.warn {
		color: var(--warn);
		border-color: var(--warn);
	}

	.error {
		color: var(--ask);
		border: 1px solid var(--ask);
		border-radius: var(--radius);
		padding: var(--space-2);
	}
</style>
