<!--
	CTA BAND — the repeated "get the free guide" conversion block.

	One component rather than copy-pasted markup on five pages, because the day
	marketing wants to change the wording, you want to change it once.
-->

<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRightIcon, FilePdfIcon } from 'phosphor-svelte';
	import Button from '#lib/components/ui/Button.svelte';

	interface Props {
		title?: string;
		body?: string;
		ctaLabel?: string;
	}

	let {
		title = 'Learn to read the tape before you trade it',
		body = 'Eight chapters on options flow: how sweeps, blocks and dealer positioning actually work, and the mistakes that make most scanners useless. Free, no card required.',
		ctaLabel = 'Get the free guide'
	}: Props = $props();
</script>

<section class="cta" aria-labelledby="cta-heading">
	<div class="container">
		<div class="cta__panel">
			<span class="cta__icon" aria-hidden="true">
				<FilePdfIcon size={30} weight="duotone" />
			</span>

			<div class="cta__copy">
				<h2 id="cta-heading" class="cta__title">{title}</h2>
				<p class="cta__body">{body}</p>
			</div>

			<div class="cta__action">
				<Button href={resolve('/guide')} variant="primary" size="lg" fullWidth pull>
					{ctaLabel}
					{#snippet iconTrailing()}<ArrowRightIcon />{/snippet}
				</Button>
			</div>
		</div>
	</div>
</section>

<style>
	.cta {
		padding-block: var(--section-y);
	}

	.cta__panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-8) var(--space-6);
		border: 1px solid var(--border-brand);
		border-radius: var(--radius-xl);
		/* A subtle brand wash rather than a solid block — a full-saturation panel
		   fights the page and reads as an ad. */
		background:
			radial-gradient(
				120% 140% at 0% 0%,
				color-mix(in srgb, var(--brand-500) 18%, transparent),
				transparent 60%
			),
			var(--surface);
	}

	.cta__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3.5rem;
		height: 3.5rem;
		flex-shrink: 0;
		border-radius: var(--radius-lg);
		background-color: color-mix(in srgb, var(--brand-500) 16%, transparent);
		color: var(--brand-300);
	}

	.cta__title {
		font-size: var(--fs-xl);
		margin-block-end: var(--space-3);
	}

	.cta__body {
		color: var(--text-secondary);
		max-width: 56ch;
	}

	@media (min-width: 48em) {
		.cta__panel {
			padding: var(--space-10);
		}

		.cta__title {
			font-size: var(--fs-2xl);
		}
	}

	@media (min-width: 64em) {
		.cta__panel {
			flex-direction: row;
			align-items: center;
			gap: var(--space-8);
		}

		.cta__copy {
			flex: 1;
		}

		/* Fixed width so the button doesn't stretch to half the panel. */
		.cta__action {
			flex: 0 0 15rem;
		}
	}
</style>
