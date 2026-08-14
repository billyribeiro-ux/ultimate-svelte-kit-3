/**
 * TEAM / AUTHORS
 *
 * This file is an SEO artefact as much as an About-page one, and it's worth
 * understanding why before dismissing it as filler copy.
 *
 * Google classifies financial content as YMYL — "Your Money or Your Life". For YMYL
 * topics its quality raters are told to check, specifically, *who* produced the
 * content and whether they have real credentials for it. A trading site with no named
 * humans on it is exactly the pattern raters are trained to mark down.
 *
 * The concrete things that help, all of which this file supplies:
 *   - a named author on every article, not "Admin" or the company name
 *   - a real biography stating relevant experience
 *   - a stable author page each article links to
 *   - `sameAs` links to external profiles, so the person is verifiable off-site
 *
 * None of that is a trick. It's the site telling the truth about its expertise in a
 * form a machine can read.
 */

export interface Person {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	/** One or two sentences. Concrete experience beats adjectives. */
	readonly bio: string;
	/** Post-nominals or licences, shown next to the name. */
	readonly credentials?: string;
	/** External profiles — becomes `sameAs` in Person schema. */
	readonly sameAs?: readonly string[];
	/** Initials, used by the avatar component as a no-image fallback. */
	readonly initials: string;
}

export const team: readonly Person[] = [
	{
		id: 'dana-okafor',
		name: 'Dana Okafor',
		role: 'Co-founder & CEO',
		initials: 'DO',
		credentials: 'CFA',
		bio: 'Spent nine years on the equity derivatives desk at a bulge-bracket bank, latterly running index volatility. Started StrikeFlow after concluding that the hard part of flow data was never collecting it — it was making it readable fast enough to matter.',
		sameAs: ['https://www.linkedin.com/in/danaokafor', 'https://x.com/danaokafor']
	},
	{
		id: 'marcus-vale',
		name: 'Marcus Vale',
		role: 'Co-founder & CTO',
		initials: 'MV',
		bio: 'Built low-latency market data infrastructure for two exchanges and a market maker. Owns the ingest path that gets an OPRA print onto your screen in under a quarter of a second.',
		sameAs: ['https://www.linkedin.com/in/marcusvale', 'https://github.com/marcusvale']
	},
	{
		id: 'priya-raman',
		name: 'Priya Raman',
		role: 'Head of Research',
		initials: 'PR',
		credentials: 'PhD',
		bio: 'Doctorate in statistics, then six years in quantitative research building volatility surface models. Writes most of what appears in our Insights section and owns the baselines behind the unusual activity scanner.',
		sameAs: ['https://www.linkedin.com/in/priyaraman']
	},
	{
		id: 'tom-brennan',
		name: 'Tom Brennan',
		role: 'Head of Product',
		initials: 'TB',
		bio: 'Twelve years designing trading interfaces, most recently at a retail brokerage where he led the options experience. Responsible for the fact that our scanner fits on a phone screen.',
		sameAs: ['https://www.linkedin.com/in/tombrennan']
	}
];

/** Look an author up by id. Returns undefined rather than throwing — callers decide. */
export function getPerson(id: string): Person | undefined {
	return team.find((person) => person.id === id);
}
