<script lang="ts">
	import { WaveformIcon } from 'phosphor-svelte';
	import { getStudio } from '#lib/audio/context.ts';
	import * as voices from '#lib/audio/voices.ts';
	import { KINDS, MELODIC, type Kind, type Track } from '#lib/pattern/model.ts';
	import { toast } from '#lib/toast/toast.ts';
	import type { Session } from './session.svelte.ts';
	import Knob from './Knob.svelte';
	import { waveform } from './waveform.ts';

	/**
	 * THE SOUND OF ONE TRACK
	 * ======================
	 *
	 * What instrument it is, its two knobs, and — for a `sample` track — the
	 * file it plays. The engine comes from context: this panel is three levels
	 * below the page that created it, and nobody in between needs to know.
	 */
	let { session, track }: { session: Session; track: Track } = $props();

	const { engine, samples } = getStudio();

	const labels: Record<Kind, string> = {
		kick: 'Kick',
		snare: 'Snare',
		hat: 'Hi-hat',
		clap: 'Clap',
		bass: 'Bass',
		lead: 'Lead',
		sample: 'Sample'
	};

	/**
	 * `bind:files` gives a `FileList`, which cannot be built by hand — so
	 * clearing it means assigning the `files` of an empty `DataTransfer`, the
	 * one way to make an empty one. Left `undefined` until the browser sets it,
	 * because `DataTransfer` does not exist on the server and this component
	 * is server-rendered.
	 */
	let files = $state<FileList>();
	let loading = $state(false);

	async function load() {
		const file = files?.[0];
		if (!file) return;
		loading = true;
		try {
			await samples.load(track.id, file);
			toast(`Loaded ${file.name}`);
		} catch (e) {
			toast((e as Error).message, 'error');
			clear();
		} finally {
			loading = false;
		}
	}

	function clear() {
		files = new DataTransfer().files;
		samples.clear(track.id);
	}

	/** Hear the sound now, with the current knobs, without pressing play. */
	async function audition() {
		await engine.resume();
		const ctx = engine.context;
		const out = engine.channel(track).input;
		const voice = {
			time: ctx.currentTime + 0.01,
			velocity: 110,
			tone: track.tone,
			decay: track.decay
		};
		const note = track.steps.find((s) => s.velocity > 0)?.note ?? track.steps[0]!.note;

		switch (track.kind) {
			case 'kick':
				return voices.kick(ctx, out, voice);
			case 'snare':
				return voices.snare(ctx, out, voice);
			case 'hat':
				return voices.hat(ctx, out, voice);
			case 'clap':
				return voices.clap(ctx, out, voice);
			case 'bass':
				return voices.bass(ctx, out, { ...voice, frequency: note.frequency, duration: 0.3 });
			case 'lead':
				return voices.lead(ctx, out, { ...voice, frequency: note.frequency, duration: 0.3 });
			case 'sample': {
				const buffer = samples.get(track.id);
				if (buffer) voices.sample(ctx, out, voice, buffer);
				return;
			}
			default:
				track.kind satisfies never;
		}
	}

	const hue = $derived(`var(--hue-${track.kind})`);
</script>

<div class="sound stack">
	<label class="field">
		<span class="field__label">Instrument</span>
		<select
			class="input"
			value={track.kind}
			onchange={(e) => session.setKind(track.id, e.currentTarget.value as Kind)}
		>
			{#each KINDS as kind (kind)}
				<option value={kind}>{labels[kind]}</option>
			{/each}
		</select>
	</label>

	<div class="knobs">
		<Knob bind:value={track.tone} label="Tone" onstart={() => session.commit()} />
		<Knob bind:value={track.decay} label="Decay" onstart={() => session.commit()} />
		<button type="button" class="btn" onclick={audition}>
			<WaveformIcon size={16} /> Audition
		</button>
	</div>

	{#if MELODIC.has(track.kind)}
		<p class="hint">
			Focus a lit step and press <kbd>↑</kbd> <kbd>↓</kbd> to change its note; <kbd>PgUp</kbd>
			<kbd>PgDn</kbd> for octaves.
		</p>
	{/if}

	{#if track.kind === 'sample'}
		<div class="stack">
			<label class="field">
				<span class="field__label">Sample file (up to ten seconds)</span>
				<input
					class="input"
					type="file"
					accept="audio/*"
					bind:files
					onchange={load}
					disabled={loading}
				/>
			</label>

			<canvas class="wave" {@attach waveform(samples.get(track.id), hue)}></canvas>

			{#if samples.names.has(track.id)}
				<p class="cluster">
					<span class="hint">{samples.names.get(track.id)}</span>
					<button type="button" class="btn btn--sm btn--ghost btn--danger" onclick={clear}
						>Remove</button
					>
				</p>
			{:else}
				<p class="hint">No file yet — this track is silent until one is loaded.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.knobs {
		display: flex;
		align-items: flex-end;
		gap: var(--space-4);
	}

	.wave {
		width: 100%;
		height: 64px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}
</style>
