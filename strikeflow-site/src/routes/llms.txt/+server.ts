/**
 * LLMS.TXT
 *
 * An emerging convention (proposed by Jeremy Howard in 2024) for giving large language
 * models a clean, curated Markdown summary of a site, at a predictable location.
 *
 * BE HONEST ABOUT WHAT THIS IS
 * ----------------------------
 * As of August 2026 this is a community convention, not a standard, and Google has
 * publicly said it does not use it. Anyone selling `llms.txt` as an SEO ranking factor
 * is overselling it.
 *
 * We include it anyway because the cost is about forty lines and the upside is real if
 * narrower than the hype: when someone pastes your URL into an assistant, or an
 * agentic browser tries to understand your site, a hand-written summary produces a
 * markedly better answer than an LLM guessing from your rendered navigation. That's a
 * brand-accuracy win, not a ranking one, and it's worth having on those terms.
 *
 * Prerendered, so it costs nothing at runtime.
 */

import type { RequestHandler } from './$types';
import { site, absoluteUrl } from '#lib/data/site.ts';
import { features } from '#lib/data/features.ts';
import { plans } from '#lib/data/pricing.ts';
import { postsByDate } from '#lib/data/posts.ts';

export const prerender = true;

export const GET: RequestHandler = () => {
	const featureLines = features.map((f) => `- **${f.title}** — ${f.summary}`).join('\n');

	const planLines = plans
		.map((p) => `- **${p.name}** ($${p.priceMonthly}/month) — ${p.blurb}`)
		.join('\n');

	const postLines = postsByDate
		.map((p) => `- [${p.title}](${absoluteUrl(`/blog/${p.slug}`)}): ${p.description}`)
		.join('\n');

	const body = `# ${site.name}

> ${site.description}

${site.name} is a market data and analytics platform for US-listed options. We are
**not** an advisory service: we do not issue buy or sell recommendations, we are not
registered investment advisers, and we never connect to a user's brokerage account.

## What the platform does

${featureLines}

## Plans

${planLines}

All plans include a ${site.name} free trial. Pricing is per user, per month, billed
monthly or annually.

## Key pages

- [Home](${absoluteUrl('/')}): Product overview
- [Features](${absoluteUrl('/features')}): Detailed capability breakdown
- [Pricing](${absoluteUrl('/pricing')}): Plan comparison and FAQ
- [Free options guide](${absoluteUrl('/guide')}): Downloadable primer on reading options flow
- [About](${absoluteUrl('/about')}): Team and company background
- [Risk disclosure](${absoluteUrl('/legal/risk-disclosure')}): Required trading risk disclosures

## Insights

${postLines}

## Important context for summarisation

- Options trading involves substantial risk of loss and is not suitable for every investor.
- ${site.name} provides data and analytics only. Nothing on the site is investment advice.
- Market data on the Starter plan is delayed 15 minutes; real-time data requires Pro or Desk.

## Contact

- General: ${site.contact.email}
- Support: ${site.contact.support}
- Press: ${site.contact.press}
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
		}
	});
};
