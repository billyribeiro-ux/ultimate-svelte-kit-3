<script lang="ts">
	import { resolve } from '$app/paths';
	import Seo from '#lib/seo/Seo.svelte';
	import { breadcrumbSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl, site } from '#lib/data/site.ts';

	const pageUrl = absoluteUrl('/legal/risk-disclosure');
	const updated = 'August 1, 2026';
</script>

<Seo
	title="Risk disclosure"
	description="Options trading involves substantial risk of loss. StrikeFlow is a market data provider, not a broker-dealer or investment adviser. Read our full risk disclosure."
	schema={[
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Risk disclosure', path: '/legal/risk-disclosure' }
		])
	]}
/>

<h1>Risk disclosure</h1>
<p class="legal-updated">Last updated {updated}</p>

<div class="legal-callout">
	<p>
		<strong
			>Options trading involves substantial risk of loss and is not suitable for every investor.</strong
		> Certain strategies can expose you to losses exceeding your initial investment. Do not trade options
		with money you cannot afford to lose.
	</p>
</div>

<h2>What StrikeFlow is</h2>
<p>
	{site.legalName} operates StrikeFlow, a market data and analytics platform. We collect, normalise and
	present publicly reported options and equity market data.
</p>

<h2>What StrikeFlow is not</h2>
<ul>
	<li>
		We are <strong>not a broker-dealer</strong>. We do not accept orders, execute trades, or custody
		assets.
	</li>
	<li>
		We are <strong>not a registered investment adviser</strong>. Nothing on this site or in the
		product is personalised investment advice.
	</li>
	<li>
		We <strong>do not issue recommendations</strong>. No feature, alert, score or article should be
		read as a suggestion to buy or sell any security.
	</li>
	<li>
		We <strong>never connect to your brokerage account</strong>. There is no account linking, and we
		cannot see or affect your positions.
	</li>
</ul>

<h2>Specific risks of options trading</h2>

<h3>Total loss of premium</h3>
<p>
	An option that expires out of the money is worthless. A buyer can lose the entire premium paid,
	and this is a common outcome rather than an edge case.
</p>

<h3>Unlimited loss on certain positions</h3>
<p>
	Selling an uncovered call exposes you to theoretically unlimited loss, because there is no upper
	bound on the price of the underlying. Other strategies carry large but bounded losses. Understand
	the maximum loss of any position before entering it.
</p>

<h3>Time decay</h3>
<p>
	Options lose value as expiry approaches, all else being equal. A directional view that is correct
	but slow can still lose money.
</p>

<h3>Liquidity and assignment</h3>
<p>
	Some contracts trade with wide spreads or thin volume, and may be difficult to exit at a fair
	price. American-style options may be assigned at any time before expiry, which can leave you with
	an unexpected position in the underlying.
</p>

<h2>Limitations of our data</h2>
<p>
	We aim for accuracy and are explicit about where our data is inferred rather than observed. In
	particular:
</p>
<ul>
	<li>
		Dealer positioning and gamma exposure figures are <strong>estimates</strong> derived from public volume
		and open interest. Actual dealer inventory is not publicly reported and cannot be observed by anyone.
	</li>
	<li>
		Whether a trade opened or closed a position is <strong>not reported</strong> on the consolidated tape.
		Our opening-position detection is probabilistic.
	</li>
	<li>
		Aggressor side is <strong>inferred</strong> by comparing fill price against the prevailing quote.
		Trades filled between the bid and ask are genuinely ambiguous.
	</li>
	<li>
		Market data may be delayed, incomplete, or interrupted. The Starter plan is deliberately delayed
		by fifteen minutes.
	</li>
</ul>

<h2>No performance claims</h2>
<p>
	We make no representation that using StrikeFlow will produce profits or prevent losses. Past
	market behaviour does not indicate future results. Any historical example shown in the product or
	on this site is illustrative and selected to explain a mechanism, not to demonstrate a return.
</p>

<h2>Your responsibility</h2>
<p>
	You are solely responsible for your own trading decisions. Consider your financial situation,
	experience and objectives, and consider seeking advice from a licensed professional before trading
	options.
</p>
<p>
	Before trading, read
	<a
		href="https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document"
		target="_blank"
		rel="noopener noreferrer"
	>
		Characteristics and Risks of Standardized Options</a
	>, published by the Options Clearing Corporation. Your broker is required to provide it.
</p>

<p class="legal-note">
	Questions about this disclosure: <a href="mailto:{site.contact.email}">{site.contact.email}</a>.
	See also our <a href={resolve('/legal/terms')}>terms of service</a> and
	<a href={resolve('/legal/privacy')}>privacy policy</a>.
</p>
