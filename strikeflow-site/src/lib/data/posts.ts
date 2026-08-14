/**
 * INSIGHTS / BLOG CONTENT
 *
 * Posts are stored as a typed array of *content blocks* rather than raw HTML strings.
 *
 * That's a deliberate call, and the reason is security. If content were HTML, rendering
 * it would need `{@html post.content}` — and `{@html}` performs no sanitisation
 * whatsoever. Today the content is a trusted constant, so it's safe. But the day
 * someone wires this to a CMS, that same `{@html}` becomes a stored-XSS hole, and
 * nobody will remember to revisit it.
 *
 * A block union closes that door permanently: every block is rendered by a component
 * that escapes its own text. There is no code path where a string becomes markup.
 * You give up inline formatting inside paragraphs; for a marketing blog that's a
 * trade worth making.
 *
 * (If you outgrow it, the upgrade is mdsvex — which compiles Markdown to real Svelte
 * components at build time and is therefore also escape-safe. Not `{@html}`.)
 */

export type Block =
	| { readonly type: 'p'; readonly text: string }
	| { readonly type: 'h2'; readonly text: string; readonly id: string }
	| { readonly type: 'h3'; readonly text: string; readonly id: string }
	| { readonly type: 'ul'; readonly items: readonly string[] }
	| { readonly type: 'ol'; readonly items: readonly string[] }
	| { readonly type: 'quote'; readonly text: string; readonly cite?: string }
	| { readonly type: 'callout'; readonly title: string; readonly text: string };

export interface Post {
	readonly slug: string;
	/** The display headline — the `<h1>`. Write it for a human reading the page. */
	readonly title: string;
	/**
	 * A shorter title for the `<title>` tag, when the headline is too long.
	 *
	 * These do not have to match, and for a good headline they often shouldn't.
	 * Google truncates a title around 60 characters, and this site appends
	 * " | StrikeFlow" (13 more). So an on-page headline of 65 characters — perfectly
	 * readable in context — gets cut mid-word in the search results, where it is the
	 * only thing persuading someone to click.
	 *
	 * So: write the `<h1>` for the reader, and the `<title>` for the results page.
	 * Falls back to `title` when omitted.
	 */
	readonly seoTitle?: string;
	/** Meta description and card summary. ~155 characters. */
	readonly description: string;
	/** ISO 8601. Used for `datePublished` and sitemap `lastmod`. */
	readonly published: string;
	readonly updated?: string;
	/** Must match an `id` in `team.ts`. */
	readonly authorId: string;
	readonly tags: readonly string[];
	readonly readingMinutes: number;
	readonly body: readonly Block[];
}

export const posts: readonly Post[] = [
	{
		slug: 'how-to-read-an-options-sweep',
		title: 'How to read an options sweep (and what most scanners get wrong)',
		seoTitle: 'How to read an options sweep correctly',
		description:
			'A sweep is not a bullish signal. It is an execution style. Here is what the order type actually tells you about the trader behind it — and what it does not.',
		published: '2026-07-08',
		updated: '2026-08-02',
		authorId: 'priya-raman',
		tags: ['Order flow', 'Market structure'],
		readingMinutes: 7,
		body: [
			{
				type: 'p',
				text: 'Open any options flow feed and you will see the word "SWEEP" in aggressive orange next to a big premium number. The implied message is that something important just happened and you should probably do something about it. That implication is doing a lot of unearned work.'
			},
			{
				type: 'p',
				text: 'A sweep is not a sentiment reading. It is a statement about execution mechanics — specifically, about how urgently the trader wanted to be filled. Understanding the difference is most of what separates reading flow from reacting to it.'
			},
			{ type: 'h2', id: 'what-a-sweep-is', text: 'What a sweep actually is' },
			{
				type: 'p',
				text: 'US options trade across more than a dozen exchanges simultaneously. Regulation NMS requires that an order be filled at the best available price across all of them, so a large order has two ways to behave.'
			},
			{
				type: 'p',
				text: 'It can wait — route to one venue, sit at a limit price, and let the rest of the market come to it. Or it can take — split itself across every venue at once and lift whatever is offered on each, accepting progressively worse prices to complete immediately. The second one is a sweep.'
			},
			{
				type: 'callout',
				title: 'The one-sentence version',
				text: 'A sweep means the trader chose speed over price. That is the entire signal. Everything else you read into it is inference.'
			},
			{
				type: 'p',
				text: 'That inference is often reasonable. Someone willing to pay up across five venues rather than wait for a better fill usually believes the move is imminent, or is hedging something that already happened. But "usually" is carrying weight, and the exceptions matter.'
			},
			{ type: 'h2', id: 'what-scanners-get-wrong', text: 'What most scanners get wrong' },
			{
				type: 'p',
				text: 'There are three failure modes we see repeatedly in retail-facing flow tools, and all three produce confident-looking alerts that mean nothing.'
			},
			{ type: 'h3', id: 'aggressor-side', text: '1. Guessing the aggressor side' },
			{
				type: 'p',
				text: 'A sweep filled at the ask is usually a buyer taking liquidity. A sweep filled at the bid is usually a seller. Plenty of tools report only that a sweep occurred, without which side initiated it — which means a large call sweep might be someone buying calls, or someone selling calls against stock they already own. Those are opposite positions displayed identically.'
			},
			{
				type: 'p',
				text: 'The fix is to compare the fill price against the prevailing NBBO at the moment of execution, per leg. If your data source does not preserve the quote at print time, this cannot be reconstructed after the fact.'
			},
			{ type: 'h3', id: 'multi-leg', text: '2. Reporting one leg of a multi-leg trade' },
			{
				type: 'p',
				text: 'This is the big one. A vertical spread, a collar, a risk reversal and a covered call all print as separate contract executions on the consolidated tape. A scanner that treats every print independently will show you a large call purchase and stay silent about the simultaneous call sale that caps it.'
			},
			{
				type: 'p',
				text: 'You end up looking at what appears to be an aggressive directional bet when the real position is a spread with a defined, and often quite modest, payoff. We stitch legs back together by matching execution timestamps, size ratios and venue before anything is classified.'
			},
			{ type: 'h3', id: 'hedges', text: '3. Ignoring that most volume is a hedge' },
			{
				type: 'p',
				text: 'Market makers are on the other side of a large fraction of prints, and their subsequent trades are delta hedges, not opinions. A dealer who sells you calls buys stock to stay neutral. If you read that stock purchase as bullish conviction, you have read a mechanical consequence of your own order as confirmation of your own thesis.'
			},
			{ type: 'h2', id: 'reading-it-properly', text: 'Reading a sweep properly' },
			{
				type: 'p',
				text: 'When a sweep appears, the useful questions are ordered, and most of them are not about the sweep itself.'
			},
			{
				type: 'ol',
				items: [
					'Which side initiated it? Compare fill against the NBBO at print time.',
					'Is it opening or closing? Compare size against the contract’s existing open interest — volume meaningfully above open interest suggests a new position.',
					'Is it one leg of something larger? Check for offsetting prints within the same few milliseconds.',
					'Is the size unusual for this specific contract? Not for the market — for this strike and expiry, against its own history.',
					'What is the expiry? A sweep into a weekly expiring in two days is a fundamentally different statement from one into January LEAPS.'
				]
			},
			{
				type: 'p',
				text: 'Question four is where fixed premium thresholds fall apart. A $500,000 sweep in a mega-cap is a Tuesday. The same premium in a mid-cap where the entire chain rarely clears six figures is genuinely anomalous. Absolute thresholds surface the former and bury the latter, which is precisely backwards.'
			},
			{
				type: 'quote',
				text: 'The tape tells you what happened. It never tells you why. Any tool that claims otherwise is selling narrative, not data.',
				cite: 'Priya Raman'
			},
			{ type: 'h2', id: 'summary', text: 'The short version' },
			{
				type: 'ul',
				items: [
					'A sweep signals urgency, not direction.',
					'Without the aggressor side, a sweep is genuinely ambiguous.',
					'Single-leg prints are frequently fragments of multi-leg positions.',
					'"Unusual" is only meaningful relative to a contract’s own baseline.',
					'A large share of options volume is hedging, and hedges have no opinion.'
				]
			},
			{
				type: 'p',
				text: 'None of this makes flow data less useful. It makes it useful for the thing it is actually good at: showing you where real capital is being committed, in size, right now. That is a genuine edge over reading price alone. It is just not a signal you can act on without thinking.'
			}
		]
	},
	{
		slug: 'dealer-gamma-explained',
		title: 'Dealer gamma explained: why price gets pinned to certain strikes',
		seoTitle: 'Dealer gamma: why price pins to strikes',
		description:
			'Why some price levels behave like magnets and others like trapdoors. A plain-English walkthrough of dealer gamma exposure and what it does to intraday volatility.',
		published: '2026-06-19',
		authorId: 'dana-okafor',
		tags: ['Volatility', 'Market structure'],
		readingMinutes: 8,
		body: [
			{
				type: 'p',
				text: 'If you have watched a widely-held stock spend an entire Friday afternoon glued to a round number, you have seen dealer gamma at work. It is one of the few market-structure effects that is both mechanically explainable and genuinely predictive of intraday behaviour.'
			},
			{
				type: 'p',
				text: 'It is also routinely explained badly, in a fog of Greek letters. So let us do it without the fog.'
			},
			{ type: 'h2', id: 'who-dealers-are', text: 'Start with who is on the other side' },
			{
				type: 'p',
				text: 'When you buy a call, someone sells it to you. That someone is usually a market maker whose business is capturing the spread, not taking a directional view. Having sold you a call, they are now short a position that loses money if the stock rises — which is a risk they do not want.'
			},
			{
				type: 'p',
				text: 'So they hedge. They buy some stock. How much depends on delta: if the call has a delta of 0.40, they buy 40 shares per contract, and their combined position is roughly neutral to small moves.'
			},
			{ type: 'h2', id: 'what-gamma-is', text: 'Gamma is the part that moves' },
			{
				type: 'p',
				text: 'Delta is not constant. As the stock rises, the call’s delta rises too — 0.40 becomes 0.50 becomes 0.65. Gamma is simply the rate of that change.'
			},
			{
				type: 'p',
				text: 'This matters because it means the hedge is never finished. Every time the stock moves, the correct hedge size changes, and the dealer has to trade again to keep up. The direction they trade determines whether they damp volatility or amplify it — and that depends entirely on whether they are long or short gamma.'
			},
			{
				type: 'callout',
				title: 'The whole mechanism in two lines',
				text: 'Dealers long gamma sell into rallies and buy into dips — this suppresses volatility. Dealers short gamma buy into rallies and sell into dips — this amplifies it.'
			},
			{ type: 'h3', id: 'long-gamma', text: 'When dealers are long gamma' },
			{
				type: 'p',
				text: 'Dealers end up long gamma when the public is net short options — commonly when there is heavy covered-call writing or put selling in a name. Their hedging is then counter-trend: the stock rises, their delta grows, and they sell stock to get back to neutral. That selling pushes back against the rally. The stock falls, and they buy, cushioning the decline.'
			},
			{
				type: 'p',
				text: 'The result is a name that feels heavy and range-bound, gravitating toward the strike with the largest open interest. This is where the term "pinning" comes from, and it gets stronger as expiry approaches because gamma concentrates sharply around at-the-money strikes in the final days.'
			},
			{ type: 'h3', id: 'short-gamma', text: 'When dealers are short gamma' },
			{
				type: 'p',
				text: 'Invert it. When the public is net long options — heavy call buying into a catalyst, or aggressive put buying during a selloff — dealers are short gamma, and their hedging becomes trend-following. The stock rises, their short calls gain delta, and they must buy stock, pushing it higher still.'
			},
			{
				type: 'p',
				text: 'This is the mechanical core of a gamma squeeze. It is not a conspiracy and nobody is choosing to chase; it is a risk-management obligation that happens to be procyclical. It also explains why the sharpest intraday moves so often occur in names where retail call buying has been unusually concentrated.'
			},
			{ type: 'h2', id: 'gamma-flip', text: 'The gamma flip level' },
			{
				type: 'p',
				text: 'Aggregate every strike’s gamma exposure across the chain and you can estimate the price at which the dealer complex crosses from net long to net short gamma. That level — commonly called the gamma flip — is one of the more useful lines you can draw on an intraday chart.'
			},
			{
				type: 'ul',
				items: [
					'Above the flip, dealers are typically long gamma: expect mean reversion, tighter ranges, and fading of extremes.',
					'Below it, they are typically short gamma: expect momentum to persist, ranges to expand, and dips to accelerate.',
					'The level itself often behaves like support or resistance, because hedging behaviour changes character as price crosses it.'
				]
			},
			{ type: 'h2', id: 'caveats', text: 'Where this breaks down' },
			{
				type: 'p',
				text: 'Every published gamma exposure figure is an estimate, and it is worth being precise about why. The consolidated tape does not report whether a trade opened or closed a position, nor who was on which side. Every model must assume a dealer position from observable volume and open interest, and that assumption is sometimes wrong.'
			},
			{
				type: 'ol',
				items: [
					'Dealer positioning is inferred, never observed. Treat it as a well-informed estimate.',
					'Index gamma dwarfs single-name gamma. SPX positioning frequently overwhelms whatever a single stock’s own chain implies.',
					'Zero-day expiries have compressed the timescale enormously — positioning that mattered for a week now often matters for an afternoon.',
					'A large enough fundamental catalyst runs straight over any hedging flow. Gamma shapes the path; it does not set the destination.'
				]
			},
			{
				type: 'p',
				text: 'Used properly, gamma is context rather than a signal. It tells you what kind of day you are likely in — one where fading extremes works, or one where it gets you run over. That framing alone changes how you size and where you place stops, which is worth considerably more than another arrow on a chart.'
			}
		]
	},
	{
		slug: 'volume-vs-open-interest',
		title: 'Volume vs open interest: the one ratio that separates signal from noise',
		seoTitle: 'Volume vs open interest: the key ratio',
		description:
			'Volume tells you how much traded today. Open interest tells you how much is still on. The relationship between them is where the actual information lives.',
		published: '2026-05-27',
		authorId: 'priya-raman',
		tags: ['Order flow', 'Fundamentals'],
		readingMinutes: 6,
		body: [
			{
				type: 'p',
				text: 'Two numbers sit next to every options contract, and most people glance at one and ignore the other. Read together, they answer a question price alone never can: is money arriving, or leaving?'
			},
			{ type: 'h2', id: 'definitions', text: 'The two numbers' },
			{
				type: 'p',
				text: 'Volume is a flow measure. It counts contracts traded during the session and resets to zero overnight. Open interest is a stock measure. It counts contracts currently open — positions entered and not yet closed or expired — and carries over from day to day.'
			},
			{
				type: 'p',
				text: 'The critical mechanical detail is timing: volume updates continuously through the session, while open interest is published once, the following morning, after the clearing house reconciles the day. So intraday you are always comparing today’s live volume against yesterday’s settled open interest.'
			},
			{
				type: 'callout',
				title: 'Why the ratio works',
				text: 'A single trade can open a position, close one, or transfer one. Volume alone cannot tell these apart. Volume measured against existing open interest can — because opening a genuinely new position, in size, requires volume the existing pool cannot account for.'
			},
			{ type: 'h2', id: 'the-four-cases', text: 'The four cases' },
			{
				type: 'p',
				text: 'Comparing today’s volume against yesterday’s open interest, alongside the direction of open interest itself, gives four readings.'
			},
			{
				type: 'ol',
				items: [
					'Volume high, open interest rising — new positions are being opened. This is the case that carries the most information: fresh capital is committing.',
					'Volume high, open interest falling — positions are being closed. Someone is taking profits or cutting risk. The activity is real but it is an exit, not an entry.',
					'Volume high, open interest roughly flat — positions are changing hands without net creation. Often day trading or a roll from one strike or expiry to another.',
					'Volume low, open interest high — a large existing position sitting quietly. Worth knowing about, especially near expiry, but nothing is happening today.'
				]
			},
			{ type: 'h2', id: 'the-ratio', text: 'Using the ratio' },
			{
				type: 'p',
				text: 'Divide the session’s volume by the prior day’s open interest for the same contract. Above 1.0 means more contracts changed hands today than were open at yesterday’s close, which is difficult to achieve without substantial new positioning.'
			},
			{
				type: 'ul',
				items: [
					'Below 0.5 — routine activity within the existing pool. Rarely interesting.',
					'0.5 to 1.0 — elevated. Worth a look, particularly on an illiquid contract.',
					'Above 1.0 — today’s activity exceeds the entire prior open position. Something has changed.',
					'Above 5.0 — either a genuinely large new position, or a data artefact. Check both before believing it.'
				]
			},
			{
				type: 'p',
				text: 'That last caveat is not throat-clearing. Extreme ratios frequently turn out to be a single institutional roll, an index rebalance, or a corporate action distorting the contract. The ratio is a filter for what deserves attention, not a verdict.'
			},
			{ type: 'h2', id: 'why-thresholds-fail', text: 'Why fixed thresholds beat you' },
			{
				type: 'p',
				text: 'Most scanners flag "unusual" activity using an absolute premium threshold — anything above, say, $250,000. The problem is that this measures the size of the underlying, not the abnormality of the trade.'
			},
			{
				type: 'p',
				text: 'A quarter-million dollars of premium in a mega-cap chain is unremarkable and will trigger every day, training you to ignore the alert. The same premium in a name whose entire options complex rarely clears six figures is extraordinary, and an absolute threshold will show it to you with exactly the same emphasis — or, if you raised the threshold to cut the noise, not at all.'
			},
			{
				type: 'p',
				text: 'The fix is to make every contract compete against its own history rather than against the market. We hold a rolling ninety-day baseline of volume and open interest for each individual contract and score deviation against that. It surfaces fewer alerts, and a much higher share of them are worth reading.'
			},
			{ type: 'h2', id: 'practical', text: 'Putting it to work' },
			{
				type: 'ol',
				items: [
					'Start from the volume-to-open-interest ratio, not from premium size.',
					'Confirm direction the next morning: did open interest actually rise? If not, you watched an exit.',
					'Check the expiry. New positioning in a contract expiring tomorrow is a very different statement from the same in six months.',
					'Look for the offsetting leg before concluding anything directional.'
				]
			},
			{
				type: 'p',
				text: 'None of this is complicated, and that is rather the point. The ratio is arithmetic you could do by hand. What makes it useful is applying it consistently, per contract, against a baseline — which is tedious for a human and trivial for a machine.'
			}
		]
	}
];

/** Newest first. Sorting here means every consumer gets the same order for free. */
export const postsByDate: readonly Post[] = [...posts].sort((a, b) =>
	b.published.localeCompare(a.published)
);

export function getPost(slug: string): Post | undefined {
	return posts.find((post) => post.slug === slug);
}

/** Every tag used across all posts, deduplicated and alphabetised. */
export const allTags: readonly string[] = [...new Set(posts.flatMap((post) => post.tags))].sort();
