/**
 * NAVIGATION
 *
 * Links are typed with SvelteKit's generated `PageRouteId` union rather than plain
 * `string`.
 *
 * That single choice is worth more than it looks. `PageRouteId` is a union of every
 * route that actually exists in `src/routes`, regenerated on every `svelte-kit sync`.
 * So if someone deletes `/pricing`, this file stops compiling — you find the broken
 * link during `pnpm check`, not from a 404 in Search Console three weeks later.
 *
 * Broken internal links are one of the few genuinely mechanical SEO problems, and
 * this turns them into a type error.
 */

import type { PageRouteId } from '$app/types';

/**
 * Route IDs that take no parameters.
 *
 * `PageRouteId` includes dynamic routes like `/blog/[slug]`, which you can't link to
 * without supplying a `slug`. This conditional type filters any route ID containing a
 * `[` out of the union, so the nav can only ever hold routes that are safe to link
 * to directly — and `resolve(href)` type-checks without needing a params argument.
 */
export type StaticRoute = Exclude<PageRouteId, `${string}[${string}`>;

export interface NavLink {
	readonly label: string;
	readonly href: StaticRoute;
	/** Optional one-liner, shown in the mobile drawer where there's room for it. */
	readonly description?: string;
}

/** Primary navigation, shown in the header. Kept short on purpose. */
export const primaryNav: readonly NavLink[] = [
	{ label: 'Features', href: '/features', description: 'What the platform does' },
	{ label: 'Pricing', href: '/pricing', description: 'Plans and what each includes' },
	{ label: 'Insights', href: '/blog', description: 'Research and market structure notes' },
	{ label: 'About', href: '/about', description: 'Who builds StrikeFlow' }
];

/** Grouped footer navigation. The `title` is rendered as a real heading. */
export interface NavGroup {
	readonly title: string;
	readonly links: readonly NavLink[];
}

export const footerNav: readonly NavGroup[] = [
	{
		title: 'Product',
		links: [
			{ label: 'Features', href: '/features' },
			{ label: 'Pricing', href: '/pricing' },
			{ label: 'Free options guide', href: '/guide' }
		]
	},
	{
		title: 'Company',
		links: [
			{ label: 'About', href: '/about' },
			{ label: 'Insights', href: '/blog' },
			{ label: 'Contact', href: '/contact' }
		]
	},
	{
		title: 'Legal',
		links: [
			{ label: 'Risk disclosure', href: '/legal/risk-disclosure' },
			{ label: 'Privacy policy', href: '/legal/privacy' },
			{ label: 'Terms of service', href: '/legal/terms' }
		]
	}
];
