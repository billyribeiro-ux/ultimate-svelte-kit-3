<script lang="ts">
	/**
	 * The mark: four tesserae, one of them out of step.
	 *
	 * Inline SVG rather than an `<img>`. It is 400 bytes, it inherits `currentColor`
	 * so it works in both themes without a second file, and it costs no request —
	 * a logo that arrives after first paint is a logo people watch appear.
	 */
	interface Props {
		/** Rendered size in pixels. The mark is drawn on a 24-unit grid. */
		size?: number;
		/** Show the wordmark beside the tiles. */
		wordmark?: boolean;
	}

	let { size = 24, wordmark = false }: Props = $props();
</script>

<span class="logo" style="--size: {size}px">
	<svg
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		aria-hidden="true"
		focusable="false"
	>
		<!--
			Three squares on the grid and one rotated off it. The odd tile is the
			whole idea: pieces that do not quite line up, which the tool exists to
			bring into agreement.
		-->
		<rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" opacity="0.9" />
		<rect x="13.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" opacity="0.45" />
		<rect x="1.5" y="13.5" width="9" height="9" rx="2" fill="currentColor" opacity="0.45" />
		<rect
			x="13.5"
			y="13.5"
			width="9"
			height="9"
			rx="2"
			fill="var(--accent)"
			transform="rotate(12 18 18)"
		/>
	</svg>

	{#if wordmark}
		<span class="logo__word">Tessera</span>
	{/if}
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text);
	}

	.logo__word {
		font-size: calc(var(--size) * 0.72);
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-tight);
		line-height: 1;
	}
</style>
