<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { CaretDownIcon, CaretUpIcon, SlidersHorizontalIcon, TrashIcon } from 'phosphor-svelte';
	import { MELODIC, STEPS, type Pattern } from '#lib/pattern/model.ts';
	import type { Brush } from './session.svelte.ts';
	import Pad from './Pad.svelte';

	/**
	 * THE GRID
	 * ========
	 *
	 * Tracks down, steps across. It renders a pattern and reports edits; it
	 * does not own the pattern, so the same component draws the studio, the
	 * published page (read-only) and the jam room (where every edit is a
	 * command to the server).
	 */
	let {
		pattern,
		step = -1,
		brush = $bindable('cycle'),
		selected = null,
		readonly = false,
		tools = true,
		onpaint,
		ontranspose,
		onfill,
		onselect,
		onmove,
		onremove,
		onrename
	}: {
		pattern: Pattern;
		step?: number;
		brush?: Brush;
		selected?: string | null;
		readonly?: boolean;
		/** The per-track buttons: sound, move, remove. Off in a jam room, where tracks are shared. */
		tools?: boolean;
		onpaint?: (trackId: string, index: number) => void;
		ontranspose?: (trackId: string, index: number, semitones: number) => void;
		onfill?: (trackId: string, on: boolean) => void;
		onselect?: (trackId: string) => void;
		onmove?: (trackId: string, direction: -1 | 1) => void;
		onremove?: (trackId: string) => void;
		onrename?: (trackId: string, name: string) => void;
	} = $props();

	const brushes: { value: Brush; label: string; key: string }[] = [
		{ value: 'cycle', label: 'Cycle', key: '1' },
		{ value: 'accent', label: 'Accent', key: '2' },
		{ value: 'soft', label: 'Soft', key: '3' },
		{ value: 'erase', label: 'Erase', key: '4' }
	];

	const flipDuration = $derived(prefersReducedMotion.current ? 0 : 220);
</script>

<div class="grid" role="group" aria-label="Step sequencer">
	{#if !readonly}
		<!--
			`bind:group` on radio inputs: four inputs, one value. The brush is a
			`$bindable` prop, so the studio's keyboard shortcuts and this toolbar
			write the same variable.
		-->
		<fieldset class="brushes">
			<legend class="visually-hidden">Brush</legend>
			{#each brushes as option (option.value)}
				<label class={['chip', { 'chip--on': brush === option.value }]}>
					<input class="visually-hidden" type="radio" bind:group={brush} value={option.value} />
					{option.label}
					<kbd>{option.key}</kbd>
				</label>
			{/each}
		</fieldset>
	{/if}

	<ol class="tracks">
		<!--
			Keyed by id, so moving a track moves its DOM rather than rewriting
			every row; `animate:flip` then draws the move from where it was to
			where it is, using the FLIP technique: measure, apply, invert, play.
		-->
		{#each pattern.tracks as track, row (track.id)}
			<li
				class={['track', { 'track--selected': track.id === selected, 'track--muted': track.muted }]}
				style:--hue={`var(--hue-${track.kind})`}
				animate:flip={{ duration: flipDuration }}
				out:fade={{ duration: 120 }}
			>
				<!--
					Declaration tags inside the `<li>`, not before it: an element with
					`animate:` must be the *only* child of its keyed `{#each}` block, and
					a declaration is a child too. They are visible to everything below.
				-->
				{const count = track.steps.filter((s) => s.velocity > 0).length}
				{const all = count === STEPS}
				{const some = count > 0 && !all}
				{const melodic = MELODIC.has(track.kind)}
				<header class="track__head">
					<!--
						Function bindings: `bind:checked={get, set}`. The box is *derived*
						from the steps — every step on means checked, some on means
						indeterminate — and ticking it is a command, not an assignment.
						`bind:indeterminate` is the third state a checkbox has and most
						interfaces never use; here it is the honest answer to "is this
						row on?" when the answer is "partly".
					-->
					<input
						type="checkbox"
						class="track__all"
						aria-label="All steps of {track.name}"
						disabled={readonly}
						bind:checked={() => all, (on) => onfill?.(track.id, on)}
						bind:indeterminate={() => some, () => {}}
					/>

					<span class="track__dot" aria-hidden="true"></span>

					{#if readonly || !onrename}
						<span class="track__name">{track.name}</span>
					{:else}
						<!-- `plaintext-only` keeps pasted formatting out; the binding writes on every keystroke. -->
						<span
							class="track__name track__name--editable"
							contenteditable="plaintext-only"
							role="textbox"
							aria-label="Track name"
							tabindex="0"
							bind:textContent={
								() => track.name, (name) => onrename(track.id, name.trim() || track.name)
							}
						></span>
					{/if}

					{#if !readonly && tools}
						<span class="track__tools">
							<button
								type="button"
								class="btn btn--ghost btn--icon btn--sm"
								aria-label="Sound settings for {track.name}"
								aria-pressed={track.id === selected}
								onclick={() => onselect?.(track.id)}
							>
								<SlidersHorizontalIcon size={16} />
							</button>
							<button
								type="button"
								class="btn btn--ghost btn--icon btn--sm"
								aria-label="Move {track.name} up"
								disabled={row === 0}
								onclick={() => onmove?.(track.id, -1)}
							>
								<CaretUpIcon size={16} />
							</button>
							<button
								type="button"
								class="btn btn--ghost btn--icon btn--sm"
								aria-label="Move {track.name} down"
								disabled={row === pattern.tracks.length - 1}
								onclick={() => onmove?.(track.id, 1)}
							>
								<CaretDownIcon size={16} />
							</button>
							<button
								type="button"
								class="btn btn--ghost btn--icon btn--sm btn--danger"
								aria-label="Remove {track.name}"
								disabled={pattern.tracks.length === 1}
								onclick={() => onremove?.(track.id)}
							>
								<TrashIcon size={16} />
							</button>
						</span>
					{/if}
				</header>

				<div class="track__steps">
					{#each track.steps as s, column (column)}
						<Pad
							velocity={s.velocity}
							note={s.note}
							{melodic}
							{column}
							kind={track.kind}
							playing={column === step}
							{readonly}
							onpaint={() => onpaint?.(track.id, column)}
							ontranspose={(semitones) => ontranspose?.(track.id, column, semitones)}
						/>
					{/each}
				</div>
			</li>
		{/each}
	</ol>
</div>

<style>
	.grid {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.brushes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.brushes label {
		cursor: pointer;
	}

	.brushes label:has(:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.tracks {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		list-style: none;
		padding: 0;
	}

	.track {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.track--selected {
		border-color: oklch(70% 0.15 var(--hue));
	}

	.track--muted .track__steps {
		opacity: 0.4;
	}

	.track__head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 2rem;
	}

	.track__all {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: oklch(70% 0.15 var(--hue));
	}

	.track__dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: oklch(72% 0.17 var(--hue));
	}

	.track__name {
		font-size: var(--fs-sm);
		font-weight: var(--weight-medium);
		min-width: 3ch;
	}

	.track__name--editable {
		padding: 0 var(--space-1);
		border-radius: var(--radius-sm);
	}

	.track__name--editable:focus {
		background: var(--surface-active);
		outline: none;
	}

	.track__tools {
		display: flex;
		margin-inline-start: auto;
	}

	/* Two rows of eight on a phone; one row of sixteen once there is room. */
	.track__steps {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 4px;
	}

	@media (min-width: 40rem) {
		.track__steps {
			grid-template-columns: repeat(16, 1fr);
		}
	}

	@media (min-width: 64rem) {
		.track {
			flex-direction: row;
			align-items: center;
		}

		.track__head {
			flex: 0 0 15rem;
		}

		.track__steps {
			flex: 1;
		}
	}
</style>
