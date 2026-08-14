/**
 * SITE CONFIGURATION — the single source of truth for who we are.
 *
 * Company name, contact details, social profiles and the canonical origin all live
 * here. Pages read from it, and so does the JSON-LD we hand to search engines.
 *
 * That second consumer is the reason this file exists. Google cross-references the
 * `Organization` data in your structured markup against what's visible on the page
 * and against what it finds elsewhere on the web. Consistency across all three is a
 * trust signal. Inconsistency is a negative one. A shared constant is the cheapest
 * possible way to guarantee consistency.
 */

import { PUBLIC_SITE_URL } from '$app/env/public';

export const site = {
	name: 'StrikeFlow',
	legalName: 'StrikeFlow Data Inc.',

	/** Used as the `<title>` suffix on every page except the home page. */
	titleSuffix: 'StrikeFlow',

	tagline: 'Real-time options flow, decoded.',

	/**
	 * The default meta description. Roughly 155 characters — beyond that Google
	 * truncates it in the results page, and a sentence cut mid-word converts badly.
	 */
	description:
		'StrikeFlow streams the full options tape in real time — sweeps, blocks, dark pool prints and dealer gamma — so you can read institutional positioning as it happens.',

	/** Canonical origin, validated and de-slashed in `src/env.ts`. */
	url: PUBLIC_SITE_URL,

	locale: 'en_US',
	language: 'en',

	founded: '2021',

	contact: {
		email: 'hello@strikeflow.io',
		support: 'support@strikeflow.io',
		press: 'press@strikeflow.io',
		phone: '+1-212-555-0148'
	},

	address: {
		street: '85 Broad Street, Floor 17',
		city: 'New York',
		region: 'NY',
		postalCode: '10004',
		country: 'US'
	},

	/**
	 * Social profiles.
	 *
	 * These become the `sameAs` array in our Organization schema, which is how a
	 * search engine confirms that this site, that X account and that LinkedIn page
	 * are the same real-world entity. It's one of the few structured-data fields
	 * that measurably helps establish who you are.
	 */
	social: {
		x: 'https://x.com/strikeflow',
		linkedin: 'https://www.linkedin.com/company/strikeflow',
		github: 'https://github.com/strikeflow',
		youtube: 'https://www.youtube.com/@strikeflow'
	},

	/** Fallback social share image. 1200×630 is the ratio X and LinkedIn both crop to. */
	ogImage: '/og/default.png',
	ogImageWidth: 1200,
	ogImageHeight: 630
} as const;

/** Every social URL as an array — the shape `sameAs` wants. */
export const socialProfiles: readonly string[] = Object.values(site.social);

/**
 * Turn a root-relative path into an absolute URL.
 *
 * Canonical tags, Open Graph images and sitemap entries all require absolute URLs;
 * a relative one is either ignored or, worse, resolved against the wrong origin when
 * a scraper mirrors your page. Everything that needs an absolute URL goes through here.
 */
export function absoluteUrl(path: string): string {
	if (path.startsWith('http://') || path.startsWith('https://')) return path;
	return `${site.url}${path.startsWith('/') ? path : `/${path}`}`;
}
