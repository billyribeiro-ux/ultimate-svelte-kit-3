<!--
	SEO
	===

	One component that owns everything inside <head> that a search engine or social
	crawler reads. Every page renders exactly one of these.

	Why centralise it? Because the failure mode of ad-hoc <svelte:head> blocks is
	silent. A page that forgets its canonical tag doesn't break — it just quietly
	competes with itself for a ranking. A page with a duplicated <title> renders
	fine and confuses the crawler. Making this a component with *required* props
	means TypeScript refuses to let you ship a page without a title and description.

	HOW SVELTE:HEAD WORKS
	---------------------
	Anything inside <svelte:head> is lifted out of the component and injected into
	the document head, wherever the component happens to sit in the tree. During
	SSR it lands in the HTML string before it's sent — which is what matters here,
	because crawlers read the raw HTML response. Tags added later by client-side
	JavaScript are much less reliably picked up.
-->

<script lang="ts">
	import { page } from '$app/state';
	import { site, absoluteUrl } from '#lib/data/site.ts';
	import {
		buildGraph,
		serializeJsonLd,
		organizationSchema,
		websiteSchema,
		webPageSchema,
		type SchemaNode
	} from './schema.ts';

	interface ArticleMeta {
		/** ISO date string. */
		readonly published: string;
		readonly modified?: string;
		readonly authorName: string;
		readonly tags?: readonly string[];
	}

	interface Props {
		/** Page title WITHOUT the brand suffix — this component adds it. */
		title: string;
		/** ~155 characters. Longer gets truncated in the results page. */
		description: string;
		/**
		 * Root-relative canonical path. Defaults to the current pathname, which is
		 * correct for virtually every page. Override it only when two routes
		 * legitimately serve the same content.
		 */
		canonicalPath?: string;
		type?: 'website' | 'article';
		/** Root-relative or absolute social share image. */
		image?: string;
		imageAlt?: string;
		/** Keep a page out of the index. Use for thank-you and gated pages. */
		noindex?: boolean;
		/** Extra JSON-LD nodes. Organization, WebSite and WebPage are added for you. */
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

	/**
	 * The canonical URL.
	 *
	 * We deliberately use `pathname` only, dropping any query string. A marketing
	 * page reached via `?utm_source=newsletter` is the same page as the bare URL,
	 * and telling Google otherwise splits its ranking signals across two addresses.
	 */
	const canonical = $derived(absoluteUrl(canonicalPath ?? page.url.pathname));

	/**
	 * Title composition.
	 *
	 * The home page uses its title verbatim; every other page gets " | StrikeFlow"
	 * appended. Suffixing the home page too would produce "StrikeFlow | StrikeFlow".
	 * Aim to keep the whole thing under ~60 characters — beyond that Google
	 * truncates, and a title cut mid-word looks broken in the results.
	 */
	const fullTitle = $derived(title === site.name ? title : `${title} | ${site.titleSuffix}`);

	const ogImageUrl = $derived(absoluteUrl(image));

	/**
	 * The robots directive.
	 *
	 * `index, follow` is the default anyway, but stating it explicitly means the
	 * intent is visible in the HTML rather than implied by absence. The three `max-`
	 * directives opt into the richest presentation Google offers:
	 *
	 *   max-image-preview:large  — allows a large thumbnail. This is the one that
	 *                              matters; it's a prerequisite for Google Discover.
	 *   max-snippet:-1           — no limit on description length.
	 *   max-video-preview:-1     — no limit on video preview length.
	 *
	 * Without these, Google applies conservative defaults and your result looks
	 * smaller than a competitor's on the same page.
	 */
	const robots = $derived(
		noindex
			? 'noindex, nofollow'
			: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
	);

	/**
	 * The structured-data graph.
	 *
	 * Organization and WebSite appear on every page — that repetition is intentional
	 * and correct. Because each carries a stable `@id`, a search engine treats them
	 * as repeated references to one entity, not as many entities.
	 */
	const jsonLdScript = $derived(
		// Assembled by concatenation, so the closing-tag text is never written
		// literally anywhere in this file — not even inside a comment. An HTML
		// tokeniser scans for that character sequence without understanding
		// JavaScript, so a literal occurrence would end this component's own script
		// block early. It is a genuine parsing hazard, not a style preference.
		'<script type="application/ld+json">' +
			serializeJsonLd(
				buildGraph([
					organizationSchema(),
					websiteSchema(),
					webPageSchema({
						url: canonical,
						name: fullTitle,
						description,
						datePublished: article?.published,
						dateModified: article?.modified ?? article?.published
					}),
					...schema
				])
			) +
			'</' +
			'script>'
	);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta name="robots" content={robots} />

	<!-- Open Graph: read by LinkedIn, Facebook, Slack, Discord, iMessage and others. -->
	<meta property="og:type" content={type} />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:site_name" content={site.name} />
	<meta property="og:locale" content={site.locale} />
	<meta property="og:image" content={ogImageUrl} />
	<meta property="og:image:width" content={String(site.ogImageWidth)} />
	<meta property="og:image:height" content={String(site.ogImageHeight)} />
	<!-- Alt text on a share image is an accessibility requirement, not decoration. -->
	<meta property="og:image:alt" content={imageAlt ?? `${site.name} — ${site.tagline}`} />

	<!--
		Article-specific Open Graph. Only emitted for articles, because claiming a
		publish date on a pricing page is noise at best and misleading at worst.
	-->
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

	<!-- X / Twitter cards. `summary_large_image` is the full-width variant. -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImageUrl} />
	<meta name="twitter:image:alt" content={imageAlt ?? `${site.name} — ${site.tagline}`} />
	<meta name="twitter:site" content="@strikeflow" />

	<!-- Colours the browser chrome on mobile. Small touch, feels native. -->
	<meta name="theme-color" content="#05070c" />

	<!--
		THE STRUCTURED-DATA GRAPH.

		{@html} is genuinely required here. Svelte escapes interpolated text by
		default, which would turn our JSON into HTML entities that no parser can read.

		It is safe in this one specific case because the string is assembled entirely
		from our own constants and passed through serializeJsonLd(), which escapes
		<, > and & so that no value in the data can terminate the tag early. No user
		input reaches it. That is why the lint rule is suppressed on the next line
		rather than disabled project-wide: this is the only place it is warranted.
	-->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdScript}
</svelte:head>
