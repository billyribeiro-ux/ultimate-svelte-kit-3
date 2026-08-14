/**
 * Product features.
 *
 * Why is this a data file and not just markup inside the page?
 *
 * Because the same six features appear in three places: the home page grid, the
 * features page, and the `FinancialService` JSON-LD block that we hand to Google.
 * If they lived in markup, those three would drift apart — and the day they do,
 * you're telling Google something different from what you're telling humans.
 * Google calls that "structured data that doesn't match visible content", and it's
 * a manual-action offence.
 *
 * One array. Three consumers. No drift.
 */

/** Icon names map 1:1 to Phosphor icon component names. */
export type IconName =
	'PulseIcon' | 'CrosshairIcon' | 'FunctionIcon' | 'EyeIcon' | 'BellRingingIcon' | 'RewindIcon';

export interface Feature {
	/** Stable key — used for anchors, keys in {#each}, and analytics. */
	readonly id: string;
	readonly title: string;
	/** One-line summary. Used in cards and in structured data. */
	readonly summary: string;
	/** Longer copy, used on the features page. */
	readonly detail: string;
	readonly icon: IconName;
	/** Three concrete capabilities. Specificity is what makes copy credible. */
	readonly points: readonly string[];
}

export const features: readonly Feature[] = [
	{
		id: 'live-flow',
		title: 'Live flow scanner',
		summary: 'Every sweep, block and split order as it prints — not thirty seconds later.',
		detail:
			'We consume the full OPRA feed and normalise it into a single stream you can actually read. Orders are classified by aggressor side, execution venue and order type the moment they cross the tape, so you see intent rather than raw prints.',
		icon: 'PulseIcon',
		points: [
			'Sub-250ms from exchange print to your screen',
			'Sweep, block, split and cross classification',
			'Filter by premium, size, expiry, moneyness or ticker'
		]
	},
	{
		id: 'unusual-activity',
		title: 'Unusual activity detection',
		summary: 'A statistical baseline for every contract, so "unusual" means something.',
		detail:
			'Most scanners call anything above a fixed premium threshold "unusual". That surfaces the same mega-cap names every day. We hold a rolling 90-day volume and open-interest baseline per contract, and score deviation against it — so a genuinely abnormal print in a mid-cap ranks above a routine one in a megacap.',
		icon: 'CrosshairIcon',
		points: [
			'Rolling 90-day baseline per individual contract',
			'Volume-to-open-interest ratio scoring',
			'Opening-position detection, not just large size'
		]
	},
	{
		id: 'greeks',
		title: 'Greeks & exposure',
		summary: 'Live dealer gamma and delta exposure, recalculated on every tick.',
		detail:
			'Knowing that a trade happened is half the picture. We compute aggregate dealer positioning across the chain and surface the strikes where hedging flows are likely to compress or accelerate price.',
		icon: 'FunctionIcon',
		points: [
			'Aggregate GEX and DEX by strike and expiry',
			'Full implied volatility surface with skew',
			'Gamma flip levels marked directly on the chart'
		]
	},
	{
		id: 'dark-pool',
		title: 'Dark pool prints',
		summary: 'Off-exchange equity volume, matched against the options tape.',
		detail:
			'Large equity positions are frequently built away from the lit exchanges and hedged in the options market. Seeing both tapes side by side turns two ambiguous signals into one clear read.',
		icon: 'EyeIcon',
		points: [
			'FINRA ATS prints, consolidated and deduplicated',
			'Correlated against same-session options flow',
			'Level-by-level accumulation heatmap'
		]
	},
	{
		id: 'alerts',
		title: 'Smart alerts',
		summary: 'A real rules engine — not a notification firehose you eventually mute.',
		detail:
			'Compose conditions across premium, size, aggressor side, IV rank and your own watchlist. Alerts are debounced and deduplicated server-side, so a single 40-leg sweep reaches you as one alert rather than forty.',
		icon: 'BellRingingIcon',
		points: [
			'Multi-condition rules with AND / OR logic',
			'Push, SMS, email, Discord and raw webhook',
			'Server-side debouncing and deduplication'
		]
	},
	{
		id: 'replay',
		title: 'Historical replay',
		summary: 'Re-run any session tick by tick and test the read you would have made.',
		detail:
			'Every session since 2019 is stored at full tick resolution. Scrub to any timestamp and watch the tape advance at your own pace, with the same tools you use live — which is the only honest way to find out whether a setup actually worked.',
		icon: 'RewindIcon',
		points: [
			'Full tick resolution back to January 2019',
			'Variable-speed scrubbing with a synced chart',
			'Export any window to CSV or Parquet'
		]
	}
];

/** Lookup helper so pages can pull one feature without re-scanning the array. */
export function getFeature(id: string): Feature | undefined {
	return features.find((feature) => feature.id === id);
}
