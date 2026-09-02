<script lang="ts">
	import { SpeakerSimpleSlashIcon, SpeakerSimpleHighIcon } from 'phosphor-svelte';
	import type { AudioEngine } from '#lib/audio/engine.svelte.ts';
	import type { Pattern } from '#lib/pattern/model.ts';
	import Knob from './Knob.svelte';
	import Meter from './Meter.svelte';

	/**
	 * THE MIXER
	 * =========
	 *
	 * One strip per track: level, pan, mute, solo, and a meter. The knobs bind
	 * straight into the track — `bind:value={track.gain}` on a deep `$state`
	 * object — and the engine picks the new value up on the next scheduled step.
	 *
	 * The meter appears only once the engine has built a channel for the
	 * track, which happens on the first note it plays. `engine.channels` is a
	 * `SvelteMap`, so `has()` is reactive and the meter shows up on its own.
	 */
	let {
		pattern,
		engine,
		onstart
	}: {
		pattern: Pattern;
		engine: AudioEngine;
		onstart?: () => void;
	} = $props();
</script>

<div class="mixer" role="group" aria-label="Mixer">
	{#each pattern.tracks as track (track.id)}
		<div
			class={['strip', { 'strip--muted': track.muted, 'strip--solo': track.solo }]}
			style:--hue={`var(--hue-${track.kind})`}
		>
			<span class="strip__name">{track.name}</span>

			<Knob
				bind:value={track.gain}
				label="Level"
				size={44}
				format={(v) => `${Math.round(v * 100)}`}
				{onstart}
			/>
			<Knob
				bind:value={track.pan}
				min={-1}
				max={1}
				step={0.05}
				label="Pan"
				size={36}
				format={(v) =>
					Math.abs(v) < 0.025
						? 'C'
						: v < 0
							? `L${Math.round(-v * 100)}`
							: `R${Math.round(v * 100)}`}
				{onstart}
			/>

			<div class="strip__buttons">
				<button
					type="button"
					class={['btn btn--sm btn--icon', { 'btn--primary': track.muted }]}
					aria-pressed={track.muted}
					aria-label="Mute {track.name}"
					onclick={() => {
						onstart?.();
						track.muted = !track.muted;
					}}
				>
					{#if track.muted}<SpeakerSimpleSlashIcon size={14} />{:else}<SpeakerSimpleHighIcon
							size={14}
						/>{/if}
				</button>
				<button
					type="button"
					class={['btn btn--sm btn--icon strip__solo', { 'btn--primary': track.solo }]}
					aria-pressed={track.solo}
					aria-label="Solo {track.name}"
					onclick={() => {
						onstart?.();
						track.solo = !track.solo;
					}}
				>
					S
				</button>
			</div>

			{#if engine.channels.has(track.id)}
				<Meter
					analyser={engine.channels.get(track.id)!.analyser}
					hue={`var(--hue-${track.kind})`}
				/>
			{:else}
				<div class="strip__silent" aria-hidden="true"></div>
			{/if}
		</div>
	{/each}
</div>

<style>
	/* A row of strips that scrolls sideways on a phone; a column on a desktop. */
	.mixer {
		display: flex;
		gap: var(--space-2);
		overflow-x: auto;
		padding-block: var(--space-2);
		scrollbar-width: thin;
	}

	.strip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		flex: 0 0 5.5rem;
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-top: 3px solid oklch(72% 0.17 var(--hue));
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.strip--muted {
		opacity: 0.6;
	}

	.strip__name {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--fs-xs);
		font-weight: var(--weight-medium);
	}

	.strip__buttons {
		display: flex;
		gap: var(--space-1);
	}

	.strip__solo {
		font-weight: var(--weight-bold);
	}

	.strip__silent {
		width: 100%;
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--surface-active);
	}

	@media (min-width: 64rem) {
		.mixer {
			flex-direction: column;
			overflow: visible;
		}

		.strip {
			flex-direction: row;
			flex: none;
			justify-content: space-between;
			border-top-width: 1px;
			border-inline-start: 3px solid oklch(72% 0.17 var(--hue));
		}

		.strip__name {
			flex: 0 0 4.5rem;
		}

		.strip :global(.meter),
		.strip__silent {
			width: 3.5rem;
		}
	}
</style>
