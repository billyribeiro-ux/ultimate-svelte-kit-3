<script lang="ts">
	import { resolve } from '$app/paths';
	import { DownloadSimpleIcon, CheckCircleIcon, WarningCircleIcon } from 'phosphor-svelte';

	import Seo from '#lib/seo/Seo.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const messages = {
		expired: {
			title: 'That download link has expired',
			body: 'Links stay valid for 24 hours. Request the guide again and we will send you a fresh one straight away.'
		},
		'bad-signature': {
			title: 'That download link is not valid',
			body: 'The link appears to have been altered. Request the guide again to get a working one.'
		},
		malformed: {
			title: 'Something is missing from that link',
			body: 'It looks like the link was truncated somewhere along the way. Request the guide again and we will send a new one.'
		}
	} as const;
</script>

<!--
	`noindex` on this page.

	It's a gated confirmation page. If it were indexed, Google would send people
	straight here from search, bypassing the form — which both breaks the flow (they
	arrive with no valid token) and makes the gate pointless. `robots.txt` also
	disallows it, and the server sets an X-Robots-Tag header. Three layers, because
	the cost of each is one line.
-->
<Seo
	title="Your guide is ready"
	description="Download your free copy of How to read options flow without fooling yourself."
	noindex
/>

<section class="thanks">
	<div class="container container--narrow">
		{#if data.status === 'valid'}
			<div class="thanks__panel">
				<span class="thanks__icon thanks__icon--ok" aria-hidden="true">
					<CheckCircleIcon size={38} weight="duotone" />
				</span>

				<h1 class="thanks__title">Your guide is ready</h1>

				<p class="lede">
					We've also emailed a copy to <strong>{data.email}</strong>, so you can come back to it
					later.
				</p>

				<div class="thanks__action">
					<!--
						`download` asks the browser to save the file rather than navigate to
						it. Without it, a PDF opens in the browser's built-in viewer and a
						chunk of people never realise they can keep it.
					-->
					<a class="thanks__download" href={data.downloadUrl} download>
						<DownloadSimpleIcon size={22} aria-hidden="true" />
						<span>Download the PDF (8 chapters)</span>
					</a>
					<p class="thanks__note">This link stays valid for 24 hours.</p>
				</div>

				<div class="thanks__next">
					<h2 class="thanks__next-title">While you're here</h2>
					<div class="thanks__next-actions">
						<Button href={resolve('/blog')} variant="secondary">Read our research notes</Button>
						<Button href={resolve('/features')} variant="ghost">See the platform</Button>
					</div>
				</div>
			</div>
		{:else}
			{@const message = messages[data.reason ?? 'malformed']}
			<div class="thanks__panel">
				<span class="thanks__icon thanks__icon--warn" aria-hidden="true">
					<WarningCircleIcon size={38} weight="duotone" />
				</span>

				<h1 class="thanks__title">{message.title}</h1>
				<p class="lede">{message.body}</p>

				<div class="thanks__action">
					<Button href={resolve('/guide')} size="lg">Request the guide again</Button>
				</div>
			</div>
		{/if}
	</div>
</section>

<style>
	.thanks {
		padding-block: calc(var(--header-height) + var(--space-12)) var(--section-y);
		min-height: 60svh;
	}

	.thanks__panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-4);
		padding: var(--space-8) var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background-color: var(--surface);
	}

	.thanks__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 4.5rem;
		height: 4.5rem;
		border-radius: var(--radius-full);
	}

	.thanks__icon--ok {
		background-color: color-mix(in srgb, var(--bull) 14%, transparent);
		color: var(--bull-400);
	}

	.thanks__icon--warn {
		background-color: color-mix(in srgb, var(--warn) 14%, transparent);
		color: var(--warn-400);
	}

	.thanks__title {
		font-size: var(--fs-2xl);
	}

	.thanks .lede {
		margin-inline: auto;
	}

	.thanks__action {
		width: 100%;
		margin-block-start: var(--space-4);
	}

	.thanks__download {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		width: 100%;
		min-height: 3.5rem;
		padding: var(--space-4) var(--space-6);
		border-radius: var(--radius-md);
		background-color: var(--accent);
		color: var(--accent-contrast);
		font-family: var(--font-heading);
		font-size: var(--fs-md);
		font-weight: var(--weight-semibold);
		text-decoration: none;
		transition: background-color var(--dur-fast) var(--ease-out);
	}

	@media (hover: hover) {
		.thanks__download:hover {
			background-color: var(--accent-hover);
			color: var(--accent-contrast);
		}
	}

	.thanks__note {
		margin-block-start: var(--space-3);
		font-size: var(--fs-xs);
		color: var(--text-muted);
		max-width: none;
	}

	.thanks__next {
		width: 100%;
		margin-block-start: var(--space-8);
		padding-block-start: var(--space-6);
		border-top: 1px solid var(--border);
	}

	.thanks__next-title {
		font-size: var(--fs-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-caps);
		color: var(--text-muted);
		margin-block-end: var(--space-4);
	}

	.thanks__next-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-3);
	}

	@media (min-width: 48em) {
		.thanks__panel {
			padding: var(--space-12) var(--space-10);
		}

		.thanks__action {
			max-width: 26rem;
			margin-inline: auto;
		}
	}
</style>
