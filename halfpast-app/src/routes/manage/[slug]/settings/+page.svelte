<script lang="ts">
	import Alert from '#lib/components/Alert.svelte';
	import Button from '#lib/components/Button.svelte';
	import Field from '#lib/components/Field.svelte';
	import { COMMON_TIME_ZONES } from '#lib/time/index.ts';
	import { getSettings, saveSettings } from '../studio.remote.ts';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	const settings = $derived(await getSettings(data.slug));

	/**
	 * The studio's own zone always appears in the list, even if it is not one of
	 * the common ones. Otherwise a studio in Kathmandu opens this page and finds
	 * the dropdown has silently reset them to London.
	 */
	const zones = $derived(
		COMMON_TIME_ZONES.includes(settings.timeZone as (typeof COMMON_TIME_ZONES)[number])
			? COMMON_TIME_ZONES
			: [settings.timeZone, ...COMMON_TIME_ZONES]
	);
</script>

<svelte:head>
	<title>{data.business.name} — settings</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="container-narrow page">
	<header>
		<h2>Settings</h2>
		<p class="text-muted">How the studio appears, and the rules customers book under.</p>
	</header>

	<form {...saveSettings} class="stack stack-lg">
		<input {...saveSettings.fields.slug.as('hidden', data.slug)} />

		{#if saveSettings.result?.saved}
			<Alert tone="success"><p>Settings saved.</p></Alert>
		{/if}

		{#if saveSettings.fields.allIssues()?.length}
			<Alert tone="error" title="Please check the form">
				<p>Some of these need another look.</p>
			</Alert>
		{/if}

		<fieldset class="group stack">
			<legend>The studio</legend>

			<Field label="Name" required error={saveSettings.fields.name.issues()?.[0]?.message}>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{...saveSettings.fields.name.as('text', settings.name)}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
					/>
				{/snippet}
			</Field>

			<Field label="Tagline" error={saveSettings.fields.tagline.issues()?.[0]?.message}>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{...saveSettings.fields.tagline.as('text', settings.tagline ?? '')}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
					/>
				{/snippet}
			</Field>

			<Field label="Description" error={saveSettings.fields.description.issues()?.[0]?.message}>
				{#snippet children({ id, describedBy, invalid })}
					<textarea
						{...saveSettings.fields.description.as('text', settings.description ?? '')}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
						rows="3"></textarea>
				{/snippet}
			</Field>

			<Field
				label="Time zone"
				required
				hint="Opening hours are read in this zone. Changing it re-interprets every shift."
				error={saveSettings.fields.timeZone.issues()?.[0]?.message}
			>
				{#snippet children({ id, describedBy, invalid })}
					<select
						{...saveSettings.fields.timeZone.as('select')}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
					>
						{#each zones as zone (zone)}
							<option value={zone} selected={zone === settings.timeZone}>{zone}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
		</fieldset>

		<fieldset class="group stack">
			<legend>Contact</legend>

			<Field label="Email" required error={saveSettings.fields.email.issues()?.[0]?.message}>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{...saveSettings.fields.email.as('email', settings.email)}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
					/>
				{/snippet}
			</Field>

			<Field label="Phone" error={saveSettings.fields.phone.issues()?.[0]?.message}>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{...saveSettings.fields.phone.as('tel', settings.phone ?? '')}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
					/>
				{/snippet}
			</Field>

			<Field label="Address" error={saveSettings.fields.addressLine.issues()?.[0]?.message}>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{...saveSettings.fields.addressLine.as('text', settings.addressLine ?? '')}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
					/>
				{/snippet}
			</Field>

			<div class="pair">
				<Field label="Town or city" error={saveSettings.fields.city.issues()?.[0]?.message}>
					{#snippet children({ id, describedBy, invalid })}
						<input
							{...saveSettings.fields.city.as('text', settings.city ?? '')}
							{id}
							aria-describedby={describedBy}
							aria-invalid={invalid}
						/>
					{/snippet}
				</Field>

				<Field label="Postcode" error={saveSettings.fields.postcode.issues()?.[0]?.message}>
					{#snippet children({ id, describedBy, invalid })}
						<input
							{...saveSettings.fields.postcode.as('text', settings.postcode ?? '')}
							{id}
							aria-describedby={describedBy}
							aria-invalid={invalid}
						/>
					{/snippet}
				</Field>
			</div>
		</fieldset>

		<fieldset class="group stack">
			<legend>Booking rules</legend>

			<Field
				label="Notice required"
				required
				hint="Minutes. Stops somebody booking a cut for four minutes from now."
				error={saveSettings.fields.minNoticeMinutes.issues()?.[0]?.message}
			>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{...saveSettings.fields.minNoticeMinutes.as('number', settings.minNoticeMinutes)}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
						min="0"
						max="20160"
					/>
				{/snippet}
			</Field>

			<Field
				label="Book up to"
				required
				hint="Days ahead the diary is open."
				error={saveSettings.fields.maxAdvanceDays.issues()?.[0]?.message}
			>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{...saveSettings.fields.maxAdvanceDays.as('number', settings.maxAdvanceDays)}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
						min="1"
						max="365"
					/>
				{/snippet}
			</Field>

			<Field
				label="Free cancellation"
				required
				hint="Hours before the appointment. After that they have to ring."
				error={saveSettings.fields.cancellationNoticeHours.issues()?.[0]?.message}
			>
				{#snippet children({ id, describedBy, invalid })}
					<input
						{...saveSettings.fields.cancellationNoticeHours.as(
							'number',
							settings.cancellationNoticeHours
						)}
						{id}
						aria-describedby={describedBy}
						aria-invalid={invalid}
						min="0"
						max="720"
					/>
				{/snippet}
			</Field>
		</fieldset>

		<Button type="submit" size="lg" loading={saveSettings.pending > 0}>Save settings</Button>
	</form>
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

	.group {
		padding: var(--space-5);
		background: var(--surface);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-lg);
	}

	legend {
		padding-inline: var(--space-2);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		font-weight: var(--weight-semibold);
		color: var(--ink-muted);
		margin-block-end: 0;
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: var(--space-3);
	}
</style>
