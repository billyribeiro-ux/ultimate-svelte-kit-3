<script lang="ts">
	/**
	 * A line of numbers as a line. Twelve hundred bytes, no chart library,
	 * because the thing it is for — a per-day spend under a trip's name — needs
	 * no axis, no legend and no tooltip.
	 */
	interface Props {
		values: readonly number[];
		width?: number;
		height?: number;
		/** What a screen reader says the picture is. */
		label?: string;
		class?: string;
	}

	let {
		values,
		width = 120,
		height = 32,
		label = 'Trend',
		class: className = ''
	}: Props = $props();

	const path = $derived.by(() => {
		if (values.length < 2) return '';
		const min = Math.min(...values);
		const max = Math.max(...values);
		const span = max - min || 1;
		const inset = 2;
		const stepX = (width - inset * 2) / (values.length - 1);
		return values
			.map((value, i) => {
				const x = inset + i * stepX;
				const y = height - inset - ((value - min) / span) * (height - inset * 2);
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	});
</script>

<svg
	class="waypoint-sparkline {className}"
	viewBox="0 0 {width} {height}"
	{width}
	{height}
	role="img"
	aria-label={label}
>
	{#if path}
		<path
			d={path}
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linejoin="round"
			stroke-linecap="round"
			vector-effect="non-scaling-stroke"
		/>
	{/if}
</svg>

<style>
	.waypoint-sparkline {
		display: inline-block;
		overflow: visible;
	}
</style>
