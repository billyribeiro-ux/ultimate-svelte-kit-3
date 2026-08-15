<script lang="ts">
	/**
	 * The mark: a clock face reading half past.
	 *
	 * Inline SVG rather than an `<img>`, for two reasons that both matter. It
	 * costs no request, so it is painted with the first byte of HTML rather than
	 * after a round trip. And it inherits `currentColor`, so it is correct in
	 * both themes without a second file or a filter.
	 */
	let { size = 28 }: { size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 32 32"
	fill="none"
	role="img"
	aria-label="Halfpast"
	focusable="false"
>
	<circle cx="16" cy="16" r="13" stroke="currentColor" stroke-width="2.5" />
	<!-- Hour hand at six, minute hand at six: half past six. -->
	<path
		d="M16 16V9"
		stroke="currentColor"
		stroke-width="2.5"
		stroke-linecap="round"
		opacity="0.45"
	/>
	<path d="M16 16v7.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
</svg>

<style>
	svg {
		display: block;
		flex-shrink: 0;
	}
</style>
