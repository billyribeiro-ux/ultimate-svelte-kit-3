<script lang="ts">
	import { createKey, deleteView, keys, revokeKey, views } from '#lib/remote/settings.remote.ts';
	import { clock, relative } from '#lib/reactivity/clock.svelte.ts';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	const canAdmin = $derived(data.role === 'owner' || data.role === 'admin');
</script>

<svelte:head>
	<title>Settings · {data.tenant} · Sextant</title>
</svelte:head>

<div class="page">
	<h1>Settings</h1>

	<section aria-labelledby="views-heading">
		<h2 id="views-heading">Saved views</h2>
		<p class="lede">
			A saved view keeps the range <em>as it was written</em> — “the last six hours”, not the six hours
			that happened to be current when it was saved.
		</p>

		<svelte:boundary>
			{#await views({ tenant: data.tenant }) then list}
				{#if list.length === 0}
					<p class="empty">No saved views yet. Save one from the explore page.</p>
				{:else}
					<ul class="list">
						{#each list as saved (saved.id)}
							<!-- One instance per row: see the note in the alerts page. -->
							{@const remove = deleteView.for(saved.id)}
							<li>
								<a
									class="list__main"
									href="/{data.tenant}/explore?q={encodeURIComponent(
										saved.query
									)}&range={encodeURIComponent(saved.range)}"
								>
									<strong>{saved.name}</strong>
									<span class="mono truncate">{saved.query}</span>
								</a>

								<form {...remove}>
									<input {...remove.fields.tenant.as('hidden', data.tenant)} />
									<input {...remove.fields.id.as('hidden', saved.id)} />
									<button type="submit" class="btn btn--sm btn--ghost">Remove</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			{/await}

			{#snippet pending()}
				<p class="empty" role="status">Loading…</p>
			{/snippet}

			{#snippet failed()}
				<p class="empty" role="alert">Could not load saved views.</p>
			{/snippet}
		</svelte:boundary>
	</section>

	<section aria-labelledby="keys-heading">
		<h2 id="keys-heading">API keys</h2>

		{#if !canAdmin}
			<p class="empty">
				Only workspace admins can see API keys. Knowing which integrations exist is itself worth
				restricting.
			</p>
		{:else}
			<p class="lede">
				A key is shown once, when it is created, and never again — because a system that can show
				you a key again is one where the key is readable at rest.
			</p>

			<form {...createKey} class="new-key">
				<input {...createKey.fields.tenant.as('hidden', data.tenant)} />

				<div class="field">
					<label for="key-name">Name</label>
					<input
						id="key-name"
						class="input"
						required
						placeholder="prod collector"
						{...createKey.fields.name.as('text')}
					/>
				</div>

				<div class="field">
					<label for="key-scope">Scope</label>
					<!-- The reset target after a key is minted, stated rather than inferred. -->
					<select
						id="key-scope"
						class="select"
						{...createKey.fields.scopes.as('select', 'ingest')}
						defaultValue="ingest"
					>
						<option value="ingest">ingest — write telemetry</option>
						<option value="read">read — run queries</option>
					</select>
					<p class="field__hint">
						Separate, because a collector and a dashboard are different machines. One combined scope
						is how a compromised collector becomes a data breach.
					</p>
				</div>

				<button type="submit" class="btn btn--primary">Create key</button>

				{#if createKey.result?.key}
					<!--
						The only time the clear value exists outside the caller's memory.

						`role="alert"` because it must be announced, and the copy button because
						a value nobody can select is a value nobody can use.
					-->
					<div class="revealed" role="alert">
						<p><strong>Copy this now.</strong> It will not be shown again.</p>
						<code class="mono">{createKey.result.key}</code>
						<button
							type="button"
							class="btn btn--sm"
							onclick={() => navigator.clipboard?.writeText(createKey.result?.key ?? '')}
						>
							Copy
						</button>
					</div>
				{/if}
			</form>

			<svelte:boundary>
				{#await keys({ tenant: data.tenant }) then list}
					{#if list.length === 0}
						<p class="empty">No keys yet.</p>
					{:else}
						<ul class="list">
							{#each list as key (key.id)}
								{@const revoke = revokeKey.for(key.id)}
								<li>
									<div class="list__main">
										<strong>{key.name}</strong>
										<span class="mono">{key.prefix}… · {key.scopes}</span>
										<span class="meta">
											{#if key.revokedAt}
												revoked {relative(key.revokedAt.getTime(), clock.now)}
											{:else if key.lastUsedAt}
												last used {relative(key.lastUsedAt.getTime(), clock.now)}
											{:else}
												never used
											{/if}
										</span>
									</div>

									{#if !key.revokedAt}
										<form {...revoke}>
											<input {...revoke.fields.tenant.as('hidden', data.tenant)} />
											<input {...revoke.fields.id.as('hidden', key.id)} />
											<button type="submit" class="btn btn--sm btn--danger">Revoke</button>
										</form>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				{/await}

				{#snippet pending()}
					<p class="empty" role="status">Loading…</p>
				{/snippet}

				{#snippet failed(error)}
					<p class="empty" role="alert">
						{(error as { body?: { message?: string } })?.body?.message ?? 'Could not load keys.'}
					</p>
				{/snippet}
			</svelte:boundary>
		{/if}
	</section>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-3);
		max-width: 56rem;
		width: 100%;
	}

	h1 {
		margin: 0;
		font-size: var(--fs-lg);
	}

	h2 {
		margin: 0 0 var(--space-1);
		font-size: var(--fs-md);
	}

	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.lede {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.list li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	.list li:last-child {
		border-bottom: 0;
	}

	.list__main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
		color: var(--text);
		text-decoration: none;
		font-size: var(--fs-sm);
	}

	a.list__main:hover strong {
		color: var(--accent);
	}

	.list__main .mono,
	.meta {
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}

	.new-key {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		align-items: end;
	}

	.revealed {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		background: var(--ok-bg);
		border-radius: var(--radius-md);
		font-size: var(--fs-sm);
	}

	.revealed p {
		margin: 0;
		flex-basis: 100%;
	}

	.revealed code {
		overflow-wrap: anywhere;
	}

	.empty {
		margin: 0;
		padding: var(--space-4);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	@media (min-width: 48rem) {
		.new-key {
			grid-template-columns: 1fr 1fr auto;
		}

		.revealed {
			grid-column: 1 / -1;
		}
	}
</style>
