<script lang="ts">
	import Alert from '#lib/components/Alert.svelte';
	import { stagger } from '#lib/motion/index.ts';
	import { getServices, getTeam, setStaffService } from '../studio.remote.ts';
	import type { LayoutData } from '../$types';
	import { messageFrom } from '#lib/errors.ts';

	let { data }: { data: LayoutData } = $props();

	const team = $derived(await getTeam(data.slug));
	const services = $derived(await getServices(data.slug));

	let lastError = $state<string | null>(null);

	async function toggle(staffId: string, serviceId: string, offers: boolean) {
		lastError = null;
		try {
			await setStaffService({ slug: data.slug, staffId, serviceId, offers });
		} catch (thrown) {
			lastError = messageFrom(thrown, 'Could not change that.');
		}
	}
</script>

<svelte:head>
	<title>{data.business.name} — team</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container page">
	<header>
		<h2>Team</h2>
		<p class="text-muted">
			Who works here and what each of them offers. A customer choosing “anyone” is offered whoever
			can do the job and is free.
		</p>
	</header>

	{#if lastError}
		<Alert tone="error" title="That did not work"><p>{lastError}</p></Alert>
	{/if}

	<ul class="list" role="list" {@attach stagger({ y: 8, each: 0.05, onView: false })}>
		{#each team as member (member.id)}
			<li class="card" class:inactive={!member.isActive} style="--hue: {member.colourHue}">
				<div class="head">
					<div>
						<h3>{member.displayName}</h3>
						<p class="role text-muted">
							{member.role === 'owner' ? 'Owner' : 'Staff'}
							{#if !member.isActive}· not taking bookings{/if}
						</p>
					</div>
				</div>

				{#if member.bio}<p class="bio text-muted">{member.bio}</p>{/if}

				<fieldset class="offers">
					<legend>Offers</legend>
					{#each services as entry (entry.id)}
						{@const offers = member.serviceIds.includes(entry.id)}
						<label class="chip" class:on={offers}>
							<input
								type="checkbox"
								checked={offers}
								onchange={(event) => void toggle(member.id, entry.id, event.currentTarget.checked)}
							/>
							{entry.name}
						</label>
					{/each}
				</fieldset>
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

	h3 {
		font-size: var(--text-md);
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
		border-inline-start: 4px solid oklch(60% 0.14 var(--hue));
		border-radius: var(--radius-lg);
	}

	.inactive {
		opacity: 0.7;
	}

	.role,
	.bio {
		font-size: var(--text-sm);
		margin-block-start: var(--space-1);
		max-width: none;
	}

	.offers {
		margin-block-start: var(--space-4);
	}

	legend {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--ink-muted);
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0 var(--space-2) var(--space-2) 0;
		padding: var(--space-2) var(--space-3);
		min-height: 2.5rem;

		background: var(--surface-sunken);
		border: var(--border) solid var(--line-strong);
		border-radius: var(--radius-pill);
		font-size: var(--text-sm);
		font-weight: var(--weight-regular);
		cursor: pointer;

		transition:
			background-color var(--dur-fast) var(--ease-standard),
			border-color var(--dur-fast) var(--ease-standard),
			color var(--dur-fast) var(--ease-standard);
	}

	.chip.on {
		background: var(--accent-soft);
		border-color: var(--accent-line);
		color: var(--accent-strong);
	}

	/* The checkbox stays real — focusable and announced — but the chip carries
	 * the visuals, so the native box would be redundant next to it. */
	.chip input {
		width: 1rem;
		height: 1rem;
	}
</style>
