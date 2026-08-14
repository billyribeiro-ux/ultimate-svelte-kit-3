<!--
	LOGO — inline SVG.

	Inline rather than an <img> for three reasons:
	  1. No extra network request, so it can't delay the header render.
	  2. It inherits `currentColor`, so it recolours with the theme for free.
	  3. It's vector, so it's sharp on every display without a @2x variant.

	The trade-off is bytes in every HTML response. For a mark this small that's
	nothing; for a detailed illustration it would be the wrong call.
-->

<script lang="ts">
	interface Props {
		/** Height in rem. Width follows the aspect ratio. */
		size?: number;
		/** Hide the wordmark and show only the glyph — used in the mobile drawer. */
		markOnly?: boolean;
	}

	let { size = 1.75, markOnly = false }: Props = $props();
</script>

<span class="logo" style="--logo-size: {size}rem">
	<!--
		aria-hidden because the adjacent text node already says "StrikeFlow".
		Announcing it twice is noise for a screen reader user.
	-->
	<svg
		class="logo__mark"
		viewBox="0 0 32 32"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		focusable="false"
	>
		<rect width="32" height="32" rx="8" fill="url(#sf-gradient)" />
		<!-- An ascending flow line: the product in one glyph. -->
		<path
			d="M7 21.5L12.5 15.5L17 19L25 9.5"
			stroke="white"
			stroke-width="2.4"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<circle cx="25" cy="9.5" r="2.6" fill="white" />
		<defs>
			<linearGradient id="sf-gradient" x1="0" y1="0" x2="32" y2="32">
				<stop stop-color="#6E93FF" />
				<stop offset="1" stop-color="#3B63E8" />
			</linearGradient>
		</defs>
	</svg>

	{#if !markOnly}
		<span class="logo__word">StrikeFlow</span>
	{/if}
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
		font-family: var(--font-heading);
		font-size: var(--logo-size);
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--text-primary);
		line-height: 1;
	}

	.logo__mark {
		width: 1em;
		height: 1em;
		flex-shrink: 0;
	}

	.logo__word {
		font-size: 0.72em;
	}
</style>
