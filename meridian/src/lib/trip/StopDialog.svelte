<script lang="ts">
	import { Dialog } from 'bits-ui';
	import * as v from 'valibot';
	import { MediaQuery } from 'svelte/reactivity';
	import { browser } from '$app/env';
	import { WarningCircleIcon, XIcon } from 'phosphor-svelte';
	import { toast } from 'svelte-sonner';
	import { errorMessage } from '#lib/ui/errors.ts';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { fromIso } from '#lib/domain/dates.ts';
	import {
		STOP_KINDS,
		StopInputSchema,
		StopPatchSchema,
		type StopKind
	} from '#lib/domain/schemas.ts';
	import { places, type Place } from '#lib/remote/geo.remote.ts';
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
	 * The shell — `.overlay`, `.dialog`, the header, the grabber — is CSS in
	 * `base.css`, because it is the product's dialog pattern: on a phone a
	 * bottom sheet, from 40em a centred panel. Today this dialog is the one
	 * that wears it; the command palette shares only the scrim, and says why.
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

	/*
	 * THE GAZETTEER, BEFORE ANYBODY ASKS
	 * ----------------------------------
	 * The place search needs the hundred places the moment the dialog opens.
	 * Asking for them here — this component is mounted with the trip page,
	 * long before it is opened — starts the fetch of the prerendered file
	 * while the person is still reading the itinerary, and `.current` hands
	 * the search whatever has arrived without suspending anything: no
	 * `await`, so the dialog's first frame is its finished layout. In the
	 * browser only; a dialog that is closed has nothing to server-render.
	 */
	const gazetteer = browser ? places() : undefined;

	/* Search first from 40em; on a phone the sheet opens without a keyboard over it. */
	const wide = new MediaQuery('(min-width: 40em)');
	const searchId = $props.id();
	let nameInput = $state<HTMLInputElement>();

	let saving = $state(false);

	/*
	 * ISSUES, ON THE FIELD THEY BELONG TO
	 * -----------------------------------
	 * The save runs the same schema the server will, first, in the browser:
	 * a name of three spaces passes `required` and fails the server's trim,
	 * and the answer used to come back as a toast of raw JSON. Now each issue
	 * is a line under its field, the field is `aria-invalid`, and nothing is
	 * sent. The coordinates also listen for the browser's own `invalid`
	 * event: they can sit in a closed `<details>`, and a required field
	 * folded out of sight stops the form without a word — so an invalid
	 * coordinate unfolds the row and says what is wrong.
	 */
	interface Issues {
		readonly name?: string | undefined;
		readonly coords?: string | undefined;
		readonly notes?: string | undefined;
	}

	// Like the fields above: assignable, and reset to none whenever the dialog opens for something else.
	let issues: Issues = $derived.by(() => {
		void mode;
		return {};
	});

	function check(): boolean {
		const result =
			mode?.kind === 'edit'
				? v.safeParse(StopPatchSchema, { id: mode.stop.id, name, kind, lng, lat, notes })
				: v.safeParse(StopInputSchema, { tripId, name, kind, lng, lat, date, notes, placeId });
		if (result.success) {
			issues = {};
			return true;
		}
		const nested = v.flatten(result.issues).nested ?? {};
		issues = {
			name: nested.name?.[0],
			coords: nested.lng || nested.lat ? m.issue_coordinates() : undefined,
			notes: nested.notes?.[0]
		};
		if (issues.coords) adjusting = true;
		return false;
	}

	/* The browser refused a coordinate: unfold the row, and say what it wants. */
	function coordsInvalid() {
		adjusting = true;
		issues = { ...issues, coords: m.issue_coordinates() };
	}

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
		if (!check()) return;
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
			toast.error(errorMessage(error));
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
					<PlaceSearch id={searchId} places={gazetteer?.current ?? []} onpick={fromPlace} />
				</div>

				<label class="field">
					<span class="label">{m.stop_name()}</span>
					<input
						class="input"
						bind:value={name}
						bind:this={nameInput}
						maxlength="120"
						required
						aria-invalid={issues.name ? 'true' : undefined}
						aria-describedby={issues.name ? `${searchId}-name-issue` : undefined}
					/>
					{#if issues.name}
						<span class="issue" id="{searchId}-name-issue">
							<WarningCircleIcon size={14} aria-hidden="true" />
							{issues.name}
						</span>
					{/if}
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
							{const Icon = $derived(KIND_ICONS[k])}
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
					<!--
						`step="any"`: a click on the map, or a dragged pin, gives a
						coordinate to many more places than four, and a step of 0.0001
						made the browser refuse it as a "step mismatch".
					-->
					<div class="coords__row">
						<input
							class="input tabular"
							type="number"
							inputmode="decimal"
							step="any"
							min="-90"
							max="90"
							aria-label={m.stop_latitude()}
							placeholder={m.stop_latitude()}
							required
							aria-invalid={issues.coords ? 'true' : undefined}
							aria-describedby={issues.coords ? `${searchId}-coords-issue` : undefined}
							oninvalid={coordsInvalid}
							bind:value={lat}
						/>
						<input
							class="input tabular"
							type="number"
							inputmode="decimal"
							step="any"
							min="-180"
							max="180"
							aria-label={m.stop_longitude()}
							placeholder={m.stop_longitude()}
							required
							aria-invalid={issues.coords ? 'true' : undefined}
							aria-describedby={issues.coords ? `${searchId}-coords-issue` : undefined}
							oninvalid={coordsInvalid}
							bind:value={lng}
						/>
					</div>
				</details>
				{#if issues.coords}
					<span class="issue" id="{searchId}-coords-issue">
						<WarningCircleIcon size={14} aria-hidden="true" />
						{issues.coords}
					</span>
				{/if}

				<label class="field">
					<span class="label">{m.stop_notes()}</span>
					<textarea
						class="textarea notes"
						bind:value={notes}
						maxlength="1000"
						aria-invalid={issues.notes ? 'true' : undefined}></textarea>
					{#if issues.notes}
						<span class="issue">
							<WarningCircleIcon size={14} aria-hidden="true" />
							{issues.notes}
						</span>
					{/if}
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

	/* Under a finger the segments are 44px tall: two pixels apart, there is no room for a hit area to reach. */
	@media (pointer: coarse) {
		.kinds__option {
			min-height: var(--control);
		}
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
