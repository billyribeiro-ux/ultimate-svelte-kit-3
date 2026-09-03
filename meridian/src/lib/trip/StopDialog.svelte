<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { XIcon } from 'phosphor-svelte';
	import { toast } from 'svelte-sonner';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatDate } from '#lib/domain/dates.ts';
	import { STOP_KINDS, type StopKind } from '#lib/domain/schemas.ts';
	import type { Place } from '#lib/remote/geo.remote.ts';
	import { addStop, moveStop, updateStop } from '#lib/remote/stops.remote.ts';
	import type { Stop } from '#lib/server/db/schema.ts';
	import { KIND_LABELS } from './kinds.ts';
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
	let lng = $derived(mode?.kind === 'edit' ? mode.stop.lng : (mode?.point?.lng ?? 0));
	let lat = $derived(mode?.kind === 'edit' ? mode.stop.lat : (mode?.point?.lat ?? 0));
	let placeId: string | undefined = $derived(
		mode?.kind === 'edit' ? (mode.stop.placeId ?? undefined) : undefined
	);

	let saving = $state(false);

	function fromPlace(place: Place) {
		if (!name.trim()) name = place.name;
		lng = place.lng;
		lat = place.lat;
		placeId = place.id;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!mode || saving) return;
		saving = true;
		try {
			if (mode.kind === 'add') {
				const stop = await addStop({ tripId, name, kind, lng, lat, date, notes, placeId });
				toast(m.stop_added());
				onsaved?.(stop);
			} else {
				await updateStop({ id: mode.stop.id, name, kind, lng, lat, notes });
				if (date !== mode.stop.date) {
					await moveStop({ tripId, id: mode.stop.id, date, index: 10_000 });
				}
				toast(m.trip_saved());
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
		<Dialog.Content class="dialog">
			<header class="dialog__header">
				<Dialog.Title class="dialog__title">
					{mode?.kind === 'edit' ? m.stop_edit() : m.stop_new()}
				</Dialog.Title>
				<Dialog.Close class="btn btn--icon btn--ghost btn--sm" aria-label={m.nav_menu()}>
					<XIcon size={18} aria-hidden="true" />
				</Dialog.Close>
			</header>
			<Dialog.Description class="visually-hidden">{m.stop_search()}</Dialog.Description>

			<form class="stack" onsubmit={save}>
				<PlaceSearch onpick={fromPlace} />

				<label class="field">
					<span class="label">{m.stop_name()}</span>
					<input class="input" bind:value={name} maxlength="120" required />
				</label>

				<div class="two">
					<label class="field">
						<span class="label">{m.stop_kind()}</span>
						<select class="select" bind:value={kind}>
							{#each STOP_KINDS as k (k)}
								<option value={k}>{KIND_LABELS[k]()}</option>
							{/each}
						</select>
					</label>

					<label class="field">
						<span class="label">{m.stop_day()}</span>
						<select class="select" bind:value={date}>
							<option value={null}>{m.day_ideas()}</option>
							{#each days as day (day)}
								<option value={day}>{formatDate(day, locale, 'day')}</option>
							{/each}
						</select>
					</label>
				</div>

				<div class="two">
					<label class="field">
						<span class="label">lng</span>
						<input
							class="input"
							type="number"
							step="0.0001"
							min="-180"
							max="180"
							bind:value={lng}
						/>
					</label>
					<label class="field">
						<span class="label">lat</span>
						<input class="input" type="number" step="0.0001" min="-90" max="90" bind:value={lat} />
					</label>
				</div>

				<label class="field">
					<span class="label">{m.stop_notes()}</span>
					<textarea class="textarea" bind:value={notes} maxlength="1000"></textarea>
				</label>

				<div class="cluster dialog__actions">
					<button class="btn btn--primary" type="submit" disabled={saving}>{m.stop_save()}</button>
					<Dialog.Close class="btn btn--ghost">{m.stop_undo()}</Dialog.Close>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.overlay) {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: color-mix(in oklab, var(--ink) 45%, transparent);
	}

	:global(.dialog) {
		position: fixed;
		z-index: 51;
		inset-inline: var(--space-3);
		bottom: var(--space-3);
		max-height: calc(100dvh - 2 * var(--space-3));
		overflow: auto;
		padding: var(--space-5);
		border-radius: var(--radius-lg);
		background: var(--paper-2);
		border: 1px solid var(--line);
		box-shadow: var(--shadow-3);
	}

	@media (min-width: 40em) {
		:global(.dialog) {
			inset: 50% auto auto 50%;
			transform: translate(-50%, -50%);
			width: min(34rem, calc(100vw - 2 * var(--space-4)));
		}
	}

	.dialog__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-block-end: var(--space-4);
	}

	:global(.dialog__title) {
		font-size: var(--text-lg);
	}

	.two {
		display: grid;
		gap: var(--space-3);
		grid-template-columns: 1fr 1fr;
	}

	.dialog__actions {
		justify-content: flex-end;
	}
</style>
