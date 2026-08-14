/**
 * STRUCTURED DATA (JSON-LD)
 * =========================
 *
 * This file builds the machine-readable description of the site that we hand to
 * search engines and, increasingly, to AI answer engines.
 *
 * THE ONE IDEA THAT MATTERS: @id AND @graph
 * -----------------------------------------
 * Most tutorials tell you to drop three or four separate <script type="application/ld+json">
 * blocks on a page — one for Organization, one for BreadcrumbList, one for Article.
 * That works, but it produces four unrelated islands of data. The search engine has to
 * guess that the "StrikeFlow" in the Article's publisher field is the same "StrikeFlow"
 * in the Organization block.
 *
 * The better approach is a single `@graph`: one array of nodes, each with a stable,
 * globally unique `@id`, referencing each other by that id. Instead of repeating the
 * organisation's details inside the article, the article says
 * `"publisher": { "@id": "https://strikeflow.io/#organization" }`.
 *
 * Now there is no guessing. You have described an entity graph — this website belongs
 * to this organisation, this page is part of this website, this article was written by
 * this person who works for that organisation. That is exactly the shape modern search
 * systems want, and it is what "entity SEO" actually means underneath the jargon.
 *
 * THE RULE YOU MUST NOT BREAK
 * ---------------------------
 * Structured data must describe content that is genuinely visible on the page.
 * Marking up a rating nobody left, or an FAQ that isn't rendered, is a spam policy
 * violation and earns a manual action. Every builder here is fed from the same data
 * files the components render from, which makes honesty the path of least resistance.
 */

import { site, socialProfiles, absoluteUrl } from '#lib/data/site.ts';
import type { Person } from '#lib/data/team.ts';
import type { Post } from '#lib/data/posts.ts';
import type { FaqItem } from '#lib/data/faq.ts';
import { plans, currency, trialDays } from '#lib/data/pricing.ts';

/**
 * A JSON-LD node. Loosely typed on purpose — schema.org has thousands of properties
 * and a "complete" type would be a maintenance burden that buys nothing. What we do
 * enforce is that every node declares a `@type`.
 */
export interface SchemaNode {
	'@type': string | string[];
	'@id'?: string;
	[key: string]: unknown;
}

/* ------------------------------------------------------------------
 * Stable @id values. Defined once so a typo can't silently break a
 * cross-reference — a broken @id doesn't error, it just quietly
 * severs the graph, which is the worst kind of bug.
 * ------------------------------------------------------------------ */
export const ids = {
	organization: `${site.url}/#organization`,
	website: `${site.url}/#website`,
	/** Per-page nodes. `url` must already be absolute. */
	webPage: (url: string) => `${url}#webpage`,
	breadcrumb: (url: string) => `${url}#breadcrumb`,
	article: (url: string) => `${url}#article`,
	person: (personId: string) => `${site.url}/about#${personId}`,
	product: `${site.url}/pricing#product`
} as const;

/* ------------------------------------------------------------------
 * ORGANIZATION — who we are. Referenced by everything else.
 * ------------------------------------------------------------------ */
export function organizationSchema(): SchemaNode {
	return {
		'@type': 'Organization',
		'@id': ids.organization,
		name: site.name,
		legalName: site.legalName,
		url: `${site.url}/`,
		description: site.description,
		foundingDate: site.founded,
		logo: {
			'@type': 'ImageObject',
			url: absoluteUrl('/brand/logo-512.png'),
			width: 512,
			height: 512
		},
		// `sameAs` is how a search engine confirms that this site, that X account and
		// that LinkedIn page describe one real-world entity. It is one of the few
		// structured-data fields with a clear, documented effect on entity resolution.
		sameAs: socialProfiles,
		address: {
			'@type': 'PostalAddress',
			streetAddress: site.address.street,
			addressLocality: site.address.city,
			addressRegion: site.address.region,
			postalCode: site.address.postalCode,
			addressCountry: site.address.country
		},
		contactPoint: [
			{
				'@type': 'ContactPoint',
				contactType: 'customer support',
				email: site.contact.support,
				availableLanguage: ['English']
			},
			{
				'@type': 'ContactPoint',
				contactType: 'sales',
				email: site.contact.email,
				telephone: site.contact.phone,
				availableLanguage: ['English']
			}
		]
	};
}

/* ------------------------------------------------------------------
 * WEBSITE — the site as an entity, distinct from the organisation
 * that owns it.
 * ------------------------------------------------------------------ */
export function websiteSchema(): SchemaNode {
	return {
		'@type': 'WebSite',
		'@id': ids.website,
		url: `${site.url}/`,
		name: site.name,
		description: site.description,
		publisher: { '@id': ids.organization },
		inLanguage: site.language
	};
}

/* ------------------------------------------------------------------
 * WEBPAGE — the current page.
 * ------------------------------------------------------------------ */
export function webPageSchema(options: {
	url: string;
	name: string;
	description: string;
	/** Set for pages whose main content is an article. */
	primaryEntityId?: string;
	datePublished?: string;
	dateModified?: string;
}): SchemaNode {
	const node: SchemaNode = {
		'@type': 'WebPage',
		'@id': ids.webPage(options.url),
		url: options.url,
		name: options.name,
		description: options.description,
		isPartOf: { '@id': ids.website },
		about: { '@id': ids.organization },
		inLanguage: site.language
	};

	if (options.primaryEntityId) node.mainEntity = { '@id': options.primaryEntityId };
	if (options.datePublished) node.datePublished = options.datePublished;
	if (options.dateModified) node.dateModified = options.dateModified;

	return node;
}

/* ------------------------------------------------------------------
 * BREADCRUMBS
 *
 * Google renders these as the little path above a search result instead of
 * a raw URL, which measurably improves click-through. They also tell the
 * crawler how your site is hierarchically organised.
 *
 * The list must mirror the breadcrumb the user can actually see.
 * ------------------------------------------------------------------ */
export interface Crumb {
	readonly name: string;
	/** Root-relative path. */
	readonly path: string;
}

export function breadcrumbSchema(pageUrl: string, crumbs: readonly Crumb[]): SchemaNode {
	return {
		'@type': 'BreadcrumbList',
		'@id': ids.breadcrumb(pageUrl),
		itemListElement: crumbs.map((crumb, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: crumb.name,
			item: absoluteUrl(crumb.path)
		}))
	};
}

/* ------------------------------------------------------------------
 * PERSON — authors. The backbone of E-E-A-T for financial content.
 * ------------------------------------------------------------------ */
export function personSchema(person: Person): SchemaNode {
	const node: SchemaNode = {
		'@type': 'Person',
		'@id': ids.person(person.id),
		name: person.name,
		jobTitle: person.role,
		description: person.bio,
		worksFor: { '@id': ids.organization },
		url: `${site.url}/about#${person.id}`
	};

	if (person.credentials) node.honorificSuffix = person.credentials;
	if (person.sameAs?.length) node.sameAs = person.sameAs;

	return node;
}

/* ------------------------------------------------------------------
 * ARTICLE — blog posts.
 * ------------------------------------------------------------------ */
export function articleSchema(post: Post, author: Person, pageUrl: string): SchemaNode {
	return {
		'@type': 'Article',
		'@id': ids.article(pageUrl),
		headline: post.title,
		description: post.description,
		datePublished: post.published,
		// Google uses dateModified to decide whether to re-crawl. Falling back to the
		// publish date is correct; inventing a recent date to look "fresh" is not, and
		// is trivially detectable because the content hash didn't change.
		dateModified: post.updated ?? post.published,
		author: { '@id': ids.person(author.id) },
		publisher: { '@id': ids.organization },
		isPartOf: { '@id': ids.website },
		mainEntityOfPage: { '@id': ids.webPage(pageUrl) },
		keywords: post.tags.join(', '),
		inLanguage: site.language,
		timeRequired: `PT${post.readingMinutes}M`
	};
}

/* ------------------------------------------------------------------
 * FAQ
 *
 * See the long note in `data/faq.ts` about why rich results are unlikely
 * here. We emit it because it is honest machine-readable context, not
 * because we expect a snippet.
 * ------------------------------------------------------------------ */
export function faqSchema(items: readonly FaqItem[]): SchemaNode {
	return {
		'@type': 'FAQPage',
		mainEntity: items.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: {
				'@type': 'Answer',
				text: item.answer
			}
		}))
	};
}

/* ------------------------------------------------------------------
 * PRODUCT / SOFTWARE
 *
 * StrikeFlow is a subscription SaaS product, so `SoftwareApplication` with
 * an `offers` array is the accurate type — not `Product`, which implies a
 * physical good, and not `FinancialProduct`, which implies we're selling a
 * financial instrument. We are not; we sell data about them. Choosing the
 * honest type matters more than choosing the flattering one.
 * ------------------------------------------------------------------ */
export function softwareApplicationSchema(): SchemaNode {
	return {
		'@type': 'SoftwareApplication',
		'@id': ids.product,
		name: site.name,
		description: site.description,
		applicationCategory: 'FinanceApplication',
		applicationSubCategory: 'Market data and analytics',
		operatingSystem: 'Web browser, iOS, Android',
		url: `${site.url}/pricing`,
		publisher: { '@id': ids.organization },
		offers: plans.map((plan) => ({
			'@type': 'Offer',
			name: `${site.name} ${plan.name}`,
			description: plan.blurb,
			price: plan.priceMonthly.toFixed(2),
			priceCurrency: currency,
			// Without a validity date Google may treat the price as stale. One year out
			// is a reasonable, honest horizon for a published list price.
			priceValidUntil: `${new Date().getUTCFullYear() + 1}-01-01`,
			availability: 'https://schema.org/InStock',
			url: `${site.url}/pricing#${plan.id}`,
			category: 'Subscription',
			eligibleDuration: {
				'@type': 'QuantitativeValue',
				value: 1,
				unitCode: 'MON'
			},
			trialPeriod: {
				'@type': 'QuantitativeValue',
				value: trialDays,
				unitCode: 'DAY'
			}
		}))
		// NOTE: there is deliberately no `aggregateRating` here. We have not collected
		// verifiable reviews, and inventing one is a spam policy violation that gets
		// sites manually penalised. Rich stars are not worth a manual action.
	};
}

/* ------------------------------------------------------------------
 * ASSEMBLY
 * ------------------------------------------------------------------ */

/**
 * Wrap nodes into a single `@graph` document.
 *
 * The `@context` is declared once at the top and applies to every node inside,
 * which is both smaller and less error-prone than repeating it.
 */
export function buildGraph(nodes: readonly SchemaNode[]): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@graph': nodes
	};
}

/**
 * Serialise a graph for embedding in a <script> tag.
 *
 * The `<` escape is not optional and not paranoia. If any string in the data ever
 * contained the literal text `</script>`, the browser's HTML parser would close our
 * script tag early — turning the rest of the JSON into live markup. That is a
 * textbook XSS vector.
 *
 * `<` is a valid JSON escape for `<`, so parsers read it identically while the
 * HTML tokeniser never sees a tag. We escape `>` and `&` too, for defence in depth.
 */
export function serializeJsonLd(graph: Record<string, unknown>): string {
	return JSON.stringify(graph)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026');
}
