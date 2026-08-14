<!--
	PRICING TABLE

	Three plan cards with a monthly/annual toggle.

	The toggle is a real radiogroup rather than two styled buttons, so arrow keys
	move between the options the way a keyboard user expects from a segmented control.
-->

<script lang="ts">
	import { resolve } from '$app/paths';
	import { CheckIcon, XIcon } from 'phosphor-svelte';

	import { plans, annualSavingPercent, trialDays } from '#lib/data/pricing.ts';
	import Card from '#lib/components/ui/Card.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import Button from '#lib/components/ui/Button.svelte';

	type Billing = 'monthly' | 'annual';

	let billing = $state<Billing>('monthly');

	/** Best available saving, used in the toggle label. */
	const bestSaving = Math.max(...plans.map(annualSavingPercent));
</script>

<div class="pricing">
	<!--
		`role="radiogroup"` + `role="radio"` gives assistive tech the right mental
		model: "one of two options", not "two unrelated buttons". `aria-checked`
		carries the state.
	-->
	<div class="pricing__toggle" role="radiogroup" aria-label="Billing period">
		<button
			type="button"
			role="radio"
			aria-checked={billing === 'monthly'}
			class="pricing__toggle-option"
			class:is-active={billing === 'monthly'}
			onclick={() => (billing = 'monthly')}
		>
			Monthly
		</button>
		<button
			type="button"
			role="radio"
			aria-checked={billing === 'annual'}
			class="pricing__toggle-option"
			class:is-active={billing === 'annual'}
			onclick={() => (billing = 'annual')}
		>
			Annual
			<span class="pricing__saving">save {bestSaving}%</span>
		</button>
	</div>

	<ul class="pricing__grid" role="list">
		{#each plans as plan (plan.id)}
			{@const price = billing === 'annual' ? plan.priceAnnual : plan.priceMonthly}
			<li class="pricing__item" id={plan.id}>
				<Card highlighted={plan.featured}>
					<div class="pricing__head">
						<h3 class="pricing__name">{plan.name}</h3>
						{#if plan.featured}
							<Badge tone="brand">Most popular</Badge>
						{/if}
					</div>

					<p class="pricing__blurb">{plan.blurb}</p>

					<p class="pricing__price">
						<span class="pricing__amount tabular">${price}</span>
						<span class="pricing__period">/month</span>
					</p>

					<p class="pricing__billing-note">
						{#if billing === 'annual'}
							Billed annually at ${price * 12}
						{:else}
							Billed monthly, cancel anytime
						{/if}
					</p>

					<div class="pricing__cta">
						<Button
							href={resolve('/contact')}
							variant={plan.featured ? 'primary' : 'secondary'}
							size="lg"
							fullWidth
						>
							{plan.cta}
						</Button>
						<p class="pricing__trial">{trialDays}-day free trial</p>
					</div>

					<ul class="pricing__features" role="list">
						{#each plan.features as feature (feature)}
							<li class="pricing__feature">
								<span class="pricing__check" aria-hidden="true">
									<CheckIcon size={16} weight="bold" />
								</span>
								<span>{feature}</span>
							</li>
						{/each}

						{#each plan.excludes ?? [] as excluded (excluded)}
							<li class="pricing__feature pricing__feature--excluded">
								<span class="pricing__cross" aria-hidden="true">
									<XIcon size={16} weight="bold" />
								</span>
								<!-- Screen readers can't see the greyed-out styling, so state it. -->
								<span><span class="visually-hidden">Not included: </span>{excluded}</span>
							</li>
						{/each}
					</ul>
				</Card>
			</li>
		{/each}
	</ul>
</div>

<style>
	.pricing {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}

	.pricing__toggle {
		display: inline-flex;
		align-self: center;
		gap: var(--space-1);
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background-color: var(--surface);
	}

	.pricing__toggle-option {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		min-height: 2.5rem;
		border-radius: var(--radius-full);
		font-family: var(--font-heading);
		font-size: var(--fs-sm);
		font-weight: var(--weight-semibold);
		color: var(--text-muted);
		transition:
			background-color var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}

	.pricing__toggle-option.is-active {
		background-color: var(--accent);
		color: var(--accent-contrast);
	}

	.pricing__saving {
		font-size: var(--fs-xs);
		font-weight: var(--weight-medium);
		opacity: 0.85;
	}

	.pricing__grid {
		display: grid;
		gap: var(--space-5);
	}

	.pricing__item {
		display: flex;
		max-width: none;
		margin: 0;
	}

	.pricing__item :global(.card) {
		flex: 1;
	}

	.pricing__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-block-end: var(--space-3);
	}

	.pricing__name {
		font-size: var(--fs-lg);
	}

	.pricing__blurb {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		max-width: none;
		min-height: 3em; /* keeps the three price rows aligned across cards */
	}

	.pricing__price {
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
		margin-block-start: var(--space-6);
		max-width: none;
	}

	.pricing__amount {
		font-family: var(--font-heading);
		font-size: var(--fs-3xl);
		font-weight: var(--weight-black);
		color: var(--text-primary);
		line-height: 1;
		letter-spacing: var(--tracking-tight);
	}

	.pricing__period {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.pricing__billing-note {
		margin-block-start: var(--space-2);
		font-size: var(--fs-xs);
		color: var(--text-muted);
		max-width: none;
	}

	.pricing__cta {
		margin-block-start: var(--space-6);
	}

	.pricing__trial {
		margin-block-start: var(--space-2);
		text-align: center;
		font-size: var(--fs-xs);
		color: var(--text-muted);
		max-width: none;
	}

	.pricing__features {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-block-start: var(--space-6);
		padding-block-start: var(--space-6);
		border-top: 1px solid var(--border);
	}

	.pricing__feature {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		font-size: var(--fs-sm);
		color: var(--text-secondary);
		max-width: none;
		margin: 0;
	}

	.pricing__feature--excluded {
		color: var(--text-muted);
		opacity: 0.65;
	}

	.pricing__check,
	.pricing__cross {
		display: inline-flex;
		flex-shrink: 0;
		margin-block-start: 0.15em;
	}

	.pricing__check {
		color: var(--bull);
	}

	.pricing__cross {
		color: var(--text-muted);
	}

	/* Two columns at tablet, three at laptop. Three 300px cards don't fit below 64em. */
	@media (min-width: 48em) {
		.pricing__grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (min-width: 64em) {
		.pricing__grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			align-items: start;
		}
	}
</style>
