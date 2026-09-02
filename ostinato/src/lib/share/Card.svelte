<script lang="ts">
	import type { Published } from '#lib/server/patterns.ts';

	/**
	 * THE SHARE CARD
	 * ==============
	 *
	 * A 1200×630 picture of a pattern, for the `og:image` of its page and for
	 * the studio's "published" preview. Rendered on the server by
	 * `svelte/server`'s `render()` — a Svelte component used as an SVG template
	 * — and nowhere else. It has no `<style>` block because a stylesheet would
	 * be extracted to a file the SVG cannot reach; everything is an attribute.
	 *
	 * The boundary is the point of the component beyond the picture. A
	 * pattern row written by an old version might not parse; without the
	 * boundary the whole render throws and the page has no image. With it, the
	 * `failed` snippet draws a plain card — and `transformError` in the
	 * endpoint decides what the snippet is allowed to know about the error.
	 */
	let { published, origin }: { published: Published; origin: string } = $props();

	const hues: Record<string, number> = {
		kick: 25,
		snare: 80,
		hat: 200,
		clap: 340,
		bass: 290,
		lead: 165,
		sample: 60
	};

	const cell = 44;
	const gap = 6;
	const gridX = 80;
	const gridY = 240;
</script>

<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img">
	<title>{published.title} by @{published.artist.handle}</title>
	<rect width="1200" height="630" fill="#0b0b0f" />

	<svelte:boundary>
		<text
			x="80"
			y="110"
			font-family="system-ui, sans-serif"
			font-size="22"
			font-weight="600"
			fill="#ffb347"
			letter-spacing="3"
		>
			OSTINATO
		</text>
		<text
			x="80"
			y="180"
			font-family="system-ui, sans-serif"
			font-size="56"
			font-weight="700"
			fill="#f1efe9"
		>
			{published.title.length > 28 ? `${published.title.slice(0, 27)}…` : published.title}
		</text>

		{#each published.pattern.tracks as track, row (track.id)}
			{const hue = hues[track.kind] ?? 60}
			{#each track.steps as step, column (column)}
				{const on = step.velocity > 0}
				<rect
					x={gridX + column * (cell + gap)}
					y={gridY + row * (cell + gap)}
					width={cell}
					height={cell}
					rx="6"
					fill={on ? `oklch(${step.velocity > 80 ? 72 : 58}% 0.17 ${hue})` : '#1c1c24'}
				/>
			{/each}
		{/each}

		<text x="80" y="590" font-family="system-ui, sans-serif" font-size="26" fill="#a6a3b3">
			@{published.artist.handle} · {published.bpm} bpm · {published.pattern.tracks.length} tracks
		</text>
		<text
			x="1120"
			y="590"
			text-anchor="end"
			font-family="ui-monospace, monospace"
			font-size="22"
			fill="#6b6a7a"
		>
			{origin.replace(/^https?:\/\//, '')}/@{published.artist.handle}/{published.slug}
		</text>

		{#snippet failed(error)}
			<text
				x="80"
				y="180"
				font-family="system-ui, sans-serif"
				font-size="56"
				font-weight="700"
				fill="#f1efe9"
			>
				{published.title}
			</text>
			<text x="80" y="590" font-family="system-ui, sans-serif" font-size="26" fill="#a6a3b3">
				{(error as { message: string }).message}
			</text>
		{/snippet}
	</svelte:boundary>
</svg>
