<script lang="ts">
	import { EyeIcon, EyeSlashIcon } from 'phosphor-svelte';
	import Alert from '#lib/components/Alert.svelte';
	import Button from '#lib/components/Button.svelte';
	import Field from '#lib/components/Field.svelte';
	import { stagger } from '#lib/motion/index.ts';
	import { formatDuration, formatMoney } from '#lib/time/index.ts';
	import { getServices, saveService, setServiceActive } from '../studio.remote.ts';
	import type { LayoutData } from '../$types';
	import { messageFrom } from '#lib/errors.ts';

	let { data }: { data: LayoutData } = $props();

	const services = $derived(await getServices(data.slug));

	let editing = $state<string | null>(null);
	let lastError = $state<string | null>(null);

	async function toggle(serviceId: string, isActive: boolean) {
		lastError = null;
		try {
			// The handler calls `getServices(slug).refresh()`, so the updated list
			// comes back with this response rather than in a second round trip.
			await setServiceActive({ slug: data.slug, serviceId, isActive });
		} catch (thrown) {
			lastError = messageFrom(thrown, 'Could not update that service.');
		}
	}
</script>

<svelte:head>
	<title>{data.business.name} — services</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container page">
	<header>
		<h2>Services</h2>
		<p class="text-muted">
			What customers can book, how long it takes, and what it costs. Durations must be a multiple of
			five minutes — that is the grid the diary is built on.
		</p>
	</header>

	{#if lastError}
		<Alert tone="error" title="That did not work"><p>{lastError}</p></Alert>
	{/if}

	<ul class="list" role="list" {@attach stagger({ y: 8, each: 0.04, onView: false })}>
		{#each services as entry (entry.id)}
			<!--
				`.for(id)` gives each row its own form instance. Without it every row
				shares one set of fields, so typing in the third card fills the first,
				and a validation error appears on all of them at once.
			-->
			{@const editForm = saveService.for(entry.id)}
			<li class="card" class:inactive={!entry.isActive}>
				<div class="summary">
					<div class="titles">
						<h3>{entry.name}</h3>
						<p class="meta text-muted">
							{formatDuration(entry.durationMinutes)}
							{#if entry.bufferAfterMinutes > 0}
								<span class="text-faint">
									(+{entry.bufferAfterMinutes} min tidy-up)
								</span>
							{/if}
							·
							{entry.priceCents === 0
								? 'Free'
								: formatMoney(entry.priceCents, data.business.currency)}
						</p>
						{#if entry.description}<p class="desc text-muted">{entry.description}</p>{/if}
					</div>

					<div class="row-actions">
						<button
							type="button"
							class="visibility"
							class:on={entry.isActive}
							onclick={() => void toggle(entry.id, !entry.isActive)}
							aria-label={entry.isActive
								? `Hide ${entry.name} from the booking page`
								: `Show ${entry.name} on the booking page`}
						>
							{#if entry.isActive}
								<EyeIcon weight="bold" aria-hidden="true" /> Live
							{:else}
								<EyeSlashIcon weight="bold" aria-hidden="true" /> Hidden
							{/if}
						</button>

						<Button
							size="sm"
							variant="secondary"
							onclick={() => (editing = editing === entry.id ? null : entry.id)}
						>
							{editing === entry.id ? 'Close' : 'Edit'}
						</Button>
					</div>
				</div>

				{#if editing === entry.id}
					<form {...editForm} class="edit stack">
						<input {...editForm.fields.slug.as('hidden', data.slug)} />
						<input {...editForm.fields.serviceId.as('hidden', entry.id)} />

						<Field label="Name" required error={editForm.fields.name.issues()?.[0]?.message}>
							{#snippet children({ id, describedBy, invalid })}
								<input
									{...editForm.fields.name.as('text', entry.name)}
									{id}
									aria-describedby={describedBy}
									aria-invalid={invalid}
								/>
							{/snippet}
						</Field>

						<Field label="Description" error={editForm.fields.description.issues()?.[0]?.message}>
							{#snippet children({ id, describedBy, invalid })}
								<textarea
									{...editForm.fields.description.as('text', entry.description ?? '')}
									{id}
									aria-describedby={describedBy}
									aria-invalid={invalid}
									rows="2"></textarea>
							{/snippet}
						</Field>

						<div class="numbers">
							<Field
								label="Minutes"
								required
								hint="A multiple of 5"
								error={editForm.fields.durationMinutes.issues()?.[0]?.message}
							>
								{#snippet children({ id, describedBy, invalid })}
									<input
										{...editForm.fields.durationMinutes.as('number', entry.durationMinutes)}
										{id}
										aria-describedby={describedBy}
										aria-invalid={invalid}
										min="5"
										max="480"
										step="5"
									/>
								{/snippet}
							</Field>

							<Field
								label="Tidy-up"
								hint="Blocked, not sold"
								error={editForm.fields.bufferAfterMinutes.issues()?.[0]?.message}
							>
								{#snippet children({ id, describedBy, invalid })}
									<input
										{...editForm.fields.bufferAfterMinutes.as('number', entry.bufferAfterMinutes)}
										{id}
										aria-describedby={describedBy}
										aria-invalid={invalid}
										min="0"
										max="120"
										step="5"
									/>
								{/snippet}
							</Field>

							<Field
								label="Price"
								required
								hint={data.business.currency}
								error={editForm.fields.price.issues()?.[0]?.message}
							>
								{#snippet children({ id, describedBy, invalid })}
									<input
										{...editForm.fields.price.as('number', entry.priceCents / 100)}
										{id}
										aria-describedby={describedBy}
										aria-invalid={invalid}
										min="0"
										step="0.01"
									/>
								{/snippet}
							</Field>
						</div>

						<label class="checkbox">
							<input {...editForm.fields.isActive.as('checkbox')} checked={entry.isActive} />
							Show on the booking page
						</label>

						{#if editForm.result?.saved}
							<Alert tone="success"><p>Saved.</p></Alert>
						{/if}

						<Button type="submit" loading={editForm.pending > 0}>Save changes</Button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	h2 {
		font-size: var(--text-lg);
	}

	header p {
		margin-block-start: var(--space-2);
		font-size: var(--text-sm);
	}

	.list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.list li + li {
		margin: 0;
	}

	.card {
		padding: var(--space-4);
		background: var(--surface);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-lg);
	}

	.inactive {
		background: var(--surface-sunken);
	}

	.inactive .titles {
		opacity: 0.65;
	}

	.summary {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	h3 {
		font-size: var(--text-md);
	}

	.meta,
	.desc {
		font-size: var(--text-sm);
		margin-block-start: var(--space-1);
		max-width: none;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.visibility {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		min-height: 2.25rem;

		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);

		border: var(--border) solid var(--line-strong);
		border-radius: var(--radius-pill);
		color: var(--ink-muted);
	}

	.visibility.on {
		color: var(--ok);
		border-color: var(--ok-line);
		background: var(--ok-soft);
	}

	.edit {
		margin-block-start: var(--space-4);
		padding-block-start: var(--space-4);
		border-block-start: var(--border) solid var(--line);
	}

	.numbers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: var(--space-3);
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: var(--weight-regular);
	}
</style>
