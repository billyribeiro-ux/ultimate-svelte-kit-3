/**
 * EBOOK CONTENT
 *
 * The source text for the gated PDF, as plain data. `build-ebook.js` turns this into
 * HTML and then into a PDF.
 *
 * Kept separate from the build script so that editing the writing doesn't mean
 * touching the rendering code, and vice versa. It's the same separation of content
 * from presentation we use everywhere else in the project.
 */

export const meta = {
	title: 'How to read options flow without fooling yourself',
	subtitle: 'A working guide to the options tape, what it reports, and what it never will',
	author: 'Priya Raman, PhD — Head of Research, StrikeFlow',
	edition: 'First edition · 2026'
};

export const chapters = [
	{
		title: 'What the tape actually reports',
		blocks: [
			{
				type: 'p',
				text: 'Before you can read options flow, you need to know precisely what information exists. Most confusion in this field comes from people reasoning about data that was never reported in the first place.'
			},
			{
				type: 'p',
				text: 'Every US-listed options trade is reported to the Options Price Reporting Authority, or OPRA, the consolidated tape for all sixteen options exchanges. A print on that tape carries the contract, the price, the size, the exchange, and a timestamp.'
			},
			{
				type: 'h3',
				text: 'What is not on the tape'
			},
			{
				type: 'p',
				text: 'This is the more important list, and almost nobody states it plainly:'
			},
			{
				type: 'ul',
				items: [
					'Who traded. There is no counterparty identity, no "institutional" flag, and no way to distinguish a hedge fund from a retail account.',
					'Whether the trade opened or closed a position. A large print might be someone building a position or someone exiting one. The tape does not say.',
					'Which side initiated. The tape reports the fill price, not the intent. Aggressor side must be inferred by comparing that price against the quote at the moment of execution.',
					'Whether the print is one leg of a larger structure. A four-leg iron condor arrives as four independent prints.'
				]
			},
			{
				type: 'callout',
				title: 'The core discipline',
				text: 'Every claim you make about options flow is either something the tape reported, or something you inferred. Know which one you are doing at all times. Most bad analysis is an inference that has quietly been promoted to a fact.'
			}
		]
	},
	{
		title: 'Execution styles: sweeps, blocks, splits and crosses',
		blocks: [
			{
				type: 'p',
				text: 'The way an order is executed tells you something real, but something narrower than most people assume.'
			},
			{
				type: 'h3',
				text: 'Sweep'
			},
			{
				type: 'p',
				text: 'An order routed simultaneously to multiple exchanges, taking whatever liquidity is offered at each, accepting progressively worse prices to complete immediately. The signal is urgency: this trader chose speed over price. It is not, by itself, a directional signal.'
			},
			{
				type: 'h3',
				text: 'Block'
			},
			{
				type: 'p',
				text: 'A single large trade executed at one venue, usually negotiated away from the screen and then printed. Blocks suggest an institution working with a broker rather than hitting the market. The size is real; the urgency is lower than a sweep.'
			},
			{
				type: 'h3',
				text: 'Split'
			},
			{
				type: 'p',
				text: 'One order broken into smaller pieces across time to reduce market impact. The individual prints look unremarkable. Recognising that twenty prints over four minutes are one order is most of the value here.'
			},
			{
				type: 'h3',
				text: 'Cross'
			},
			{
				type: 'p',
				text: 'Both sides of the trade are brought to the exchange by the same broker. Frequently a pre-arranged transfer of an existing position rather than new risk being taken.'
			}
		]
	},
	{
		title: 'Finding the aggressor',
		blocks: [
			{
				type: 'p',
				text: 'If you learn one technique from this guide, make it this one. A print without an aggressor side is genuinely ambiguous, and a very large fraction of flow tools show you exactly that.'
			},
			{
				type: 'p',
				text: 'The method is straightforward. At the moment of execution, the contract has a bid and an ask — the National Best Bid and Offer. Compare the fill price against them:'
			},
			{
				type: 'ul',
				items: [
					'Filled at or above the ask: a buyer crossed the spread to get done. Buyer-initiated.',
					'Filled at or below the bid: a seller crossed the spread. Seller-initiated.',
					'Filled between: ambiguous, often a midpoint negotiation. Do not guess.'
				]
			},
			{
				type: 'callout',
				title: 'Why this cannot be reconstructed later',
				text: 'The NBBO at the exact millisecond of the fill is not stored on the print. If your data source did not capture the quote at print time, no amount of later analysis can recover the aggressor side. This is the single most common reason two flow tools disagree about the same trade.'
			},
			{
				type: 'p',
				text: 'Consider what this ambiguity costs you. A large call print filled at the ask is someone paying up for upside exposure. The same size filled at the bid is someone selling calls — quite possibly against stock they already hold, which is a mildly bearish-to-neutral position. Identical on the tape. Opposite in meaning.'
			}
		]
	},
	{
		title: 'Volume against open interest',
		blocks: [
			{
				type: 'p',
				text: 'Volume counts contracts traded today and resets overnight. Open interest counts contracts currently open and carries forward. Read together they answer a question price cannot: is money arriving or leaving?'
			},
			{
				type: 'p',
				text: 'One mechanical detail matters enormously: open interest is published once, the following morning, after the clearing house reconciles. Intraday, you are always comparing today’s live volume against yesterday’s settled open interest.'
			},
			{
				type: 'h3',
				text: 'The four readings'
			},
			{
				type: 'ol',
				items: [
					'High volume, rising open interest — new positions being opened. The most informative case.',
					'High volume, falling open interest — positions being closed. Real activity, but an exit.',
					'High volume, flat open interest — positions changing hands. Day trading, or a roll.',
					'Low volume, high open interest — a large position sitting quietly. Relevant near expiry.'
				]
			},
			{
				type: 'h3',
				text: 'The ratio'
			},
			{
				type: 'p',
				text: 'Divide today’s volume by yesterday’s open interest for the same contract. Above 1.0 means more contracts traded today than were open at last night’s close — difficult to achieve without substantial new positioning. Above 5.0, check for a data artefact before believing it.'
			}
		]
	},
	{
		title: 'Why fixed thresholds mislead you',
		blocks: [
			{
				type: 'p',
				text: 'Most scanners define "unusual" as premium above some absolute figure. This measures the size of the underlying, not the abnormality of the trade.'
			},
			{
				type: 'p',
				text: 'Half a million dollars of premium in a mega-cap chain is an ordinary Tuesday and will fire every day, training you to ignore the alert. The same premium in a name whose entire options complex rarely clears six figures is genuinely extraordinary — and an absolute threshold presents both identically, or, if you raised the threshold to cut the noise, hides the second one entirely.'
			},
			{
				type: 'callout',
				title: 'The fix',
				text: 'Score every contract against its own history, not against the market. A rolling ninety-day baseline of volume and open interest per individual contract, with deviation measured in standard deviations rather than dollars, produces far fewer alerts and a much higher proportion worth reading.'
			}
		]
	},
	{
		title: 'Multi-leg positions and the fragmentation problem',
		blocks: [
			{
				type: 'p',
				text: 'Spreads, collars, risk reversals and butterflies all print as separate contract executions. A scanner that treats each print independently will show you one leg and stay silent about the others.'
			},
			{
				type: 'p',
				text: 'The practical consequence: you see what appears to be an aggressive directional bet when the actual position is a spread with a defined and often modest payoff. Or you see heavy call buying that is in fact the long leg of a collar protecting a large equity position — a defensive structure, not a bullish one.'
			},
			{
				type: 'h3',
				text: 'Reassembling the position'
			},
			{
				type: 'ul',
				items: [
					'Match on execution timestamp — legs of one order typically print within milliseconds.',
					'Check size ratios — a 1:1 ratio suggests a vertical; 1:2 suggests a ratio spread.',
					'Check the venue — legs of one order usually clear at the same exchange.',
					'Look for the offsetting strike before concluding anything directional.'
				]
			}
		]
	},
	{
		title: 'Dealer gamma and why price gets pinned',
		blocks: [
			{
				type: 'p',
				text: 'When you buy an option, a market maker usually sells it. They do not want the directional risk, so they hedge with stock. As price moves, the correct hedge size changes, and they must keep trading to stay neutral. Gamma is the rate at which that hedge requirement changes.'
			},
			{
				type: 'p',
				text: 'The direction they are forced to trade determines whether they damp volatility or amplify it.'
			},
			{
				type: 'callout',
				title: 'The whole mechanism',
				text: 'Dealers long gamma sell into rallies and buy into dips, suppressing volatility. Dealers short gamma buy into rallies and sell into dips, amplifying it.'
			},
			{
				type: 'p',
				text: 'Aggregate gamma across the chain and you can estimate the price at which the dealer complex flips from net long to net short gamma. Above that level expect mean reversion and tighter ranges; below it expect momentum to persist and dips to accelerate.'
			},
			{
				type: 'h3',
				text: 'Four caveats worth taking seriously'
			},
			{
				type: 'ol',
				items: [
					'Dealer positioning is inferred from public data, never observed. Treat every figure as an estimate.',
					'Index gamma frequently overwhelms single-name gamma.',
					'Zero-day expiries have compressed the timescale from weeks to hours.',
					'A large enough fundamental catalyst runs straight over any hedging flow.'
				]
			}
		]
	},
	{
		title: 'A sixty-second checklist',
		blocks: [
			{
				type: 'p',
				text: 'When an alert appears, work through these in order. Most prints fail at step two or three, which is exactly the point — the value of a checklist is how quickly it discards things.'
			},
			{
				type: 'ol',
				items: [
					'Which side initiated it? If your tool cannot tell you, you are looking at an ambiguous print. Stop here.',
					'Is it opening or closing? Compare size against existing open interest.',
					'Is it one leg of something larger? Look for offsetting prints in the same millisecond window.',
					'Is the size unusual for this contract specifically, measured against its own baseline?',
					'What is the expiry? Two days and six months are entirely different statements.',
					'What is the implied volatility rank? Buying expensive options and buying cheap ones are different trades regardless of direction.',
					'Does the equity tape agree? Correlated dark pool accumulation strengthens the read considerably.'
				]
			},
			{
				type: 'callout',
				title: 'The honest conclusion',
				text: 'Flow data will not tell you what to buy, and any product that claims otherwise is selling narrative. What it does, reliably, is show you where real capital is being committed in size, right now. That is a genuine edge over reading price alone — it is simply not a signal you can act on without thinking.'
			}
		]
	}
];

export const disclaimer = `Options trading involves substantial risk and is not suitable for every investor. You can lose more than your initial investment. StrikeFlow Data Inc. is a market data and analytics provider. We are not a broker-dealer and not a registered investment adviser. Nothing in this document is investment advice or a recommendation to buy or sell any security. Past performance does not indicate future results.`;
