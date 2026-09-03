<script lang="ts">
	import type { Note } from '#lib/music/note.ts';

	/**
	 * ONE STEP
	 * ========
	 *
	 * A button that is on or off and, when on, hit hard or soft. It knows
	 * nothing about the pattern: the grid tells it what it is showing and it
	 * reports what was done to it. A hundred and twenty-eight of these make a
	 * bar, so it is kept small.
	 */
	let {
		velocity,
		note,
		melodic,
		column,
		playing,
		kind,
		readonly = false,
		onpaint,
		ontranspose
	}: {
		velocity: number;
		note: Note;
		melodic: boolean;
		column: number;
		playing: boolean;
		kind: string;
		readonly?: boolean;
		onpaint: () => void;
		ontranspose: (semitones: number) => void;
	} = $props();

	const on = $derived(velocity > 0);

	function keydown(event: KeyboardEvent) {
		if (readonly || !melodic || !on) return;
		const steps: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 12, PageDown: -12 };
		const delta = steps[event.key];
		if (delta === undefined) return;
		event.preventDefault();
		ontranspose(delta);
	}
</script>

<!--
	`class` takes an array: strings and objects, falsy entries dropped — clsx
	semantics, built in. It reads as the list of things this pad *is*.
-->
<button
	type="button"
	class={[
		'pad',
		{
			'pad--on': on,
			'pad--accent': velocity > 80,
			'pad--playing': playing,
			'pad--beat': column % 4 === 0,
			'pad--readonly': readonly
		}
	]}
	style:--hue={`var(--hue-${kind})`}
	style:--level={velocity / 127}
	aria-pressed={on}
	aria-label="Step {column + 1}{on
		? `, ${melodic ? note.name : velocity > 80 ? 'accent' : 'soft'}`
		: ''}"
	disabled={readonly && !on}
	onclick={onpaint}
	onkeydown={keydown}
>
	{#if on && melodic}
		<span class="pad__note">{note.pitchClass}<sub>{note.octave}</sub></span>
	{/if}
</button>

<style>
	.pad {
		position: relative;
		aspect-ratio: 1;
		width: 100%;
		min-width: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-raised);
		color: var(--on-accent);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background var(--dur-fast) linear,
			transform var(--dur-fast) var(--ease-out),
			box-shadow var(--dur-fast) linear;
	}

	.pad--beat {
		border-color: var(--border-strong);
	}

	.pad:hover:not(.pad--readonly) {
		background: var(--surface-hover);
	}

	.pad--on {
		border-color: transparent;
		background: oklch(calc(52% + 22% * var(--level)) 0.16 var(--hue));
	}

	.pad--accent {
		box-shadow: inset 0 0 0 2px oklch(88% 0.1 var(--hue));
	}

	.pad--playing {
		outline: 2px solid var(--playhead);
		outline-offset: -2px;
	}

	.pad--on.pad--playing {
		transform: scale(1.08);
		box-shadow: 0 0 14px oklch(75% 0.18 var(--hue));
	}

	.pad--readonly {
		cursor: default;
	}

	.pad__note {
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		font-weight: var(--weight-semibold);
		line-height: 1;
	}

	.pad__note sub {
		font-size: 0.7em;
	}
</style>
