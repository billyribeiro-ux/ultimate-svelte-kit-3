/**
 * PRICING
 *
 * These objects feed both the pricing table and the `Offer` nodes inside our
 * structured data. Google will show a price in the search result for a product
 * page — but only if the marked-up price matches the visible one. Deriving both
 * from this array is how we guarantee that.
 */

export interface Plan {
	readonly id: string;
	readonly name: string;
	/** Monthly price in whole US dollars. */
	readonly priceMonthly: number;
	/** Annual price per month, i.e. what you pay monthly when billed yearly. */
	readonly priceAnnual: number;
	readonly blurb: string;
	/** Exactly one plan should be flagged. Two "most popular" plans is just noise. */
	readonly featured: boolean;
	readonly cta: string;
	readonly features: readonly string[];
	/** Shown greyed-out with a strike, so buyers can see what they'd gain by upgrading. */
	readonly excludes?: readonly string[];
}

export const currency = 'USD';

export const plans: readonly Plan[] = [
	{
		id: 'starter',
		name: 'Starter',
		priceMonthly: 49,
		priceAnnual: 39,
		blurb: 'For traders learning to read the tape, on a delayed feed.',
		featured: false,
		cta: 'Start free trial',
		features: [
			'15-minute delayed options flow',
			'Unusual activity scanner',
			'3 active alert rules',
			'30 days of history',
			'Web and mobile access'
		],
		excludes: ['Real-time feed', 'Dealer gamma exposure', 'Dark pool prints', 'API access']
	},
	{
		id: 'pro',
		name: 'Pro',
		priceMonthly: 149,
		priceAnnual: 119,
		blurb: 'The full real-time tape, for traders who act on it intraday.',
		featured: true,
		cta: 'Start free trial',
		features: [
			'Real-time options flow, sub-250ms',
			'Unusual activity scanner with baselines',
			'Unlimited alert rules',
			'Dealer gamma and delta exposure',
			'Dark pool prints',
			'2 years of history',
			'Discord and webhook delivery'
		],
		excludes: ['Historical tick replay', 'API access', 'Team seats']
	},
	{
		id: 'desk',
		name: 'Desk',
		priceMonthly: 499,
		priceAnnual: 415,
		blurb: 'For funds and prop desks that need the raw data and seats to share it.',
		featured: false,
		cta: 'Talk to sales',
		features: [
			'Everything in Pro',
			'5 team seats included',
			'Full tick replay back to 2019',
			'REST and WebSocket API',
			'CSV and Parquet export',
			'Priority data pipeline',
			'Dedicated support engineer'
		]
	}
];

/** Percentage saved by paying annually, rounded down. Used in the billing toggle. */
export function annualSavingPercent(plan: Plan): number {
	return Math.floor(((plan.priceMonthly - plan.priceAnnual) / plan.priceMonthly) * 100);
}

/** Trial length in days, referenced in copy, in FAQs and in the Offer schema. */
export const trialDays = 7;
