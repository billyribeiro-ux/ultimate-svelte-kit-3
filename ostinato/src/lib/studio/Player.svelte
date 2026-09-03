<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AudioEngine } from '#lib/audio/engine.svelte.ts';
	import { SampleBank } from '#lib/audio/samples.svelte.ts';
	import { Scheduler } from '#lib/audio/scheduler.svelte.ts';
	import { getStudio, hasStudio, setStudio, type Studio } from '#lib/audio/context.ts';
	import type { Pattern } from '#lib/pattern/model.ts';
	import Transport from './Transport.svelte';

	/**
	 * PLAY A PATTERN YOU CANNOT EDIT
	 * ==============================
	 *
	 * The published page, the gallery preview and the jam room all need to
	 * *play* a pattern without owning one. This wraps the transport around a
	 * pattern prop and hands its children the playhead through a snippet
	 * parameter, so the grid underneath can light up.
	 *
	 * It asks context whether a studio already exists — `hasStudio` is the
	 * third function `createContext` returns — and creates one only if not.
	 * The jam page creates none; this makes one and provides it, so the meters
	 * and panels under it work exactly as they do in the studio.
	 */
	let {
		pattern,
		bpm = $bindable(),
		swing = $bindable(),
		readonly = true,
		onfirstplay,
		ontempo,
		children
	}: {
		pattern: Pattern;
		bpm?: number;
		swing?: number;
		readonly?: boolean;
		/** Called once, the first time play starts — the published page counts it. */
		onfirstplay?: () => void;
		/** Called when a tempo gesture ends, with the values the knobs landed on. */
		ontempo?: (bpm: number, swing: number) => void;
		children: Snippet<[{ step: number; playing: boolean }]>;
	} = $props();

	const studio: Studio = hasStudio() ? getStudio() : create();
	if (!hasStudio()) setStudio(studio);

	function create(): Studio {
		const engine = new AudioEngine();
		const samples = new SampleBank(engine);
		const scheduler = new Scheduler(engine, () => pattern, {
			output: (track) => engine.channel(track).input,
			sample: (track) => samples.get(track.id)
		});
		return { engine, scheduler, samples };
	}

	const { engine, scheduler } = studio;

	let played = false;
	$effect(() => {
		if (scheduler.playing && !played) {
			played = true;
			onfirstplay?.();
		}
	});

	// Stop the transport when the player goes away — a navigation must not leave a groove running.
	$effect(() => () => scheduler.stop());

	// Local copies the knobs can turn; the parent decides what a turn means.
	let localBpm = $derived(bpm ?? pattern.bpm);
	let localSwing = $derived(swing ?? pattern.swing);
</script>

<div class="player">
	<Transport
		{engine}
		{scheduler}
		bind:bpm={localBpm}
		bind:swing={localSwing}
		disabled={readonly}
		onend={() => ontempo?.(localBpm, localSwing)}
	/>
	{@render children({ step: scheduler.step, playing: scheduler.playing })}
</div>

<style>
	.player {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
