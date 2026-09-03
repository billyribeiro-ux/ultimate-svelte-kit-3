<script lang="ts">
	import { PlayIcon, StopIcon } from 'phosphor-svelte';
	import type { AudioEngine } from '#lib/audio/engine.svelte.ts';
	import type { Scheduler } from '#lib/audio/scheduler.svelte.ts';
	import Knob from './Knob.svelte';

	/**
	 * PLAY, STOP, TEMPO, SWING, VOLUME
	 * ================================
	 *
	 * `bpm` and `swing` are bindable so the knobs write into the pattern
	 * directly; `onstart` is where the studio takes its undo snapshot. The
	 * master volume belongs to the engine, not the pattern — it is how loud
	 * *this* machine is, and it is not part of what gets shared.
	 */
	let {
		engine,
		scheduler,
		bpm = $bindable(120),
		swing = $bindable(0),
		disabled = false,
		onstart,
		onend
	}: {
		engine: AudioEngine;
		scheduler: Scheduler;
		bpm?: number;
		swing?: number;
		/** Tempo and swing knobs locked — a published pattern plays as written. */
		disabled?: boolean;
		onstart?: () => void;
		onend?: () => void;
	} = $props();

	/**
	 * `$inspect.trace` — in development only, and only in this one effect —
	 * prints *which* piece of state made the effect re-run. The transport is
	 * the component most likely to update for a reason nobody intended, since
	 * it reads the engine, the scheduler and the pattern; when it does, this
	 * says why. It must be the first statement of the effect, and it compiles
	 * to nothing in production.
	 */
	$effect(() => {
		// eslint-disable-next-line svelte/no-inspect -- deliberate: the lesson is what this prints
		$inspect.trace('transport');
		void engine.state;
		void scheduler.playing;
	});

	const stateLabel = $derived(
		engine.state === 'running'
			? 'audio on'
			: engine.state === 'suspended'
				? 'audio paused'
				: 'audio idle'
	);
</script>

<div class="transport" role="group" aria-label="Transport">
	<button
		type="button"
		class={['btn btn--lg play', { 'play--on': scheduler.playing }]}
		aria-pressed={scheduler.playing}
		aria-label={scheduler.playing ? 'Stop' : 'Play'}
		onclick={() => scheduler.toggle()}
	>
		{#if scheduler.playing}
			<StopIcon size={22} weight="fill" />
		{:else}
			<PlayIcon size={22} weight="fill" />
		{/if}
		<span class="play__label">{scheduler.playing ? 'Stop' : 'Play'}</span>
		<kbd>space</kbd>
	</button>

	<Knob
		bind:value={bpm}
		min={40}
		max={240}
		step={1}
		label="Tempo"
		format={(v) => `${v}`}
		{disabled}
		{onstart}
		{onend}
	/>
	<Knob
		bind:value={swing}
		min={0}
		max={1}
		step={0.05}
		label="Swing"
		format={(v) => `${Math.round(v * 100)}%`}
		{disabled}
		{onstart}
		{onend}
	/>
	<Knob
		bind:value={engine.volume}
		min={0}
		max={1}
		step={0.02}
		label="Volume"
		format={(v) => `${Math.round(v * 100)}`}
	/>

	<div class="readout">
		<span class="readout__bars mono" aria-label="Bars played"
			>{String(scheduler.bars).padStart(3, '0')}</span
		>
		<span class={['readout__state', `readout__state--${engine.state}`]}>{stateLabel}</span>
	</div>
</div>

<style>
	.transport {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		overflow-x: auto;
		padding-block: var(--space-2);
		scrollbar-width: none;
	}

	.play {
		flex-shrink: 0;
		gap: var(--space-2);
	}

	.play--on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
	}

	.play kbd {
		display: none;
	}

	.readout {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		margin-inline-start: auto;
		gap: 2px;
		flex-shrink: 0;
	}

	.readout__bars {
		font-size: var(--fs-lg);
		font-weight: var(--weight-semibold);
		color: var(--accent);
	}

	.readout__state {
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}

	.readout__state--running {
		color: var(--ok);
	}

	@media (min-width: 40rem) {
		.play kbd {
			display: inline-block;
		}
	}
</style>
