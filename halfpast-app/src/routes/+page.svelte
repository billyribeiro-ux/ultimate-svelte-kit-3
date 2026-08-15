<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		CalendarCheckIcon,
		ClockCountdownIcon,
		GlobeHemisphereWestIcon,
		LockKeyIcon
	} from 'phosphor-svelte';
	import Button from '#lib/components/Button.svelte';
	import { reveal, stagger, magnetic } from '#lib/motion/index.ts';

	const FEATURES = [
		{
			icon: ClockCountdownIcon,
			title: 'Nobody gets double-booked',
			body: 'Two people tapping the same eleven o’clock is not an edge case, it is a Monday. The database refuses the second one, so one of them always gets a straight answer instead of both getting a confirmation.'
		},
		{
			icon: GlobeHemisphereWestIcon,
			title: 'Right time, wherever they are',
			body: 'Your hours are your hours. A customer in Lisbon sees them in their own clock, and the two mornings a year the clocks move are handled properly rather than hopefully.'
		},
		{
			icon: CalendarCheckIcon,
			title: 'The page updates itself',
			body: 'When a slot goes, it goes — on every screen currently looking at it, within a second, without anybody pressing refresh.'
		},
		{
			icon: LockKeyIcon,
			title: 'No account to book',
			body: 'A name, an email, done. Your customers get a link that lets them see or cancel their appointment; you get fewer no-shows and no password resets to answer.'
		}
	];
</script>

<svelte:head>
	<title>Halfpast — appointment booking for small studios</title>
	<meta
		name="description"
		content="A booking page for independent studios, clinics and salons. Live availability, real time zone handling, and no account for your customers to forget."
	/>
</svelte:head>

<section class="hero">
	<div class="container hero-inner">
		<p class="eyebrow" {@attach reveal({ y: 8, duration: 0.4 })}>Appointment booking</p>

		<h1 {@attach reveal({ y: 20, delay: 0.05 })}>
			The diary that argues<br />with itself, so you don’t
		</h1>

		<p class="lede" {@attach reveal({ y: 16, delay: 0.12 })}>
			Halfpast gives your studio a booking page that is honest about what is free — down to the
			second, across time zones, and even on the two mornings a year the clocks move.
		</p>

		<div class="cta" {@attach reveal({ y: 12, delay: 0.2 })}>
			<div {@attach magnetic(0.2)}>
				<Button href={resolve('/book/[slug]', { slug: 'willow-lane' })} size="lg">
					See a live booking page
				</Button>
			</div>
			<Button href={resolve('/sign-in')} size="lg" variant="secondary">Sign in to a diary</Button>
		</div>

		<p class="demo-note text-faint" {@attach reveal({ y: 8, delay: 0.28 })}>
			Demo studio: <code>ada@willowlane.test</code> / <code>halfpast-demo-2026</code>
		</p>
	</div>
</section>

<section class="section">
	<div class="container">
		<ul class="features auto-grid" role="list" {@attach stagger({ y: 14, each: 0.06 })}>
			{#each FEATURES as feature (feature.title)}
				{@const Icon = feature.icon}
				<li class="feature">
					<span class="feature-icon" aria-hidden="true"><Icon weight="duotone" /></span>
					<h2>{feature.title}</h2>
					<p>{feature.body}</p>
				</li>
			{/each}
		</ul>
	</div>
</section>

<style>
	.hero {
		padding-block: var(--space-8) var(--space-7);
		/*
		 * A single soft wash behind the headline. `radial-gradient` with a
		 * transparent stop rather than an image: no request, no layout shift, and
		 * it recolours itself in dark mode because the colour is a token.
		 */
		background:
			radial-gradient(
				ellipse 80% 60% at 50% -10%,
				color-mix(in oklab, var(--accent) 12%, transparent),
				transparent 70%
			),
			var(--paper);
	}

	.hero-inner {
		max-width: 52rem;
	}

	h1 {
		font-size: var(--text-3xl);
		margin-block: var(--space-3) var(--space-4);
	}

	.lede {
		font-size: var(--text-md);
		color: var(--ink-muted);
		max-width: 46ch;
	}

	.cta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-block-start: var(--space-6);
	}

	/* Mobile first: full-width buttons stacked, side by side once there is room. */
	.cta :global(.btn) {
		width: 100%;
	}

	.cta > div {
		width: 100%;
	}

	@media (min-width: 30rem) {
		.cta :global(.btn),
		.cta > div {
			width: auto;
		}
	}

	.demo-note {
		margin-block-start: var(--space-5);
		font-size: var(--text-sm);
	}

	.demo-note code {
		font-size: 0.9em;
	}

	.features {
		--col-min: 17rem;
		--grid-gap: var(--space-5);
		list-style: none;
		padding: 0;
	}

	.feature {
		margin: 0;
		padding: var(--space-5);
		background: var(--surface);
		border: var(--border) solid var(--line);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}

	.feature-icon {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		font-size: 1.5rem;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: var(--radius-md);
		margin-block-end: var(--space-4);
	}

	.feature h2 {
		font-size: var(--text-md);
		margin-block-end: var(--space-2);
	}

	.feature p {
		font-size: var(--text-sm);
		color: var(--ink-muted);
		max-width: none;
	}
</style>
