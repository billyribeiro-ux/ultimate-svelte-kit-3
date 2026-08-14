/**
 * Chapters 8–17: data, environment, SEO, and the visual shell.
 */

export const part2 = [
	/* ============================================================ 08 */
	{
		slug: '08-the-data-layer',
		title: 'The data layer',
		summary:
			'Typed constants that every page and every piece of structured data reads from. One source of truth, no drift.',
		goal: 'All the content of the site lives in typed modules, separate from the markup that renders it.',
		blocks: [
			{
				type: 'p',
				text: "Before we build a single component, we write down what the site says. Features, plans, FAQs, people, articles — all of it as typed data in `src/lib/data/`."
			},
			{
				type: 'why',
				title: 'Why not just write the copy in the markup?',
				text: 'Because the same six features appear in three places: the home page grid, the features page, and the structured data we hand to Google. Written three times, they drift. And the day they drift, you are telling Google something different from what you are telling humans — which Google calls "structured data that does not match visible content", and which earns a manual penalty.'
			},
			{ type: 'h3', id: 'site', text: 'Site configuration' },
			{
				type: 'code',
				file: 'src/lib/data/site.ts',
				lang: 'ts',
				code: `import { PUBLIC_SITE_URL } from '$app/env/public';

export const site = {
	name: 'StrikeFlow',
	legalName: 'StrikeFlow Data Inc.',
	titleSuffix: 'StrikeFlow',
	tagline: 'Real-time options flow, decoded.',
	description:
		'StrikeFlow streams the full options tape in real time — sweeps, blocks, dark pool ' +
		'prints and dealer gamma — so you can read institutional positioning as it happens.',
	url: PUBLIC_SITE_URL,
	locale: 'en_US',
	language: 'en',
	contact: {
		email: 'hello@strikeflow.io',
		support: 'support@strikeflow.io'
	},
	social: {
		x: 'https://x.com/strikeflow',
		linkedin: 'https://www.linkedin.com/company/strikeflow'
	},
	ogImage: '/og/default.png',
	ogImageWidth: 1200,
	ogImageHeight: 630
} as const;

export const socialProfiles: readonly string[] = Object.values(site.social);

/** Turn a root-relative path into an absolute URL. */
export function absoluteUrl(path: string): string {
	if (path.startsWith('http://') || path.startsWith('https://')) return path;
	return \`\${site.url}\${path.startsWith('/') ? path : \`/\${path}\`}\`;
}`
			},
			{
				type: 'note',
				text: "`absoluteUrl` looks trivial and earns its keep constantly. Canonical tags, Open Graph images and sitemap entries all require absolute URLs — a relative one is either ignored or resolved against the wrong origin when a scraper mirrors your page. Everything that needs an absolute URL goes through this one function."
			},
			{ type: 'h3', id: 'nav', text: 'Navigation, typed against your real routes' },
			{
				type: 'code',
				file: 'src/lib/data/nav.ts',
				lang: 'ts',
				code: `import type { PageRouteId } from '$app/types';

/**
 * Route IDs that take no parameters.
 * Filters '/blog/[slug]' out of the union, so nav can only hold safe links.
 */
export type StaticRoute = Exclude<PageRouteId, \`\${string}[\${string}\`>;

export interface NavLink {
	readonly label: string;
	readonly href: StaticRoute;
	readonly description?: string;
}

export const primaryNav: readonly NavLink[] = [
	{ label: 'Features', href: '/features', description: 'What the platform does' },
	{ label: 'Pricing', href: '/pricing', description: 'Plans and what each includes' },
	{ label: 'Insights', href: '/blog', description: 'Research and market structure notes' },
	{ label: 'About', href: '/about', description: 'Who builds StrikeFlow' }
];`
			},
			{
				type: 'why',
				title: 'This is the best trick in the chapter',
				text: '`PageRouteId` is a union of every route that actually exists in `src/routes`, regenerated on every build by SvelteKit. Type your links against it and deleting a route becomes a **compile error** rather than a 404 you discover in Search Console three weeks later. Broken internal links are one of the few purely mechanical SEO problems, and this makes them impossible.'
			},
			{
				type: 'p',
				text: "The `Exclude<..., \\`\\${string}[\\${string}\\`>` bit is a conditional type that removes anything containing a `[` — so dynamic routes like `/blog/[slug]`, which you can't link to without supplying a slug, can't end up in the nav by accident."
			},
			{ type: 'h3', id: 'features', text: 'Features, pricing, FAQ, team, posts' },
			{
				type: 'p',
				text: 'The rest follow the same pattern: an exported `interface`, then a `readonly` array. Here is the shape of the features module:'
			},
			{
				type: 'code',
				file: 'src/lib/data/features.ts',
				lang: 'ts',
				code: `export type IconName =
	| 'PulseIcon' | 'CrosshairIcon' | 'FunctionIcon'
	| 'EyeIcon' | 'BellRingingIcon' | 'RewindIcon';

export interface Feature {
	readonly id: string;
	readonly title: string;
	readonly summary: string;   // one line, used in cards AND structured data
	readonly detail: string;    // longer copy, features page only
	readonly icon: IconName;
	readonly points: readonly string[];
}

export const features: readonly Feature[] = [
	{
		id: 'live-flow',
		title: 'Live flow scanner',
		summary: 'Every sweep, block and split order as it prints — not thirty seconds later.',
		detail: 'We consume the full OPRA feed and normalise it into a single stream…',
		icon: 'PulseIcon',
		points: [
			'Sub-250ms from exchange print to your screen',
			'Sweep, block, split and cross classification',
			'Filter by premium, size, expiry, moneyness or ticker'
		]
	}
	// …five more
];`
			},
			{
				type: 'note',
				text: 'Icons are stored as **strings**, not imported components. A `.ts` data file importing `.svelte` files couples your data to your view layer and makes it untestable in plain Node. We build a lookup table in chapter 13 that maps the string to a component.'
			},
			{
				type: 'p',
				text: "Build out `pricing.ts`, `faq.ts`, `team.ts` and `posts.ts` the same way. The full contents are in the finished project — the pattern matters more than the copy."
			},
			{ type: 'h3', id: 'posts-blocks', text: 'One decision worth copying: blog posts as blocks' },
			{
				type: 'code',
				file: 'src/lib/data/posts.ts',
				lang: 'ts',
				code: `export type Block =
	| { readonly type: 'p'; readonly text: string }
	| { readonly type: 'h2'; readonly text: string; readonly id: string }
	| { readonly type: 'h3'; readonly text: string; readonly id: string }
	| { readonly type: 'ul'; readonly items: readonly string[] }
	| { readonly type: 'ol'; readonly items: readonly string[] }
	| { readonly type: 'quote'; readonly text: string; readonly cite?: string }
	| { readonly type: 'callout'; readonly title: string; readonly text: string };`
			},
			{
				type: 'why',
				title: 'Why not just store HTML?',
				text: "Because rendering HTML requires `{@html post.content}`, and `{@html}` performs no sanitisation whatsoever. Today the content is a trusted constant so it is safe. The day someone wires this to a CMS, that same line becomes a stored-XSS hole — and nobody will remember to revisit it. A block union closes the door permanently: there is no code path where a string becomes markup."
			},
			{
				type: 'checkpoint',
				text: '`src/lib/data/` contains site, nav, features, pricing, faq, team and posts. `pnpm run check` passes. Nothing renders yet.'
			}
		]
	},

	/* ============================================================ 09 */
	{
		slug: '09-environment-variables',
		title: 'Environment variables',
		summary:
			'SvelteKit 3 replaced implicit `$env/*` imports with declared, validated, type-safe variables. This is a genuine upgrade.',
		goal: 'Typed environment variables that fail at startup if misconfigured, and cannot leak to the browser.',
		blocks: [
			{
				type: 'p',
				text: "In SvelteKit 2, every variable in your environment was importable from `$env/*`. Convenient, and slightly dangerous: nothing stopped you importing a secret into a component, and nothing told you a variable was missing until the code path that used it happened to run — often in production, at 3am."
			},
			{ type: 'p', text: 'SvelteKit 3 makes you declare them. You get three things back:' },
			{
				type: 'ol',
				items: [
					'**Type safety.** `import { PUBLIC_SITE_URL } from \'$app/env/public\'` is typed. A typo is a build error, not a runtime `undefined`.',
					'**Validation.** The schema runs at startup. A malformed URL kills the boot with a clear message instead of silently emitting broken canonical tags for a month.',
					'**Leak protection.** Anything without `public: true` lives in `$app/env/private`, which physically cannot be imported into browser code. The build fails if you try.'
				]
			},
			{ type: 'h3', id: 'declare', text: 'Declaring them' },
			{
				type: 'code',
				file: 'src/env.ts',
				lang: 'ts',
				code: `import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

export const variables = defineEnvVars({
	/** Canonical origin, no trailing slash. */
	PUBLIC_SITE_URL: {
		public: true,
		static: true,
		description: 'Canonical origin, e.g. https://strikeflow.io — no trailing slash.',
		schema: v.pipe(
			v.optional(v.string(), 'http://localhost:5173'),
			v.url('PUBLIC_SITE_URL must be a valid absolute URL'),
			// Strip a trailing slash once, here, rather than defensively everywhere else
			v.transform((url) => url.replace(/\\/+$/, ''))
		)
	},

	/** Private by default — no \`public: true\`. */
	LEADS_DIR: {
		description: 'Directory for the newline-delimited JSON lead log.',
		schema: v.optional(v.string(), '.data')
	},

	EBOOK_TOKEN_SECRET: {
		description: 'HMAC key for signing ebook download links. Set this in production.',
		schema: v.optional(v.pipe(v.string(), v.minLength(32, 'Use at least 32 characters')))
	}
});`
			},
			{ type: 'terminal', code: 'pnpm add valibot' },
			{
				type: 'ul',
				items: [
					'`public: true` — importable from `$app/env/public`, and usable in `app.html` as `%sveltekit.env.NAME%`. **Everything else is private.**',
					'`static: true` — inlined into the bundle at build time, which allows dead-code elimination. Use it for values that cannot change between build and run.',
					'`schema` — any [Standard Schema](https://standardschema.dev) validator. We use Valibot; Zod works identically.',
					'`description` — shows on hover in your editor. Free documentation.'
				]
			},
			{ type: 'h3', id: 'using', text: 'Using them' },
			{
				type: 'code',
				lang: 'ts',
				file: 'anywhere',
				code: `// Safe in components — this is public
import { PUBLIC_SITE_URL } from '$app/env/public';

// Server-only. Importing this into a component FAILS THE BUILD.
import { EBOOK_TOKEN_SECRET } from '$app/env/private';`
			},
			{
				type: 'why',
				title: 'That build failure is the feature',
				text: 'Most secret leaks are not sophisticated attacks. They are someone importing a config module into a component without noticing it pulls in an API key, which then ships in a JavaScript bundle anyone can read. A build that refuses to compile is a much better safety net than a code review that might catch it.'
			},
			{ type: 'h3', id: 'dotenv', text: 'The .env files' },
			{
				type: 'code',
				file: '.env.example',
				lang: 'bash',
				code: `# Copy to .env and fill in. .env is gitignored; this file is not.

PUBLIC_SITE_URL="http://localhost:5173"
LEADS_DIR=".data"

# Generate with:
#   node -e "console.log(crypto.randomBytes(32).toString('hex'))"
EBOOK_TOKEN_SECRET=""`
			},
			{
				type: 'note',
				text: 'Commit `.env.example`, never `.env`. The example file is the documentation a new engineer reads before their first `pnpm dev`, and keeping it in sync with `src/env.ts` costs nothing.'
			},
			{ type: 'terminal', code: 'cp .env.example .env\npnpm run check' },
			{
				type: 'checkpoint',
				text: '`src/env.ts` exists, `pnpm run check` passes, and `node_modules/$app/types/env.d.ts` has been generated with your variable names in it.'
			}
		]
	},

	/* ============================================================ 10 */
	{
		slug: '10-the-seo-component',
		title: 'The SEO component',
		summary:
			'One component that owns everything inside <head> a search engine or social crawler reads — with required props, so you cannot forget one.',
		goal: 'Every page emits a correct title, description, canonical, robots directive and social card.',
		blocks: [
			{
				type: 'p',
				text: "The failure mode of ad-hoc `<svelte:head>` blocks is silence. A page that forgets its canonical tag doesn't break — it just quietly competes with itself for a ranking. A page with two `<title>` elements renders fine and confuses the crawler."
			},
			{
				type: 'p',
				text: "So we build one component with **required** props. TypeScript then refuses to let you ship a page without a title and description."
			},
			{ type: 'h3', id: 'head', text: 'How svelte:head works' },
			{
				type: 'p',
				text: "Anything inside `<svelte:head>` is lifted out of the component and injected into the document head, no matter where the component sits in the tree. During server rendering it lands in the HTML string before it's sent — which is what matters, because crawlers read the raw HTML response. Tags added later by client-side JavaScript are much less reliably picked up."
			},
			{ type: 'h3', id: 'props', text: 'The props' },
			{
				type: 'code',
				file: 'src/lib/seo/Seo.svelte',
				lang: 'svelte',
				code: `<script lang="ts">
	import { page } from '$app/state';
	import { site, absoluteUrl } from '#lib/data/site.ts';

	interface Props {
		/** Page title WITHOUT the brand suffix — this component adds it. */
		title: string;
		/** ~155 characters. Longer gets truncated in the results page. */
		description: string;
		/** Defaults to the current pathname. Override only for genuine duplicates. */
		canonicalPath?: string;
		type?: 'website' | 'article';
		image?: string;
		imageAlt?: string;
		/** Keep a page out of the index. For thank-you and gated pages. */
		noindex?: boolean;
		schema?: readonly SchemaNode[];
		article?: ArticleMeta;
	}

	let {
		title,
		description,
		canonicalPath,
		type = 'website',
		image = site.ogImage,
		imageAlt,
		noindex = false,
		schema = [],
		article
	}: Props = $props();
</script>`
			},
			{
				type: 'note',
				text: '`$props()` is the Svelte 5 rune that replaces `export let`. Destructure it, give defaults inline, and type it with an interface. There is no separate props declaration.'
			},
			{ type: 'h3', id: 'canonical', text: 'The canonical URL' },
			{
				type: 'code',
				lang: 'ts',
				file: 'src/lib/seo/Seo.svelte',
				code: `const canonical = $derived(absoluteUrl(canonicalPath ?? page.url.pathname));`
			},
			{
				type: 'why',
				title: 'Why pathname only, dropping the query string',
				text: 'A page reached via `?utm_source=newsletter` is the same page as the bare URL. Telling Google otherwise splits its ranking signals across two addresses that then compete with each other. Dropping the query string is the entire fix, and it is one line.'
			},
			{ type: 'h3', id: 'title', text: 'Title composition' },
			{
				type: 'code',
				lang: 'ts',
				file: 'src/lib/seo/Seo.svelte',
				code: `const fullTitle = $derived(
	title === site.name ? title : \`\${title} | \${site.titleSuffix}\`
);`
			},
			{
				type: 'p',
				text: 'The home page uses its title verbatim; every other page gets " | StrikeFlow" appended. Suffixing the home page too would give you "StrikeFlow | StrikeFlow".'
			},
			{
				type: 'warn',
				text: 'Keep the whole thing under about **60 characters**. Beyond that Google truncates, and a title cut mid-word looks broken in the one place it is meant to persuade someone to click. Our blog headlines are longer than that on purpose, so they get a separate shorter `seoTitle` — see chapter 24.'
			},
			{ type: 'h3', id: 'robots', text: 'The robots directive' },
			{
				type: 'code',
				lang: 'ts',
				file: 'src/lib/seo/Seo.svelte',
				code: `const robots = $derived(
	noindex
		? 'noindex, nofollow'
		: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
);`
			},
			{
				type: 'ul',
				items: [
					'`max-image-preview:large` — **the one that matters.** It allows a large thumbnail, and it is a prerequisite for appearing in Google Discover.',
					'`max-snippet:-1` — no limit on description length.',
					'`max-video-preview:-1` — no limit on video preview length.'
				]
			},
			{
				type: 'p',
				text: 'Without these, Google applies conservative defaults and your result looks physically smaller than a competitor\'s on the same page.'
			},
			{ type: 'h3', id: 'markup', text: 'The markup' },
			{
				type: 'code',
				file: 'src/lib/seo/Seo.svelte',
				lang: 'svelte',
				code: `<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta name="robots" content={robots} />

	<!-- Open Graph: LinkedIn, Facebook, Slack, Discord, iMessage -->
	<meta property="og:type" content={type} />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:site_name" content={site.name} />
	<meta property="og:locale" content={site.locale} />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:image:width" content={String(site.ogImageWidth)} />
	<meta property="og:image:height" content={String(site.ogImageHeight)} />
	<meta property="og:image:alt" content={imageAlt ?? \`\${site.name} — \${site.tagline}\`} />

	{#if type === 'article' && article}
		<meta property="article:published_time" content={article.published} />
		{#if article.modified}
			<meta property="article:modified_time" content={article.modified} />
		{/if}
		<meta property="article:author" content={article.authorName} />
		{#each article.tags ?? [] as tag (tag)}
			<meta property="article:tag" content={tag} />
		{/each}
	{/if}

	<!-- X / Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImageUrl} />
	<meta name="twitter:image:alt" content={imageAlt ?? \`\${site.name} — \${site.tagline}\`} />

	<meta name="theme-color" content="#05070c" />
</svelte:head>`
			},
			{
				type: 'note',
				text: 'Alt text on a share image (`og:image:alt`) is an accessibility requirement, not decoration — screen readers announce it when a link is shared into a chat. Almost nobody sets it.'
			},
			{
				type: 'checkpoint',
				text: 'The component compiles. Nothing uses it yet — we add the structured data next, then start putting it on pages.'
			}
		]
	},

	/* ============================================================ 11 */
	{
		slug: '11-structured-data',
		title: 'Structured data that actually connects',
		summary:
			'Most tutorials give you four disconnected JSON-LD blocks. We build one @graph where every node references the others by @id.',
		goal: 'A single, cross-referenced entity graph that tells a search engine who you are.',
		blocks: [
			{
				type: 'p',
				text: 'Structured data is a machine-readable description of your page. Search engines use it to understand what a page *is* rather than guessing from the text — and increasingly, so do AI answer engines.'
			},
			{ type: 'h3', id: 'graph', text: 'The one idea that matters' },
			{
				type: 'p',
				text: "Most tutorials tell you to drop three or four separate `<script type=\"application/ld+json\">` blocks on a page: one for Organization, one for BreadcrumbList, one for Article. That works, and it produces four unrelated islands of data. The search engine has to *guess* that the \"StrikeFlow\" in the Article's publisher field is the same \"StrikeFlow\" in the Organization block."
			},
			{
				type: 'p',
				text: 'The better approach is a single `@graph`: one array of nodes, each with a stable, globally unique `@id`, referencing each other by that id.'
			},
			{
				type: 'code',
				lang: 'json',
				file: 'the shape',
				code: `{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": "https://strikeflow.io/#organization", "name": "StrikeFlow" },
    { "@type": "WebSite", "@id": "https://strikeflow.io/#website",
      "publisher": { "@id": "https://strikeflow.io/#organization" } },
    { "@type": "Article", "@id": "https://strikeflow.io/blog/x#article",
      "author":    { "@id": "https://strikeflow.io/about#priya-raman" },
      "publisher": { "@id": "https://strikeflow.io/#organization" } }
  ]
}`
			},
			{
				type: 'why',
				title: 'Why this is worth the effort',
				text: 'You have described an **entity graph**: this site belongs to this organisation, this page is part of this site, this article was written by this person who works for that organisation. No guessing required. That shape is exactly what modern search systems want, and it is what "entity SEO" actually means underneath the jargon.'
			},
			{ type: 'h3', id: 'ids', text: 'Stable ids, defined once' },
			{
				type: 'code',
				file: 'src/lib/seo/schema.ts',
				lang: 'ts',
				code: `export const ids = {
	organization: \`\${site.url}/#organization\`,
	website: \`\${site.url}/#website\`,
	webPage: (url: string) => \`\${url}#webpage\`,
	breadcrumb: (url: string) => \`\${url}#breadcrumb\`,
	article: (url: string) => \`\${url}#article\`,
	person: (personId: string) => \`\${site.url}/about#\${personId}\`,
	product: \`\${site.url}/pricing#product\`
} as const;`
			},
			{
				type: 'warn',
				text: "Define these once. A typo in an `@id` does not throw an error — it silently severs the graph, which is the worst kind of bug: everything looks fine and nothing works."
			},
			{ type: 'h3', id: 'builders', text: 'The builders' },
			{
				type: 'code',
				file: 'src/lib/seo/schema.ts',
				lang: 'ts',
				code: `export function organizationSchema(): SchemaNode {
	return {
		'@type': 'Organization',
		'@id': ids.organization,
		name: site.name,
		legalName: site.legalName,
		url: \`\${site.url}/\`,
		description: site.description,
		logo: {
			'@type': 'ImageObject',
			url: absoluteUrl('/brand/logo-512.png'),
			width: 512,
			height: 512
		},
		sameAs: socialProfiles,
		contactPoint: [
			{
				'@type': 'ContactPoint',
				contactType: 'customer support',
				email: site.contact.support,
				availableLanguage: ['English']
			}
		]
	};
}`
			},
			{
				type: 'note',
				text: '`sameAs` is how a search engine confirms that this site, that X account and that LinkedIn page describe one real-world entity. It is one of the few structured-data fields with a documented, observable effect on entity resolution — well worth filling in accurately.'
			},
			{
				type: 'p',
				text: 'The same file also exports `websiteSchema`, `webPageSchema`, `breadcrumbSchema`, `personSchema`, `articleSchema`, `faqSchema` and `softwareApplicationSchema`. Each returns one node; each references the others by id.'
			},
			{ type: 'h3', id: 'honest', text: 'Two places to be honest' },
			{
				type: 'code',
				file: 'src/lib/seo/schema.ts',
				lang: 'ts',
				code: `		offers: plans.map((plan) => ({ /* … */ }))
		// NOTE: there is deliberately no \`aggregateRating\` here.
		// We have not collected verifiable reviews, and inventing one is a spam
		// policy violation that gets sites manually penalised.`
			},
			{
				type: 'warn',
				text: "**Structured data must describe content that is genuinely visible on the page.** Marking up a rating nobody left, or an FAQ that is not rendered, is a spam policy violation and earns a manual action — which takes months to lift. Every builder here is fed from the same data files the components render from, which makes honesty the path of least resistance."
			},
			{
				type: 'p',
				text: "The second honest note is about FAQ markup. Google narrowed FAQ rich results in 2023 to well-known authoritative government and health sites. A new fintech site will almost certainly not get FAQ snippets, and anyone promising otherwise is selling something. We emit it anyway, because it costs nothing and it is genuine machine-readable context — but not because we expect a snippet."
			},
			{ type: 'h3', id: 'serialise', text: 'Serialising safely' },
			{
				type: 'code',
				file: 'src/lib/seo/schema.ts',
				lang: 'ts',
				code: `export function buildGraph(nodes: readonly SchemaNode[]): Record<string, unknown> {
	return { '@context': 'https://schema.org', '@graph': nodes };
}

export function serializeJsonLd(graph: Record<string, unknown>): string {
	return JSON.stringify(graph)
		.replace(/</g, '\\\\u003c')
		.replace(/>/g, '\\\\u003e')
		.replace(/&/g, '\\\\u0026');
}`
			},
			{
				type: 'warn',
				text: "The `<` escape is not optional and not paranoia. If any string in your data ever contained the literal text for a closing script tag, the browser's HTML parser would close the script early and treat the rest of your JSON as live markup. That is a textbook XSS vector. `\\u003c` is a valid JSON escape, so parsers read it identically while the HTML tokeniser never sees a tag."
			},
			{ type: 'h3', id: 'render', text: 'Rendering it' },
			{
				type: 'code',
				file: 'src/lib/seo/Seo.svelte',
				lang: 'svelte',
				code: `const jsonLdScript = $derived(
	// Built by concatenation so the closing-tag text never appears literally
	// in this file — not even inside a comment.
	'<script type="application/ld+json">' +
		serializeJsonLd(
			buildGraph([
				organizationSchema(),
				websiteSchema(),
				webPageSchema({ url: canonical, name: fullTitle, description }),
				...schema
			])
		) +
		'</' + 'script>'
);`
			},
			{
				type: 'code',
				file: 'src/lib/seo/Seo.svelte (in svelte:head)',
				lang: 'svelte',
				code: `<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html jsonLdScript}`
			},
			{
				type: 'note',
				text: 'Organization and WebSite appear on **every** page. That repetition is intentional and correct — because each carries a stable `@id`, a search engine treats them as repeated references to one entity, not as many entities.'
			},
			{
				type: 'checkpoint',
				text: 'You can explain what `@graph` and `@id` do, and why `serializeJsonLd` escapes angle brackets.'
			}
		]
	},

	/* ============================================================ 12 */
	{
		slug: '12-sitemap-robots-llms',
		title: 'sitemap.xml, robots.txt and llms.txt',
		summary:
			'Three generated files, and a clear explanation of what each one actually controls — including the distinction almost everyone gets wrong.',
		goal: 'All three files generate at build time from your real routes.',
		blocks: [
			{
				type: 'p',
				text: "These are routes, not static files, because they need your real origin — and a hardcoded static file will point staging crawlers at production, or worse."
			},
			{
				type: 'p',
				text: "In SvelteKit, `src/routes/sitemap.xml/+server.ts` serves `/sitemap.xml`. A folder with a dot in the name is fine."
			},
			{ type: 'h3', id: 'manifest', text: 'A typed route manifest' },
			{
				type: 'code',
				file: 'src/lib/seo/routes.ts',
				lang: 'ts',
				code: `import type { StaticRoute } from '#lib/data/nav.ts';

export interface SitemapEntry {
	readonly path: StaticRoute;
	readonly lastmod?: string;
}

export const staticSitemapEntries: readonly SitemapEntry[] = [
	{ path: '/' },
	{ path: '/features' },
	{ path: '/pricing' },
	{ path: '/guide' },
	{ path: '/blog' },
	{ path: '/about' },
	{ path: '/contact' },
	{ path: '/legal/risk-disclosure' },
	{ path: '/legal/privacy' },
	{ path: '/legal/terms' }
];`
			},
			{
				type: 'why',
				title: 'Why an explicit list rather than auto-discovery',
				text: 'You could glob `src/routes` and generate this. Auto-discovery has no opinion, though: it happily lists the thank-you page you deliberately noindexed. An explicit list means putting a page in the sitemap is a **decision** — and because `path` is typed as `StaticRoute`, deleting a route makes this file stop compiling instead of producing a sitemap full of 404s.'
			},
			{ type: 'h3', id: 'sitemap', text: 'The sitemap' },
			{
				type: 'code',
				file: 'src/routes/sitemap.xml/+server.ts',
				lang: 'ts',
				code: `import type { RequestHandler } from './$types';
import { absoluteUrl } from '#lib/data/site.ts';
import { staticSitemapEntries } from '#lib/seo/routes.ts';
import { postsByDate } from '#lib/data/posts.ts';

export const prerender = true;

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export const GET: RequestHandler = () => {
	const blogEntries = postsByDate.map((post) => ({
		path: \`/blog/\${post.slug}\`,
		lastmod: post.updated ?? post.published
	}));

	const urls = [...staticSitemapEntries, ...blogEntries]
		.map((entry) => {
			const loc = escapeXml(absoluteUrl(entry.path));
			const lastmod = entry.lastmod ? \`\\n\\t\\t<lastmod>\${entry.lastmod}</lastmod>\` : '';
			return \`\\t<url>\\n\\t\\t<loc>\${loc}</loc>\${lastmod}\\n\\t</url>\`;
		})
		.join('\\n');

	const xml = \`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
\${urls}
</urlset>\`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
			'X-Robots-Tag': 'noindex'
		}
	});
};`
			},
			{
				type: 'warn',
				text: 'The namespace must be **exactly** `http://www.sitemaps.org/schemas/sitemap/0.9`. Get one character wrong and the file parses as generic XML, and every crawler rejects it as "not a sitemap". I typo\'d this while writing the project; the e2e test in chapter 26 is there because of it.'
			},
			{
				type: 'ul',
				items: [
					'**No `<changefreq>` and no `<priority>`.** Google has stated plainly that it ignores both. Every site declared everything "daily" and "1.0", so the fields became meaningless. Emitting them adds bytes and implies precision you do not have.',
					'**`<lastmod>` only where it is true.** Blog posts have real dates. Marketing pages do not track edits, so they get none. An inaccurate lastmod is worse than none — it teaches the crawler to distrust the field across your whole site.'
				]
			},
			{ type: 'h3', id: 'robots', text: 'robots.txt' },
			{
				type: 'why',
				title: 'The distinction almost everyone gets wrong',
				text: 'robots.txt controls **crawling**, not **indexing**. A URL blocked there can still appear in search results — Google just shows it with no description, because you told it not to look. If you want a page kept *out of the index*, use a `noindex` meta tag and let the crawler in to read it. Blocking a page you also noindexed is self-defeating: the crawler can never see the noindex.'
			},
			{
				type: 'code',
				file: 'src/routes/robots.txt/+server.ts',
				lang: 'ts',
				code: `export const prerender = true;

export const GET: RequestHandler = () => {
	const body = \`User-agent: *
Allow: /

# Internal asset directory — nothing here is a page
Disallow: /_app/

# Gated pages. The noindex meta tag is what keeps these out of the index;
# these lines just save the crawl budget.
Disallow: /guide/thank-you
Disallow: /guide/download

Sitemap: \${absoluteUrl('/sitemap.xml')}
\`;

	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
};`
			},
			{ type: 'h3', id: 'llms', text: 'llms.txt' },
			{
				type: 'p',
				text: "An emerging convention for giving language models a clean, hand-written Markdown summary of your site at a predictable location."
			},
			{
				type: 'warn',
				text: "Be honest about what this is. As of August 2026 it is a community convention, not a standard, and Google has publicly said it does not use it. Anyone selling `llms.txt` as a ranking factor is overselling it."
			},
			{
				type: 'p',
				text: "We include it because it costs about forty lines, and the upside is real if narrower than the hype: when someone pastes your URL into an assistant, a hand-written summary produces a markedly better answer than a model guessing from your rendered navigation. That is a brand-accuracy win, not a ranking one."
			},
			{
				type: 'p',
				text: 'Ours generates from the same data modules and — importantly — repeats the disclaimer that we are not an advisory service, so a summarising model carries that through.'
			},
			{
				type: 'checkpoint',
				text: 'Visit `/sitemap.xml`, `/robots.txt` and `/llms.txt` in dev. All three render, and the sitemap lists every page plus every blog post.'
			}
		]
	},

	/* ============================================================ 13 */
	{
		slug: '13-ui-primitives',
		title: 'UI primitives',
		summary:
			'Button, Card, Badge and Logo — and the single most important accessibility rule in front-end work.',
		goal: 'A small set of reusable components, each doing one thing properly.',
		blocks: [
			{ type: 'terminal', code: 'pnpm add phosphor-svelte' },
			{ type: 'h3', id: 'button', text: 'Button: link or button?' },
			{
				type: 'why',
				title: 'The rule worth memorising',
				text: 'Navigates somewhere? Use `<a href>`. Performs an action? Use `<button>`. A `<div onclick>` is not focusable, not keyboard operable, not announced as interactive, and not openable in a new tab. Those are not edge cases — they are how a meaningful share of people use the web.'
			},
			{
				type: 'p',
				text: 'Rather than write two nearly identical components, we pick the element at runtime with `<svelte:element>`:'
			},
			{
				type: 'code',
				file: 'src/lib/components/ui/Button.svelte',
				lang: 'svelte',
				code: `<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		/** Provide this and you get an <a>. Omit it and you get a <button>. */
		href?: string;
		external?: boolean;
		fullWidth?: boolean;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
		icon?: Snippet;
		iconTrailing?: Snippet;
	}

	let {
		variant = 'primary', size = 'md', href, external = false,
		fullWidth = false, disabled = false, type = 'button',
		onclick, children, icon, iconTrailing
	}: Props = $props();

	const tag = $derived(href ? 'a' : 'button');
</script>

<svelte:element
	this={tag}
	class="btn btn--{variant} btn--{size}"
	class:btn--full={fullWidth}
	{href}
	{onclick}
	target={external ? '_blank' : undefined}
	rel={external ? 'noopener noreferrer' : undefined}
	type={href ? undefined : type}
	disabled={href ? undefined : disabled}
>
	{#if icon}<span class="btn__icon" aria-hidden="true">{@render icon()}</span>{/if}
	<span class="btn__label">{@render children()}</span>
	{#if iconTrailing}<span class="btn__icon" aria-hidden="true">{@render iconTrailing()}</span>{/if}
</svelte:element>`
			},
			{
				type: 'note',
				text: '`Snippet` is the Svelte 5 replacement for slots. A snippet prop is a chunk of markup the parent passes in, rendered with `{@render …}`. Unlike slots, snippets are ordinary values: typed, passable, and usable in `{#if}`.'
			},
			{ type: 'h3', id: 'touch', text: 'Two CSS details that matter on phones' },
			{
				type: 'code',
				file: 'src/lib/components/ui/Button.svelte',
				lang: 'css',
				code: `.btn {
	/* 44px minimum touch target — Apple's and Google's guidelines,
	   and WCAG 2.2 Success Criterion 2.5.8 */
	min-height: 2.75rem;

	/* Stops a double-tap zooming on iOS, and kills the 300ms tap delay */
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
}

/* Hover styles ONLY on devices with a real pointer */
@media (hover: hover) {
	.btn--primary:hover:not(.btn--disabled) {
		background-color: var(--accent-hover);
		transform: translateY(-1px);
	}
}`
			},
			{
				type: 'why',
				title: 'Why hover styles need a media query',
				text: 'On a touchscreen there is no hover — but browsers fake one on tap, and it **sticks** until you tap elsewhere. So a phone user taps your button and it stays lit up afterwards, looking broken. `@media (hover: hover)` means those styles only apply to devices with a real pointer. Almost nobody does this, and it is one line.'
			},
			{ type: 'h3', id: 'icons', text: 'The icon registry' },
			{
				type: 'p',
				text: 'Our data files store icons as strings. Here is the bridge from string to component:'
			},
			{
				type: 'code',
				file: 'src/lib/components/ui/icons.ts',
				lang: 'ts',
				code: `import {
	PulseIcon, CrosshairIcon, FunctionIcon,
	EyeIcon, BellRingingIcon, RewindIcon
} from 'phosphor-svelte';
import type { Component } from 'svelte';
import type { IconName } from '#lib/data/features.ts';

export const featureIcons: Record<IconName, Component<Record<string, unknown>>> = {
	PulseIcon, CrosshairIcon, FunctionIcon,
	EyeIcon, BellRingingIcon, RewindIcon
} as Record<IconName, Component<Record<string, unknown>>>;`
			},
			{
				type: 'note',
				text: 'Typing it as a full `Record<IconName, …>` is the point: add a name to the `IconName` union and forget to register it here, and TypeScript fails the build. A plain object with a runtime lookup would fail silently with an invisible icon in production.'
			},
			{
				type: 'p',
				text: 'In Svelte 5 you render a component held in a variable by just using it as a tag. `<svelte:component this={Icon} />` is legacy:'
			},
			{
				type: 'code',
				lang: 'svelte',
				file: 'usage',
				code: `{@const Icon = featureIcons[feature.icon]}
<Icon size={26} weight="duotone" />`
			},
			{ type: 'h3', id: 'phosphor-vite', text: 'One important build setting' },
			{
				type: 'p',
				text: "`import { PulseIcon } from 'phosphor-svelte'` reads nicely but resolves a barrel file re-exporting roughly nine thousand components. Production builds tree-shake it, but the dev server has to crawl every one — which turns a cold start into a coffee break. Phosphor ships a Vite plugin that rewrites those imports into deep ones:"
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `import { sveltePhosphorOptimize } from 'phosphor-svelte/vite';

export default defineConfig({
	plugins: [
		sveltekit({ /* … */ }),
		sveltePhosphorOptimize()   // MUST come AFTER sveltekit()
	]
});`
			},
			{
				type: 'warn',
				text: 'The ordering matters and the failure is loud. Vite runs `transform` hooks in array order, and this plugin parses its input as JavaScript. Put it **before** `sveltekit()` and it receives raw `.svelte` source — markup and all — and dies on the first `<h1>` with *"Unexpected JSX expression"*. I lost ten minutes to this.'
			},
			{
				type: 'checkpoint',
				text: 'Button, Card, Badge, Logo and the icon registry all compile, and the dev server still starts quickly.'
			}
		]
	},

	/* ============================================================ 14 */
	{
		slug: '14-header-and-drawer',
		title: 'The header and a mobile drawer that is not broken',
		summary:
			'A sticky header, and a slide-in navigation drawer built on <dialog> — which gives us focus trapping, Escape and inertness for free.',
		goal: 'A responsive header whose mobile drawer is genuinely accessible, with almost no code.',
		blocks: [
			{
				type: 'p',
				text: "Hand-rolling a modal drawer means hand-rolling all of this:"
			},
			{
				type: 'ul',
				items: [
					'Trapping Tab inside it so focus cannot wander behind the overlay',
					'Closing on Escape',
					'Making the rest of the page inert to screen readers',
					'Restoring focus to the trigger button on close',
					'A backdrop that is not trapped in a stacking context'
				]
			},
			{
				type: 'p',
				text: 'Every one of those is a bug people ship. A native `<dialog>` opened with `showModal()` gives you all five, correctly, in about four lines.'
			},
			{
				type: 'code',
				file: 'src/lib/components/layout/SiteHeader.svelte',
				lang: 'svelte',
				code: `<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { scrollY } from 'svelte/reactivity/window';
	import { ListIcon, XIcon } from 'phosphor-svelte';
	import { primaryNav, type StaticRoute } from '#lib/data/nav.ts';

	let drawer = $state<HTMLDialogElement | null>(null);
	let isOpen = $state(false);

	const isScrolled = $derived((scrollY.current ?? 0) > 8);

	function openDrawer() {
		drawer?.showModal();
		isOpen = true;
	}

	function closeDrawer() {
		drawer?.close();
	}

	/* The dialog fires 'close' however it was closed — our button, Escape, or
	   a backdrop click. Syncing state here means we cannot get out of sync. */
	function handleClose() {
		isOpen = false;
	}

	/* The browser has no idea a client-side route changed. Without this, tapping
	   a link changes the page underneath while the drawer stays open on top. */
	afterNavigate(() => {
		if (drawer?.open) drawer.close();
	});

	function isCurrent(href: StaticRoute): boolean {
		const target = resolve(href);
		const here = page.url.pathname;
		if (target === resolve('/')) return here === target;
		return here === target || here.startsWith(\`\${target}/\`);
	}
</script>`
			},
			{
				type: 'note',
				text: '`scrollY` from `svelte/reactivity/window` is a reactive wrapper around `window.scrollY`. It attaches its listener lazily — only while something is reading `.current` — and cleans up on its own. It is also SSR-safe: `.current` is `undefined` on the server rather than throwing. Much better than an `$effect` with `addEventListener`.'
			},
			{ type: 'h3', id: 'markup', text: 'The markup' },
			{
				type: 'code',
				file: 'src/lib/components/layout/SiteHeader.svelte',
				lang: 'svelte',
				code: `<header class="header" class:header--scrolled={isScrolled}>
	<div class="header__inner container container--wide">
		<a class="header__brand" href={resolve('/')} aria-label="StrikeFlow — home">
			<Logo size={1.5} />
		</a>

		<nav class="header__nav" aria-label="Main">
			<ul class="header__nav-list" role="list">
				{#each primaryNav as link (link.href)}
					<li>
						<a
							class="header__nav-link"
							class:is-current={isCurrent(link.href)}
							href={resolve(link.href)}
							aria-current={isCurrent(link.href) ? 'page' : undefined}
						>{link.label}</a>
					</li>
				{/each}
			</ul>
		</nav>

		<button
			class="header__toggle"
			type="button"
			onclick={openDrawer}
			aria-expanded={isOpen}
			aria-haspopup="dialog"
			aria-label="Open navigation menu"
		>
			<ListIcon size={24} aria-hidden="true" />
		</button>
	</div>
</header>

<dialog bind:this={drawer} class="drawer" onclose={handleClose} aria-label="Navigation menu">
	<!-- drawer contents -->
</dialog>`
			},
			{
				type: 'why',
				title: 'Why the desktop nav is hidden with CSS, not removed from the DOM',
				text: 'You could render one nav or the other depending on screen size. Then a crawler — which has no viewport — sees whichever branch happened to render, and your internal linking becomes a coin flip. One nav in the markup, hidden with CSS, is unambiguous.'
			},
			{
				type: 'note',
				text: '`aria-current="page"` on the active link is what tells a screen reader "you are here". It is also a free CSS hook — we style the active state off the same attribute, so the visual and the announced state can never disagree.'
			},
			{ type: 'h3', id: 'drawer-css', text: 'The drawer styles' },
			{
				type: 'code',
				file: 'src/lib/components/layout/SiteHeader.svelte',
				lang: 'css',
				code: `.drawer {
	margin: 0 0 0 auto;        /* pin to the right edge */
	padding: 0;
	border: none;
	width: min(22rem, 88vw);
	height: 100%;
	max-height: 100%;
	background-color: var(--surface);
	border-left: 1px solid var(--border);
}

.drawer::backdrop {
	background-color: rgb(0 0 0 / 0.65);
	backdrop-filter: blur(2px);
}

/* [open] is set by the browser, so we animate without tracking state */
.drawer[open] { animation: slide-in var(--dur-slow) var(--ease-out); }

@keyframes slide-in {
	from { transform: translateX(100%); }
	to   { transform: translateX(0); }
}

.drawer__panel {
	/* Respects the iOS home indicator and notch */
	padding: var(--space-4) var(--space-5) max(var(--space-5), env(safe-area-inset-bottom));
	overflow-y: auto;
	overscroll-behavior: contain;
}`
			},
			{
				type: 'why',
				title: 'Notice there is no z-index',
				text: 'A `<dialog>` opened with `showModal()` lives in the browser\'s **top layer** — above every z-index on the page, regardless of stacking contexts. It cannot be trapped behind a transformed ancestor, which is the bug that eventually kills every hand-rolled modal.'
			},
			{
				type: 'note',
				text: '`overscroll-behavior: contain` stops scroll chaining — without it, scrolling to the bottom of the drawer starts scrolling the page behind it.'
			},
			{
				type: 'checkpoint',
				text: 'On a narrow window the hamburger opens a drawer. Escape closes it, Tab stays inside it, and clicking a link closes it and navigates.'
			}
		]
	},

	/* ============================================================ 15 */
	{
		slug: '15-layout-and-shell',
		title: 'The layout and the HTML shell',
		summary:
			'Wire up the global stylesheet, add the skip link and main landmark, and put the single most valuable performance tag in the document head.',
		goal: 'The site finally looks like something, and loads fast.',
		blocks: [
			{ type: 'h3', id: 'layout', text: 'The root layout' },
			{
				type: 'p',
				text: '`src/routes/+layout.svelte` wraps every page. Three jobs, and nothing else — layouts that accumulate logic become the hardest file in the codebase to reason about.'
			},
			{
				type: 'code',
				file: 'src/routes/+layout.svelte',
				lang: 'svelte',
				code: `<script lang="ts">
	import '#lib/styles/app.css';

	import favicon from '#lib/assets/favicon.svg';
	import SiteHeader from '#lib/components/layout/SiteHeader.svelte';
	import SiteFooter from '#lib/components/layout/SiteFooter.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>

<div class="app-shell">
	<SiteHeader />
	<main id="main" tabindex="-1">
		{@render children()}
	</main>
	<SiteFooter />
</div>`
			},
			{
				type: 'p',
				text: 'That first import is the moment the whole design system switches on. Save the file and watch Times New Roman disappear.'
			},
			{
				type: 'why',
				title: 'The skip link and tabindex="-1"',
				text: 'A keyboard user landing on your page would otherwise have to tab through the entire header on **every single page** before reaching content. The skip link lets them jump. `tabindex="-1"` on `<main>` makes it programmatically focusable, so the link actually moves focus rather than just scrolling — without it some browsers scroll the page but leave focus stranded in the header. This is WCAG 2.4.1, Level A.'
			},
			{
				type: 'code',
				file: 'src/routes/+layout.svelte',
				lang: 'css',
				code: `.app-shell {
	display: flex;
	flex-direction: column;
	min-height: 100svh;
}

main { flex: 1; }
main:focus { outline: none; }`
			},
			{
				type: 'why',
				title: '100svh, not 100vh',
				text: 'On mobile, `vh` is measured against the viewport with browser chrome **hidden**. So a `100vh` element is taller than what you can actually see, and the page scrolls by the height of the address bar for no reason. `svh` — small viewport height — measures the visible area. This one unit fixes the single most common mobile layout bug.'
			},
			{ type: 'h3', id: 'prerender', text: 'Prerender the whole site' },
			{
				type: 'code',
				file: 'src/routes/+layout.ts',
				lang: 'ts',
				code: `export const prerender = true;
export const trailingSlash = 'never';`
			},
			{
				type: 'p',
				text: "Options exported from a layout cascade to every page beneath it, so those two lines configure the entire site. At build time SvelteKit crawls your app, renders each page and writes plain HTML files. A visitor gets a static file from the CDN edge — no server render, no cold start."
			},
			{
				type: 'note',
				text: "`trailingSlash: 'never'` matters more than it looks. `/about` and `/about/` are **different URLs** to a search engine. If both resolve, you have split your ranking signals in two. Pick one and be consistent; SvelteKit redirects the other form for you."
			},
			{
				type: 'note',
				text: 'A useful side effect of prerendering: the crawler follows every internal link and reports any that 404. Combined with `handleHttpError: \'fail\'` in `vite.config.ts`, it becomes impossible to ship a dead internal link.'
			},
			{ type: 'h3', id: 'shell', text: 'The HTML shell, and the preload' },
			{
				type: 'code',
				file: 'src/app.html',
				lang: 'html',
				code: `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />

		<link rel="preload" href="/fonts/montserrat-latin-wght-normal.woff2"
		      as="font" type="font/woff2" crossorigin />
		<link rel="preload" href="/fonts/sofia-sans-latin-wght-normal.woff2"
		      as="font" type="font/woff2" crossorigin />

		<meta name="theme-color" content="#05070c" />
		<meta name="color-scheme" content="dark" />

		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>`
			},
			{
				type: 'why',
				title: 'Those two preload lines are the highest-leverage change in the project',
				text: 'Without them the browser must: fetch HTML → fetch CSS → parse CSS → discover the @font-face → fetch the font. That is a serial chain with the font last. `rel="preload"` starts the font fetch the moment the head is read, in parallel with the CSS. On a 4G connection this typically pulls first paint of real text forward by hundreds of milliseconds.'
			},
			{
				type: 'warn',
				text: "`crossorigin` is **required** even for same-origin fonts. Font requests are always made in CORS mode; omit it and the browser downloads the file **twice** — once for the preload, once for the real request. Your preload then makes the page slower, which is a genuinely nasty bug to notice."
			},
			{
				type: 'note',
				text: 'Only preload what is critical. Preloading everything makes every resource high priority, which is the same as making none of them high priority.'
			},
			{
				type: 'p',
				text: '`data-sveltekit-preload-data="hover"` on `<body>` makes SvelteKit start loading a route\'s code and data when the pointer enters a link — roughly 200ms before the click lands. On touch devices it falls back to `touchstart`. Navigation then feels instant.'
			},
			{
				type: 'checkpoint',
				text: 'The site is dark, uses Montserrat and Sofia Sans, has a working header and footer, and `pnpm run build` prerenders your pages.'
			}
		]
	},

	/* ============================================================ 16 */
	{
		slug: '16-the-chart',
		title: 'A TradingView chart, wired up properly',
		summary:
			'Lightweight Charts v5 in a Svelte component — using {@attach}, a dynamic import, and deterministic data so hydration never disagrees with the server.',
		goal: 'A live-updating chart that costs nothing on first load and is accessible to screen readers.',
		blocks: [
			{ type: 'terminal', code: 'pnpm add lightweight-charts' },
			{ type: 'h3', id: 'deterministic', text: 'First: deterministic fake data' },
			{
				type: 'p',
				text: "The site has no live feed, so we generate plausible data. Two constraints shape how."
			},
			{
				type: 'warn',
				text: "**It must be deterministic.** `Math.random()` would produce different numbers on the server than on the client, so the server-rendered HTML would not match what hydration expects. Svelte warns, and in the worst case you get a visible flash as the DOM is patched. Same for `Date.now()`."
			},
			{
				type: 'code',
				file: 'src/lib/utils/market-data.ts',
				lang: 'ts',
				code: `/** Mulberry32 — a tiny, fast, seeded PRNG. Not cryptographic; not trying to be. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return function next(): number {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}`
			},
			{
				type: 'p',
				text: 'The second constraint: it must look like a market, not like noise. A uniform random walk is obviously fake. We add mean reversion and a small drift term:'
			},
			{
				type: 'code',
				file: 'src/lib/utils/market-data.ts',
				lang: 'ts',
				code: `		const shock = (random() - 0.5) * 1.6;      // the random tick
		const reversion = (anchor - value) * 0.045; // pull back toward the anchor
		const drift = 0.028;                        // gentle overall trend

		value = Math.max(1, value + shock + reversion + drift);`
			},
			{
				type: 'note',
				text: "Import `UTCTimestamp` from the chart library as a **type-only** import. It is a *branded* type — `number & { … }` — which exists so you cannot hand the library a millisecond timestamp where it wants seconds. That mix-up renders your chart in 1970 and is the most common Lightweight Charts bug. `import type` is erased at build time, so you get the safety without pulling 48kB into a utility module."
			},
			{ type: 'h3', id: 'attach', text: 'The component: {@attach}' },
			{
				type: 'p',
				text: 'An **attachment** is a function that runs when an element is added to the DOM and returns a cleanup function. It replaces both the old `onMount` + `bind:this` dance and `use:` actions.'
			},
			{
				type: 'code',
				file: 'src/lib/components/charts/FlowChart.svelte',
				lang: 'svelte',
				code: `<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { prefersReducedMotion } from 'svelte/motion';
	import { generateSeries, nextPoint, mulberry32, formatUsd } from '#lib/utils/market-data.ts';

	let { height = 300, symbol = 'SPY', live = true, seed = 20260814 } = $props();

	const initial = $derived(generateSeries({ seed }));

	let tick = $state<{ last: number; changeAbs: number; changePct: number } | null>(null);

	const last = $derived(tick?.last ?? initial.last);
	const changeAbs = $derived(tick?.changeAbs ?? initial.changeAbs);
	const isUp = $derived(changeAbs >= 0);

	/* A chart that animates forever is an accessibility problem — WCAG 2.2.2
	   requires moving content lasting over five seconds be pausable. Honouring
	   the OS setting satisfies that without a pause button nobody finds. */
	const shouldAnimate = $derived(live && !prefersReducedMotion.current);

	const chart: Attachment<HTMLDivElement> = (node) => {
		let disposed = false;
		let teardown: (() => void) | undefined;

		const data = initial;       // snapshot once — reading it in the timer
		const animate = shouldAnimate; // would make the effect re-run in a loop
		tick = null;

		void (async () => {
			const { createChart, AreaSeries, HistogramSeries, ColorType } =
				await import('lightweight-charts');

			if (disposed) return;

			const api = createChart(node, {
				autoSize: true,
				height,
				layout: { background: { type: ColorType.Solid, color: 'transparent' } }
				/* …more options… */
			});

			const priceSeries = api.addSeries(AreaSeries, { lineColor: '#4f7dff', lineWidth: 2 });
			priceSeries.setData(data.price.slice());
			api.timeScale().fitContent();

			let timer: ReturnType<typeof setInterval> | undefined;
			if (animate) { /* …append a bar every 1600ms… */ }

			teardown = () => {
				if (timer) clearInterval(timer);
				api.remove();   // disposes canvas, ResizeObserver and listeners
			};
		})();

		return () => {
			disposed = true;
			teardown?.();
		};
	};
</script>

<div class="chart__canvas" style="min-height: {height}px" aria-hidden="true" {@attach chart}></div>`
			},
			{ type: 'h3', id: 'three-things', text: 'Three things worth understanding' },
			{
				type: 'why',
				title: '1. Why the dynamic import',
				text: '`lightweight-charts` is ~48kB gzipped and touches the DOM, so it cannot run during server rendering. `await import(…)` inside the attachment does two jobs at once: it guarantees the code only executes in the browser, **and** it tells the bundler to split it into its own chunk. The initial page load — the thing Largest Contentful Paint measures — never downloads it.'
			},
			{
				type: 'why',
				title: '2. Why the `disposed` flag',
				text: 'There is an `await` between the attachment starting and the chart being created. If the component unmounts in that gap — a fast navigation — you would create a chart inside a detached node that nothing will ever clean up. The flag closes that window.'
			},
			{
				type: 'why',
				title: '3. Why a chart is not accessible on its own',
				text: 'It renders to `<canvas>`, which to a screen reader is a blank rectangle. Every number the chart conveys is therefore **also** available as real text — in the stat row beside it, and in a visually-hidden summary in the `<figcaption>`. If your chart is the only place some information exists, that information does not exist for a chunk of your users.'
			},
			{
				type: 'warn',
				text: 'v5 changed the series API. It is `chart.addSeries(AreaSeries, options)` now — the v4 style `chart.addAreaSeries(options)` was removed. Most tutorials you find are still v4, and this is the exact line that breaks.'
			},
			{
				type: 'note',
				text: "Also note `autoSize: true`, which uses a ResizeObserver internally. It correctly handles the container changing size without the window resizing — which a `window.onresize` handler misses entirely."
			},
			{
				type: 'checkpoint',
				text: 'A chart renders, ticks every 1.6 seconds, and stops ticking if you enable "reduce motion" in your OS settings. The chart chunk loads separately in the network tab.'
			}
		]
	},

	/* ============================================================ 17 */
	{
		slug: '17-marketing-components',
		title: 'Marketing components',
		summary:
			'Section headers, the feature grid, stat strips, CTA bands, an FAQ accordion with no JavaScript, and a pricing table.',
		goal: 'Everything the marketing pages need, built once and reused.',
		blocks: [
			{ type: 'h3', id: 'headings', text: 'SectionHeader: levels are structure, not size' },
			{
				type: 'code',
				file: 'src/lib/components/marketing/SectionHeader.svelte',
				lang: 'svelte',
				code: `interface Props {
	eyebrow?: string;
	title: string;
	lede?: string;
	/** Heading level — defaults to 2, correct for a section inside a page with one h1 */
	level?: 2 | 3;
	align?: 'start' | 'center';
	id?: string;
	children?: Snippet;
}`
			},
			{
				type: 'why',
				title: 'Why a level prop at all',
				text: 'Heading levels are a document outline, not font sizes. A screen reader user can pull up a list of headings and navigate by it, and jumping from `<h1>` to `<h3>` makes that outline read as though content is missing. So: visual size comes from CSS, and the level comes from where the section genuinely sits in the hierarchy. They are separate decisions.'
			},
			{ type: 'h3', id: 'grid', text: 'FeatureGrid, and a Safari quirk' },
			{
				type: 'code',
				file: 'src/lib/components/marketing/FeatureGrid.svelte',
				lang: 'svelte',
				code: `<ul class="feature-grid auto-grid" role="list">
	{#each items as feature (feature.id)}
		{@const Icon = featureIcons[feature.icon]}
		<li class="feature-grid__item">
			<Card as="article">
				<span class="feature-grid__icon" aria-hidden="true">
					<Icon size={26} weight="duotone" />
				</span>
				<svelte:element this={\`h\${level}\`} class="feature-grid__title" id={feature.id}>
					{feature.title}
				</svelte:element>
				<p>{feature.summary}</p>
			</Card>
		</li>
	{/each}
</ul>`
			},
			{
				type: 'warn',
				text: '`role="list"` on a `<ul>` looks redundant — it is not. Safari\'s VoiceOver **removes list semantics** from any `<ul>` whose `list-style` is `none`. That is deliberate WebKit behaviour. Re-declaring the role restores the "list of 6 items" announcement that tells a user how much is ahead of them.'
			},
			{
				type: 'note',
				text: 'The `{#each … (feature.id)}` bit is a **keyed** each block. Always key your loops with a stable unique id — it lets Svelte surgically move DOM nodes instead of rebuilding them, and it prevents state attaching to the wrong item. Never use the array index as a key.'
			},
			{ type: 'h3', id: 'stats', text: 'StatStrip: a description list' },
			{
				type: 'code',
				file: 'src/lib/components/marketing/StatStrip.svelte',
				lang: 'svelte',
				code: `<dl class="stats">
	{#each stats as stat (stat.label)}
		<div class="stats__item">
			<dt class="stats__label">{stat.label}</dt>
			<dd class="stats__value tabular">{stat.value}</dd>
		</div>
	{/each}
</dl>`
			},
			{
				type: 'p',
				text: 'A number and its label are genuinely a term/definition pair. Marking them up as a `<dl>` means a screen reader announces "median latency, 240 milliseconds" rather than two orphaned strings that happen to sit near each other.'
			},
			{
				type: 'code',
				lang: 'css',
				file: 'the ordering trick',
				code: `/* The label sits ABOVE the number visually, but <dt> must precede <dd>
   in the DOM. \`order\` does the visual swap without breaking the pairing. */
.stats__label { order: 2; }
.stats__value { order: 1; }`
			},
			{ type: 'h3', id: 'faq', text: 'An accordion with zero JavaScript' },
			{
				type: 'code',
				file: 'src/lib/components/marketing/FaqAccordion.svelte',
				lang: 'svelte',
				code: `{#each items as item (item.id)}
	<details class="faq__item" name={group} id={item.id}>
		<summary class="faq__summary">
			<span class="faq__question">{item.question}</span>
			<span class="faq__marker" aria-hidden="true">
				<CaretDownIcon size={18} weight="bold" />
			</span>
		</summary>
		<div class="faq__answer"><p>{item.answer}</p></div>
	</details>
{/each}`
			},
			{
				type: 'why',
				title: 'Why native <details> beats every hand-rolled accordion',
				text: 'You get keyboard operation, the correct role and expanded state announced, working-before-hydration, and — the killer feature — **Ctrl+F "find in page" auto-expands a closed section to reveal a match**. A div-based accordion hides its content from browser search, so a user searching your FAQ finds nothing. They do not report that as a bug. They just leave.'
			},
			{
				type: 'note',
				text: 'The `name` attribute makes the group exclusive — opening one closes the others. That used to require JavaScript and is now a one-word HTML attribute.'
			},
			{
				type: 'code',
				lang: 'css',
				file: 'removing the default triangle',
				code: `.faq__summary {
	list-style: none;                      /* Firefox */
	cursor: pointer;
	min-height: 3.25rem;
}
.faq__summary::-webkit-details-marker { display: none; }  /* older Safari */`
			},
			{ type: 'h3', id: 'pricing', text: 'PricingTable: a real radiogroup' },
			{
				type: 'code',
				file: 'src/lib/components/marketing/PricingTable.svelte',
				lang: 'svelte',
				code: `<div class="pricing__toggle" role="radiogroup" aria-label="Billing period">
	<button
		type="button"
		role="radio"
		aria-checked={billing === 'monthly'}
		class:is-active={billing === 'monthly'}
		onclick={() => (billing = 'monthly')}
	>Monthly</button>

	<button
		type="button"
		role="radio"
		aria-checked={billing === 'annual'}
		class:is-active={billing === 'annual'}
		onclick={() => (billing = 'annual')}
	>Annual <span class="pricing__saving">save {bestSaving}%</span></button>
</div>`
			},
			{
				type: 'p',
				text: '`role="radiogroup"` plus `role="radio"` gives assistive tech the right mental model — "one of two options", rather than "two unrelated buttons".'
			},
			{
				type: 'note',
				text: 'For excluded features we render them struck through and greyed. A screen reader cannot see grey, so we add a visually-hidden "Not included: " prefix. Colour and styling are never the only carrier of meaning.'
			},
			{
				type: 'checkpoint',
				text: 'All six marketing components compile. Open the FAQ in a browser, close every item, then Ctrl+F for a word inside one — it should expand.'
			}
		]
	}
];
