<script lang="ts">
	import { resolve } from '$app/paths';
	import { keepTyped } from '#lib/forms/keep-typed.ts';
	import { createKey, deleteView, keys, revokeKey, views } from '#lib/remote/settings.remote.ts';
	import { clock, relative } from '#lib/reactivity/clock.svelte.ts';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	const canAdmin = $derived(data.role === 'owner' || data.role === 'admin');

	// Here in the `<script>`, before the template hydrates: a key's name and scope
	// chosen while the bundle was still loading must survive it arriving.
	keepTyped(createKey.fields.name, createKey.fields.scopes);
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

		<!--
			AN `await` EXPRESSION, NOT AN `{#await}` BLOCK — FOR BOTH LISTS ON THIS PAGE.

			Every form that changes a list refreshes it in the same request: the
			handler calls `.refresh()`, and the new rows come back with the result.
			Both lists used to be `{#await keys(…) then list}` blocks, and those drew
			the rows from before the refresh. The block did run again when the
			refresh landed, and the console said why it came back stale: Svelte's
			`derived_inert` warning, "reading a derived belonging to a now-destroyed
			effect may result in stale values". A key just created stayed missing
			until the page was reloaded.

			The blocks also left this boundary's snippets dead in the browser. A
			boundary waits for `await` expressions, and an `{#await}` block is not
			one: once the page hydrated, the block drew nothing while a list loaded,
			and nothing at all when it failed. With the `await` here, `pending` shows
			until the first rows arrive and `failed` shows if they never do.
		-->
		<svelte:boundary>
			{const list = $derived(await views({ tenant: data.tenant }))}

			{#if list.length === 0}
				<p class="empty">No saved views yet. Save one from the explore page.</p>
			{:else}
				<ul class="list">
					{#each list as saved (saved.id)}
						<!-- One instance per row: see the note in the alerts page. -->
						{const remove = $derived(deleteView.for(saved.id))}
						<li>
							<a
								class="list__main"
								href={resolve(
									`/[tenant]/explore?q=${encodeURIComponent(saved.query)}&range=${encodeURIComponent(saved.range)}`,
									{ tenant: data.tenant }
								)}
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

			{#snippet pending()}
				<p class="empty" role="status">Loading…</p>
			{/snippet}

			{#snippet failed(error)}
				<p class="empty" role="alert">{(error as App.Error).message}</p>
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

			<!-- `await`, not `{#await}`, so creating and revoking redraw it: see the saved views. -->
			<svelte:boundary>
				{const list = $derived(await keys({ tenant: data.tenant }))}

				{#if list.length === 0}
					<p class="empty">No keys yet.</p>
				{:else}
					<ul class="list">
						{#each list as key (key.id)}
							{const revoke = $derived(revokeKey.for(key.id))}
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

				{#snippet pending()}
					<p class="empty" role="status">Loading…</p>
				{/snippet}

				<!--
					What arrives here is SvelteKit's `App.Error`, not the `HttpError` that
					was thrown: its `message` is the server's own, such as "Sign in to
					continue." Every boundary error has been through `handleError`, so there
					is always a message and nothing for a fallback to stand in for.
				-->
				{#snippet failed(error)}
					<p class="empty" role="alert">{(error as App.Error).message}</p>
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
