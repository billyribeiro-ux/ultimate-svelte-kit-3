<script lang="ts">
	import { hydratable } from 'svelte';
	import { cinematic } from '#lib/motion/cinematic.ts';
	import Section from '#lib/components/Section.svelte';
	import { TEMPLATES } from '#lib/sheet/templates.ts';

	/**
	 * A demo grid that needs no JavaScript: the formulas and their results,
	 * written out, with a CSS animation that "types" the formula into the
	 * bar. The results are real — `templates.spec.ts` computes them — and
	 * the point is that a person sees a spreadsheet before they load one.
	 */
	const demo = [
		['Category', 'Budgeted', 'Actual', 'Difference'],
		['Rent', '1,400.00', '1,400.00', '0.00'],
		['Groceries', '450.00', '512.40', '-62.40'],
		['Transport', '120.00', '96.50', '23.50'],
		['Total', '=SUM(B2:B4)', '=SUM(C2:C4)', '=B5-C5']
	];

	/**
	 * `hydratable` for a random number that must agree with itself: the
	 * drifting dots get random positions on the server, and the browser must
	 * use *those*, not new ones, or hydration would find different markup.
	 */
	const seeds = hydratable('abacus:hero-seeds', () =>
		Array.from({ length: 18 }, () => ({
			x: Math.random() * 100,
			y: Math.random() * 100,
			d: Math.random() * 8
		}))
	);

	const words = 'A spreadsheet, and what it teaches.'.split(' ');
</script>

<svelte:head>
	<title>Abacus — a spreadsheet in the browser</title>
	<meta
		name="description"
		content="A spreadsheet with a real formula engine, live collaboration, passkeys and streaming import — built to show everything Svelte 5 and SvelteKit 3 can do, and to explain reactivity through the thing that invented it."
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

	<p class="hero__eyebrow" data-rise>Abacus</p>
	<h1 class="hero__title">
		{#each words as word, i (i)}
			<span class="hero__word" data-word>{word}</span>
		{/each}
	</h1>
	<p class="hero__lede" data-rise>
		Formulas that recalculate only what changed. A grid that scrolls a million rows. Passkeys
		instead of passwords, and a second person editing beside you. Every cell is a lesson in how
		reactivity works — because a spreadsheet is where it was invented.
	</p>

	<div class="hero__actions cluster" data-rise>
		<a class="btn btn--primary btn--lg" href="/sheet/local">Open a sheet — no account</a>
		<a class="btn btn--lg" href="/templates">Start from a template</a>
	</div>

	<div class="demo" data-rise aria-hidden="true">
		<div class="demo__bar mono">
			<span class="demo__cell">D5</span><span class="demo__formula">=B5-C5</span>
		</div>
		<table class="demo__table">
			<tbody>
				{#each demo as row, r (r)}
					<tr>
						{#each row as text, c (c)}
							{#if r === 0}
								<th>{text}</th>
							{:else}
								<td class={{ num: c > 0, formula: text.startsWith('='), total: r === 4 }} data-pad>
									{text.startsWith('=')
										? c === 1
											? '1,970.00'
											: c === 2
												? '2,008.90'
												: '-38.90'
										: text}
								</td>
							{/if}
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<div class="page">
	<Section eyebrow="Templates" title="Three sheets that already work">
		<ul class="features">
			{#each Object.values(TEMPLATES) as template (template.slug)}
				<li>
					<h3><a href="/templates/{template.slug}">{template.title}</a></h3>
					<p>{template.summary}</p>
				</li>
			{/each}
		</ul>
	</Section>

	<Section eyebrow="What is inside" title="Everything the framework can do, used for something">
		<ul class="features">
			<li>
				<h3>A real engine</h3>
				<p>
					A formula language with fifty functions, a dependency graph that recalculates only what
					changed, cycles detected and named, and a property test that checks it against a
					from-scratch evaluation ten thousand times.
				</p>
			</li>
			<li>
				<h3>The reactivity lesson</h3>
				<p>
					The same engine built out of <code>$derived</code> — because Svelte's runtime is a spreadsheet
					— with the update order shown, side by side.
				</p>
			</li>
			<li>
				<h3>Passkeys, not passwords</h3>
				<p>
					Sign in with your phone's face or your laptop's fingerprint. There is no password column
					anywhere in the database, because there is no password.
				</p>
			</li>
			<li>
				<h3>Together, live</h3>
				<p>
					Share a link and edit at the same time. Every change is an operation, numbered by the
					server, applied everywhere — and you can see where the other person is.
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
		max-width: 16ch;
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

	.demo {
		max-width: 36rem;
		margin-top: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		overflow: hidden;
		box-shadow: var(--shadow-lg);
	}

	.demo__bar {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-sm);
	}

	.demo__cell {
		color: var(--text-muted);
	}

	.demo__formula {
		color: var(--accent-strong);
	}

	.demo__table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-sm);
	}

	.demo__table th,
	.demo__table td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--grid-line);
		border-right: 1px solid var(--grid-line);
		text-align: left;
	}

	.demo__table th {
		background: var(--grid-head);
		color: var(--grid-head-text);
		font-weight: var(--weight-medium);
		font-size: var(--fs-xs);
	}

	.demo__table .num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.demo__table .total {
		font-weight: var(--weight-semibold);
		background: var(--selection);
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

	@media (prefers-reduced-motion: reduce) {
		.dot {
			animation: none;
		}
	}

	@media (min-width: 40rem) {
		.hero {
			padding-block: var(--space-8);
		}
		.features {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
