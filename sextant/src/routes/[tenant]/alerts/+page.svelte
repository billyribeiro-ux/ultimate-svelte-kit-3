<script lang="ts">
	import { deleteRule, rules, saveRule, toggleRule } from '#lib/remote/alerts.remote.ts';
	import { clock, relative } from '#lib/reactivity/clock.svelte.ts';
	import { formatDuration } from '#lib/time/range.ts';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	/** The rule being edited, or `null` for the new-rule form. */
	let editing = $state<string | null>(null);
	let creating = $state(false);

	const list = $derived(await rules({ tenant: data.tenant }));

	/**
	 * How stale an evaluation may be before it is worth saying so.
	 *
	 * Three intervals. One missed tick is a slow query; three is an evaluator that
	 * has stopped, and an alert that is not being evaluated is not an alert —
	 * showing it as "ok" would be the most dangerous thing this page could do.
	 */
	function stale(evaluatedAt: number, intervalMs: number, now: number): boolean {
		return evaluatedAt > 0 && now - evaluatedAt > intervalMs * 3;
	}

	function stateOf(rule: (typeof list)[number], now: number): { label: string; tone: string } {
		if (!rule.enabled) return { label: 'Disabled', tone: '' };
		if (rule.evaluatedAt === 0) return { label: 'Not yet evaluated', tone: '' };
		if (stale(rule.evaluatedAt, rule.intervalMs, now)) {
			return { label: 'Evaluation is behind', tone: 'chip--warn' };
		}
		if (rule.state === 'firing') return { label: 'Firing', tone: 'chip--danger' };
		if (rule.state === 'pending') return { label: 'Pending', tone: 'chip--warn' };
		return { label: 'OK', tone: 'chip--ok' };
	}
</script>

<svelte:head>
	<title>Alerts · {data.tenant} · Sextant</title>
</svelte:head>

<div class="page">
	<header class="page__head">
		<h1>Alerts</h1>
		<button
			type="button"
			class="btn btn--primary btn--sm"
			onclick={() => {
				creating = !creating;
				editing = null;
			}}
		>
			{creating ? 'Cancel' : 'New rule'}
		</button>
	</header>

	{#if creating}
		{@render ruleForm(null)}
	{/if}

	<svelte:boundary>
		{#if list.length === 0}
			<p class="empty">
				No rules yet. A rule runs a query on a schedule and fires when the first number it returns
				crosses a threshold.
			</p>
		{:else}
			<ul class="rules">
				{#each list as rule (rule.id)}
					{@const state = stateOf(rule, clock.now)}
					<li class="rule">
						<div class="rule__head">
							<span class="chip {state.tone}">{state.label}</span>
							<h2>{rule.name}</h2>

							<div class="rule__actions">
								<!--
									A checkbox, not a switch made of two divs.

									It is announced correctly, it is reachable with Tab, it toggles
									with Space, and the label is associated with it. Every one of
									those is work to rebuild and easy to get subtly wrong.
								-->
								<label class="toggle">
									<input
										type="checkbox"
										checked={rule.enabled}
										onchange={(event) =>
											toggleRule({
												tenant: data.tenant,
												id: rule.id,
												enabled: event.currentTarget.checked
											})}
									/>
									<span>Enabled</span>
								</label>

								<button
									type="button"
									class="btn btn--sm"
									onclick={() => {
										editing = editing === rule.id ? null : rule.id;
										creating = false;
									}}
								>
									{editing === rule.id ? 'Close' : 'Edit'}
								</button>

								<form {...deleteRule}>
									<input type="hidden" name="tenant" value={data.tenant} />
									<input type="hidden" name="id" value={rule.id} />
									<button type="submit" class="btn btn--sm btn--danger">Delete</button>
								</form>
							</div>
						</div>

						<p class="rule__query mono truncate" title={rule.query}>{rule.query}</p>

						<dl class="rule__facts">
							<div>
								<dt>Fires</dt>
								<dd>
									{rule.direction}
									{rule.threshold}
									{#if rule.forMs > 0}for {formatDuration(rule.forMs)}{/if}
								</dd>
							</div>
							{#if rule.clearsAt !== null}
								<div>
									<dt>Clears</dt>
									<dd>{rule.direction === 'above' ? 'below' : 'above'} {rule.clearsAt}</dd>
								</div>
							{/if}
							<div>
								<dt>Window</dt>
								<dd>{formatDuration(rule.windowMs)}</dd>
							</div>
							<div>
								<dt>Last value</dt>
								<dd>{rule.value === null ? 'no data' : rule.value.toLocaleString()}</dd>
							</div>
							<div>
								<dt>Evaluated</dt>
								<dd>
									{rule.evaluatedAt === 0 ? 'never' : relative(rule.evaluatedAt, clock.now)}
								</dd>
							</div>
							{#if rule.state === 'firing' && rule.firingSince}
								<div>
									<dt>Firing for</dt>
									<dd>{formatDuration(clock.now - rule.firingSince)}</dd>
								</div>
							{/if}
						</dl>

						{#if editing === rule.id}
							{@render ruleForm(rule)}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#snippet pending()}
			<p class="empty" role="status">Loading rules…</p>
		{/snippet}

		{#snippet failed(error)}
			<p class="empty" role="alert">
				{(error as { body?: { message?: string } })?.body?.message ?? 'Could not load the rules.'}
			</p>
		{/snippet}
	</svelte:boundary>
</div>

<!--
	ONE FORM SNIPPET FOR CREATE AND EDIT.

	Two forms would be two places to add a field to and one place to forget. The
	only difference between them is a hidden `id`, which is exactly what the server
	branches on.
-->
{#snippet ruleForm(rule: (typeof list)[number] | null)}
	<form {...saveRule} class="form">
		<input type="hidden" name="tenant" value={data.tenant} />
		<input type="hidden" name="id" value={rule?.id ?? ''} />

		<div class="field">
			<label for="name-{rule?.id ?? 'new'}">Name</label>
			<input
				id="name-{rule?.id ?? 'new'}"
				name="name"
				class="input"
				required
				value={rule?.name ?? ''}
				placeholder="Checkout error rate"
			/>
		</div>

		<div class="field field--wide">
			<label for="query-{rule?.id ?? 'new'}">Query</label>
			<input
				id="query-{rule?.id ?? 'new'}"
				name="query"
				class="input mono"
				required
				value={rule?.query ?? 'from logs | where level == "error" | summarize n = count()'}
			/>
			<p class="field__hint">
				The first numeric column of the first row is the value under test. A query that returns no
				rows means <strong>no data</strong>, which holds the rule's state rather than resolving it.
			</p>
		</div>

		<div class="field">
			<label for="direction-{rule?.id ?? 'new'}">Fires when the value is</label>
			<select id="direction-{rule?.id ?? 'new'}" name="direction" class="select">
				<option value="above" selected={rule?.direction !== 'below'}>above the threshold</option>
				<option value="below" selected={rule?.direction === 'below'}>below the threshold</option>
			</select>
		</div>

		<div class="field">
			<label for="threshold-{rule?.id ?? 'new'}">Threshold</label>
			<input
				id="threshold-{rule?.id ?? 'new'}"
				name="threshold"
				class="input"
				inputmode="decimal"
				required
				value={rule?.threshold ?? 10}
			/>
		</div>

		<div class="field">
			<label for="clears-{rule?.id ?? 'new'}">Clears at (optional)</label>
			<input
				id="clears-{rule?.id ?? 'new'}"
				name="clearsAt"
				class="input"
				inputmode="decimal"
				value={rule?.clearsAt ?? ''}
			/>
			<p class="field__hint">
				A separate resolve threshold stops a value sitting on the line from firing and resolving on
				alternate evaluations.
			</p>
		</div>

		<div class="field">
			<label for="for-{rule?.id ?? 'new'}">For (minutes)</label>
			<input
				id="for-{rule?.id ?? 'new'}"
				name="forMinutes"
				class="input"
				inputmode="numeric"
				value={(rule?.forMs ?? 0) / 60_000}
			/>
			<p class="field__hint">
				Zero fires on the first crossing. Use it only for things never briefly true.
			</p>
		</div>

		<div class="field">
			<label for="window-{rule?.id ?? 'new'}">Window (minutes)</label>
			<input
				id="window-{rule?.id ?? 'new'}"
				name="windowMinutes"
				class="input"
				inputmode="numeric"
				value={(rule?.windowMs ?? 300_000) / 60_000}
			/>
		</div>

		<div class="form__actions">
			<button type="submit" class="btn btn--primary">{rule ? 'Save changes' : 'Create rule'}</button
			>
		</div>
	</form>
{/snippet}

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3);
		max-width: 68rem;
		width: 100%;
	}

	.page__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-lg);
	}

	h2 {
		margin: 0;
		font-size: var(--fs-md);
	}

	.rules {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.rule {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.rule__head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.rule__actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-inline-start: auto;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.rule__query {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.rule__facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		font-size: var(--fs-xs);
	}

	.rule__facts div {
		display: flex;
		gap: var(--space-1);
	}

	dt {
		color: var(--text-faint);
	}

	dd {
		margin: 0;
		color: var(--text);
		font-family: var(--font-mono);
	}

	.form {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
	}

	.form__actions {
		display: flex;
		justify-content: flex-end;
	}

	.empty {
		padding: var(--space-5);
		margin: 0;
		color: var(--text-muted);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	@media (min-width: 48rem) {
		.form {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.field--wide,
		.form__actions {
			grid-column: 1 / -1;
		}
	}
</style>
