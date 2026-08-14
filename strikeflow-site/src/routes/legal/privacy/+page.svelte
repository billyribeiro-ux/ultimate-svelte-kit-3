<script lang="ts">
	import { resolve } from '$app/paths';
	import Seo from '#lib/seo/Seo.svelte';
	import { breadcrumbSchema } from '#lib/seo/schema.ts';
	import { absoluteUrl, site } from '#lib/data/site.ts';

	const pageUrl = absoluteUrl('/legal/privacy');
	const updated = 'August 1, 2026';
</script>

<Seo
	title="Privacy policy"
	description="What data StrikeFlow collects, why, how long we keep it, and how to get it deleted. We do not sell personal data."
	schema={[
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Privacy policy', path: '/legal/privacy' }
		])
	]}
/>

<h1>Privacy policy</h1>
<p class="legal-updated">Last updated {updated}</p>

<div class="legal-callout">
	<p>
		<strong>The short version.</strong> If you download our guide we store your email address and the
		experience level you selected, so we can send you the guide and occasional research notes. We do not
		sell your data. One click unsubscribes you, and one email deletes you.
	</p>
</div>

<h2>Who we are</h2>
<p>
	{site.legalName}, {site.address.street}, {site.address.city}, {site.address.region}
	{site.address.postalCode}, United States. For any privacy question, write to
	<a href="mailto:{site.contact.email}">{site.contact.email}</a>.
</p>

<h2>What we collect, and why</h2>

<h3>When you request the free guide</h3>
<ul>
	<li>
		<strong>Your email address</strong> — to send you the guide and, with your consent, occasional research
		notes.
	</li>
	<li>
		<strong>Your self-reported experience level</strong> — so we can send material at roughly the right
		level rather than the same email to everyone.
	</li>
	<li>
		<strong>The time of signup and which page it came from</strong> — so we can tell which content is
		worth writing more of.
	</li>
</ul>
<p>
	The lawful basis is your consent, given by ticking the box on the form. You can withdraw it at any
	time, and doing so does not affect processing that already happened.
</p>

<h3>When you simply browse the site</h3>
<p>
	Our web server records standard request logs — IP address, timestamp, requested URL, user agent —
	which are used for security and for diagnosing faults. They are retained for 30 days and then
	deleted. The lawful basis is our legitimate interest in operating a secure service.
</p>

<h3>What we do not do</h3>
<ul>
	<li>We do not sell or rent personal data to anyone, for any purpose.</li>
	<li>We do not use advertising or cross-site tracking cookies on this website.</li>
	<li>We do not build profiles of you across other sites.</li>
	<li>We do not require an account to read anything published here.</li>
</ul>

<h2>Cookies</h2>
<p>
	This marketing website sets no advertising or analytics cookies. If we later add privacy-focused
	analytics, we will update this page before doing so, and it will remain cookieless.
</p>

<h2>Who we share data with</h2>
<p>
	Only the service providers needed to run the service — currently our hosting provider and our
	email delivery provider. Each processes data on our instructions under a data processing
	agreement, and none of them are permitted to use it for their own purposes.
</p>

<h2>How long we keep it</h2>
<ul>
	<li>
		<strong>Marketing email addresses</strong> — until you unsubscribe, then for 30 days so we can honour
		the suppression, then deleted.
	</li>
	<li><strong>Server logs</strong> — 30 days.</li>
	<li>
		<strong>Customer billing records</strong> — as long as tax law requires, currently seven years.
	</li>
</ul>

<h2>Your rights</h2>
<p>
	Depending on where you live, you may have the right to access the data we hold about you, correct
	it, delete it, receive a portable copy, object to processing, or withdraw consent.
</p>
<p>
	To exercise any of them, email
	<a href="mailto:{site.contact.email}">{site.contact.email}</a>. We respond within 30 days and we
	do not charge a fee. We may ask you to confirm the request from the address on file, which is to
	protect you rather than to obstruct you.
</p>
<p>
	If you are in the EEA or UK and are unhappy with our response, you may complain to your national
	data protection authority.
</p>

<h2>Security</h2>
<p>
	Data is encrypted in transit with TLS. Access to systems holding personal data is limited to
	employees who need it and is logged. We will notify affected users and the relevant authority
	without undue delay if a breach occurs that is likely to result in a risk to your rights.
</p>

<h2>Children</h2>
<p>
	This service is not directed at anyone under 18, and we do not knowingly collect data from
	children. If you believe we have, contact us and we will delete it.
</p>

<h2>Changes</h2>
<p>
	If we make a material change we will update the date at the top of this page and, for anyone on
	our mailing list, say so by email before it takes effect.
</p>

<p class="legal-note">
	<strong>A note for anyone reusing this project:</strong> this document is written to be accurate
	about how this specific codebase behaves, but it is not legal advice and it has not been reviewed
	by a lawyer. Your obligations depend on where you and your users are. Have a qualified
	professional review it before you publish. See also our
	<a href={resolve('/legal/terms')}>terms of service</a> and
	<a href={resolve('/legal/risk-disclosure')}>risk disclosure</a>.
</p>
