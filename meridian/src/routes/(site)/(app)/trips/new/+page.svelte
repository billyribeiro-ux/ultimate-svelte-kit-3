<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/paraglide/messages.js';
	import { CURRENCIES } from '#lib/domain/money.ts';
	import { places } from '#lib/remote/geo.remote.ts';
	import { createTrip } from '#lib/remote/trips.remote.ts';
	import DateRangeField from '#lib/ui/DateRangeField.svelte';

	/*
	 * `/trips/new?place=lisbon` — the explore page links here — starts the
	 * name off with the place. The gazetteer comes from the prerendered
	 * `places()`, already cached from the page that linked here.
	 */
	const all = await places();
	const suggested = $derived(
		all.find((place) => place.id === page.url.searchParams.get('place'))?.name ?? ''
	);
</script>

<svelte:head>
	<title>{m.trip_new_title()} — {m.app_name()}</title>
</svelte:head>

<section class="container new">
	<!--
		One remote `form`, spread onto a real <form>. The date range is a
		headless picker that writes two hidden ISO inputs named `startDate`
		and `endDate` — the names the schema on the server expects — so the
		same request shape works with JavaScript on or off.
	-->
	<form class="card card--pad stack" {...createTrip}>
		<h1>{m.trip_new_title()}</h1>

		<label class="field">
			<span class="label">{m.trip_name()}</span>
			<input
				class="input"
				{...createTrip.fields.name.as('text', suggested)}
				maxlength="80"
				required
			/>
			{#each createTrip.fields.name.issues() ?? [] as issue (issue.message)}
				<span class="issue">{issue.message}</span>
			{/each}
		</label>

		<label class="field">
			<span class="label">{m.trip_description()}</span>
			<textarea class="textarea" {...createTrip.fields.description.as('text')} maxlength="500"
			></textarea>
		</label>

		<!--
			The picker renders its own hidden inputs; they must carry the names
			SvelteKit expects, which encode the field's type — so the names come
			from `as('hidden', …)`, the same call the form's own inputs use.
		-->
		<DateRangeField
			futureOnly
			label={m.trip_dates()}
			startName={createTrip.fields.startDate.as('hidden', createTrip.fields.startDate.value() ?? '')
				.name}
			endName={createTrip.fields.endDate.as('hidden', createTrip.fields.endDate.value() ?? '').name}
			start={createTrip.fields.startDate.value()}
			end={createTrip.fields.endDate.value()}
			issues={[
				...(createTrip.fields.startDate.issues() ?? []),
				...(createTrip.fields.endDate.issues() ?? [])
			]}
		/>

		<label class="field">
			<span class="label">{m.trip_currency()}</span>
			<select class="select" {...createTrip.fields.currency.as('select')}>
				{#each CURRENCIES as currency (currency)}
					<option value={currency}>{currency}</option>
				{/each}
			</select>
		</label>

		<button class="btn btn--primary" type="submit" disabled={createTrip.pending > 0}>
			{m.trip_create()}
		</button>
	</form>
</section>

<style>
	.new {
		max-width: 36rem;
		padding-block: var(--space-6) var(--space-8);
	}
</style>
