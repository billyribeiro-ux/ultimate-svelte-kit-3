<script lang="ts">
	/**
	 * A trip as a thumbnail: its stops joined by lines, in a small box, with
	 * nothing else. The data is `[lng, lat]` pairs; the projection is the
	 * simplest there is — longitude across, latitude up, scaled to fit — which
	 * is wrong for the whole world and right for a trip.
	 */
	interface Props {
		points: readonly (readonly [number, number])[];
		width?: number;
		height?: number;
		label?: string;
	}

	let { points, width = 160, height = 90, label = '' }: Props = $props();

	const projected = $derived.by(() => {
		if (points.length === 0) return [];
		const lngs = points.map(([lng]) => lng);
		const lats = points.map(([, lat]) => lat);
		const west = Math.min(...lngs);
		const east = Math.max(...lngs);
		const south = Math.min(...lats);
		const north = Math.max(...lats);
		const inset = 10;
		const spanX = Math.max(east - west, 0.5);
		const spanY = Math.max(north - south, 0.5);
		// Keep the aspect honest: scale both axes by the same factor.
		const scale = Math.min((width - inset * 2) / spanX, (height - inset * 2) / spanY);
		const offsetX = (width - spanX * scale) / 2;
		const offsetY = (height - spanY * scale) / 2;
		return points.map(([lng, lat]) => [
			offsetX + (lng - west) * scale,
			offsetY + (north - lat) * scale
		]);
	});

	const path = $derived(
		projected
			.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x!.toFixed(1)},${y!.toFixed(1)}`)
			.join(' ')
	);
</script>

<svg class="thumb" viewBox="0 0 {width} {height}" role="img" aria-label={label}>
	<rect {width} {height} rx="8" class="thumb__paper" />
	{#if projected.length > 1}
		<path d={path} class="thumb__route" />
	{/if}
	{#each projected as [x, y], i (i)}
		<circle cx={x} cy={y} r="3" class="thumb__stop" />
	{/each}
</svg>

<style>
	.thumb {
		width: 100%;
		height: auto;
		display: block;
	}

	.thumb__paper {
		fill: var(--paper-3);
	}

	.thumb__route {
		fill: none;
		stroke: var(--sea);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-dasharray: 5 4;
	}

	.thumb__stop {
		fill: var(--paper-2);
		stroke: var(--sea);
		stroke-width: 2;
	}
</style>
