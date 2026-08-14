<script lang="ts">
	import { EnvelopeSimpleIcon, PhoneIcon, MapPinIcon, LifebuoyIcon } from 'phosphor-svelte';

	import Seo from '#lib/seo/Seo.svelte';
	import { breadcrumbSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl, site } from '#lib/data/site.ts';

	const pageUrl = absoluteUrl('/contact');

	const channels = [
		{
			icon: EnvelopeSimpleIcon,
			title: 'Sales and general',
			body: 'Questions about plans, data coverage, or whether StrikeFlow fits how you trade.',
			linkLabel: site.contact.email,
			href: `mailto:${site.contact.email}`
		},
		{
			icon: LifebuoyIcon,
			title: 'Support',
			body: 'Existing customers. We aim to reply within one business day, and faster during market hours.',
			linkLabel: site.contact.support,
			href: `mailto:${site.contact.support}`
		},
		{
			icon: PhoneIcon,
			title: 'Desk enquiries',
			body: 'Team seats, API access and data licensing. Weekdays, 8am–6pm Eastern.',
			linkLabel: site.contact.phone,
			href: `tel:${site.contact.phone.replace(/[^+\d]/g, '')}`
		},
		{
			icon: MapPinIcon,
			title: 'Office',
			body: 'We are a small team and do not take walk-ins, but post reaches us here.',
			linkLabel: `${site.address.street}, ${site.address.city}, ${site.address.region} ${site.address.postalCode}`,
			href: undefined
		}
	];
</script>

<Seo
	title="Contact"
	description="Reach the StrikeFlow team — sales, customer support, desk and API enquiries, and our New York office address."
	schema={[
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Contact', path: '/contact' }
		])
	]}
/>

<section class="page-hero">
	<div class="container container--narrow">
		<h1>Talk to a human</h1>
		<p class="lede">
			No ticket portal and no chatbot. Every address below reaches a person on the team.
		</p>
	</div>
</section>

<section class="section section--tight" aria-label="Contact channels">
	<div class="container">
		<ul class="channels auto-grid" role="list">
			{#each channels as channel (channel.title)}
				{@const Icon = channel.icon}
				<li class="channels__item">
					<span class="channels__icon" aria-hidden="true">
						<Icon size={24} weight="duotone" />
					</span>
					<h2 class="channels__title">{channel.title}</h2>
					<p class="channels__body">{channel.body}</p>

					{#if channel.href}
						<a class="channels__link" href={channel.href}>{channel.linkLabel}</a>
					{:else}
						<!-- `<address>` is the correct element for contact details of its
						     nearest article or the document as a whole. -->
						<address class="channels__address">{channel.linkLabel}</address>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</section>

<section class="section note" aria-labelledby="note-heading">
	<div class="container container--narrow">
		<div class="note__panel">
			<h2 id="note-heading" class="note__title">Before you email about a trade</h2>
			<p>
				We cannot tell you what to buy, whether a particular print is bullish, or what to do with a
				position. StrikeFlow is a market data provider — we are not a broker-dealer and not a
				registered investment adviser, and answering those questions would make us one.
			</p>
			<p>
				What we are very happy to help with: how a number in the product was calculated, where a
				data point came from, and what its limitations are.
			</p>
		</div>
	</div>
</section>

<style>
	.page-hero {
		padding-block: calc(var(--header-height) + var(--space-10)) var(--space-2);
		background:
			radial-gradient(
				70% 60% at 20% -10%,
				color-mix(in srgb, var(--brand-500) 14%, transparent),
				transparent 70%
			),
			var(--bg-root);
	}

	.page-hero .lede {
		margin-block-start: var(--space-5);
	}

	.channels {
		--grid-min: 17rem;
	}

	.channels__item {
		padding: var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background-color: var(--surface);
		margin: 0;
		max-width: none;
	}

	.channels__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-md);
		background-color: color-mix(in srgb, var(--brand-500) 14%, transparent);
		color: var(--brand-400);
		margin-block-end: var(--space-4);
	}

	.channels__title {
		font-size: var(--fs-md);
		margin-block-end: var(--space-2);
	}

	.channels__body {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		max-width: none;
	}

	.channels__link {
		display: inline-block;
		margin-block-start: var(--space-4);
		font-family: var(--font-heading);
		font-weight: var(--weight-semibold);
		font-size: var(--fs-sm);
		/* Long email addresses shouldn't push the card wider than the grid cell. */
		overflow-wrap: anywhere;
	}

	.channels__address {
		display: block;
		margin-block-start: var(--space-4);
		font-style: normal;
		font-size: var(--fs-sm);
		color: var(--text-secondary);
	}

	.note__panel {
		padding: var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background-color: var(--bg-canvas);
	}

	.note__title {
		font-size: var(--fs-lg);
		margin-block-end: var(--space-4);
	}

	.note__panel p {
		font-size: var(--fs-sm);
		color: var(--text-secondary);
	}

	.note__panel p + p {
		margin-block-start: var(--space-4);
	}
</style>
