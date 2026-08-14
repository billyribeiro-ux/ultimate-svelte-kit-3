<script lang="ts">
	import Seo from '#lib/seo/Seo.svelte';
	import { breadcrumbSchema, personSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl, site } from '#lib/data/site.ts';
	import { team } from '#lib/data/team.ts';

	import SectionHeader from '#lib/components/marketing/SectionHeader.svelte';
	import StatStrip from '#lib/components/marketing/StatStrip.svelte';
	import CtaBand from '#lib/components/marketing/CtaBand.svelte';

	const pageUrl = absoluteUrl('/about');

	const facts = [
		{ value: '2021', label: 'Founded' },
		{ value: '19', label: 'People' },
		{ value: 'New York', label: 'Headquarters' },
		{ value: 'Self-funded', label: 'Ownership' }
	];

	const principles = [
		{
			title: 'Show the working',
			body: 'Every score and classification in the product can be expanded to show the inputs behind it. If we cannot explain how a number was produced, we do not ship the number.'
		},
		{
			title: 'Say what we do not know',
			body: 'Dealer positioning is inferred, not observed. Opening-position detection is probabilistic. We label estimates as estimates, in the product and on this website.'
		},
		{
			title: 'Never give advice',
			body: 'We are a data company. We do not run a signals service, we do not publish trade ideas, and we do not take a cut of anything you do with the data.'
		}
	];
</script>

<Seo
	title="About — the team behind StrikeFlow"
	description="StrikeFlow was founded in 2021 by a derivatives trader and a market data engineer. Here is who builds it, what we believe about market data, and what we refuse to do."
	schema={[
		...team.map(personSchema),
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'About', path: '/about' }
		])
	]}
/>

<section class="page-hero">
	<div class="container container--wide">
		<h1 class="page-hero__title">We got tired of reading the tape an hour late</h1>
		<p class="lede">
			StrikeFlow started in 2021 because the tools available to anyone outside an institutional desk
			were either delayed, incomplete, or confidently wrong — and often all three.
		</p>
	</div>
</section>

<section class="section section--tight" aria-label="Company facts">
	<div class="container container--wide">
		<StatStrip stats={facts} />
	</div>
</section>

<section class="section story" aria-labelledby="story-heading">
	<div class="container container--narrow">
		<h2 id="story-heading">The short version</h2>

		<p>
			Dana spent nine years on an equity derivatives desk, latterly running index volatility. The
			desk had a consolidated, classified, real-time view of the options tape. It was not especially
			clever technology — it was mostly a matter of paying for the full feed and putting serious
			engineering behind normalising it.
		</p>

		<p>
			Outside that building, the same information was either fifteen minutes late, missing the
			aggressor side, or reported one leg at a time so that a hedged spread looked like an
			aggressive directional bet. The gap was not analytical sophistication. It was plumbing.
		</p>

		<p>
			Marcus had spent his career building exactly that plumbing — market data infrastructure for
			two exchanges and a market maker. In 2021 the two of them started building the version of that
			desk tool that anyone could subscribe to.
		</p>

		<p>
			We are nineteen people in New York, self-funded, and we sell one thing: a clean, fast,
			honestly-labelled view of the options market. We have turned down every offer to bolt a
			signals service onto it, for the reason set out below.
		</p>
	</div>
</section>

<section class="section principles" aria-labelledby="principles-heading">
	<div class="container container--wide">
		<SectionHeader
			id="principles-heading"
			eyebrow="How we work"
			title="Three rules we have not broken yet"
		/>

		<ul class="principles__list" role="list">
			{#each principles as principle (principle.title)}
				<li class="principles__item">
					<h3 class="principles__title">{principle.title}</h3>
					<p class="principles__body">{principle.body}</p>
				</li>
			{/each}
		</ul>
	</div>
</section>

<!--
	THE TEAM SECTION.

	For a financial site this is not an optional "meet the team" page. Google's search
	quality rater guidelines direct raters to check who is responsible for YMYL content
	and whether they have relevant expertise. Named people with real, checkable
	backgrounds — and matching `Person` structured data, emitted above — is how you
	answer that question in a form both humans and machines can verify.
-->
<section class="section team" aria-labelledby="team-heading">
	<div class="container container--wide">
		<SectionHeader id="team-heading" eyebrow="The team" title="Who builds and writes this" />

		<ul class="team__list auto-grid" role="list">
			{#each team as person (person.id)}
				<li class="team__item" id={person.id}>
					<span class="team__avatar" aria-hidden="true">{person.initials}</span>

					<h3 class="team__name">
						{person.name}{#if person.credentials}<span class="team__credentials"
								>, {person.credentials}</span
							>{/if}
					</h3>
					<p class="team__role">{person.role}</p>
					<p class="team__bio">{person.bio}</p>

					{#if person.sameAs?.length}
						<ul class="team__links" role="list">
							{#each person.sameAs as profile (profile)}
								<li>
									<a href={profile} target="_blank" rel="noopener noreferrer">
										{new URL(profile).hostname.replace('www.', '')}
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</section>

<section class="section contact-note" aria-labelledby="contact-heading">
	<div class="container container--narrow text-center">
		<h2 id="contact-heading">Talk to us</h2>
		<p class="lede">
			We answer our own email. General enquiries go to
			<a href="mailto:{site.contact.email}">{site.contact.email}</a>, support to
			<a href="mailto:{site.contact.support}">{site.contact.support}</a>.
		</p>
	</div>
</section>

<CtaBand />

<style>
	.page-hero {
		padding-block: calc(var(--header-height) + var(--space-10)) var(--space-4);
		background:
			radial-gradient(
				70% 60% at 20% -10%,
				color-mix(in srgb, var(--brand-500) 14%, transparent),
				transparent 70%
			),
			var(--bg-root);
	}

	.page-hero__title {
		max-width: 18ch;
	}

	.page-hero .lede {
		margin-block-start: var(--space-5);
	}

	/* `.stack`-style rhythm for the prose block. */
	.story h2 {
		margin-block-end: var(--space-6);
	}

	.story p + p {
		margin-block-start: var(--space-5);
	}

	.principles {
		background-color: var(--bg-canvas);
		border-block: 1px solid var(--border);
	}

	.principles__list {
		display: grid;
		gap: var(--space-6);
		margin-block-start: var(--space-10);
	}

	.principles__item {
		padding-inline-start: var(--space-5);
		border-inline-start: 2px solid var(--accent);
		margin: 0;
		max-width: none;
	}

	.principles__title {
		font-size: var(--fs-lg);
		margin-block-end: var(--space-2);
	}

	.principles__body {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		max-width: none;
	}

	.team__list {
		--grid-min: 16rem;
		margin-block-start: var(--space-10);
	}

	.team__item {
		padding: var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background-color: var(--surface);
		margin: 0;
		max-width: none;
	}

	/*
	 * Initials rather than a photograph.
	 *
	 * Four headshots is four image requests and four chances of layout shift, for
	 * decoration. If you do use photos: set explicit width and height attributes so
	 * the browser reserves the space before the image lands.
	 */
	.team__avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		border-radius: var(--radius-full);
		background-color: color-mix(in srgb, var(--brand-500) 18%, transparent);
		color: var(--brand-300);
		font-family: var(--font-heading);
		font-weight: var(--weight-bold);
		font-size: var(--fs-sm);
		letter-spacing: var(--tracking-wide);
		margin-block-end: var(--space-4);
	}

	.team__name {
		font-size: var(--fs-md);
	}

	.team__credentials {
		font-weight: var(--weight-medium);
		color: var(--text-muted);
	}

	.team__role {
		font-size: var(--fs-sm);
		color: var(--text-brand);
		margin-block-start: 0.125rem;
		max-width: none;
	}

	.team__bio {
		margin-block-start: var(--space-3);
		font-size: var(--fs-sm);
		color: var(--text-secondary);
		max-width: none;
	}

	.team__links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-block-start: var(--space-4);
	}

	.team__links li {
		margin: 0;
		max-width: none;
	}

	.team__links a {
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.contact-note {
		border-top: 1px solid var(--border);
	}

	.contact-note .lede {
		margin-block-start: var(--space-4);
	}

	@media (min-width: 64em) {
		.principles__list {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
