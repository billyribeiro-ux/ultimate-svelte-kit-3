<script lang="ts">
	/**
	 * A trip as a thumbnail: its stops joined by lines, in a small box, with
	 * nothing else. The data is `[lng, lat]` pairs; the projection is the
	 * simplest there is — longitude across, latitude up, scaled to fit, with
	 * a degree of longitude shrunk by the cosine of the trip's middle
	 * latitude, as it is on the ground — which is wrong for the whole world
	 * and right for a trip. Without the cosine, Iberia was a flat smear
	 * across the top half of the box.
	 *
	 * The route goes through every stop; the dots do not. Five stops in one
	 * city are five rings drawn over each other at this size, a smudge, so
	 * stops closer than 6 units in the box share one dot.
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
		const inset = 12;
		const squash = Math.cos((((north + south) / 2) * Math.PI) / 180);
		const spanX = Math.max((east - west) * squash, 0.5);
		const spanY = Math.max(north - south, 0.5);
		// Keep the aspect honest: scale both axes by the same factor, and centre the drawing.
		const scale = Math.min((width - inset * 2) / spanX, (height - inset * 2) / spanY);
		const offsetX = (width - spanX * scale) / 2;
		const offsetY = (height - spanY * scale) / 2;
		return points.map(([lng, lat]) => [
			offsetX + (lng - west) * squash * scale,
			offsetY + (north - lat) * scale
		]);
	});

	const dots = $derived.by(() => {
		const kept: number[][] = [];
		for (const point of projected) {
			const [x = 0, y = 0] = point;
			if (kept.some(([kx = 0, ky = 0]) => Math.hypot(kx - x, ky - y) < 6)) continue;
			kept.push(point);
		}
		return kept;
	});

	const path = $derived(
		projected
			.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x!.toFixed(1)},${y!.toFixed(1)}`)
			.join(' ')
	);
</script>

<!--
	The box's shape is the viewBox's: 160×90 on the trips list, 320×160 in
	the embed. A fixed 16:9 in the CSS letterboxed the embed's 2:1 drawing
	with an empty band above and below.
-->
<svg
	class="thumb"
	viewBox="0 0 {width} {height}"
	style:aspect-ratio="{width} / {height}"
	role="img"
	aria-label={label}
>
	<rect {width} {height} rx="6" class="thumb__paper" />
	{#if projected.length > 1}
		<path d={path} class="thumb__route" />
	{/if}
	<!--
		Keyed by where the dot is. The loop that made `dots` keeps no two
		within 6px of each other, so a position is unique, and it is all a dot
		is: the stops behind it are not here, only their projection.
	-->
	{#each dots as [x, y] (`${x},${y}`)}
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

	/*
	 * `non-scaling-stroke`: the SVG is drawn in a small box (`width` ×
	 * `height`) and shown at whatever width the card or the frame is, and
	 * without this the 2px route would scale with it — a 4px line on a wide
	 * card, a 1px one in a narrow embed.
	 */
	.thumb__route {
		fill: none;
		stroke: var(--sea);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-dasharray: 5 4;
		vector-effect: non-scaling-stroke;
	}

	.thumb__stop {
		fill: var(--paper-2);
		stroke: var(--sea);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
</style>
