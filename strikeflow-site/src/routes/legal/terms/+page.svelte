<script lang="ts">
	import { resolve } from '$app/paths';
	import Seo from '#lib/seo/Seo.svelte';
	import { breadcrumbSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl, site } from '#lib/data/site.ts';
	import { trialDays } from '#lib/data/pricing.ts';

	const pageUrl = absoluteUrl('/legal/terms');
	const updated = 'August 1, 2026';
</script>

<Seo
	title="Terms of service"
	description="The terms governing use of StrikeFlow: subscriptions, market data licensing, acceptable use, and limitation of liability."
	schema={[
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Terms of service', path: '/legal/terms' }
		])
	]}
/>

<h1>Terms of service</h1>
<p class="legal-updated">Last updated {updated}</p>

<div class="legal-callout">
	<p>
		<strong>The short version.</strong> Subscribe monthly or annually, cancel whenever you like. The data
		is licensed to you personally — don't redistribute it. We provide data, not advice, and we aren't
		liable for your trading decisions.
	</p>
</div>

<h2>1. Agreement</h2>
<p>
	These terms form an agreement between you and {site.legalName} ("StrikeFlow", "we"). By creating an
	account or using the service you accept them. If you are agreeing on behalf of an organisation, you
	confirm you have authority to bind it.
</p>

<h2>2. The service</h2>
<p>
	StrikeFlow provides market data and analytics for US-listed options and equities. We make
	reasonable efforts to keep the service available and accurate, but market data is provided
	<strong>as is</strong> and may be delayed, interrupted or incomplete. We do not warrant that it will
	be uninterrupted or error-free.
</p>

<h2>3. Not investment advice</h2>
<p>
	We are not a broker-dealer and not a registered investment adviser. Nothing in the service is
	investment advice or a recommendation. All trading decisions are yours alone. See our
	<a href={resolve('/legal/risk-disclosure')}>risk disclosure</a>.
</p>

<h2>4. Subscriptions and billing</h2>
<ul>
	<li>Plans are billed monthly or annually in advance.</li>
	<li>
		New subscribers receive a {trialDays}-day free trial. Cancel during it and you are not charged.
	</li>
	<li>Subscriptions renew automatically until cancelled.</li>
	<li>
		Cancel at any time from your account settings. Access continues to the end of the paid period.
	</li>
	<li>
		Upgrades take effect immediately and are prorated. Downgrades take effect at the next renewal.
	</li>
	<li>
		We may change prices with at least 30 days' notice by email. Existing terms are honoured to the
		end of your current period.
	</li>
</ul>

<h2>5. Market data licence</h2>
<p>
	Market data is licensed to you for your own internal use. Exchanges impose conditions we are
	required to pass through. You may not:
</p>
<ul>
	<li>Redistribute, resell, or publicly display the data;</li>
	<li>Share account credentials, or use one seat for multiple people;</li>
	<li>Scrape, or access the service other than through the interfaces we provide;</li>
	<li>Use the data to build a competing market data product.</li>
</ul>
<p>
	Exchanges may require you to be classified as a professional or non-professional subscriber, which
	affects the fees they charge. You must tell us accurately which you are, and tell us if it
	changes.
</p>

<h2>6. Acceptable use</h2>
<p>
	Don't attempt to breach or probe our security, don't overload the service, and don't use it to
	break the law or infringe anyone's rights. We may suspend an account that does, and will tell you
	why unless legally prevented.
</p>

<h2>7. Intellectual property</h2>
<p>
	The software, interface, documentation and our derived analytics remain ours. Your subscription
	grants a limited, non-exclusive, non-transferable right to use them for the term. Underlying
	market data remains the property of the exchanges that produce it.
</p>

<h2>8. Limitation of liability</h2>
<p>
	To the fullest extent permitted by law, StrikeFlow is not liable for trading losses, lost profits,
	lost data, or any indirect or consequential damages arising from use of the service. Our total
	aggregate liability is limited to the fees you paid us in the twelve months before the claim.
</p>
<p>
	Nothing in these terms excludes liability that cannot lawfully be excluded, including liability
	for fraud or for death or personal injury caused by negligence.
</p>

<h2>9. Termination</h2>
<p>
	You may cancel at any time. We may suspend or terminate an account for material breach of these
	terms, or on 30 days' notice if we discontinue the service — in which case we refund any unused
	prepaid period.
</p>

<h2>10. Changes</h2>
<p>
	We may update these terms. Material changes take effect 30 days after we notify you by email or in
	the product. Continuing to use the service after that constitutes acceptance.
</p>

<h2>11. Governing law</h2>
<p>
	These terms are governed by the laws of the State of New York, and the state and federal courts
	located in New York County have exclusive jurisdiction over any dispute.
</p>

<p class="legal-note">
	<strong>A note for anyone reusing this project:</strong> this is realistic sample copy for a
	teaching project, not legal advice, and it has not been reviewed by a lawyer. Terms for a real
	financial data product must reflect your actual exchange agreements and your jurisdiction. Have
	counsel review before publishing. Questions:
	<a href="mailto:{site.contact.email}">{site.contact.email}</a>.
</p>
