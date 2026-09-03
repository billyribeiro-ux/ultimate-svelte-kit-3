<script lang="ts">
	import { compassPoint, normalizeBearing } from './geo/index.js';

	/**
	 * A needle. It points along a bearing and names the nearest compass point
	 * for anybody who cannot see it.
	 */
	interface Props {
		/** degrees clockwise from north */
		bearing: number;
		size?: number;
		class?: string;
	}

	let { bearing, size = 48, class: className = '' }: Props = $props();

	const heading = $derived(normalizeBearing(bearing));
	const point = $derived(compassPoint(heading));
</script>

<svg
	class="waypoint-compass {className}"
	viewBox="0 0 48 48"
	width={size}
	height={size}
	role="img"
	aria-label="{Math.round(heading)} degrees, {point}"
	data-point={point}
>
	<circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-opacity="0.35" />
	<text
		x="24"
		y="10"
		text-anchor="middle"
		font-size="7"
		font-family="ui-sans-serif, system-ui, sans-serif"
		fill="currentColor"
		fill-opacity="0.7">N</text
	>
	<g class="waypoint-compass__needle" style:transform="rotate({heading}deg)">
		<path d="M24 12 L28 24 L24 22 L20 24 Z" fill="currentColor" />
		<path d="M24 36 L28 24 L24 26 L20 24 Z" fill="currentColor" fill-opacity="0.3" />
	</g>
</svg>

<style>
	.waypoint-compass {
		display: inline-block;
	}

	.waypoint-compass__needle {
		transform-origin: 24px 24px;
		transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	@media (prefers-reduced-motion: reduce) {
		.waypoint-compass__needle {
			transition: none;
		}
	}
</style>
