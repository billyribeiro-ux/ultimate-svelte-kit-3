<!--
	SITE FOOTER

	Carries the secondary navigation, the company identity, and — because this is a
	financial site — the standing risk disclosure.

	That last part is not decoration. Google classifies trading content as YMYL ("Your
	Money or Your Life") and holds it to a higher trust bar. A visible, honest statement
	of what the product is and isn't, on every single page, is one of the clearest
	trust signals a finance site can send. It's also the right thing to do.
-->

<script lang="ts">
	import { resolve } from '$app/paths';
	import { XLogoIcon, LinkedinLogoIcon, GithubLogoIcon, YoutubeLogoIcon } from 'phosphor-svelte';
	import type { Component } from 'svelte';

	import { site } from '#lib/data/site.ts';
	import { footerNav } from '#lib/data/nav.ts';
	import Logo from '#lib/components/ui/Logo.svelte';

	const socialLinks: ReadonlyArray<{
		label: string;
		href: string;
		icon: Component<Record<string, unknown>>;
	}> = [
		{ label: 'StrikeFlow on X', href: site.social.x, icon: XLogoIcon },
		{ label: 'StrikeFlow on LinkedIn', href: site.social.linkedin, icon: LinkedinLogoIcon },
		{ label: 'StrikeFlow on GitHub', href: site.social.github, icon: GithubLogoIcon },
		{ label: 'StrikeFlow on YouTube', href: site.social.youtube, icon: YoutubeLogoIcon }
	] as ReadonlyArray<{ label: string; href: string; icon: Component<Record<string, unknown>> }>;

	/*
	 * Computed at render time.
	 *
	 * On a prerendered page this is baked in at build, so a site built in December
	 * would show a stale year all through January. The fix isn't clever code — it's
	 * remembering that prerendered output is only as fresh as your last deploy.
	 * Most sites deploy often enough that this is fine; if yours doesn't, render the
	 * year on the client or drop it entirely. It carries no legal weight either way.
	 */
	const year = new Date().getFullYear();
</script>

<footer class="footer">
	<div class="container container--wide">
		<div class="footer__top">
			<div class="footer__brand">
				<a href={resolve('/')} class="footer__logo" aria-label="StrikeFlow — home">
					<Logo size={1.5} />
				</a>
				<p class="footer__blurb">{site.tagline}</p>

				<ul class="footer__social" role="list">
					{#each socialLinks as social (social.href)}
						{@const Icon = social.icon}
						<li>
							<a
								class="footer__social-link"
								href={social.href}
								aria-label={social.label}
								target="_blank"
								rel="noopener noreferrer me"
							>
								<Icon size={20} aria-hidden="true" />
							</a>
						</li>
					{/each}
				</ul>
			</div>

			<!--
				A <nav> per group, each with its own aria-label. One giant <nav> with
				three unlabelled sublists is much harder to skim with a screen reader,
				which lets users jump between landmarks by name.
			-->
			<div class="footer__nav-groups">
				{#each footerNav as group (group.title)}
					<nav class="footer__group" aria-label={group.title}>
						<h2 class="footer__group-title">{group.title}</h2>
						<ul class="footer__group-list" role="list">
							{#each group.links as link (link.href)}
								<li>
									<a class="footer__link" href={resolve(link.href)}>{link.label}</a>
								</li>
							{/each}
						</ul>
					</nav>
				{/each}
			</div>
		</div>

		<!--
			The standing risk disclosure. `role="note"` marks it as an aside rather
			than body copy, and the heading is visually hidden so screen-reader users
			can still identify the region.
		-->
		<section class="footer__disclosure" role="note" aria-labelledby="risk-heading">
			<h2 id="risk-heading" class="visually-hidden">Risk disclosure</h2>
			<p>
				<strong>Risk disclosure.</strong> Options trading involves substantial risk and is not
				suitable for every investor. You can lose more than your initial investment. {site.name} is a
				market data and analytics provider — we are not a broker-dealer and not a registered investment
				adviser, and nothing on this site is investment advice or a recommendation to buy or sell any
				security. Past performance does not indicate future results. Read the full
				<a href={resolve('/legal/risk-disclosure')}>risk disclosure</a> before trading.
			</p>
		</section>

		<div class="footer__bottom">
			<p class="footer__copyright">
				&copy; {year}
				{site.legalName}. All rights reserved.
			</p>
			<address class="footer__address">
				{site.address.street}, {site.address.city}, {site.address.region}
				{site.address.postalCode}
			</address>
		</div>
	</div>
</footer>

<style>
	.footer {
		background-color: var(--bg-canvas);
		border-top: 1px solid var(--border);
		padding-block: var(--space-12) var(--space-8);
		margin-block-start: var(--space-16);
	}

	.footer__top {
		display: flex;
		flex-direction: column;
		gap: var(--space-10);
	}

	.footer__logo {
		display: inline-block;
		text-decoration: none;
	}

	.footer__blurb {
		margin-block-start: var(--space-3);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		max-width: 32ch;
	}

	.footer__social {
		display: flex;
		gap: var(--space-2);
		margin-block-start: var(--space-5);
	}

	.footer__social-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		color: var(--text-muted);
		transition:
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}

	@media (hover: hover) {
		.footer__social-link:hover {
			color: var(--text-primary);
			border-color: var(--border-strong);
		}
	}

	/* Two columns on phones, three from 48em. Three across at 360px would be cramped. */
	.footer__nav-groups {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-8) var(--space-6);
	}

	.footer__group-title {
		font-size: var(--fs-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-caps);
		color: var(--text-primary);
		margin-block-end: var(--space-4);
	}

	.footer__group-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.footer__link {
		color: var(--text-muted);
		text-decoration: none;
		font-size: var(--fs-sm);
		/* Comfortable tap target without visibly changing the layout. */
		display: inline-block;
		padding-block: 0.25rem;
	}

	@media (hover: hover) {
		.footer__link:hover {
			color: var(--text-primary);
		}
	}

	.footer__disclosure {
		margin-block-start: var(--space-12);
		padding: var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background-color: var(--surface);
	}

	.footer__disclosure p {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: var(--lh-relaxed);
		max-width: 90ch;
	}

	.footer__bottom {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-block-start: var(--space-8);
		padding-block-start: var(--space-6);
		border-top: 1px solid var(--border);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.footer__address {
		font-style: normal;
	}

	@media (min-width: 48em) {
		.footer__nav-groups {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.footer__bottom {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}
	}

	@media (min-width: 64em) {
		.footer__top {
			flex-direction: row;
			justify-content: space-between;
			gap: var(--space-16);
		}

		.footer__brand {
			flex: 0 0 20rem;
		}

		.footer__nav-groups {
			flex: 1;
			max-width: 40rem;
		}
	}
</style>
