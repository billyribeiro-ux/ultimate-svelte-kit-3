<script lang="ts">
	import { scale } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { online } from 'svelte/reactivity/window';
	import { page } from '$app/state';
	import type { RouteParams } from '$app/types';
	import { becomeArtist, whoAmI } from '#lib/remote/artist.remote.ts';
	import {
		fillRoomTrack,
		loadRoomPreset,
		setRoomStep,
		setRoomTempo,
		toggleRoomMute,
		watchRoom
	} from '#lib/remote/rooms.remote.ts';
	import { cycleVelocity } from '#lib/pattern/model.ts';
	import { PRESET_NAMES, preset } from '#lib/pattern/presets.ts';
	import Player from '#lib/studio/Player.svelte';
	import StepGrid from '#lib/studio/StepGrid.svelte';
	import { toast } from '#lib/toast/toast.ts';

	const params = $derived(page.params as RouteParams<'/(app)/jam/[room]'>);

	/**
	 * THE LIVE QUERY
	 * ==============
	 * `watchRoom(id)` is a `query.live`: awaiting it gives the current room,
	 * and after that its `current` updates every time the server yields —
	 * every toggle by anybody in the room. `connected` says whether the stream
	 * is up; `reconnect()` restarts it by hand. SvelteKit reconnects on its own
	 * with backoff, and eagerly when the browser comes back online.
	 */
	const room = $derived(watchRoom(params.room));

	async function run(action: Promise<unknown>) {
		try {
			await action;
		} catch (e) {
			toast((e as Error).message, 'error');
		}
	}
</script>

<svelte:head>
	<title>Jam: {params.room} — Ostinato</title>
</svelte:head>

<div class="page jam">
	<svelte:boundary>
		<!--
			`$derived(await room)`, not a bare `await room`. A declaration tag with
			a plain `await` runs *once* — it is a blocking promise, not a
			subscription — and would show the first snapshot forever. Wrapping it
			in `$derived` is what makes it re-run every time the live query yields:
			the resource's `then` is reactive, and a derived is what tracks it.
		-->
		{const snapshot = $derived(await room)}
		<!--
			Overridable deriveds: `bpm` follows the room, and can be *assigned*
			by the knob while a gesture is in progress. When the room's next
			snapshot arrives the derived recomputes and the override is gone —
			replaced by whatever the server settled on, which is usually the
			same number.
		-->
		{let bpm = $derived(snapshot.pattern.bpm)}
		{let swing = $derived(snapshot.pattern.swing)}

		<header class="jam__head">
			<div>
				<p class="eyebrow">Jam room</p>
				<h1>{snapshot.name}</h1>
			</div>

			<div class="cluster">
				<span class={['chip', { 'chip--on': room.connected }]} role="status">
					{room.connected ? 'live' : 'reconnecting…'}
				</span>
				{#if online.current === false}
					<span class="chip">offline</span>
				{/if}
				<button type="button" class="btn btn--sm btn--ghost" onclick={() => room.reconnect()}
					>Reconnect</button
				>
				<span class="hint mono">v{snapshot.version}</span>
			</div>
		</header>

		<section class="presence" aria-label="Who is here">
			{#each snapshot.present as who (who.id)}
				<span
					class="chip chip--on"
					animate:flip={{ duration: 200 }}
					transition:scale={{ duration: 160 }}
				>
					@{who.handle}
				</span>
			{/each}
		</section>

		<!-- Who this browser is, from the same query the header uses; refreshed by the form below. -->
		{const me = $derived(await whoAmI())}
		{#if !me}
			<!--
				Choosing a handle in the room: the form carries the room id, and the
				handler calls `watchRoom(room).reconnect()` so that the stream — which
				read the cookie when it opened — restarts and shows the new name.
			-->
			<form {...becomeArtist} class="cluster handle">
				<label class="field">
					<span class="field__label">Play as</span>
					<input class="input" {...becomeArtist.fields.handle.as('text')} placeholder="yourname" />
				</label>
				<input {...becomeArtist.fields.room.as('hidden', params.room)} />
				<button class="btn" disabled={!!becomeArtist.pending}>Join as @…</button>
				{#each becomeArtist.fields.handle.issues() ?? [] as issue (issue.message)}
					<p class="issue">{issue.message}</p>
				{/each}
			</form>
		{/if}

		<Player
			pattern={snapshot.pattern}
			bind:bpm
			bind:swing
			readonly={false}
			ontempo={(b, s) => run(setRoomTempo({ room: params.room, bpm: b, swing: s }))}
		>
			{#snippet children({ step })}
				<StepGrid
					pattern={snapshot.pattern}
					{step}
					tools={false}
					onpaint={(track, index) => {
						const current = snapshot.pattern.tracks.find((t) => t.id === track)?.steps[index];
						if (!current) return;
						void run(
							setRoomStep({
								room: params.room,
								track,
								index,
								step: { velocity: cycleVelocity(current.velocity), note: current.note }
							})
						);
					}}
					ontranspose={(track, index, semitones) => {
						const current = snapshot.pattern.tracks.find((t) => t.id === track)?.steps[index];
						if (!current) return;
						void run(
							setRoomStep({
								room: params.room,
								track,
								index,
								step: { velocity: current.velocity, note: current.note.transpose(semitones) }
							})
						);
					}}
					onfill={(track, on) => run(fillRoomTrack({ room: params.room, track, on }))}
				/>
			{/snippet}
		</Player>

		<section class="cluster">
			{#each snapshot.pattern.tracks as track (track.id)}
				<button
					type="button"
					class={['chip', { 'chip--on': !track.muted }]}
					aria-pressed={!track.muted}
					onclick={() => run(toggleRoomMute({ room: params.room, track: track.id }))}
				>
					{track.name}
				</button>
			{/each}
		</section>

		<section class="cluster">
			<span class="hint">Replace the room's pattern:</span>
			{#each PRESET_NAMES as name (name)}
				<button
					type="button"
					class="btn btn--sm"
					onclick={() => run(loadRoomPreset({ room: params.room, preset: name }))}
				>
					{preset(name).title}
				</button>
			{/each}
		</section>

		{#snippet pending()}
			<p class="hint">Joining the room…</p>
		{/snippet}

		{#snippet failed(error, reset)}
			<p class="issue">{(error as Error).message}</p>
			<button type="button" class="btn" onclick={reset}>Try again</button>
		{/snippet}
	</svelte:boundary>
</div>

<style>
	.jam {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding-block: var(--space-5) var(--space-8);
	}

	.jam__head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--space-3);
	}

	.eyebrow {
		color: var(--accent);
		font-size: var(--fs-xs);
		font-weight: var(--weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.presence {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-height: 1.75rem;
	}

	.handle {
		align-items: flex-end;
	}
</style>
