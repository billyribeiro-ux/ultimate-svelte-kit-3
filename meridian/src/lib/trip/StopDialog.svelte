<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { MediaQuery } from 'svelte/reactivity';
	import { XIcon } from 'phosphor-svelte';
	import { toast } from 'svelte-sonner';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { fromIso } from '#lib/domain/dates.ts';
	import { STOP_KINDS, type StopKind } from '#lib/domain/schemas.ts';
	import type { Place } from '#lib/remote/geo.remote.ts';
	import { addStop, moveStop, updateStop } from '#lib/remote/stops.remote.ts';
	import type { Stop } from '#lib/server/db/schema.ts';
	import { KIND_ICONS, KIND_LABELS } from './kinds.ts';
	import PlaceSearch from './PlaceSearch.svelte';

	/**
	 * ADD OR EDIT A STOP
	 * ==================
	 *
	 * One dialog for both, told apart by `mode`. Bits UI's `Dialog` supplies
	 * the focus trap, the Escape key, the scroll lock and the ARIA; the form
	 * inside is plain HTML bound to local state, and the save button calls a
	 * `command` — `addStop` or `updateStop` — because a dialog only exists
	 * once JavaScript is running, so there is nothing to enhance.
	 *
	 * A date change on an existing stop goes through `moveStop`, the same
	 * function a drag uses, so "move to Thursday" means one thing in the
	 * whole application.
	 *
	 * The shell — `.overlay`, `.dialog`, the header, the grabber — is shared
	 * CSS in `base.css`: on a phone it is a bottom sheet, from 40em a centred
	 * panel, and the command palette wears the same classes.
	 */
	export type Mode =
		| { kind: 'add'; date: string | null; point?: { lng: number; lat: number } }
		| { kind: 'edit'; stop: Stop };

	interface Props {
		mode: Mode | null;
		tripId: string;
		days: readonly string[];
		onclose: () => void;
		onsaved?: (stop: Stop) => void;
	}

	let { mode, tripId, days, onclose, onsaved }: Props = $props();

	const locale = getLocale();
	/* The day in words, as the itinerary's headings write it: "Sunday, May 10". UTC, so the calendar date is the one that comes out. */
	const dayName = new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC'
	});
	const formatDay = (day: string) => dayName.format(fromIso(day).toDate('UTC'));

	/*
	 * The draft is `$derived` from `mode`: opening the dialog for a different
	 * stop resets every field, and opening it for the same stop twice starts
	 * from the stored values, not from whatever was typed last time.
	 * Assignable deriveds — the fields are bound and edited — with the mode
	 * as the reset.
	 */
	let name = $derived(mode?.kind === 'edit' ? mode.stop.name : '');
	let kind: StopKind = $derived(mode?.kind === 'edit' ? mode.stop.kind : 'place');
	let date: string | null = $derived(
		mode?.kind === 'edit' ? mode.stop.date : mode?.kind === 'add' ? mode.date : null
	);
	let notes = $derived(mode?.kind === 'edit' ? mode.stop.notes : '');
	/*
	 * No coordinates until there are some. A new stop with no place picked
	 * and no click on the map has none, and `null` says so — `0, 0` would be
	 * a real point (in the Gulf of Guinea) presented as if it were chosen,
	 * and saved as one. The inputs are `required`, so the browser will not
	 * submit while they are empty.
	 */
	let lng: number | null = $derived(
		mode?.kind === 'edit' ? mode.stop.lng : (mode?.point?.lng ?? null)
	);
	let lat: number | null = $derived(
		mode?.kind === 'edit' ? mode.stop.lat : (mode?.point?.lat ?? null)
	);
	const unset = $derived(lng == null || lat == null);
	let placeId: string | undefined = $derived(
		mode?.kind === 'edit' ? (mode.stop.placeId ?? undefined) : undefined
	);

	/*
	 * The coordinates are folded away once a place has been picked — they
	 * came from the gazetteer and rarely need a hand. They are open while
	 * adding: either the pin came from a click on the map, where a nudge is
	 * the likely next step, or there is no pin yet, and the row says so and
	 * cannot be folded until there is.
	 */
	let adjusting = $derived(mode?.kind === 'add');

	/* Search first from 40em; on a phone the sheet opens without a keyboard over it. */
	const wide = new MediaQuery('(min-width: 40em)');
	const searchId = $props.id();
	let nameInput = $state<HTMLInputElement>();

	let saving = $state(false);

	function fromPlace(place: Place) {
		if (!name.trim()) name = place.name;
		lng = place.lng;
		lat = place.lat;
		placeId = place.id;
		adjusting = false;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!mode || saving || lng == null || lat == null) return;
		saving = true;
		try {
			if (mode.kind === 'add') {
				const stop = await addStop({ tripId, name, kind, lng, lat, date, notes, placeId });
				toast.success(m.stop_added());
				onsaved?.(stop);
			} else {
				await updateStop({ id: mode.stop.id, name, kind, lng, lat, notes });
				if (date !== mode.stop.date) {
					await moveStop({ tripId, id: mode.stop.id, date, index: 10_000 });
				}
				toast.success(m.trip_saved());
				onsaved?.({ ...mode.stop, name, kind, lng, lat, notes, date });
			}
			onclose();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root open={mode !== null} onOpenChange={(open) => !open && onclose()}>
	<Dialog.Portal>
		<Dialog.Overlay class="overlay" />
		<Dialog.Content
			class="dialog"
			onOpenAutoFocus={(event) => {
				if (!wide.current) return;
				event.preventDefault();
				if (mode?.kind === 'edit') nameInput?.focus();
				else document.getElementById(searchId)?.focus();
			}}
		>
			<span class="sheet-grabber" aria-hidden="true"></span>
			<header class="dialog__header">
				<Dialog.Title class="dialog__title">
					{mode?.kind === 'edit' ? m.stop_edit() : m.stop_new()}
				</Dialog.Title>
				<Dialog.Close class="btn btn--icon btn--ghost btn--sm" aria-label={m.dialog_close()}>
					<XIcon size={18} aria-hidden="true" />
				</Dialog.Close>
			</header>
			<Dialog.Description class="visually-hidden">{m.stop_search()}</Dialog.Description>

			<form class="stack" onsubmit={save}>
				<div class="field">
					<label class="label" for={searchId}>{m.stop_place()}</label>
					<PlaceSearch id={searchId} onpick={fromPlace} />
				</div>

				<label class="field">
					<span class="label">{m.stop_name()}</span>
					<input class="input" bind:value={name} bind:this={nameInput} maxlength="120" required />
				</label>

				<!--
					The kind as a segmented control: six radios in a fieldset, drawn
					as a pill track, three to a row (the style block says why). The
					chosen one lifts onto a tier-3 pill and its icon takes the kind's
					colour — the same hue the stop will have on the map.
				-->
				<fieldset class="field">
					<legend class="label">{m.stop_kind()}</legend>
					<div class="kinds">
						{#each STOP_KINDS as k (k)}
							{@const Icon = KIND_ICONS[k]}
							<label class="kinds__option" data-kind={k}>
								<input
									class="visually-hidden"
									type="radio"
									name="kind"
									value={k}
									bind:group={kind}
								/>
								<Icon size={16} aria-hidden="true" />
								<span>{KIND_LABELS[k]()}</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<label class="field">
					<span class="label">{m.stop_day()}</span>
					<select class="select" bind:value={date}>
						<option value={null}>{m.day_ideas()}</option>
						{#each days as day (day)}
							<option value={day}>{formatDay(day)}</option>
						{/each}
					</select>
				</label>

				<details class="coords" bind:open={adjusting}>
					<!-- While there is no pin the row stays open: a required field folded out of sight is a form that will not submit and will not say why. -->
					<summary
						class="coords__summary"
						onclick={(event) => {
							if (unset) event.preventDefault();
						}}
					>
						<span class="label">{m.stop_coordinates()}</span>
						{#if lat != null && lng != null}
							<span class="coords__value tabular">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
							<span class="hint">{m.stop_adjust_pin()}</span>
						{:else}
							<span class="coords__unset">{m.stop_coordinates_unset()}</span>
						{/if}
					</summary>
					<div class="coords__row">
						<input
							class="input tabular"
							type="number"
							inputmode="decimal"
							step="0.0001"
							min="-90"
							max="90"
							aria-label={m.stop_latitude()}
							placeholder={m.stop_latitude()}
							required
							bind:value={lat}
						/>
						<input
							class="input tabular"
							type="number"
							inputmode="decimal"
							step="0.0001"
							min="-180"
							max="180"
							aria-label={m.stop_longitude()}
							placeholder={m.stop_longitude()}
							required
							bind:value={lng}
						/>
					</div>
				</details>

				<label class="field">
					<span class="label">{m.stop_notes()}</span>
					<textarea class="textarea notes" bind:value={notes} maxlength="1000"></textarea>
				</label>

				<div class="cluster dialog__actions">
					<Dialog.Close class="btn btn--ghost">{m.dialog_cancel()}</Dialog.Close>
					<button class="btn btn--primary" type="submit" disabled={saving}>{m.stop_save()}</button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/*
	 * Three to a row at every width. Six across was the first idea, and the
	 * panel is 32rem: a sixth of it is about 75px, "Transport" needs 90 and
	 * "Hospedagem" more, so the label squeezed its own icon out. Two rows of
	 * three hold the longest label in all three languages.
	 */
	.kinds {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-0);
		padding: var(--space-0);
		border-radius: var(--radius);
		background: var(--paper-3);
	}

	.kinds__option {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		min-height: var(--control-sm);
		padding: 0.25rem 0.4rem;
		border-radius: var(--radius-sm);
		color: var(--ink-2);
		font-size: var(--text-xs);
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color var(--dur-2) var(--ease-out),
			color var(--dur-2) var(--ease-out);
	}

	.kinds__option :global(svg) {
		flex-shrink: 0;
	}

	/* The chosen kind: a tier-3 pill with a 3:1 edge, because the tier step alone does not show. */
	.kinds__option:has(input:checked) {
		background: var(--paper-4);
		color: var(--ink);
		box-shadow:
			var(--shadow-1),
			inset 0 0 0 1px var(--segment-edge);
	}

	/* The chosen kind's icon takes its colour — the one place the dialog shows a hue. */
	.kinds__option:has(input:checked) :global(svg) {
		color: var(--kind);
	}

	.kinds__option:has(input:focus-visible) {
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}

	/* `align-content: center` puts the one line in the middle of the 36px row; the items keep a shared baseline. */
	.coords__summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		align-content: center;
		gap: var(--space-2);
		min-height: var(--control-sm);
		cursor: pointer;
		list-style: none;
	}

	.coords__summary::-webkit-details-marker {
		display: none;
	}

	.coords__value {
		color: var(--ink);
		font-size: var(--text-sm);
	}

	.coords__summary .hint {
		margin-inline-start: auto;
		color: var(--sea);
	}

	.coords__unset {
		color: var(--ink-2);
		font-size: var(--text-sm);
	}

	.coords__row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		padding-block-start: var(--space-2);
	}

	.notes {
		min-height: 5rem;
	}
</style>
