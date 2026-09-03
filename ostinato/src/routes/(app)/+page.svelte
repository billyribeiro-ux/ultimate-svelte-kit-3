<script lang="ts">
	import { hydratable } from 'svelte';
	import { cinematic } from '#lib/motion/cinematic.ts';
	import { getFeatured } from '#lib/remote/patterns.remote.ts';
	import { preset } from '#lib/pattern/presets.ts';
	import PatternCard from '#lib/components/PatternCard.svelte';
	import Section from '#lib/components/Section.svelte';

	/**
	 * THE DEMO GROOVE
	 * ===============
	 *
	 * The hero shows a pattern lighting up step by step with no audio and no
	 * JavaScript: each pad has a CSS animation offset by its column. The
	 * pattern is a real preset, so what plays when somebody clicks "open in the
	 * studio" is what they were just looking at.
	 */
	const demo = preset('four-on-the-floor');

	/**
	 * `hydratable` for a random number that must agree with itself.
	 *
	 * The dots behind the hero drift with random delays. Random on the server
	 * and random again in the browser means the markup SvelteKit hydrates does
	 * not match the markup it rendered — a hydration mismatch, and a visible
	 * jump. `hydratable` runs the function once on the server, bakes the result
	 * into the page, and hands the browser *that* value instead of a new one.
	 */
	const seeds = hydratable('ostinato:hero-seeds', () =>
		Array.from({ length: 24 }, () => ({
			x: Math.random() * 100,
			y: Math.random() * 100,
			d: Math.random() * 8
		}))
	);

	const words = 'A groovebox in your browser.'.split(' ');
</script>

<svelte:head>
	<title>Ostinato — a groovebox in your browser</title>
	<meta
		name="description"
		content="A step sequencer with synthesised drums and bass, shareable patterns, live jam rooms and an embeddable player. Built to show everything Svelte 5 and SvelteKit 3 can do."
	/>
</svelte:head>

<section class="hero page" {@attach cinematic()}>
	<div class="hero__dots" aria-hidden="true">
		{#each seeds as seed, i (i)}
			<span
				class="dot"
				style:left="{seed.x}%"
				style:top="{seed.y}%"
				style:animation-delay="-{seed.d}s"
			></span>
		{/each}
	</div>

	<p class="hero__eyebrow" data-rise>Ostinato</p>
	<h1 class="hero__title">
		{#each words as word, i (i)}
			<span class="hero__word" data-word>{word}</span>
		{/each}
	</h1>
	<p class="hero__lede" data-rise>
		Sixteen steps, a synthesised kit, a bass that moves. Make a groove, share it as a link, publish
		it to the gallery, or jam on it with somebody else in real time.
	</p>

	<div class="hero__actions cluster" data-rise>
		<a class="btn btn--primary btn--lg" href="/studio?preset=four-on-the-floor">Open the studio</a>
		<a class="btn btn--lg" href="/jam/lobby">Join the lobby jam</a>
	</div>

	<div class="demo" aria-hidden="true">
		{#each demo.tracks as track (track.id)}
			<div class="demo__row" style:--hue={`var(--hue-${track.kind})`}>
				{#each track.steps as step, column (column)}
					<span
						class={['demo__pad', { 'demo__pad--on': step.velocity > 0 }]}
						style:--column={column}
						data-pad
					></span>
				{/each}
			</div>
		{/each}
	</div>
</section>

<div class="page">
	<Section eyebrow="Featured" title="Grooves worth stealing">
		<!--
			`await` in markup, inside a boundary with a `pending` snippet. The
			featured list is a `prerender` remote function: at build time this
			resolved and was baked into the page, so on a real visit it arrives
			with the HTML and the pending state never shows.
		-->
		<svelte:boundary>
			<ul class="featured">
				{#each await getFeatured() as published (published.id)}
					<li><PatternCard {published} /></li>
				{:else}
					<li class="hint">Nothing featured yet — publish something from the studio.</li>
				{/each}
			</ul>

			{#snippet pending()}
				<p class="hint">Loading the featured grooves…</p>
			{/snippet}

			{#snippet failed(error, reset)}
				<p class="issue">
					The featured list could not be loaded. <button class="btn btn--sm" onclick={reset}
						>Try again</button
					>
				</p>
				<p class="hint">{(error as Error).message}</p>
			{/snippet}
		</svelte:boundary>
	</Section>

	<Section eyebrow="What is inside" title="Everything the framework can do, used for something">
		<ul class="features">
			<li>
				<h3>A real scheduler</h3>
				<p>
					Two clocks: a timer looks ahead, the audio clock plays exactly on time. Swing, velocity
					and tempo changes land on the next sixteenth.
				</p>
			</li>
			<li>
				<h3>Links that are saves</h3>
				<p>
					The whole pattern fits in the address bar — about two hundred characters. Paste it
					anywhere and it opens.
				</p>
			</li>
			<li>
				<h3>Publish, remix, embed</h3>
				<p>
					A gallery with vanity addresses, a share card drawn on the server, and a <code
						>&lt;ostinato-player&gt;</code
					> element for any page.
				</p>
			</li>
			<li>
				<h3>Jam rooms</h3>
				<p>
					One pattern, many browsers, over a live query. Every toggle is heard by everyone in the
					room.
				</p>
			</li>
		</ul>
	</Section>
</div>

<style>
	.hero {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding-block: var(--space-7) var(--space-6);
		overflow: hidden;
	}

	.hero__dots {
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
	}

	.dot {
		position: absolute;
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--accent);
		opacity: 0.25;
		animation: drift 8s ease-in-out infinite alternate;
	}

	@keyframes drift {
		to {
			transform: translateY(-24px);
			opacity: 0.6;
		}
	}

	.hero__eyebrow {
		color: var(--accent);
		font-weight: var(--weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: var(--fs-sm);
	}

	.hero__title {
		max-width: 14ch;
	}

	.hero__word {
		display: inline-block;
	}

	.hero__word + .hero__word {
		margin-inline-start: 0.28em;
	}

	.hero__lede {
		max-width: var(--measure);
		color: var(--text-muted);
		font-size: var(--fs-lg);
	}

	/* ---- The demo grid: pure CSS, plays forever, obeys reduced motion ---- */
	.demo {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: var(--space-4);
	}

	.demo__row {
		display: grid;
		grid-template-columns: repeat(16, 1fr);
		gap: 4px;
	}

	.demo__pad {
		aspect-ratio: 1;
		border-radius: var(--radius-sm);
		background: var(--surface-active);
	}

	.demo__pad--on {
		background: oklch(72% 0.17 var(--hue));
		animation: pulse 2s steps(1) infinite;
		/* Sixteen steps at 120bpm are two seconds; each column fires an eighth later. */
		animation-delay: calc(var(--column) * 0.125s);
	}

	@keyframes pulse {
		0%,
		6% {
			background: var(--playhead);
			box-shadow: 0 0 12px var(--playhead);
		}
		6.25%,
		100% {
			background: oklch(72% 0.17 var(--hue));
			box-shadow: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.demo__pad--on,
		.dot {
			animation: none;
		}
	}

	.featured {
		display: grid;
		gap: var(--space-4);
		list-style: none;
		padding: 0;
	}

	.features {
		display: grid;
		gap: var(--space-4);
		list-style: none;
		padding: 0;
	}

	.features li {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.features p {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	@media (min-width: 40rem) {
		.hero {
			padding-block: var(--space-8);
		}

		.featured,
		.features {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 64rem) {
		.featured {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
