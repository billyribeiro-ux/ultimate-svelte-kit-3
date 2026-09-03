<script lang="ts">
	import { STEPS, type Pattern } from '#lib/pattern/model.ts';

	/**
	 * A pattern as a picture: one row of squares per track, lit where a step
	 * is. It is an SVG so that it scales to a card, a hero and a share image
	 * from the same markup, and it is the same drawing `Card.svelte` uses on
	 * the server.
	 */
	let { pattern, playhead = -1 }: { pattern: Pattern; playhead?: number } = $props();

	const cell = 10;
	const gap = 2;
	const width = STEPS * (cell + gap) - gap;
	const height = $derived(pattern.tracks.length * (cell + gap) - gap);
</script>

<svg
	viewBox="0 0 {width} {height}"
	class="mini"
	role="img"
	aria-label="{pattern.tracks.length} tracks, 16 steps"
>
	{#each pattern.tracks as track, row (track.id)}
		{#each track.steps as step, column (column)}
			{const on = step.velocity > 0}
			<rect
				x={column * (cell + gap)}
				y={row * (cell + gap)}
				width={cell}
				height={cell}
				rx="2"
				class={[
					'cell',
					{
						'cell--on': on,
						'cell--soft': on && step.velocity <= 80,
						'cell--now': column === playhead
					}
				]}
				style:--hue={`var(--hue-${track.kind})`}
			/>
		{/each}
	{/each}
</svg>

<style>
	.mini {
		width: 100%;
		height: auto;
	}

	.cell {
		fill: var(--surface-active);
		transition: fill var(--dur-fast) linear;
	}

	.cell--on {
		fill: oklch(72% 0.17 var(--hue));
	}

	.cell--soft {
		fill: oklch(58% 0.11 var(--hue));
	}

	.cell--now {
		fill: var(--playhead);
	}
</style>
