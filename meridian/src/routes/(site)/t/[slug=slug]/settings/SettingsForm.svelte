<script lang="ts">
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { errorMessage } from '#lib/ui/errors.ts';
	import { ArrowLeftIcon, LinkIcon, LockSimpleIcon } from 'phosphor-svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { href } from '#lib/href.ts';
	import { CURRENCIES } from '#lib/domain/money.ts';
	import type { Visibility } from '#lib/domain/schemas.ts';
	import { tripBySlug, updateTrip } from '#lib/remote/trips.remote.ts';
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
			toast.success(m.trip_saved());
		} catch (error) {
			toast.error(errorMessage(error));
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
		<p class="back">
			<a class="btn btn--ghost btn--sm" href={href('/(site)/t/[slug=slug]', { slug: trip.slug })}>
				<ArrowLeftIcon size={14} aria-hidden="true" />
				{trip.name}
			</a>
		</p>
		<h1 class="title-page">{m.trip_settings()}</h1>
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

		<!--
			Who can see it, as two cards to choose between rather than two
			radios in a row: each carries an icon and a line that says what it
			means, and `:has(:checked)` paints the chosen one. The label texts
			are exactly the message strings, which the end-to-end suite uses.
		-->
		<fieldset class="field">
			<legend class="label">{m.trip_visibility()}</legend>
			<div class="choices">
				<label class="choice">
					<input
						class="radio"
						type="radio"
						name="visibility"
						value="private"
						bind:group={visibility}
					/>
					<LockSimpleIcon size={20} aria-hidden="true" class="choice__icon" />
					<span class="choice__text">
						<span class="choice__title">{m.trip_visibility_private()}</span>
						<span class="choice__desc">{m.trip_visibility_private_desc()}</span>
					</span>
				</label>
				<label class="choice">
					<input
						class="radio"
						type="radio"
						name="visibility"
						value="link"
						bind:group={visibility}
					/>
					<LinkIcon size={20} aria-hidden="true" class="choice__icon" />
					<span class="choice__text">
						<span class="choice__title">{m.trip_visibility_link()}</span>
						<span class="choice__desc">{m.trip_visibility_link_desc()}</span>
					</span>
				</label>
			</div>
		</fieldset>

		<div class="actions">
			<button class="btn btn--primary" type="submit" disabled={saving}>{m.trip_save()}</button>
		</div>
	</form>
</section>

<style>
	.settings {
		max-width: 40rem;
		padding-block: var(--space-6) var(--space-6);
	}

	.back {
		margin-inline-start: calc(-1 * var(--space-3));
	}

	.choices {
		display: grid;
		gap: var(--space-2);
	}

	/*
	 * The radio and the icon line up with the title, the first line, not
	 * with the middle of a description that wraps to two or three lines on
	 * a phone: `start`, and nudged down to sit on the title's line.
	 */
	.choice {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr);
		align-items: start;
		gap: var(--space-3);
		min-height: var(--control);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--line-2);
		border-radius: var(--radius);
		background: var(--paper-2);
		cursor: pointer;
		transition:
			background-color var(--dur-2) var(--ease-out),
			border-color var(--dur-2) var(--ease-out);
	}

	.choice:hover {
		border-color: var(--line-3);
	}

	.choice:has(:checked) {
		background: var(--sea-soft);
		border-color: var(--sea);
	}

	.choice :global(.radio) {
		margin-block-start: 0.2em;
	}

	.choice :global(.choice__icon) {
		margin-block-start: 0.15em;
		color: var(--ink-3);
	}

	.choice:has(:checked) :global(.choice__icon) {
		color: var(--sea);
	}

	.choice__text {
		display: grid;
		gap: var(--space-0);
	}

	.choice__title {
		font-weight: 500;
	}

	.choice__desc {
		color: var(--ink-2);
		font-size: var(--text-sm);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
