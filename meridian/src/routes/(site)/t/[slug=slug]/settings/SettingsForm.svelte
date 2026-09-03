<script lang="ts">
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { m } from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import { CURRENCIES } from '#lib/domain/money.ts';
	import type { Visibility } from '#lib/domain/schemas.ts';
	import { deleteTrip, tripBySlug, updateTrip } from '#lib/remote/trips.remote.ts';
	import type { Trip } from '#lib/server/db/schema.ts';
	import DateRangeField from '#lib/ui/DateRangeField.svelte';

	interface Props {
		trip: Trip;
	}

	let { trip }: Props = $props();

	// The fields start from the trip and belong to the form from then on. `untrack` says so
	// out loud: we read the prop once, on purpose, and the page re-creates this form per slug.
	const initial = untrack(() => trip);
	let name = $state(initial.name);
	let description = $state(initial.description);
	let startDate = $state(initial.startDate);
	let endDate = $state(initial.endDate);
	let currency = $state(initial.currency);
	let visibility: Visibility = $state(initial.visibility);
	let saving = $state(false);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		try {
			/*
			 * SINGLE-FLIGHT: `.updates(...)` names the query this page is holding,
			 * so the server refreshes it in the same response and the page —
			 * including the embed section below, which reads the visibility —
			 * has the new trip before the toast appears. No second round trip.
			 */
			await updateTrip({
				id: trip.id,
				name,
				description,
				startDate,
				endDate,
				currency,
				visibility
			}).updates(tripBySlug(trip.slug));
			toast(m.trip_saved());
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{m.trip_settings()} — {trip.name}</title>
</svelte:head>

<section class="container settings stack stack--lg">
	<header class="stack stack--sm">
		<p>
			<a href={localizeHref(resolve('/(site)/t/[slug=slug]', { slug: trip.slug }))}>
				← {trip.name}
			</a>
		</p>
		<h1>{m.trip_settings()}</h1>
	</header>

	<form class="card card--pad stack" onsubmit={save}>
		<label class="field">
			<span class="label">{m.trip_name()}</span>
			<input class="input" bind:value={name} maxlength="80" required />
		</label>
		<label class="field">
			<span class="label">{m.trip_description()}</span>
			<textarea class="textarea" bind:value={description} maxlength="500"></textarea>
		</label>
		<DateRangeField
			label={m.trip_dates()}
			startName="startDate"
			endName="endDate"
			start={startDate}
			end={endDate}
			onchange={(start, end) => {
				startDate = start;
				endDate = end;
			}}
		/>
		<label class="field">
			<span class="label">{m.trip_currency()}</span>
			<select class="select" bind:value={currency}>
				{#each CURRENCIES as code (code)}
					<option value={code}>{code}</option>
				{/each}
			</select>
		</label>

		<fieldset class="field">
			<legend class="label">{m.trip_visibility()}</legend>
			<label class="radio">
				<input type="radio" name="visibility" value="private" bind:group={visibility} />
				{m.trip_visibility_private()}
			</label>
			<label class="radio">
				<input type="radio" name="visibility" value="link" bind:group={visibility} />
				{m.trip_visibility_link()}
			</label>
		</fieldset>

		<div>
			<button class="btn btn--primary" type="submit" disabled={saving}>{m.trip_save()}</button>
		</div>
	</form>

	<!-- A remote form: deleting works with JavaScript off, and asks first when it is on. -->
	<form
		class="card card--pad cluster cluster--between"
		{...deleteTrip}
		onsubmit={(event) => {
			if (!confirm(m.trip_delete_confirm())) event.preventDefault();
		}}
	>
		<input {...deleteTrip.fields.id.as('hidden', trip.id)} />
		<span class="muted">{m.trip_delete_confirm()}</span>
		<button class="btn btn--danger" type="submit">{m.trip_delete()}</button>
	</form>
</section>

<style>
	.settings {
		max-width: 40rem;
		padding-block: var(--space-6) var(--space-8);
	}

	.radio {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
</style>
