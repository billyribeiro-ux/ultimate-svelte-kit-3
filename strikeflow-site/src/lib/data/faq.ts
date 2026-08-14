/**
 * FREQUENTLY ASKED QUESTIONS
 *
 * This array does double duty: it renders the accordion on the pricing page, and it
 * generates a `FAQPage` JSON-LD block.
 *
 * A word of warning about that second use, because it's dated advice almost everywhere.
 * Google narrowed FAQ rich results in 2023 to "well-known authoritative government and
 * health websites". A brand-new fintech site will almost certainly NOT get FAQ snippets
 * in search results, and anyone promising otherwise is selling something.
 *
 * We still emit the markup, for two honest reasons:
 *   1. It costs nothing — it's derived from content we already publish.
 *   2. Structured data is machine-readable context. Search engines and LLM-based
 *      answer engines both use it to understand the page, independently of whether a
 *      rich snippet is drawn.
 *
 * What we do NOT do is write questions solely to farm a snippet. Every question here
 * is one a real buyer asks, which is the version that actually helps.
 */

export interface FaqItem {
	readonly id: string;
	readonly question: string;
	/** Plain text. Keep it answerable in a breath — structured data has no room for essays. */
	readonly answer: string;
}

export const faqs: readonly FaqItem[] = [
	{
		id: 'data-source',
		question: 'Where does your options data come from?',
		answer:
			'We consume the full OPRA (Options Price Reporting Authority) feed directly, which is the consolidated tape for every US-listed options exchange. Dark pool prints come from FINRA ATS reporting. We do not resell a third-party aggregator, which is why our latency is measured in milliseconds rather than seconds.'
	},
	{
		id: 'latency',
		question: 'How real-time is "real-time"?',
		answer:
			'Median time from an exchange print reaching our ingest to it appearing on your screen is under 250 milliseconds on the Pro and Desk plans. The Starter plan is on a deliberate 15-minute delay, which is the standard entitlement boundary for non-professional market data.'
	},
	{
		id: 'beginner',
		question: 'Do I need to be an experienced options trader to use this?',
		answer:
			'No, but you should understand calls, puts, strikes and expiry before the data will mean much. Our free guide covers exactly that ground, and every screen in the product has an explainer attached to it.'
	},
	{
		id: 'signals',
		question: 'Does StrikeFlow tell me what to buy?',
		answer:
			'No. StrikeFlow is a market data and analytics platform, not an advisory service. We show you what is happening in the options market as it happens. We never issue buy or sell recommendations, and we are not registered investment advisers.'
	},
	{
		id: 'trial',
		question: 'How does the free trial work?',
		answer:
			'Seven days of full Pro access. We ask for a card so the account continues seamlessly if you stay, and you can cancel in one click from your billing page at any point during the trial without being charged.'
	},
	{
		id: 'cancel',
		question: 'Can I cancel or change plans later?',
		answer:
			'Yes, at any time, from your account settings. Upgrades take effect immediately and are prorated. Downgrades take effect at the end of your current billing period, so you keep what you paid for.'
	},
	{
		id: 'api',
		question: 'Is there an API?',
		answer:
			'Yes, on the Desk plan. You get both a REST API for historical queries and a WebSocket stream for live flow, plus bulk export to CSV and Parquet. Rate limits and schemas are documented in full before you commit.'
	},
	{
		id: 'brokerage',
		question: 'Do I need to connect my brokerage account?',
		answer:
			'No. StrikeFlow is read-only market data and never connects to your broker, holds your funds, or places orders. There is no account linking step, because there is nothing for us to link to.'
	}
];
