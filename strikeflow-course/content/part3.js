/**
 * Chapters 24–30 and 35–37: pages, lead capture, content, tests, and shipping.
 * (Global numbering — the motion chapters, 31–34 in part 4, slot in between the
 * building chapters and the testing chapters; see content/index.js.)
 */

export const part3 = [
	/* ============================================================ 24 */
	{
		slug: 'the-home-page',
		title: 'The home page',
		summary:
			'Assembling the components into a page — and writing a headline that works for both humans and search engines.',
		goal: 'A complete, responsive home page with correct SEO and structured data.',
		blocks: [
			{
				type: 'code',
				file: 'src/routes/+page.svelte',
				lang: 'svelte',
				code: `<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRightIcon,
		LightningIcon,
		ShieldCheckIcon,
		DatabaseIcon,
		BroadcastIcon,
		StrategyIcon
	} from 'phosphor-svelte';

	import Seo from '#lib/seo/Seo.svelte';
	import { softwareApplicationSchema } from '#lib/seo/schema.ts';
	import { site } from '#lib/data/site.ts';

	import Button from '#lib/components/ui/Button.svelte';
	import Badge from '#lib/components/ui/Badge.svelte';
	import FlowChart from '#lib/components/charts/FlowChart.svelte';
	import SectionHeader from '#lib/components/marketing/SectionHeader.svelte';
	import FeatureGrid from '#lib/components/marketing/FeatureGrid.svelte';
	import StatStrip from '#lib/components/marketing/StatStrip.svelte';
	import CtaBand from '#lib/components/marketing/CtaBand.svelte';
	import { heroSequence, parallax, reveal, revealGroup } from '#lib/motion/index.ts';

	const stats = [
		{ value: '<250ms', label: 'Tape to screen', note: 'Median, Pro and Desk plans' },
		{ value: '16', label: 'Exchanges consolidated', note: 'Full OPRA feed' },
		{ value: '1.4M', label: 'Prints per session', note: 'Peak, classified in real time' },
		{ value: '7 yrs', label: 'Tick history', note: 'Back to January 2019' }
	];

	const steps = [
		{
			icon: DatabaseIcon,
			title: 'We take the whole tape',
			body: 'Direct OPRA ingest across all sixteen US options exchanges, plus FINRA dark pool reporting. No aggregator in the middle adding seconds and dropping fields.'
		},
		{
			icon: StrategyIcon,
			title: 'We work out what it means',
			body: 'Every print is matched against the quote at execution to find the aggressor, stitched back together with its other legs, and scored against that contract’s own ninety-day baseline.'
		},
		{
			icon: BroadcastIcon,
			title: 'You see intent, not noise',
			body: 'What reaches your screen is a classified, deduplicated stream you can filter and set rules on — rather than a wall of prints you have to interpret yourself.'
		}
	];
</script>

<Seo
	title="Real-time options flow, decoded"
	description={site.description}
	schema={[softwareApplicationSchema()]}
/>`
			},
			{ type: 'h3', id: 'hero', text: 'The hero' },
			{
				type: 'code',
				file: 'src/routes/+page.svelte',
				lang: 'svelte',
				code: `<section class="hero" {@attach heroSequence()}>
	<!-- … -->
	<div class="hero__glow" aria-hidden="true" {@attach parallax(0.12)}></div>

	<div class="container container--wide">
		<div class="hero__grid">
			<div class="hero__copy">
				<span data-hero="badge">
					<Badge tone="brand">Live options flow</Badge>
				</span>

				<!-- … -->
				<h1 class="hero__title" data-hero="headline">
					Read institutional options flow as it prints
				</h1>

				<p class="hero__lede" data-hero="lede">
					StrikeFlow streams the entire US options tape — sweeps, blocks, dark pool prints and
					dealer gamma — in under 250 milliseconds. Stop reconstructing what happened an hour ago.
				</p>

				<div class="hero__actions" data-hero="actions">
					<Button href={resolve('/guide')} size="lg" pull>
						Get the free guide
						{#snippet iconTrailing()}<ArrowRightIcon />{/snippet}
					</Button>
					<Button href={resolve('/features')} variant="secondary" size="lg">
						See how it works
					</Button>
				</div>

				<ul class="hero__assurances" role="list" data-hero="assurances">
					<li>
						<LightningIcon size={16} weight="fill" aria-hidden="true" />
						<span>7-day free trial</span>
					</li>
					<li>
						<ShieldCheckIcon size={16} weight="fill" aria-hidden="true" />
						<span>Never connects to your broker</span>
					</li>
				</ul>
			</div>

			<div class="hero__chart" data-hero="panel">
				<FlowChart height={320} symbol="SPY" />
			</div>
		</div>

		<div class="hero__stats" data-reveal {@attach reveal({ delay: 0.1 })}>
			<StatStrip {stats} animated />
		</div>
	</div>
</section>`
			},
			{
				type: 'note',
				text: 'The `#lib/motion/index.ts` import at the top of the script, the `{@attach heroSequence()}`, `{@attach parallax(0.12)}` and `{@attach reveal(…)}` attributes, the `data-hero`/`data-reveal` markers, the `pull` prop on the primary button and the `animated` flag on `StatStrip` are all hooks for the motion system — we build every piece of it in part 4 (chapters 31–34). They are shown here so the code matches the finished project; until you build that folder, leave the import and every one of those hooks out — everything else on this page works without them. (The import also brings in `revealGroup`, which the sections further down the real file attach in the same way; leave those attachments out too.)'
			},
			{
				type: 'why',
				title: 'About that headline',
				text: '"Read institutional options flow as it prints" states what the product does, in the language a buyer would use. It tells both a human and a search engine what this page is about. Something like "Trade smarter" tells neither — and the `<h1>` is the single strongest on-page signal of a page\'s subject.'
			},
			{
				type: 'note',
				text: 'The `{#snippet iconTrailing()}…{/snippet}` block inside `<Button>` is how you pass markup to a component in Svelte 5. It matches the `iconTrailing?: Snippet` prop we declared in chapter 19.'
			},
			{ type: 'h3', id: 'hero-css', text: 'Mobile-first hero layout' },
			{
				type: 'code',
				file: 'src/routes/+page.svelte',
				lang: 'css',
				code: `.hero {
	position: relative;
	/* Extra top padding clears the sticky header, which overlaps the page. */
	padding-block: calc(var(--header-height) + var(--space-8)) var(--section-y);
	background-color: var(--bg-root);
	/* The glow layer is taller than the hero and moves; without this it would
	   paint over the section below as it parallaxes. */
	overflow: hidden;
}

/*
 * The glow lives on its own element so it can be transformed independently.
 * Animating a \`background\` gradient is a paint operation on every frame;
 * animating a positioned element is a compositor operation. Same visual, an
 * order of magnitude cheaper.
 */
.hero__glow {
	position: absolute;
	inset-block-start: -20%;
	inset-inline: 0;
	/* Taller than its container, so parallax never exposes an edge. */
	height: 140%;
	pointer-events: none;
	z-index: 0;
	background: radial-gradient(
		80% 60% at 50% 10%,
		color-mix(in srgb, var(--brand-500) 16%, transparent),
		transparent 70%
	);
}

/* … */

.hero__grid {
	display: flex;
	flex-direction: column;
	gap: var(--space-10);
}

/* … */

.hero__actions {
	display: flex;
	flex-direction: column;
	gap: var(--space-3);
	width: 100%;
}

/* … */

/* From 30em there's room for side-by-side buttons. Below that they stack
   full-width, which is both easier to tap and the conventional mobile pattern. */
@media (min-width: 30em) {
	.hero__actions {
		flex-direction: row;
		flex-wrap: wrap;
		width: auto;
	}
}

@media (min-width: 64em) {
	.hero__grid {
		flex-direction: row;
		align-items: center;
		gap: var(--space-16);
	}

	.hero__copy {
		flex: 1 1 46%;
	}

	.hero__chart {
		flex: 1 1 54%;
		min-width: 0; /* lets the chart shrink inside flex instead of overflowing */
	}
}`
			},
			{
				type: 'warn',
				text: '`min-width: 0` on the chart column is not optional. Flex items default to `min-width: auto`, which means they refuse to shrink below their content size. A chart canvas will happily blow out of its column without it. This is the single most common flexbox overflow bug.'
			},
			{
				type: 'note',
				text: 'Notice the background gradient is CSS, not an image. A hero background image is often the Largest Contentful Paint element — and a gradient renders instantly with no network request at all.'
			},
			{
				type: 'checkpoint',
				text: 'The home page renders on desktop and on a 375px-wide phone viewport with no horizontal scrolling. View source and confirm the `<h1>`, `<title>`, canonical and JSON-LD are all present.'
			}
		]
	},

	/* ============================================================ 25 */
	{
		slug: 'the-other-pages',
		title: 'Features, pricing, about and contact',
		summary:
			'Four more pages, built from the same components — plus the section that makes a financial site trustworthy.',
		goal: 'The marketing site is content-complete.',
		blocks: [
			{
				type: 'p',
				text: "These pages reuse everything we've built, so rather than reproduce them line by line I'll show the parts that are new or that make a specific point."
			},
			{ type: 'h3', id: 'breadcrumbs', text: 'Breadcrumbs on every inner page' },
			{
				type: 'code',
				lang: 'svelte',
				file: 'src/routes/features/+page.svelte',
				code: `<Seo
	title="Features — the full options tape, classified in real time"
	description="Live flow scanning, unusual activity baselines, dealer gamma exposure, dark pool prints, a real alerts engine and full tick replay. Here is exactly what StrikeFlow does."
	schema={[
		softwareApplicationSchema(),
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Features', path: '/features' }
		])
	]}
/>`
			},
			{
				type: 'note',
				text: 'Google renders a breadcrumb as the little path above a search result instead of a raw URL, which measurably improves click-through. It also tells the crawler how your site is organised hierarchically.'
			},
			{ type: 'h3', id: 'hidden-h1', text: 'A visually hidden h1' },
			{
				type: 'code',
				lang: 'svelte',
				file: 'src/routes/features/+page.svelte',
				code: `<h1 class="visually-hidden">StrikeFlow features</h1>`
			},
			{
				type: 'p',
				text: 'On the features page the visual weight is carried by a `SectionHeader`, but the page still needs exactly one `<h1>` for the document outline. Hiding it visually is fine; omitting it is not.'
			},
			{ type: 'h3', id: 'limits', text: 'The section that builds trust' },
			{
				type: 'p',
				text: 'The features page ends with a heading that says **"What this data cannot tell you"**, listing three genuine limitations of the product.'
			},
			{
				type: 'why',
				title: 'Why put weaknesses on a sales page',
				text: 'Google classifies financial content as **YMYL** — "Your Money or Your Life" — and holds it to a higher trust bar. Its quality rater guidelines explicitly reward accuracy and transparency on those topics. Beyond the algorithm: buyers in this market have been burned by tools that overclaim, and being the one that says "here is where our data stops" is genuinely persuasive. Honesty happens to be a conversion tactic.'
			},
			{
				type: 'code',
				lang: 'ts',
				file: 'src/routes/features/+page.svelte',
				code: `const limitations = [
	'We infer dealer positioning from public volume and open interest. Nobody can observe it directly, so treat every gamma figure as a well-informed estimate.',
	'The consolidated tape does not report whether a trade opened or closed a position. Our opening-position detection is probabilistic, and we show you the confidence.',
	'Starter plan data is delayed fifteen minutes. That is the standard non-professional market data entitlement, not a limitation we invented.'
];`
			},
			{ type: 'h3', id: 'about', text: 'The about page, and why it is an SEO page' },
			{
				type: 'p',
				text: "The About page is not filler. For YMYL topics, quality raters are told to check specifically **who** produced the content and whether they have real credentials for it. A trading site with no named humans on it is exactly the pattern raters are trained to mark down."
			},
			{
				type: 'ul',
				items: [
					'A named author on every article — not "Admin", not the company name',
					'A real biography stating relevant experience',
					'A stable author page each article links to',
					'`sameAs` links to external profiles, so the person is verifiable off-site'
				]
			},
			{
				type: 'code',
				lang: 'svelte',
				file: 'src/routes/about/+page.svelte',
				code: `<Seo
	title="About — the team behind StrikeFlow"
	description="StrikeFlow was founded in 2021 by a derivatives trader and a market data engineer. Here is who builds it, what we believe about market data, and what we refuse to do."
	schema={[
		...team.map(personSchema),
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'About', path: '/about' }
		])
	]}
/>`
			},
			{
				type: 'p',
				text: 'Each team member gets an `id` on their card, so `/about#priya-raman` is a real anchor — which is exactly what the `Person` schema `@id` points at, and what blog bylines link to.'
			},
			{
				type: 'note',
				text: 'We use initials in coloured circles rather than photographs. Four headshots is four image requests and four chances of layout shift, for decoration. If you do use photos, set explicit `width` and `height` attributes so the browser reserves the space before the image lands.'
			},
			{ type: 'h3', id: 'contact', text: 'Contact' },
			{
				type: 'p',
				text: 'No form — the only thing we want to capture is a guide signup, and a second form competes with it. Just contact methods, using the right elements:'
			},
			{
				type: 'code',
				lang: 'svelte',
				file: 'src/routes/contact/+page.svelte',
				code: `{#if channel.href}
	<!--
		\`mailto:\` and \`tel:\` are scheme URLs, not routes, so there is nothing
		for \`resolve()\` to do. The lint rule accepts such hrefs when it can
		read the literal, but not through an \`{#each}\` variable — hence the
		targeted disable rather than a \`rel="external"\` that would be wrong
		for an email address.
	-->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a class="channels__link" href={channel.href}>{channel.linkLabel}</a>
{:else}
	<!-- \`<address>\` is the correct element for contact details of its
	     nearest article or the document as a whole. -->
	<address class="channels__address">{channel.linkLabel}</address>
{/if}`
			},
			{
				type: 'note',
				text: 'The `eslint-disable` line is not decoration. `eslint-plugin-svelte` 3.23 makes `svelte/no-navigation-without-resolve` an **error** in its `recommended` config: every `href` must come from `resolve()`, be a literal the rule can see is not a route (`mailto:`, `https://…`), or carry `rel="external"` — which is what the footer and the team profile links do. Here the value hides behind an `{#each}` variable, so the rule cannot read it, and `rel="external"` would be a lie on an email address. So we switch the rule off for this one line and write down why. Type the anchor without it and `pnpm run lint` fails on this file.'
			},
			{
				type: 'note',
				text: '`<address>` is the correct element for the contact details of its nearest article or the document as a whole. It is not for postal addresses generally — a shipping address in a table is not an `<address>`. Browsers italicise it by default, which we reset.'
			},
			{
				type: 'checkpoint',
				text: 'All five marketing pages render, each with one `<h1>`, a canonical tag and a breadcrumb where appropriate.'
			}
		]
	},

	/* ============================================================ 26 */
	{
		slug: 'lead-capture-server',
		title: 'Lead capture: the server side',
		summary:
			'Storage behind an interface, HMAC-signed expiring tokens, and rate limiting — the three pieces before we touch the form.',
		goal: 'A secure, swappable back end for the email capture flow.',
		blocks: [
			{
				type: 'p',
				text: "Everything in this chapter lives in `src/lib/server/`. SvelteKit refuses to bundle anything in that directory into client code — if you accidentally import it into a component, **the build fails** rather than shipping your signing key to the browser. That is a hard framework guarantee, not a convention."
			},
			{ type: 'h3', id: 'store', text: 'Storage behind an interface' },
			{
				type: 'code',
				file: 'src/lib/server/leads.ts',
				lang: 'ts',
				code: `/** A captured lead. */
export interface Lead {
	readonly email: string;
	/** Self-reported experience, used for list segmentation. */
	readonly experience: ExperienceLevel;
	readonly consentedToMarketing: boolean;
	/** ISO 8601 timestamp of capture. */
	readonly capturedAt: string;
	/** Which page or campaign produced the signup. */
	readonly source: string;
}

export type ExperienceLevel = 'new' | 'some' | 'experienced' | 'professional';
// …
export interface LeadStore {
	/** Persist a lead. Must be idempotent-safe: the same email may arrive twice. */
	save(lead: Lead): Promise<void>;
	/** Has this address already signed up? Used to avoid duplicate welcome emails. */
	has(email: string): Promise<boolean>;
}

// …
export const leadStore: LeadStore = new FileLeadStore();`
			},
			{
				type: 'why',
				title: 'Why an interface when there is only one implementation?',
				text: 'Because there will not be for long. A real deployment sends these to Mailchimp, ConvertKit, HubSpot or a Postgres table. When that day comes you write a second implementation and change **one line** — you do not go hunting through form handlers for `fs.appendFile` calls. That is the difference between a two-hour change and a two-day one, and it costs about fifteen lines today.'
			},
			{
				type: 'p',
				text: 'The second `// …` in that listing stands for the default implementation — a small `FileLeadStore` class, the path it writes to, and the `normaliseEmail()` helper it uses (the first is a doc comment). It appends newline-delimited JSON to a file. Zero dependencies, zero infrastructure, and you can read the output with `cat`.'
			},
			{
				type: 'note',
				text: 'JSONL beats a single JSON array here for one specific reason: appending is a pure append. A JSON array would require reading the whole file, parsing it, pushing and rewriting — O(n) per signup, and you lose everything if the process dies mid-write.'
			},
			{
				type: 'warn',
				text: "Do **not** strip Gmail-style dots or `+tags` when normalising an email. `a+news@gmail.com` is a legitimate address someone chose in order to filter your mail. Silently rewriting it is both rude and, under GDPR, arguably processing you did not disclose. Lowercase and trim; nothing more."
			},
			{ type: 'h3', id: 'tokens', text: 'Signed download tokens' },
			{
				type: 'p',
				text: 'The ebook is gated behind an email address. That gate is worthless if the download URL is guessable or shareable forever, so we issue a signed, expiring token.'
			},
			{
				type: 'why',
				title: 'How an HMAC works, in one paragraph',
				text: 'We take the data we want to protect and hash it together with a secret only the server knows. The result is a signature. Anyone can **read** the data — it is not encrypted — but nobody can produce a valid signature for **modified** data without the secret. So a user can see their token expires at 3pm, and cannot change it to next year.'
			},
			{
				type: 'code',
				file: 'src/lib/server/tokens.ts',
				lang: 'ts',
				code: `import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import * as v from 'valibot';
import { EBOOK_TOKEN_SECRET } from '$app/env/private';

// …
const secret: string = EBOOK_TOKEN_SECRET ?? randomBytes(32).toString('hex');

if (!EBOOK_TOKEN_SECRET) {
	console.warn(
		'[tokens] EBOOK_TOKEN_SECRET is not set — using an ephemeral key.\\n' +
			'         Download links will stop working when the server restarts.\\n' +
			'         Set it in .env before deploying. See .env.example.'
	);
}

/** How long a download link stays valid. Long enough to be useful; short enough to matter. */
const TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

/**
 * What a token carries, as a schema rather than a bare interface — because on the
 * way back in, the payload is parsed from a string and has to be CHECKED, not
 * assumed. The type is inferred from the schema, so the two cannot drift.
 */
const TokenPayloadSchema = v.object({
	/** Who it was issued to. Lets us attribute a download without a database lookup. */
	email: v.string(),
	/** Expiry, as epoch milliseconds. */
	exp: v.number()
});

type TokenPayload = v.InferOutput<typeof TokenPayloadSchema>;

// …
function encode(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
	return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Issue a token for an email address. */
export function createDownloadToken(email: string): string {
	const payload: TokenPayload = {
		email,
		exp: Date.now() + TTL_MS
	};

	const encoded = encode(JSON.stringify(payload));
	return \`\${encoded}.\${sign(encoded)}\`;
}`
			},
			{
				type: 'p',
				text: 'If `EBOOK_TOKEN_SECRET` is unset, the module makes up a random key when the server starts and says so in the console. The project runs with zero setup, at the cost of every outstanding link dying on restart — a deliberately visible symptom, so it gets fixed before deploy rather than running on a default key in production.'
			},
			{
				type: 'note',
				text: '`base64url` is the URL-safe variant of base64: it swaps `+`, `/` and `=` for `-`, `_` and nothing. Standard base64 in a query string needs escaping, and breaks when copied out of an email client.'
			},
			{ type: 'h3', id: 'verify', text: 'Verifying — and the line that matters most' },
			{
				type: 'code',
				file: 'src/lib/server/tokens.ts',
				lang: 'ts',
				code: `export function verifyDownloadToken(token: string | null): TokenResult {
	if (!token) return { valid: false, reason: 'malformed' };

	const parts = token.split('.');
	if (parts.length !== 2) return { valid: false, reason: 'malformed' };

	const [encoded, signature] = parts;
	if (!encoded || !signature) return { valid: false, reason: 'malformed' };

	const expected = sign(encoded);


	// …
	const expectedBuffer = Buffer.from(expected);
	const providedBuffer = Buffer.from(signature);

	if (expectedBuffer.length !== providedBuffer.length) {
		return { valid: false, reason: 'bad-signature' };
	}

	if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
		return { valid: false, reason: 'bad-signature' };
	}

	// Only now, with the signature proven, do we trust the payload's contents — and
	// even then we check its shape rather than assert it. \`JSON.parse\` returns \`any\`,
	// and \`as TokenPayload\` would wave a wrong shape (a token from an older format,
	// say) straight through to the code below.
	let json: unknown;
	try {
		json = JSON.parse(decode(encoded));
	} catch {
		return { valid: false, reason: 'malformed' };
	}

	const parsed = v.safeParse(TokenPayloadSchema, json);
	if (!parsed.success) return { valid: false, reason: 'malformed' };
	const payload = parsed.output;

	if (Date.now() > payload.exp) {
		return { valid: false, reason: 'expired' };
	}

	return { valid: true, email: payload.email };
}`
			},
			{
				type: 'warn',
				text: '**`timingSafeEqual`, not `===`.** A normal string comparison returns as soon as it finds a differing character. That means comparing `"aaaa"` takes fractionally longer than `"zaaa"` when the real signature starts with `"a"` — and an attacker who can measure that difference can recover the signature one character at a time. It is called a timing attack and it is practical over a local network. `timingSafeEqual` always compares the full length. It needs two buffers of equal length, so we check the lengths first — safe to short-circuit, because the length of a signature is not a secret. (The `// …` in the listing is the comment in the real file that says all of this.)'
			},
			{
				type: 'note',
				text: 'The function returns a **discriminated union** rather than throwing. That forces the caller to handle failure, and lets them tell "expired" (offer a re-send) apart from "bad signature" (someone is poking at it).'
			},
			{
				type: 'why',
				title: 'Why the payload is checked with a schema, not a cast',
				text: "`JSON.parse` returns `any`, and the tempting next line is `JSON.parse(…) as TokenPayload`. A cast checks nothing: it tells the compiler to believe you, so if the shape were ever wrong, the code below would read `payload.exp` as `undefined` and compare dates with it, and nothing would complain. A valid signature only proves *our server* wrote the payload — and \"our server\" includes last year's version of it, with last year's payload format. So the payload's shape is a valibot schema, `TokenPayloadSchema`, and `v.safeParse` checks the parsed value against it; anything that does not fit is `malformed`. The `TokenPayload` type is inferred from the schema with `v.InferOutput`, so the type and the check can never drift apart. It is the same valibot that validates the signup form, used for the same reason: data from outside the type system gets checked at the border."
			},
			{ type: 'h3', id: 'ratelimit', text: 'Rate limiting' },
			{
				type: 'p',
				text: 'A public form with no rate limit is an open invitation. Within a week of going live you will have thousands of junk signups, and if the form ever triggers an email you are now a spam relay with your domain reputation attached.'
			},
			{
				type: 'code',
				file: 'src/lib/server/rate-limit.ts',
				lang: 'ts',
				code: `interface Bucket {
	count: number;
	/** Epoch ms when this window ends. */
	resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Reclaim memory from expired buckets.
 *
 * Without this the Map grows forever — one entry per unique IP, never removed. On a
 * long-running server that is a slow memory leak, and "slow memory leak" is how you
 * get paged at 4am six months from now.
 */
function sweep(now: number): void {
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

// …
export function rateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
	const { limit = 5, windowMs = 60_000 } = options;
	const now = Date.now();

	// Cheap probabilistic cleanup: sweep on roughly 1 in 50 calls rather than
	// running a timer. Avoids keeping a \`setInterval\` alive for the process lifetime.
	if (Math.random() < 0.02) sweep(now);

	const existing = buckets.get(key);

	if (!existing || existing.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
	}

	existing.count += 1;

	const allowed = existing.count <= limit;
	return {
		allowed,
		remaining: Math.max(0, limit - existing.count),
		retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000)
	};
}`
			},
			{
				type: 'warn',
				text: '**Be honest about what this is.** The state lives in one process\'s memory. It resets on deploy, it does not work across multiple instances (four containers behind a load balancer gives an attacker 4× the limit), and it does nothing against a distributed attack. For a single-instance marketing site it is genuinely adequate. The moment you scale horizontally, move it to Redis — `INCR` plus `EXPIRE` is the same algorithm — or use your CDN\'s rate limiting, which sees the traffic before it reaches you and is the better answer anyway.'
			},
			{
				type: 'note',
				text: 'The `sweep()` function is not optional. Without it the Map grows forever, one entry per unique IP, never removed. On a long-running server that is a slow memory leak — and a slow memory leak is how you get paged at 4am six months from now.'
			},
			{
				type: 'note',
				text: "The key is only as good as the address in it. In the next chapter the form keys on `event.getClientAddress()`, which is the address of whatever connected to the server — and behind a hosting platform's proxy, that is the proxy, for every visitor alike. Chapter 37 shows the two environment variables that fix it before you deploy."
			},
			{
				type: 'checkpoint',
				text: 'Three files in `src/lib/server/`. `pnpm run check` passes. We test all of this properly in chapter 35.'
			}
		]
	},

	/* ============================================================ 27 */
	{
		slug: 'the-remote-form',
		title: 'The remote form',
		summary:
			"SvelteKit 3's `form()` — a server function you import into a component, that works with JavaScript disabled.",
		goal: 'A typed, validated, progressively-enhanced signup with no hand-written API endpoint.',
		blocks: [
			{
				type: 'p',
				text: "This is the flagship SvelteKit 3 feature. A **remote function** runs only on the server, but you import it into a component as if it were local. SvelteKit replaces the import with a fetch call at build time."
			},
			{
				type: 'p',
				text: 'You get one typed function signature spanning client and server. No hand-written endpoint, no `fetch(\'/api/…\')`, no manually maintained request and response types.'
			},
			{
				type: 'note',
				text: 'The file must have a `.remote.ts` suffix. That is not a convention you could rename — SvelteKit looks for that segment specifically.'
			},
			{ type: 'h3', id: 'form-vs-command', text: 'Why form() and not command()' },
			{
				type: 'why',
				title: 'The whole reason',
				text: 'A `command()` fires from an event handler and needs JavaScript. A `form()` is spread onto a real `<form>` element, so it submits as an ordinary HTTP POST when JavaScript has not loaded, has failed, or is disabled — then progressively enhances itself once hydrated. For the most important conversion point on the site, working without JavaScript is not a nice-to-have.'
			},
			{ type: 'h3', id: 'schema', text: 'The schema' },
			{
				type: 'code',
				file: 'src/routes/guide/guide.remote.ts',
				lang: 'ts',
				code: `import * as v from 'valibot';
import { form, getRequestEvent } from '$app/server';
import { redirect, invalid } from '@sveltejs/kit';

import { leadStore, normaliseEmail, type Lead } from '#lib/server/leads.ts';
import { createDownloadToken } from '#lib/server/tokens.ts';
import { rateLimit } from '#lib/server/rate-limit.ts';

// …
const guideSchema = v.object({
	email: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty('Enter your email address'),
		v.email('That does not look like a valid email address'),
		// Guards against a database column overflow and against absurd input.
		// RFC 5321 caps a full address at 254 characters.
		v.maxLength(254, 'That email address is too long')
	),

	experience: v.picklist(
		['new', 'some', 'experienced', 'professional'],
		'Choose which best describes you'
	),

	// …
	consent: v.pipe(
		v.optional(v.boolean(), false),
		v.check(
			(value) => value === true,
			'Please confirm you would like to receive the guide by email'
		)
	),

	// …
	_company: v.optional(v.string(), '')
});`
			},
			{
				type: 'warn',
				text: "**Checkbox fields must be optional.** An unchecked checkbox sends *nothing* — not `false`, the field is simply absent. So `v.boolean()` can never be satisfied by an unchecked box. SvelteKit enforces this at the type level: write a non-optional boolean and the `form()` overload resolves to a string literal explaining the problem, and your handler stops type-checking. It is a deliberately designed compile error, and a much better teacher than a runtime bug where consent silently never validates. So: optional with a default of `false`, then a `check` that demands `true`. The real file spells all of this out in a long comment above `consent` — that is what the `// …` there stands for; the others are the schema's doc comment and the honeypot's."
			},
			{
				type: 'note',
				text: 'The leading underscore on `_company` is a SvelteKit convention: fields whose names start with `_` are not repopulated into the form when validation fails. It exists for passwords, and suits a honeypot too.'
			},
			{
				type: 'why',
				title: 'Why Valibot rather than Zod',
				text: 'Both implement the Standard Schema spec, which is the interface SvelteKit accepts here — so either drops in unchanged. Valibot tree-shakes: you ship only the validators you import, which for this form is a few hundred bytes rather than Zod\'s ~13kB. On a marketing page where bundle size is a ranking input, that is worth having.'
			},
			{ type: 'h3', id: 'handler', text: 'The handler' },
			{
				type: 'code',
				file: 'src/routes/guide/guide.remote.ts',
				lang: 'ts',
				code: `export const requestGuide = form(guideSchema, async (data, issue) => {
	// …
	const event = getRequestEvent();

	/* ---- 1. Rate limit -------------------------------------------------- */
	const limit = rateLimit(\`guide:\${event.getClientAddress()}\`, {
		limit: 5,
		windowMs: 60_000
	});

	if (!limit.allowed) {
		// Attached to the email field so it renders next to the input the user is
		// looking at, rather than in a form-level error block they might miss.
		invalid(
			issue.email(
				\`Too many attempts. Please wait \${limit.retryAfterSeconds} seconds and try again.\`
			)
		);
	}

	/* ---- 2. Honeypot ---------------------------------------------------- */
	// …
	const isBot = data._company.trim().length > 0;

	const email = normaliseEmail(data.email);

	/* ---- 3. Persist ----------------------------------------------------- */
	if (!isBot) {
		const alreadyKnown = await leadStore.has(email);

		if (!alreadyKnown) {
			const lead: Lead = {
				email,
				experience: data.experience,
				consentedToMarketing: data.consent,
				capturedAt: new Date().toISOString(),
				source: 'guide-landing'
			};

			await leadStore.save(lead);
		}

		// A real deployment sends the welcome email here — and does it via a queue,
		// not inline, so a slow mail provider can't hold the user's request open.
	}

	/* ---- 4. Issue a signed download link -------------------------------- */
	const token = createDownloadToken(email);

	// …
	redirect(303, \`/guide/thank-you?t=\${encodeURIComponent(token)}\`);
});`
			},
			{
				type: 'why',
				title: 'Why the bot gets a success page',
				text: 'Returning "bot detected" hands the author of the bot a free test harness for evading your check. We behave exactly as if the signup succeeded, and simply do not store anything.'
			},
			{
				type: 'why',
				title: 'Why 303 and not 302',
				text: '303 (See Other) tells the browser to follow up with a **GET**. That is the Post/Redirect/Get pattern, and it is what stops a browser refresh from resubmitting the form and creating a duplicate.'
			},
			{
				type: 'warn',
				text: '`redirect()` **throws**. Nothing after that line runs — which is what you want, and also why you must never wrap a redirect in a `try/catch` that swallows everything. The catch eats the redirect and the user sits on the form wondering what happened. This is a genuinely common bug.'
			},
			{
				type: 'note',
				text: 'Server-side validation is the only validation that counts. Client-side checks are a convenience for honest users; anyone can bypass them with `curl`. Never treat them as a security boundary.'
			},
			{
				type: 'checkpoint',
				text: '`pnpm run check` passes. If it complains about the `form()` overload, your `consent` field is not optional — re-read the warning above.'
			}
		]
	},

	/* ============================================================ 28 */
	{
		slug: 'the-capture-page',
		title: 'The capture page',
		summary:
			'Wiring the form into markup, showing validation errors accessibly, hiding a honeypot properly, the one page that cannot be prerendered — and what a visitor sees when the server fails.',
		goal: 'A working, accessible signup form.',
		blocks: [
			{
				type: 'code',
				file: 'src/routes/guide/+page.svelte',
				lang: 'svelte',
				code: `<script lang="ts">
	import { ArrowRightIcon, CheckIcon, LockSimpleIcon } from 'phosphor-svelte';
	// …
	import { requestGuide } from './guide.remote.ts';
	// …
</script>

<!-- … -->
<form {...requestGuide} class="signup" aria-labelledby="signup-heading">
	<h2 id="signup-heading" class="signup__title">Get the guide</h2>
	<p class="signup__sub">Enter your email and we'll send you straight to the download.</p>

	<!-- Email -->
	<div class="field">
		<label class="field__label" for="guide-email">Email address</label>
		<input
			id="guide-email"
			class="field__input"
			placeholder="you@example.com"
			autocomplete="email"
			{...requestGuide.fields.email.as('email')}
			aria-describedby={requestGuide.fields.email.issues()
				? 'guide-email-error'
				: undefined}
		/>
		{#if requestGuide.fields.email.issues()}
			<!--
				\`role="alert"\` makes a screen reader announce the message the
				moment it appears, rather than only when the user happens to
				navigate onto it.
			-->
			<p class="field__error" id="guide-email-error" role="alert">
				{#each requestGuide.fields.email.issues() ?? [] as issue (issue.message)}
					{issue.message}
				{/each}
			</p>
		{/if}
	</div>

	<!-- … -->
	<button class="signup__submit" type="submit" disabled={requestGuide.pending > 0}>
		{#if requestGuide.pending > 0}
			Sending…
		{:else}
			Send me the guide
			<ArrowRightIcon size={18} aria-hidden="true" />
		{/if}
	</button>

	<p class="signup__privacy">
		<LockSimpleIcon size={14} aria-hidden="true" />
		<span>
			We never sell or share your address. See our
			<a href={resolve('/legal/privacy')}>privacy policy</a>.
		</span>
	</p>
</form>`
			},
			{
				type: 'p',
				text: 'The `// …` and `<!-- … -->` lines stand for what this listing leaves out: the other imports and the page data, the hero copy column beside the form, and — inside the form — the experience `<select>` and the consent checkbox (the same field pattern again), the honeypot, which the next section shows, and the comments the real file puts above each part.'
			},
			{ type: 'h3', id: 'spread', text: 'What the spreads do' },
			{
				type: 'ul',
				items: [
					'`{...requestGuide}` on the `<form>` — sets `action`, `method` and the enhancement handler. Without JavaScript this is an ordinary POST that works; with JavaScript it submits in the background.',
					'`{...requestGuide.fields.email.as(\'email\')}` on the input — sets `name`, `type`, `aria-invalid` and the value binding. `as()` accepts every HTML input type: `text`, `email`, `password`, `number`, `date`, `checkbox`, `radio`, `file`, `select`, and more.',
					'`requestGuide.pending` — a counter of in-flight submissions. Disabling on it prevents the double-submit you get from an impatient double-click on a slow connection.'
				]
			},
			{
				type: 'note',
				text: '`role="alert"` on the error paragraph makes a screen reader announce the message the **moment it appears**, rather than only when the user happens to navigate onto it. `aria-describedby` then links the error to the input, so focusing the field re-reads it.'
			},
			{
				type: 'note',
				text: '`aria-invalid` is set for you by `field.as(…)`, so we style the error state off the same attribute assistive technology reads. One source of truth — the visual and the announced state cannot disagree.'
			},
			{ type: 'h3', id: 'honeypot', text: 'Hiding the honeypot correctly' },
			{
				type: 'code',
				file: 'src/routes/guide/+page.svelte',
				lang: 'svelte',
				code: `<div class="honeypot" aria-hidden="true">
	<label for="guide-company">Company (leave this empty)</label>
	<input
		id="guide-company"
		tabindex="-1"
		autocomplete="off"
		{...requestGuide.fields._company.as('text')}
	/>
</div>`
			},
			{
				type: 'code',
				lang: 'css',
				file: 'src/routes/guide/+page.svelte',
				code: `.honeypot {
	position: absolute;
	left: -9999px;
	width: 1px;
	height: 1px;
	overflow: hidden;
}`
			},
			{
				type: 'ul',
				items: [
					'**Off-screen, not `display: none`.** Sophisticated bots skip `display: none` fields precisely because they know it is a trap.',
					'`tabindex="-1"` — keyboard users never land on it.',
					'`aria-hidden="true"` — screen readers never announce it.',
					'`autocomplete="off"` — **this is the one people miss.** Without it a password manager fills the field in and flags a real person as a bot, silently rejecting genuine signups.'
				]
			},
			{ type: 'h3', id: 'input-size', text: 'The 16px rule' },
			{
				type: 'code',
				lang: 'css',
				file: 'src/routes/guide/+page.svelte',
				code: `.field__input {
	/* … */
	min-height: 3rem;
	/* … */
	/*
	 * 16px minimum on mobile.
	 *
	 * iOS Safari automatically zooms the page when you focus an input whose
	 * font-size is under 16px, and it does not zoom back out. Users experience
	 * this as the site "breaking" when they tap a field. \`--fs-base\` is 1rem,
	 * which clears the threshold.
	 */
	font-size: var(--fs-base);
	/* … */
}`
			},
			{
				type: 'warn',
				text: 'iOS Safari automatically **zooms the page** when you focus an input whose font-size is under 16px — and it does not zoom back out. Users experience this as your site breaking when they tap a field. It is one of the most common mobile bugs on the web and the fix is one line.'
			},
			{ type: 'h3', id: 'no-prerender', text: 'This page cannot be prerendered' },
			{
				type: 'p',
				text: 'Run a build now and it fails:'
			},
			{
				type: 'terminal',
				code: 'Error: Cannot access url.search on a page with prerendering enabled'
			},
			{
				type: 'why',
				title: 'Why',
				text: 'A remote `form()` builds its own `action` attribute from the **current request URL**, so a submission returns you to the page you submitted from with any query string intact. Prerendering happens at build time, where there is no request and therefore no meaningful URL — so SvelteKit throws rather than baking in a wrong one. The rule: **a page hosting a remote form must be server-rendered.**'
			},
			{
				type: 'code',
				file: 'src/routes/guide/+page.ts',
				lang: 'ts',
				code: `export const prerender = false;`
			},
			{
				type: 'note',
				text: 'The cost is small. This page renders per request instead of being a static file, adding a few milliseconds of server time. Everything expensive about it — CSS, fonts, JavaScript — is still static and still cached at the edge. Only the HTML shell is dynamic.'
			},
			{ type: 'h3', id: 'when-it-fails', text: 'When the server fails' },
			{
				type: 'p',
				text: "Every failure so far has an answer the visitor can act on. A field the schema rejects comes back as an issue beside that input, and too many attempts comes back as an issue on the email field. What is left is the failure nobody planned: the disk the leads are written to is full, or there is a bug, and `leadStore.has()` or `save()` throws before the handler reaches its `redirect()`."
			},
			{
				type: 'p',
				text: "When code on the server throws, SvelteKit does not send the exception to the browser. It reduces every error to a small object of type `App.Error`, which always has two fields: a `status` (an HTTP status code such as 404 or 500) and a `message`. The reducing is done by a **hook** called `handleError` — a function SvelteKit calls for every error, which you may export from a file named `src/hooks.server.ts`. StrikeFlow has no such file, so SvelteKit's built-in default applies, and it does two things. An error the code threw on purpose, like the `error(404, 'No article found at …')` in the blog route, keeps the status and the sentence it was given. Anything else — an exception nobody planned — is printed to the server's console with its full stack, and reaches the browser as `{ status: 500, message: 'Internal Error' }`."
			},
			{
				type: 'why',
				title: 'Why the real message never reaches the browser',
				text: "Because an unplanned error is, by definition, one nobody has checked is safe to show. Ours would read something like `ENOTDIR: not a directory, open '/srv/app/package.json/leads.jsonl'` — a file path on the server, handed to anyone who submits the form. Database errors can carry worse: table names, fragments of queries, sometimes credentials. SvelteKit's errors documentation puts it plainly: unknown errors \"can contain sensitive information\", so \"unknown error messages and stack traces are not exposed to users\". The full error goes to the server's log, where you can read it; the visitor gets a safe sentence. If you want a friendlier one than `'Internal Error'`, that is what your own `handleError` is for:"
			},
			{
				type: 'code',
				file: 'a handleError of your own',
				lang: 'ts',
				code: `import type { HandleServerError } from '@sveltejs/kit/hooks';

export const handleError: HandleServerError = ({ kind, error }) => {
	// error(…) bodies, SvelteKit's own errors and validation errors are already
	// safe to show: returning nothing keeps them exactly as they are.
	if (kind !== 'unknown') return;

	// Anything else may carry a file path or a secret. Log it where only you can
	// read it, and give the visitor a sentence instead of 'Internal Error'.
	console.error(error);
	return { message: 'Something went wrong on our side. Please try again shortly.' };
};`
			},
			{
				type: 'note',
				text: "That is an option, not part of StrikeFlow. Once you supply the hook, logging is your job — SvelteKit only logs unknown errors itself when you have not. The [errors documentation](https://svelte.dev/docs/kit/errors) covers the rest, including adding fields such as a support reference to `App.Error`."
			},
			{
				type: 'p',
				text: "Where does the visitor see that `App.Error`? The documentation for remote forms answers: \"If an error occurs during submission, the nearest `+error.svelte` page will be rendered.\" `+error.svelte` is a route file, like `+page.svelte`, and SvelteKit walks up the folders from the failing route looking for one. With none anywhere, it falls back to a page of its own, which is this short:"
			},
			{
				type: 'code',
				file: "SvelteKit's built-in error page",
				lang: 'svelte',
				code: `<svelte:options runes={true} />

<script>
	import { page } from '$app/state';
</script>

<h1>{page.status}</h1>
<p>{page.error?.message}</p>`
			},
			{
				type: 'p',
				text: "A status code and a message, and nothing else: no heading a person would write, no way back to the form, not even a title. It is a safety net, not a page you ship. So StrikeFlow has its own, at the root of `src/routes`, where it catches every route on the site:"
			},
			{
				type: 'code',
				file: 'src/routes/+error.svelte',
				lang: 'svelte',
				code: `<script lang="ts">
	import { resolve } from '$app/paths';
	import { site } from '#lib/data/site.ts';
	import Button from '#lib/components/ui/Button.svelte';
	import type { ErrorProps } from './$types';

	let { error }: ErrorProps = $props();

	const notFound = $derived(error.status === 404);
	const heading = $derived(notFound ? 'We can’t find that page' : 'Something went wrong');
</script>

<!--
	No <Seo> here: an error page has no canonical URL to claim and nothing to say
	to a social card. It only needs a title, and to stay out of the index.
-->
<svelte:head>
	<title>{heading} | {site.titleSuffix}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="error-page">
	<div class="container container--narrow">
		<p class="eyebrow">Error {error.status}</p>
		<h1 class="error-page__title">{heading}</h1>
		<p class="lede">{error.message}</p>

		<div class="error-page__actions">
			<Button href={resolve('/')}>Back to the home page</Button>
			<Button href={resolve('/guide')} variant="secondary">Get the free guide</Button>
		</div>
	</div>
</section>`
			},
			{
				type: 'ul',
				items: [
					"**`error` arrives as a prop**, typed as `ErrorProps` from `./$types` — the same way a page receives `data`. Older code reads `page.error` from `$app/state`, as the built-in page does, and that still works; the prop is the SvelteKit 3 idiom, because the component then depends on its inputs rather than on global state.",
					"**It renders inside the root layout**, so the header, footer and skip link stay, and the two buttons give the visitor somewhere to go.",
					"**`error.message` is shown as it stands**, because `handleError` has already made it safe: either the sentence the code wrote, or `'Not Found'` / `'Internal Error'`. The heading carries the human words, by status.",
					"**No `<Seo>`**: an error page has no canonical URL to claim. It gets a title and `noindex`, and SvelteKit sends it with the real status code — a 404 is a 404, not a 200 page that *says* not found."
				]
			},
			{
				type: 'why',
				title: 'Why the capture page catches nothing itself',
				text: "Because it has nothing better to say. The failures that reach this point are ones the visitor cannot fix by changing what they typed, and the only safe sentence about them is the one `handleError` has already written. A `catch` in the page would be code for the one case with no better message to show, so we let the error page take it. The cost is real and worth naming: the error page replaces the form, and a visitor who wants another go has to come back to it — which is why our error page offers the way back. For three fields that is a fair trade. For a long form it is not: take control of the submission with `enhance`, and read the next warning before you do."
			},
			{
				type: 'warn',
				text: "**A `catch` around a remote call receives a different shape.** Await `form.submit()` inside `enhance` — or a `command()` in a click handler — and a failure rejects with SvelteKit's `HttpError`: `{ status, body }`, where `body` is that same `App.Error`. It is not an `Error`, and it has no `message` of its own. So `(error as Error).message` is `undefined`, and `error instanceof Error ? error.message : 'Something went wrong'` throws the server's sentence away every time — while a plausible sentence sits on screen and nothing looks broken. Read `body.message`, behind `isHttpError()`. A `<svelte:boundary>`'s `failed` snippet and `+error.svelte` are the other way round: they receive the `App.Error` itself, so they read `error.message`."
			},
			{
				type: 'code',
				file: 'if you take control',
				lang: 'svelte',
				code: `<script lang="ts">
	import { isHttpError } from '@sveltejs/kit';
	import { requestGuide } from './guide.remote.ts';

	let failure = $state<string | null>(null);
</script>

<form
	{...requestGuide.enhance(async (form) => {
		failure = null;
		try {
			// A success redirects to the thank-you page; there is nothing else to do.
			await form.submit();
		} catch (error) {
			// An HttpError carries the server's App.Error in \`body\`. Its message is a
			// sentence written for the visitor whenever code chose the status —
			// error(503, 'Signups are paused…'). A 500 is the status every UNPLANNED
			// error gets, with the bare 'Internal Error', which is no help under a
			// form; and a dropped connection is not an HttpError at all.
			failure =
				isHttpError(error) && error.status !== 500
					? error.body.message
					: 'Something went wrong on our side. Please try again.';
		}
	})}
	class="signup"
	aria-labelledby="signup-heading"
>
	<h2 id="signup-heading" class="signup__title">Get the guide</h2>
	<!-- … -->
	{#if failure}
		<p class="field__error" role="alert">{failure}</p>
	{/if}
</form>`
			},
			{
				type: 'p',
				text: "Look at the condition. `isHttpError(error)` narrows the type, so `error.status` and `error.body.message` need no cast. Then `error.status !== 500` separates the two kinds of message: any other status was chosen by code — a 503 because signups are paused, a 429 from a rate limiter — and came with a sentence meant for a person, while 500 is what every unplanned error becomes, and its `'Internal Error'` would sit under the form like a shrug. Those, and anything that is not an `HttpError` at all, get one sentence of our own."
			},
			{
				type: 'note',
				text: "We checked both shapes in a real browser before writing them down, against a lead store that could not be read and an `error(503, …)` added for the experiment. Left to the error page, the 503's own sentence — **Signups are paused while we move the list.** — reached the visitor, and the store failure arrived as **Internal Error**. The same two failures caught in `enhance` arrived with `error instanceof Error` false, `error.message` undefined, and the server's words in `error.body.message`. The store failure is pinned by `e2e/failure.e2e.ts`, with JavaScript and without (chapter 36 shows how)."
			},
			{
				type: 'checkpoint',
				text: "Submit the form with a bad email and see an inline error. Submit a good one and land on `/guide/thank-you?t=…`. Then disable JavaScript in devtools and do it again — it should still work. Last, watch it fail: set `LEADS_DIR` in your `.env` to `package.json` — a file where the store expects a folder — restart `pnpm dev` and submit. You get the site's error page, **Something went wrong** over **Internal Error**, inside the header and footer, and the `ENOTDIR` error with its stack in the terminal. Put `LEADS_DIR` back afterwards. While you are there, visit `/no-such-page`: the same component, saying it can't find the page, with a real 404 status in the network tab."
			}
		]
	},

	/* ============================================================ 29 */
	{
		slug: 'gated-download',
		title: 'The gated download',
		summary:
			'Validate the token on the server, serve the PDF from outside `static/`, and generate the PDF itself with headless Chromium.',
		goal: 'A real PDF, delivered only to someone holding a valid token.',
		blocks: [
			{ type: 'h3', id: 'thankyou', text: 'The thank-you page' },
			{
				type: 'code',
				file: 'src/routes/guide/thank-you/+page.server.ts',
				lang: 'ts',
				code: `import type { PageServerLoad } from './$types';
import { verifyDownloadToken } from '#lib/server/tokens.ts';

// …
export const prerender = false;

export const load: PageServerLoad = ({ url, setHeaders }) => {
	// A missing \`t\` becomes '', which verifies as 'malformed' like any other bad
	// token — and keeps \`token\` a plain string for the valid branch below.
	const token = url.searchParams.get('t') ?? '';
	const result = verifyDownloadToken(token);

	/*
	 * Belt and braces on top of the \`noindex\` meta tag the page renders.
	 *
	 * The meta tag is in the HTML, so only a crawler that parses the HTML sees it.
	 * An \`X-Robots-Tag\` header is read from the response itself, before any parsing.
	 * Two mechanisms, because a gated page leaking into the index is embarrassing
	 * and slow to undo. Both need the crawler to fetch the page, which is why
	 * robots.txt deliberately does NOT disallow it — see \`robots.txt/+server.ts\`.
	 */
	setHeaders({
		'X-Robots-Tag': 'noindex, nofollow',
		'Cache-Control': 'private, no-store'
	});

	if (!result.valid) {
		return {
			// Never echo the raw token back into the page — that's how a bad token ends
			// up in an analytics URL, a referrer header, or a support screenshot.
			status: 'invalid' as const,
			reason: result.reason,
			token: null,
			email: null
		};
	}

	return {
		status: 'valid' as const,
		reason: null,
		// The token is re-used for the download route, which verifies it again.
		// Every entry point validates independently — never trust that an earlier
		// step in the flow did its job.
		//
		// We return the token, not a finished URL, and the page builds the link with
		// \`resolve()\` as it renders. On the server \`resolve()\` returns a path relative
		// to the request: \`../guide/download?t=…\` for a full page load, but
		// \`../../guide/download?t=…\` for the \`__data.json\` request a client-side
		// navigation makes, which is one level deeper. Serialised from here, that
		// second answer reaches a page that is NOT one level deeper; it only lands
		// on the right file today because a surplus \`..\` stops at the site root,
		// and under a base path it would climb out of the base.
		token,
		email: result.email
	};
};`
			},
			{
				type: 'why',
				title: 'Why validation happens here, not in the component',
				text: 'A component could decode the token and read its expiry, but it could never verify the **signature** — that requires the secret, and anything the browser can read is not a secret. So the server decides, and the page just renders the verdict.'
			},
			{
				type: 'p',
				text: "The load hands the page the verified token, and the page builds the download link itself, with `resolve()`, as it renders:"
			},
			{
				type: 'code',
				file: 'src/routes/guide/thank-you/+page.svelte',
				lang: 'svelte',
				code: `<script lang="ts">
	import { resolve } from '$app/paths';
	// …
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// …
</script>

<!-- … -->
<a
	class="thanks__download"
	href={resolve(\`/guide/download?t=\${encodeURIComponent(data.token)}\`)}
	download
>
	<DownloadSimpleIcon size={22} aria-hidden="true" />
	<span>Download the PDF (8 chapters)</span>
</a>`
			},
			{
				type: 'why',
				title: 'Why `resolve()` belongs in the component, not in load data',
				text: "It is tempting to finish the URL in the load function and return `downloadUrl` ready to use; an earlier version of this file did exactly that. The trouble is what `resolve()` returns on the server. The `$app/paths` docs say: \"During server rendering, the base path is relative and depends on the page currently being rendered.\" So on the server `resolve('/guide/download?t=…')` is a *relative* path, worked out from the current request — and a load function runs for two different requests. A full page load asks for `/guide/thank-you`, and gets `../guide/download?t=…`. A visitor with JavaScript arrives by client-side navigation (the form redirects here), and then the load runs for `/guide/thank-you/__data.json`, one folder deeper, and gets `../../guide/download?t=…`. That string is then serialised and dropped into a page that is *not* one folder deeper. Today it still lands on the right file, only because a surplus `..` stops at the root of the site; deploy under a base path and the link would climb out of it. Data should be data. Return the token, and let the component — which knows exactly which page it is rendering — turn it into a link."
			},
			{
				type: 'note',
				text: "`PageProps` from `./$types` types everything the page receives — `data` from the load above, and `params`. It is generated from your load function, so `data.status === 'valid'` narrows `data.token` to a `string` inside the `{#if}` with no cast. (Older code writes `{ data: PageData }` by hand; `PageProps` replaced that in SvelteKit 2.16.)"
			},
			{
				type: 'note',
				text: "Two layers keep this page out of the index: a `noindex` meta tag in the HTML, and an `X-Robots-Tag` header on the response itself, which a crawler reads before it parses anything. robots.txt is deliberately *not* a third layer. Both of the others only work on a crawler that is allowed to fetch the page, and a `Disallow` would stop it fetching — the self-defeating combination chapter 18 warned about."
			},
			{ type: 'h3', id: 'download', text: 'The download endpoint' },
			{
				type: 'code',
				file: 'src/routes/guide/download/+server.ts',
				lang: 'ts',
				code: `const EBOOK_PATH = resolvePath(
	process.cwd(),
	join('private', 'ebook', 'strikeflow-options-flow-guide.pdf')
);

const FILENAME = 'StrikeFlow-How-To-Read-Options-Flow.pdf';

export const GET: RequestHandler = async ({ url }) => {
	const result = verifyDownloadToken(url.searchParams.get('t'));

	if (!result.valid) {
		// …
		error(
			403,
			result.reason === 'expired' ? 'This download link has expired' : 'Invalid download link'
		);
	}

	let file: Buffer;
	try {
		file = await readFile(EBOOK_PATH);
	} catch {
		// A missing build artefact is our fault, not the user's — hence 500, and a
		// message that tells the operator what to run.
		error(500, 'The guide is temporarily unavailable. Please try again shortly.');
	}

	return new Response(new Uint8Array(file), {
		headers: {
			'Content-Type': 'application/pdf',
			// …
			'Content-Disposition': \`attachment; filename="\${FILENAME}"\`,
			'Content-Length': String(file.byteLength),
			// …
			'Cache-Control': 'private, no-store',
			'X-Robots-Tag': 'noindex, nofollow'
		}
	});
};`
			},
			{
				type: 'p',
				text: 'The `// …` inside `if (!result.valid)` stands for a comment explaining why that is a **403, not a 404**: the resource exists, the caller just is not allowed it. Hiding existence with a 404 suits genuinely secret resources, but the whole site advertises this PDF, so pretending otherwise would only confuse someone with an expired link. The two `// …` among the headers are short comments: `attachment` makes the browser save the file rather than display it, and `private` is explained below.'
			},
			{
				type: 'warn',
				text: "**The PDF is not in `static/`.** Anything in `static/` is copied verbatim into the build and served directly by the CDN — it is public, full stop. The URL is guessable, and the moment one person shares it your email gate is decorative. So it lives in a top-level `private/` directory that never enters the client build."
			},
			{
				type: 'note',
				text: 'We verify the token **again** here, even though the thank-you page already did. The two are independently reachable — someone can bookmark this URL or hit it directly. Every entry point validates for itself. Trusting that "an earlier screen already checked" is how authorisation bugs happen.'
			},
			{
				type: 'note',
				text: '`Cache-Control: private` is doing real work: it stops a shared CDN caching a response that required authorisation. Without it, a CDN could serve this PDF to the next person who requests the URL, token or no token.'
			},
			{ type: 'h3', id: 'pdf', text: 'Generating the PDF' },
			{
				type: 'why',
				title: 'Why headless Chromium rather than a PDF library',
				text: 'Libraries like pdfkit make you position every element by hand in points. That is fine for an invoice and miserable for a thirty-page document with headings, lists and page breaks. Chromium already contains the best text layout engine ever written, and it speaks CSS — including the print-specific parts (`@page`, `break-inside`, running headers) that exist precisely for this. And we already have Playwright installed for tests, so reusing it is free.'
			},
			{
				type: 'code',
				file: 'scripts/build-ebook.js',
				lang: 'js',
				code: `import { chromium } from 'playwright';
// …
function renderHtml() {
	// …
}

async function main() {
	await mkdir(outDir, { recursive: true });

	// …
	const executablePath = process.env.CHROMIUM_PATH;

	const browser = await chromium.launch(executablePath ? { executablePath } : {});
	try {
		const page = await browser.newPage();
		// …
		await page.setContent(renderHtml(), { waitUntil: 'networkidle' });

		await page.pdf({
			path: outFile,
			format: 'A4',
			// Chromium's own margins set to zero so the stylesheet's @page rule is the
			// only thing controlling layout. Two competing margin systems is a
			// reliable way to produce a document that looks fine on screen and wrong
			// on paper.
			margin: { top: '0', bottom: '0', left: '0', right: '0' },
			// Without this, Chromium strips background colours when printing — which
			// would silently remove every callout box.
			printBackground: true,
			displayHeaderFooter: true,
			headerTemplate: '<div></div>',
			footerTemplate: \`
				<div style="width:100%;font-size:8pt;color:#8590a8;padding:0 20mm;display:flex;justify-content:space-between;font-family:sans-serif;">
					<span>StrikeFlow — How to read options flow</span>
					<span class="pageNumber"></span>
				</div>\`
		});

		const pages = await page.evaluate(() => document.querySelectorAll('.chapter').length);
		console.log(\`[ebook] \${pages} chapters rendered\`);
	} finally {
		// \`finally\` so a failed render still closes the browser. Leaked Chromium
		// processes are a classic way to exhaust CI memory.
		await browser.close();
	}

	console.log(\`[ebook] written to \${outFile}\`);
}

await main();`
			},
			{
				type: 'p',
				text: 'The `// …` lines stand for the rest of the script: the other imports and paths, the body of `renderHtml()` — which builds the whole document as one HTML string from `ebook-content.js` — and two comments. The one above `CHROMIUM_PATH` explains the override: CI images, Docker builds and locked-down networks can point it at a Chromium they already have instead of downloading a second copy. The one above `setContent` explains `networkidle`: the document has no external resources today, but the day you add a logo or a web font, printing before it loads leaves a gap where it should be.'
			},
			{
				type: 'p',
				text: 'The print stylesheet uses CSS most people never touch:'
			},
			{
				type: 'code',
				lang: 'css',
				file: 'the print CSS that matters',
				code: `@page { size: A4; margin: 22mm 20mm 20mm; }

.chapter    { break-before: page; }   /* each chapter starts a new sheet */
.chapter h3 { break-after: avoid; }   /* never orphan a heading at page bottom */
.callout    { break-inside: avoid; }  /* never split a box across pages */
p           { orphans: 2; widows: 2; } /* never leave one line alone */`
			},
			{
				type: 'p',
				text: "Give the script a name in `package.json`, so nobody has to remember the path:"
			},
			{
				type: 'code',
				file: 'package.json',
				lang: 'json',
				code: `"scripts": {
	…
	"ebook:build": "node scripts/build-ebook.js",
	…
},`
			},
			{ type: 'terminal', code: 'pnpm exec playwright install chromium\npnpm run ebook:build' },
			{
				type: 'warn',
				text: "A trap I hit writing this: the HTML is a JavaScript template literal, and a stray backtick **inside a CSS comment** terminates the string. The syntax error then points at your CSS, which is a confusing place to land. Keep backticks out of the template."
			},
			{
				type: 'checkpoint',
				text: 'Complete the flow end to end and get a real PDF. Then change one character in the token in the URL — you should get a 403.'
			}
		]
	},

	/* ============================================================ 30 */
	{
		slug: 'blog-and-legal',
		title: 'The blog and the legal pages',
		summary:
			'Dynamic routes with `entries()`, article structured data, a nested layout, and why a trading site needs a risk disclosure.',
		goal: 'Content pages complete, with full Article and Person schema.',
		blocks: [
			{ type: 'h3', id: 'dynamic', text: 'A dynamic route' },
			{
				type: 'p',
				text: '`src/routes/blog/[slug]/+page.svelte` handles `/blog/anything`. The `[slug]` folder name becomes `params.slug`.'
			},
			{
				type: 'code',
				file: 'src/routes/blog/[slug]/+page.ts',
				lang: 'ts',
				code: `import { error } from '@sveltejs/kit';
import type { PageLoad, EntryGenerator } from './$types';
import { getPost } from '#lib/data/posts.ts';
import { getPerson } from '#lib/data/team.ts';
import { posts } from '#lib/data/posts.ts';

// …
export const entries: EntryGenerator = () => {
	return posts.map((post) => ({ slug: post.slug }));
};

export const load: PageLoad = ({ params }) => {
	const post = getPost(params.slug);

	if (!post) {
		// …
		error(404, \`No article found at /blog/\${params.slug}\`);
	}

	const author = getPerson(post.authorId);

	if (!author) {
		// …
		error(500, \`Post "\${post.slug}" references unknown author "\${post.authorId}"\`);
	}

	return { post, author };
};`
			},
			{
				type: 'why',
				title: 'Why declare entries() when the crawler would find them anyway',
				text: 'SvelteKit finds most pages by crawling links, and it would discover all three of these from `/blog`. But that makes prerendering depend on your **navigation**. Move posts behind a "load more" button and they silently stop being built, with no error. `entries()` states the truth directly: these slugs exist and must be rendered, regardless of what links to them.'
			},
			{
				type: 'warn',
				text: 'Return a **404** for a missing post, not a redirect to `/blog`. A missing article genuinely is not found, and bouncing a crawler to an index page with a 302 creates a *soft 404* — one of the more common ways sites confuse Google about which of their URLs are real.'
			},
			{
				type: 'note',
				text: 'An unresolvable author is a **500**, not a 404. It is a data bug, not a user error, and failing loudly at build time is exactly what we want — an article with no byline is an E-E-A-T problem we would rather never ship.'
			},
			{ type: 'h3', id: 'article-schema', text: 'The full article schema' },
			{
				type: 'code',
				file: 'src/routes/blog/[slug]/+page.svelte',
				lang: 'svelte',
				code: `<Seo
	title={post.seoTitle ?? post.title}
	description={post.description}
	type="article"
	article={{
		published: post.published,
		modified: post.updated,
		authorName: author.name,
		tags: post.tags
	}}
	schema={[
		articleSchema(post, author, pageUrl),
		personSchema(author),
		breadcrumbSchema(pageUrl, [
			{ name: 'Home', path: '/' },
			{ name: 'Insights', path: '/blog' },
			{ name: post.title, path: \`/blog/\${post.slug}\` }
		])
	]}
/>`
			},
			{
				type: 'why',
				title: 'seoTitle: the h1 and the title tag should differ',
				text: 'Our headline — "How to read an options sweep (and what most scanners get wrong)" — is 63 characters, and with " | StrikeFlow" appended that is 76. Google truncates around 60, so the results page would show it cut mid-word. So we write the `<h1>` for the reader and a shorter `seoTitle` for the results page. An e2e test in chapter 36 enforces the limit.'
			},
			{ type: 'h3', id: 'stretched', text: 'The stretched link' },
			{
				type: 'code',
				lang: 'css',
				file: 'src/routes/blog/+page.svelte',
				code: `.post-card {
	/* Required — the stretched-link ::after below is absolutely positioned
	   against this. Without it, the overlay escapes to the nearest positioned
	   ancestor and covers the whole page. */
	position: relative;
	/* … */
}

/* … */
.post-card__title a::after {
	content: '';
	position: absolute;
	inset: 0;
}`
			},
			{
				type: 'p',
				text: 'The whole card becomes clickable while the only real link is the heading. You avoid nesting the card inside an `<a>` (invalid — a link cannot contain a heading plus block content) and avoid an `onclick` on the container (not keyboard accessible). The link text stays the article title, so it reads correctly when a screen reader lists all links on the page.'
			},
			{
				type: 'warn',
				text: '`position: relative` on the card is load-bearing. Without it the overlay escapes to the nearest positioned ancestor and covers the entire page — every click anywhere goes to that one article.'
			},
			{ type: 'h3', id: 'nested-layout', text: 'A nested layout' },
			{
				type: 'p',
				text: '`src/routes/legal/+layout.svelte` wraps only the routes under `/legal`, inheriting the root layout above it.'
			},
			{
				type: 'code',
				file: 'src/routes/legal/+layout.svelte',
				lang: 'css',
				code: `.legal :global(h2) {
	font-size: var(--fs-xl);
	margin-block: var(--space-10) var(--space-4);
	scroll-margin-top: calc(var(--header-height) + var(--space-6));
}`
			},
			{
				type: 'why',
				title: 'Why :global here',
				text: 'Svelte scopes styles by adding a hash class to elements it can see in **this** component\'s markup. The headings come from the child page, so they never get that class and a normal selector would not reach them. `.legal :global(h2)` reads as: scope the `.legal` part, but let the `h2` part match anything inside. That is the correct escape hatch for styling child-rendered content — far better than reaching for `!important`. (The `scroll-margin-top` line does nothing yet: none of the legal headings has an `id`, so nothing can link to one. It is there for the day they do. When the browser scrolls to a linked element it adds that element\'s `scroll-margin-top` to the page-wide `scroll-padding-top` from chapter 13, so a linked `h2` here would stop with extra clearance below the sticky header.)'
			},
			{ type: 'h3', id: 'ymyl', text: 'Why a trading site needs these pages' },
			{
				type: 'p',
				text: 'Three legal pages: risk disclosure, privacy, terms. For a financial site these are not boilerplate — they are trust signals a quality rater is explicitly told to look for, and the risk disclosure in particular is genuinely important.'
			},
			{
				type: 'p',
				text: 'The footer carries a condensed version of the risk disclosure on **every page**, stating plainly that we are a data provider, not a broker-dealer or adviser, and that nothing here is investment advice. That is both the right thing to do and a strong E-E-A-T signal.'
			},
			{
				type: 'warn',
				text: 'The legal copy in this project is realistic sample text for a teaching exercise. It is **not legal advice** and has not been reviewed by a lawyer. Your obligations depend on your jurisdiction and your actual business. Have counsel review before you publish anything like it.'
			},
			{
				type: 'checkpoint',
				text: 'All three blog posts render at their own URLs with Article, Person and BreadcrumbList in the JSON-LD. `pnpm run build` prerenders them.'
			}
		]
	},

	/* ============================================================ 35 */
	{
		slug: 'unit-tests',
		title: 'Unit tests with Vitest',
		summary:
			'What a test actually is, why Vitest and Vite are the same tool, and how to test the code where being wrong is expensive.',
		goal: 'Fast, meaningful tests for the logic that matters most — starting from never having written one.',
		blocks: [
			{ type: 'h3', id: 'what-is-a-test', text: 'What a test actually is' },
			{
				type: 'p',
				text: 'A test is a small program that runs your real code and checks the answer. That is all. There is no magic in it, and if you have ever written a `console.log` to check whether a function works, you have already done the hard conceptual part — a test just makes that check permanent and automatic.'
			},
			{
				type: 'code',
				lang: 'ts',
				file: 'the entire idea',
				code: `import { describe, it, expect } from 'vitest';
import { addTax } from './tax.ts';

describe('addTax', () => {
	it('adds 20 percent', () => {
		expect(addTax(100)).toBe(120);
	});
});`
			},
			{
				type: 'ul',
				items: [
					'`describe` groups related tests. Purely organisational — it makes failures readable.',
					'`it` is one test. Read it as a sentence: *it* adds 20 percent. If the name does not read as a sentence, the test is probably doing too much.',
					'`expect(...)` takes the actual value; `.toBe(...)` says what it should be. If they differ, the test fails and prints both.'
				]
			},
			{
				type: 'why',
				title: 'Why bother, honestly',
				text: 'Not to prove the code works today — you can check that by hand. Tests exist for the change you make in four months, when you have forgotten how any of this fits together. They are the mechanism that lets you edit code confidently instead of nervously. That is the entire return on investment, and it only pays out over time.'
			},
			{ type: 'h3', id: 'vitest-is-vite', text: 'Vitest is Vite' },
			{
				type: 'p',
				text: 'This is the thing worth understanding, and it explains why Vitest needs almost no configuration.'
			},
			{
				type: 'p',
				text: 'Your test files import your real source files — TypeScript, `.svelte` components, `#lib` paths, CSS imports. None of that is something Node can run directly. Something must transform it first. That something is **Vite**, which you already have.'
			},
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `import { defineConfig } from 'vitest/config';
// …

export default defineConfig({
	plugins: [
		sveltekit({
			// …
		}),

		// …
		sveltePhosphorOptimize()
	],

	test: {
		expect: { requireAssertions: true },

		// …
		projects: [
			// …
		]
	}
});`
			},
			{
				type: 'note',
				text: 'The import comes from `vitest/config`, not `vite` — the same `defineConfig`, but its types know about the `test` block. The `// …` just above `sveltePhosphorOptimize()` is the ordering comment from chapter 19: it must come after `sveltekit()`.'
			},
			{
				type: 'why',
				title: 'One config, one transform pipeline',
				text: 'The `test` block lives in the *same file* as your build config, and Vitest reuses the exact same plugins. So your tests see your code transformed identically to how the browser will see it. Older test runners needed a separate config that duplicated all of this — and drifted, producing the notorious "passes in tests, breaks in the build" failure. Sharing one pipeline removes that entire category of problem.'
			},
			{
				type: 'note',
				text: '`requireAssertions: true` fails any test that runs without asserting anything. It sounds pedantic and it catches a genuinely common mistake: an async test that forgets `await`, finishes early, asserts nothing, and reports a confident green tick forever.'
			},
			{ type: 'h3', id: 'projects', text: 'Two projects: Node and browser' },
			{
				type: 'code',
				file: 'vite.config.ts',
				lang: 'ts',
				code: `test: {
	// …
	projects: [
		{
			// Component tests — run in a real Chromium, not a DOM emulator.
			// Worth the extra seconds: jsdom quietly lies about layout and focus,
			// which are exactly the things a component test should verify.
			test: {
				name: 'client',
				browser: {
					enabled: true,
					provider: playwright(),
					instances: [{ browser: 'chromium', headless: true }]
				},
				include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
				exclude: ['src/lib/server/**']
			}
		},
		{
			// Pure logic tests — plain Node, no browser, fast.
			test: {
				name: 'server',
				environment: 'node',
				include: ['src/**/*.{test,spec}.{js,ts}'],
				exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
			}
		}
	]
}`
			},
			{
				type: 'note',
				text: "Each project inherits the root config — the `sveltekit()` and Phosphor plugins included — automatically. That is a Vitest 5 behaviour: Vitest 4 needed `extends: './vite.config.ts'` on every project, which re-read this file from disk each time. If you see that line in an older example, it is no longer needed; `extends: false` is the opt-out for a project that must stand alone."
			},
			{
				type: 'ul',
				items: [
					'Files named `something.spec.ts` run in **Node** — fast, for pure logic.',
					'Files named `Something.svelte.spec.ts` run in a **real browser** — slower, for components.'
				]
			},
			{
				type: 'why',
				title: 'Why a real browser and not jsdom',
				text: 'jsdom is a JavaScript reimplementation of the DOM, and it is a very good one — but it quietly lies about layout, focus behaviour and a number of APIs, which are exactly the things a component test should be checking. The extra couple of seconds buys you tests that fail when the thing actually breaks, rather than tests that pass because the emulator agreed with your bug.'
			},
			{ type: 'h3', id: 'what-to-test', text: 'What to test — and what not to' },
			{
				type: 'p',
				text: 'Beginners are usually told to test everything, which produces a suite so slow and brittle that the team deletes it. Test where being wrong is expensive:'
			},
			{
				type: 'ul',
				items: [
					'**Security-critical code.** Our token signing. If it breaks, anyone can forge a download link.',
					'**Anything with edge cases.** Expiry boundaries, empty arrays, zero, negative numbers.',
					'**Invariants other code depends on.** Our chart data must have strictly increasing timestamps, because the charting library silently misbehaves otherwise.',
					'**Bugs you have already fixed.** Write the test that would have caught it, so it cannot come back.'
				]
			},
			{
				type: 'warn',
				text: 'Do not test that a framework works. A test asserting that Svelte renders a prop is testing Svelte, not your code, and it will break when Svelte changes something irrelevant. Test *your* logic.'
			},
			{ type: 'h3', id: 'tokens-test', text: 'The test that matters most here' },
			{
				type: 'code',
				file: 'src/lib/server/tokens.spec.ts',
				lang: 'ts',
				code: `it('rejects a tampered payload', () => {
	const token = createDownloadToken('reader@example.com');
	const [, signature] = token.split('.');

	// Re-encode a payload claiming a different email, keeping the old signature.
	const forgedPayload = Buffer.from(
		JSON.stringify({ email: 'attacker@example.com', exp: Date.now() + 100_000 })
	).toString('base64url');

	const result = verifyDownloadToken(\`\${forgedPayload}.\${signature}\`);
	expect(result).toEqual({ valid: false, reason: 'bad-signature' });
});`
			},
			{
				type: 'p',
				text: 'Eight lines. If that test ever fails, anyone can mint themselves a download link or change whose email is attributed to a download. That is the shape of a test worth writing.'
			},
			{ type: 'h3', id: 'time', text: 'Testing code that depends on time' },
			{
				type: 'p',
				text: 'Our tokens expire after 24 hours. You cannot wait 24 hours, so you lie to the code about what time it is:'
			},
			{
				type: 'code',
				file: 'src/lib/server/tokens.spec.ts',
				lang: 'ts',
				code: `it('rejects an expired token', () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));

	const token = createDownloadToken('reader@example.com');
	expect(verifyDownloadToken(token).valid).toBe(true);

	// Tokens last 24 hours. Step 25 hours forward.
	vi.setSystemTime(new Date('2026-08-15T13:00:00Z'));

	expect(verifyDownloadToken(token)).toEqual({ valid: false, reason: 'expired' });
});`
			},
			{
				type: 'note',
				text: 'Always test **both sides** of a boundary. We have this test and a matching one at 23 hours 59 minutes asserting the token is still valid. A test that only checks the failure case passes just as happily if your token expires instantly.'
			},
			{
				type: 'warn',
				text: 'Call `vi.useRealTimers()` in an `afterEach`. Fake timers leak into later tests and cause failures that make no sense in the file you are looking at — one of the more infuriating debugging experiences available.'
			},
			{ type: 'h3', id: 'invariants', text: 'Test properties, not values' },
			{
				type: 'code',
				file: 'src/lib/utils/market-data.spec.ts',
				lang: 'ts',
				code: `it('produces the same sequence for the same seed', () => {
	const a = mulberry32(42);
	const b = mulberry32(42);

	const first = Array.from({ length: 20 }, () => a());
	const second = Array.from({ length: 20 }, () => b());

	expect(first).toEqual(second);
});

// …

it('produces strictly increasing, evenly spaced timestamps', () => {
	const { price } = generateSeries({ bars: 30, interval: 300 });

	for (let i = 1; i < price.length; i += 1) {
		const previous = price[i - 1];
		const current = price[i];
		expect(previous).toBeDefined();
		expect(current).toBeDefined();
		// Lightweight Charts silently misbehaves on out-of-order data, so this
		// invariant matters more than it looks.
		expect(current!.time - previous!.time).toBe(300);
	}
});

it('never produces a non-positive price', () => {
	// A random walk can wander below zero without the guard in generateSeries.
	for (const seed of [1, 500, 12345, 987654]) {
		for (const point of generateSeries({ seed, bars: 400 }).price) {
			expect(point.value).toBeGreaterThan(0);
		}
	}
});`
			},
			{
				type: 'why',
				title: 'None of these assert a specific number',
				text: 'They assert *properties*: determinism, ordering, positivity. That means they survive a change to the generation algorithm — they only fail if the guarantee is actually broken. A test asserting `price[3] === 428.91` would fail on every harmless tweak, and a test that cries wolf gets deleted.'
			},
			{ type: 'h3', id: 'wrong-test', text: 'When the test is wrong' },
			{
				type: 'p',
				text: 'While writing this project I asserted `formatCompactUsd(5_600)` returns exactly `"$5.60K"` — and the assertion broke when the project moved from Node 22 to Node 24. `Intl` is implemented by ICU, the Unicode library Node bundles, and its output is a moving target: compact **currency** formatting used to keep the currency\'s minimum fraction digits (`$5.60K` on Node 22\'s ICU 78.2), and ICU 78.3, which Node 24 ships, trims them to `$5.6K`. Same code, different text, depending on which Node is installed.'
			},
			{
				type: 'code',
				file: 'src/lib/utils/market-data.spec.ts',
				lang: 'ts',
				code: `it('formats a value with a trailing zero, whichever ICU is installed', () => {
	/*
	 * DELIBERATELY A PATTERN, NOT AN EXACT STRING.
	 *
	 * \`Intl\` is implemented by ICU, the Unicode library Node bundles, and its
	 * output is a moving target across versions. Compact *currency* formatting
	 * used to keep the currency's minimum fraction digits — \`$5.60K\` — and as
	 * of ICU 78.3 it trims them: \`$5.6K\`. Node 22 ships 78.2, Node 24 ships
	 * 78.3, so the same code produces different text on each.
	 *
	 * A byte-exact assertion here is therefore not a test of this function. It
	 * is a test of which Node version is installed, and it fails on upgrade for
	 * a reason that has nothing to do with the code under test. This project
	 * learned that the hard way while moving from Node 22 to Node 24.
	 *
	 * What the app actually needs is the right symbol, the right magnitude
	 * suffix, and no more than two decimals. That is what this asserts.
	 */
	expect(formatCompactUsd(5_600)).toMatch(/^\\$5\\.60?K$/);
	expect(formatCompactUsd(1_000)).toMatch(/^\\$1(\\.00)?K$/);
});`
			},
			{
				type: 'note',
				text: 'The comment is half the test. A pattern where you would expect an exact string looks like laziness to the next person who reads it, and without the explanation they will "fix" it back to a byte-exact assertion — which is not a test of `formatCompactUsd` at all, but of which Node version is installed.'
			},
			{ type: 'h3', id: 'running', text: 'Running them' },
			{
				type: 'terminal',
				code: `pnpm run test:unit            # watch mode — reruns on save
pnpm run test:unit -- --run   # once, then exit (what CI uses)
pnpm exec vitest run --project=server   # just the fast Node ones`
			},
			{
				type: 'note',
				text: 'Watch mode is the point. Vitest reruns only the tests affected by the file you just saved, usually in well under a second. Leave it running in a second terminal and you get a continuous answer to "did I just break something?"'
			},
			{
				type: 'checkpoint',
				text: 'All unit tests pass. You have tests for token signing, expiry, tampering, rate limiting and the data generator — and you can explain why Vitest needs no build configuration of its own.'
			}
		]
	},

	/* ============================================================ 36 */
	{
		slug: 'e2e-tests',
		title: 'End-to-end tests, and the two bugs they found',
		summary:
			'Testing SEO metadata, the no-JavaScript path, and the gated download — plus a true story about how these tests caught two real defects.',
		goal: 'A suite that runs a real browser against a real production build, on desktop and mobile.',
		blocks: [
			{
				type: 'p',
				text: 'End-to-end tests run against a real production build in a real browser. That matters here: prerendering, the CSRF origin check and the form\'s progressive enhancement all behave differently in a production build.'
			},
			{
				type: 'code',
				file: 'playwright.config.ts',
				lang: 'ts',
				code: `export default defineConfig({
	testMatch: '**/*.e2e.{ts,js}',

	webServer: [
		{
			command: 'pnpm run build && pnpm run preview',
			port: 4173,
			// Building takes a moment; the default 60s is tight on a cold cache.
			timeout: 180_000,

			/*
			 * Deliberately NOT \`reuseExistingServer: !process.env.CI\`, which is the
			 * common default.
			 *
			 * Reusing a server you happen to have running is faster, and it means the
			 * suite can silently test a build from twenty minutes ago. That bit me while
			 * writing this project: a motion test failed, I spent time diagnosing the
			 * code, and the code was fine — the server was stale.
			 *
			 * A test suite that can pass or fail against the wrong build is worse than a
			 * slow one, because it makes every result untrustworthy. Always build fresh.
			 */
			reuseExistingServer: false
		},
		{
			/*
			 * A second server over the SAME build, with the lead store pointed at a
			 * file where it expects a directory. Every signup then fails for real —
			 * \`ENOTDIR\` from the file system, not a mock — which is the only honest
			 * way to test what a visitor sees when the server breaks.
			 *
			 * Only \`e2e/failure.e2e.ts\` talks to this port, so the server above stays
			 * healthy for everything else. Playwright starts web servers one after
			 * another, so this one starts after the build above has finished.
			 */
			command: 'pnpm exec vite preview --port 4174 --strictPort',
			port: 4174,
			env: { LEADS_DIR: 'package.json' },
			reuseExistingServer: false
		}
	],

	use: {
		baseURL: 'http://localhost:4173',
		// Only kept for failures — traces are large and mostly uninteresting when green.
		trace: 'retain-on-failure'
	},

	// …
	projects: [
		{
			name: 'desktop',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'mobile',
			use: { ...devices['Pixel 7'] }
		}
	],

	// A failing e2e test is almost never flaky in this project — fail fast rather
	// than retrying and hiding a real bug. That holds in CI as much as locally, so
	// there are no retries anywhere.
	retries: 0,
	reporter: process.env.CI ? 'github' : 'list'
});`
			},
			{
				type: 'why',
				title: 'Why not reuse a server you already have running?',
				text: 'Nearly every Playwright example ships `reuseExistingServer: !process.env.CI` — locally, attach to whatever server happens to be up; in CI, build fresh. It is faster, and it means the suite can silently test a build from twenty minutes ago. That bit me while writing this project: a motion test failed, I spent time diagnosing the code, and the code was fine — the server was stale. A test suite that can pass or fail against the wrong build is worse than a slow one, because it makes every result untrustworthy. So this config always builds fresh, everywhere.'
			},
			{
				type: 'why',
				title: 'Why two device projects',
				text: '"Works on desktop" and "works on a phone" are genuinely different claims, and this site is built mobile-first. The mobile project uses a real device profile — touch events, viewport, user agent — so the hover guards and the drawer are exercised the way a phone would exercise them. Both bugs below were **mobile-only**.'
			},
			{ type: 'h3', id: 'seo-tests', text: 'Testing the invisible' },
			{
				type: 'p',
				text: 'SEO metadata is the ideal thing to test automatically: it breaks silently, and nobody notices by using the site.'
			},
			{
				type: 'code',
				file: 'e2e/seo.e2e.ts',
				lang: 'ts',
				code: `for (const path of INDEXABLE_PAGES) {
	test(\`\${path} has complete, valid metadata\`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);

		// --- Title ---
		const title = await page.title();
		expect(title.length).toBeGreaterThan(10);
		// Google truncates around 60 characters. Longer isn't an error, but it
		// means the end of your title is invisible in the results page.
		expect(title.length).toBeLessThanOrEqual(70);

		// --- Description ---
		const description = await page
			.locator('head meta[name="description"]')
			.getAttribute('content');
		expect(description).toBeTruthy();
		expect((description ?? '').length).toBeGreaterThan(50);
		expect((description ?? '').length).toBeLessThanOrEqual(200);

		// --- Canonical: exactly one, absolute, matching this path ---
		const canonicals = page.locator('head link[rel="canonical"]');
		await expect(canonicals).toHaveCount(1);
		const canonical = await canonicals.getAttribute('href');
		expect(canonical).toMatch(/^https?:\\/\\//);
		expect(new URL(canonical ?? '').pathname).toBe(path);

		// --- Exactly one h1 ---
		// More than one is a document-outline bug; zero means the page has no
		// stated subject. Both are common and both are avoidable.
		await expect(page.locator('h1')).toHaveCount(1);

		// --- Indexable ---
		const robots = await page.locator('head meta[name="robots"]').getAttribute('content');
		expect(robots).toContain('index');
		expect(robots).not.toContain('noindex');
		// The directive that unlocks large thumbnails, and Discover eligibility.
		expect(robots).toContain('max-image-preview:large');

		// --- Open Graph ---
		for (const property of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
			await expect(page.locator(\`head meta[property="\${property}"]\`)).toHaveCount(1);
		}

		// --- Structured data parses and is a graph ---
		const ldJson = await page.locator('head script[type="application/ld+json"]').textContent();
		expect(ldJson).toBeTruthy();
		const graph = JSON.parse(ldJson ?? '{}');
		expect(graph['@context']).toBe('https://schema.org');
		expect(Array.isArray(graph['@graph'])).toBe(true);
		// Organization and WebSite appear on every page, cross-referenced by @id.
		const types = graph['@graph'].map((node: { '@type': string }) => node['@type']);
		expect(types).toContain('Organization');
		expect(types).toContain('WebSite');
		expect(types).toContain('WebPage');
	});
}`
			},
			{
				type: 'code',
				file: 'e2e/seo.e2e.ts',
				lang: 'ts',
				code: `test('every sitemap URL returns 200', async ({ request }) => {
	const body = await request.get('/sitemap.xml').then((r) => r.text());
	const locs = [...body.matchAll(/<loc>([^<]+)<\\/loc>/g)].map((match) => match[1] ?? '');

	expect(locs.length).toBeGreaterThanOrEqual(13);

	for (const loc of locs) {
		// Compare by path — the sitemap carries the configured production origin,
		// which is not the origin this test server runs on.
		const response = await request.get(new URL(loc).pathname);
		expect(response.status(), \`\${loc} should return 200\`).toBe(200);
	}
});`
			},
			{
				type: 'note',
				text: 'A companion test asserts the sitemap declares the correct XML namespace, verbatim: `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`. A wrong namespace is a single-word typo that makes every crawler reject the file as "not a sitemap" — which is exactly why it gets its own dedicated test rather than being assumed.'
			},
			{ type: 'h3', id: 'nojs', text: 'The test that justifies the architecture' },
			{
				type: 'code',
				file: 'e2e/guide-signup.e2e.ts',
				lang: 'ts',
				code: `test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the signup form still works', async ({ page }) => {
		await page.goto('/guide');

		await page.getByLabel('Email address').fill(uniqueEmail());
		await page.getByLabel('Which best describes you?').selectOption('professional');
		await page.getByRole('checkbox').check();
		await page.getByRole('button', { name: /send me the guide/i }).click();

		await page.waitForURL(/\\/guide\\/thank-you/);
		await expect(page.getByRole('heading', { name: /your guide is ready/i })).toBeVisible();
	});

	test('marketing pages render their content server-side', async ({ page }) => {
		await page.goto('/');
		// Real text in the initial HTML — which is also what a crawler sees.
		await expect(page.getByRole('heading', { level: 1 })).toContainText(/options flow/i);
		await expect(page.getByRole('link', { name: /free guide/i }).first()).toBeVisible();
	});
});`
			},
			{
				type: 'p',
				text: 'The first of these is the test that justifies using a remote `form()` rather than a `command()`; the second confirms the marketing copy is real text in the initial HTML, which is also what a crawler sees. With JavaScript disabled the page is inert HTML — no hydration, no fetch, no client handler. If the form still works, it works for people on flaky connections, on locked-down corporate browsers, and in the window before your JavaScript has finished loading.'
			},
			{ type: 'h3', id: 'failure', text: 'Testing the failure, for real' },
			{
				type: 'p',
				text: "Everything so far runs against a healthy server. But chapter 28 promised what a visitor sees when the server *breaks* — the site's own error page, inside the layout, with a way back — and a promise like that is exactly what a dependency upgrade can quietly undo. So it gets a test too. The question is how to make a production build fail on demand."
			},
			{
				type: 'p',
				text: "Look again at the `webServer` list in the config above. The second entry starts another `vite preview` over the *same* build, on port 4174, with one environment variable changed: `LEADS_DIR` points at `package.json`, a file where the lead store expects a folder. Every signup on that server fails for real, with `ENOTDIR` from the file system. Playwright starts web servers one after another, so the build has finished by the time it starts, and only this spec talks to it:"
			},
			{
				type: 'code',
				file: 'e2e/failure.e2e.ts',
				lang: 'ts',
				code: `import { test, expect, type Page } from '@playwright/test';

test.use({ baseURL: 'http://localhost:4174' });

async function submitSignup(page: Page): Promise<void> {
	await page.goto('/guide');
	await page
		.getByLabel('Email address')
		.fill(\`e2e-\${Math.random().toString(36).slice(2, 10)}@example.com\`);
	await page.getByLabel('Which best describes you?').selectOption('some');
	await page.getByRole('checkbox').check();
	await page.getByRole('button', { name: /send me the guide/i }).click();
}

async function expectErrorPage(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
	// SvelteKit's default \`handleError\` has replaced the real message — ENOTDIR and
	// a file path — with a safe one before it reached the page.
	await expect(page.getByText('Internal Error')).toBeVisible();
	await expect(page.getByText(/ENOTDIR|package\\.json/)).toHaveCount(0);
	// Inside the site's layout, with a way forward rather than a dead end.
	await expect(page.getByRole('banner')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Back to the home page' })).toBeVisible();
}

test.describe('a signup the server cannot save', () => {
	test('shows the error page', async ({ page }) => {
		await submitSignup(page);
		await expectErrorPage(page);
	});

	test.describe('without JavaScript', () => {
		test.use({ javaScriptEnabled: false });

		test('shows the same error page', async ({ page }) => {
			await submitSignup(page);
			await expectErrorPage(page);
		});
	});
});`
			},
			{
				type: 'why',
				title: 'Why a second server rather than a mock',
				text: "The usual shortcuts are all worse. Faking the response with `page.route()` means hand-writing SvelteKit's private wire format, and the test then proves only that your fake renders. A test-only switch in production code (\"if this header is set, throw\") ships a way to break your site on purpose. Breaking `LEADS_DIR` for the one server breaks every happy-path test with it. A second server costs a few lines of config and fails the way production would fail — through the real store, the real `handleError`, the real error page — while the first stays healthy for everything else. Note what the spec asserts beyond the heading: that `ENOTDIR` and the file path appear *nowhere* on the page. That is the security property from chapter 28, held by a test."
			},
			{
				type: 'p',
				text: "Three smaller specs guard promises made in earlier chapters. `e2e/header.e2e.ts` loads `/features` with JavaScript off and checks the Features link carries `aria-current=\"page\"` in the HTML the server sent (chapter 20), then opens the drawer on a phone-sized screen and closes it with a click on the backdrop. `e2e/pricing.e2e.ts` presses the right arrow on the billing toggle and expects Annual to be chosen (chapter 23). And `e2e/seo.e2e.ts` gained a test that an unknown address answers with a real 404 status, a `noindex`, and the site's error page. Each was run against the code *before* its fix and watched fail first: a test you have never seen fail has not yet proved it can."
			},
			{ type: 'h3', id: 'bug1', text: 'Bug one: 181 pixels' },
			{
				type: 'p',
				text: 'The mobile no-JS test failed with a strange message: Playwright timed out with *"element is not stable"*. The checkbox was moving.'
			},
			{
				type: 'p',
				text: 'Measuring it, the checkbox was jumping **181 pixels** shortly after page load — on mobile only. The cause: the font-fallback metrics from chapter 11. I had estimated them. Sofia Sans is 96.7% of Arial\'s width; I had guessed 92%. When the real font loaded, every line of body copy re-flowed, and on mobile — where the copy sits above the form — that shoved the whole form down the page.'
			},
			{
				type: 'why',
				title: 'This was never a test problem',
				text: 'It is Cumulative Layout Shift, one of the three Core Web Vitals, and it is a real user-facing defect: a form button moving out from under someone\'s thumb mid-tap. The test just happened to be the thing that noticed. Fixing it in the test config would have hidden a genuine bug.'
			},
			{
				type: 'p',
				text: 'The fix was to measure rather than guess, and to make the measurement repeatable:'
			},
			{
				type: 'code',
				file: 'scripts/measure-font-metrics.js',
				lang: 'js',
				code: `// Without this the measurement races the font load and silently measures the
// fallback against itself, producing a perfect 100% that is completely wrong.
await page.evaluate(() => document.fonts.ready);

const results = await page.evaluate(
	({ targets, fallback }) => {
		// …

		return targets.map((/** @type {{label:string,family:string,weight:number}} */ target) => {
			const targetWidth = width(target.family, target.weight);
			const fallbackWidth = width(fallback, target.weight);
			const metrics = vertical(target.family, target.weight);

			const sizeAdjust = targetWidth / fallbackWidth;

			return {
				label: target.label,
				sizeAdjust,
				// Overrides are relative to the already-size-adjusted em, so each
				// real metric is divided by the size adjustment.
				ascentOverride: metrics.ascent / sizeAdjust,
				descentOverride: metrics.descent / sizeAdjust,
				rawAscent: metrics.ascent,
				rawDescent: metrics.descent
			};
		});
	},
	{ targets: TARGETS, fallback: FALLBACK }
);`
			},
			{
				type: 'p',
				text: 'The `// …` stands for two small helpers that run inside the page: `width()` renders a sample string in a hidden `<span>` and measures it, and `vertical()` reads the ascent and descent from a canvas. Everything is compared against Arial — the fallback the `@font-face` rules re-describe.'
			},
			{
				type: 'p',
				text: "Add it to `package.json` beside the other scripts, then run it with the dev server up, since it measures the fonts in a real page:"
			},
			{
				type: 'code',
				file: 'package.json',
				lang: 'json',
				code: `"scripts": {
	…
	"fonts:measure": "node scripts/measure-font-metrics.js"
},`
			},
			{ type: 'terminal', code: 'pnpm run fonts:measure' },
			{ type: 'p', text: 'Shift after the fix: **0 pixels**.' },
			{ type: 'h3', id: 'bug2', text: 'Bug two: the scroll deadlock' },
			{
				type: 'p',
				text: 'The same test still failed. Same message, same place. So the font shift was real, but it was not the whole story.'
			},
			{
				type: 'p',
				text: 'The culprit was one line in `reset.css`:'
			},
			{ type: 'code', lang: 'css', file: 'the offending line', code: 'html { scroll-behavior: smooth; }' },
			{
				type: 'p',
				text: 'Playwright scrolls an element into view, then checks whether it has stopped moving. With smooth scrolling the animation is still in flight, so it sees movement, scrolls again — which **restarts the animation**. Forever.'
			},
			{
				type: 'why',
				title: 'Again, not a test problem',
				text: 'Any code that scrolls then measures hits the same deadlock. And globally, `scroll-behavior: smooth` also breaks scroll restoration: pressing back animates a long scroll to your previous position instead of restoring it instantly. It is the most popular one-liner in web development and it should not be applied globally. If you want smooth scrolling, ask for it per call: `element.scrollIntoView({ behavior: \'smooth\' })`.'
			},
			{
				type: 'p',
				text: 'Removing it fixed the test — and dropped the whole suite from 53 seconds to 23, because the scroll fight had been slowing every test that scrolled.'
			},
			{ type: 'terminal', code: 'pnpm exec playwright test --reporter=list' },
			{
				type: 'checkpoint',
				text: 'All e2e tests pass on both the desktop and mobile projects. If any fail, read the failure carefully before touching the test — twice now the test was right.'
			}
		]
	},

	/* ============================================================ 37 */
	{
		slug: 'ship-it',
		title: 'Ship it',
		summary:
			'The full verification pipeline, deployment with adapter-node, and a pre-launch checklist worth actually running.',
		goal: 'A verified build you can deploy with confidence.',
		blocks: [
			{ type: 'h3', id: 'verify', text: 'The full check' },
			{
				type: 'terminal',
				code: `pnpm run check      # svelte-check — TypeScript across .ts and .svelte
pnpm run lint       # Prettier + ESLint
pnpm run test:unit  # Vitest
pnpm exec playwright test
pnpm run build`
			},
			{
				type: 'p',
				text: 'All five should be clean. On the finished project that is 0 type errors, 0 lint errors, 30 unit tests, and 41 end-to-end tests that each run on both device profiles — 82 e2e results in all.'
			},
			{
				type: 'note',
				text: 'Run exactly these five in CI, in this order. Cheapest and fastest first, so a typo fails in seconds rather than after a four-minute browser run.'
			},
			{ type: 'h3', id: 'deploy', text: 'Deploying' },
			{
				type: 'p',
				text: '`adapter-node` produces a plain Node server in `build/`:'
			},
			{ type: 'terminal', code: 'pnpm run build\nnode build/index.js' },
			{
				type: 'note',
				text: "`adapter-node` 6 — the version that ships with SvelteKit 3 — changed three things worth knowing before you deploy. The `ORIGIN` environment variable is gone: if the server sits behind a proxy that hides the real host, set `paths: { origin: 'https://strikeflow.io' }` inside `sveltekit()` in `vite.config.ts` instead (`PORT` and `HOST` still work as before). Static files are served from a list recorded at build time, with content-hash `ETag`s and no `Last-Modified` header, so a file copied into `build/client` after the build is simply not served — runtime configuration belongs in environment variables. And static assets answer only `GET` and `HEAD`; any other method gets a 405."
			},
			{
				type: 'warn',
				text: "**On your own machine, `node build/index.js` refuses every signup, and that is the CSRF check doing its job.** With no `paths.origin` and no `PROTOCOL_HEADER`, `adapter-node` works out the site's origin from the request's `host` header and assumes **https**; the adapter docs say so in as many words. Open `http://localhost:3000` and the server believes it is `https://localhost:3000`, so the form's origin does not match and the CSRF check answers **403** — \"Cross-site remote requests are forbidden\" with JavaScript, \"Cross-site POST form submissions are forbidden\" without. Nothing is broken: behind your host's TLS the two agree. For a local smoke test of the production build, use `pnpm run preview`, which serves it over plain http (it is what the end-to-end tests run against). If you specifically want `node build` over http, build once with `paths: { origin: 'http://localhost:3000' }` in `vite.config.ts`, and take it out before you deploy."
			},
			{
				type: 'note',
				text: "Behind a proxy — and Fly, Railway and Render all put one in front of your app — the server needs one more variable. `event.getClientAddress()`, which the rate limiter from chapter 26 keys on, returns the address of whatever connected to Node, and behind a proxy that is the proxy. Tell the adapter where the real address is with `ADDRESS_HEADER`, usually `X-Forwarded-For`, and with `XFF_DEPTH` set to the number of trusted proxies in front of you (often `1`). The adapter reads that header from the *right*, skipping your own proxies, because the left end is whatever the client chose to send."
			},
			{
				type: 'why',
				title: 'Why the rate limiter makes ADDRESS_HEADER urgent',
				text: "Without it, every visitor shares the proxy's address, so they all share one rate-limit bucket. The limit of five signups a minute stops being per person and becomes per *site*: the sixth person to sign up in any minute, anywhere in the world, is told \"Too many attempts\". Nothing errors and nothing is logged; signups just quietly drop on your best traffic day. The opposite mistake is as bad: set `ADDRESS_HEADER` when there is *no* proxy and anyone can send their own `X-Forwarded-For`, pick a fresh address per request, and walk straight past the limit. Headers are easy to forge, so set these only for the proxies you actually have."
			},
			{
				type: 'p',
				text: 'That runs anywhere Node runs — a VPS, a container, Fly, Railway, Render. If you would rather deploy to a specific platform, swap the adapter in `vite.config.ts`:'
			},
			{
				type: 'code',
				lang: 'ts',
				file: 'swapping the adapter',
				code: `import adapter from '@sveltejs/adapter-vercel';     // or -cloudflare, -netlify, -static

export default defineConfig({
	plugins: [sveltekit({ adapter: adapter() })]
});`
			},
			{
				type: 'warn',
				text: "You cannot use `adapter-static` for this project as built. Two pages are server-rendered on purpose (`/guide` and `/guide/thank-you`) and the download endpoint runs per request. If you need a fully static build, replace the remote form with a third-party form service and drop the gated download."
			},
			{ type: 'h3', id: 'env-prod', text: 'Environment, before anything else' },
			{
				type: 'p',
				text: 'The project\'s `.env.example` documents every variable `src/env.ts` declares. In production, give each one a real value:'
			},
			{
				type: 'code',
				file: 'production values',
				lang: 'bash',
				code: `PUBLIC_SITE_URL="https://strikeflow.io"
LEADS_DIR="/var/lib/strikeflow/leads"
EBOOK_TOKEN_SECRET="<64 hex characters>"`
			},
			{
				type: 'p',
				text: 'For the secret, let Node generate the 64 random hex characters:'
			},
			{
				type: 'terminal',
				code: `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`
			},
			{
				type: 'p',
				text: 'Where you put those values depends on when each one is read. `LEADS_DIR` and `EBOOK_TOKEN_SECRET` are read when the server starts, and the server `adapter-node` builds does **not** load a `.env` file on its own — only `pnpm dev`, `pnpm preview` and the build do that. So either set them in your host\'s environment settings, or keep them in a `.env` file beside the build and start the server with Node\'s `--env-file` flag:'
			},
			{ type: 'terminal', code: 'node --env-file=.env build/index.js' },
			{
				type: 'p',
				text: 'Start it with plain `node build/index.js` and no host settings, and the server never sees either value: it falls back to a throwaway signing key, so every download link dies on the next restart, and it writes leads to `.data` in whatever directory it was started from.'
			},
			{
				type: 'warn',
				text: '`PUBLIC_SITE_URL` is `static: true`, which means it is **baked in at build time**. Setting it after building does nothing — you will deploy a site whose every canonical tag, Open Graph URL and sitemap entry points at localhost. Set it before you build, in `.env` (which the build does read) or in the shell that runs `pnpm run build`.'
			},
			{ type: 'h3', id: 'checklist', text: 'Pre-launch checklist' },
			{
				type: 'ol',
				items: [
					'`PUBLIC_SITE_URL` is the real domain and was set **before** the build.',
					'`EBOOK_TOKEN_SECRET` and `LEADS_DIR` reach the running server, from your host\'s settings or `node --env-file=.env` — otherwise download links die on every restart and leads land in `.data`.',
					'`curl https://yourdomain.com/robots.txt` returns the real domain in the `Sitemap:` line.',
					'`curl https://yourdomain.com/sitemap.xml` lists real URLs, and each returns 200.',
					'View source on the home page: exactly one `<title>`, one canonical, one `<h1>`.',
					'Paste a page into the [Rich Results Test](https://search.google.com/test/rich-results) and confirm the graph parses.',
					'Paste a URL into Slack or LinkedIn and check the share card renders with the right image.',
					'Run Lighthouse on mobile. Watch CLS especially — it should be 0.',
					'Tab through the home page. The skip link appears first, focus is always visible, nothing is unreachable.',
					'Turn off JavaScript and submit the signup form — on the deployed https site, or locally on `pnpm run preview`, not on a plain-http `node build` (see the warning above).',
					'Submit an expired token to `/guide/download` and confirm a 403.',
					'Behind a proxy, `ADDRESS_HEADER` (and `XFF_DEPTH`) are set, so each visitor has their own rate limit.',
					'Submit the form six times in a minute and confirm the rate limit fires — and that a second device on another network is still let through.',
					'Verify Search Console ownership and submit the sitemap.'
				]
			},
			{ type: 'h3', id: 'leads', text: 'One thing to change before real traffic' },
			{
				type: 'warn',
				text: 'The file-backed `LeadStore` is a teaching implementation. Concurrent appends from multiple processes can interleave, and there is no backup. Before real signups, write a second `LeadStore` implementation that posts to your email provider or a database. Because everything upstream depends on the **interface**, that is one line changed in `leads.ts`.'
			},
			{ type: 'h3', id: 'done', text: "What you've built" },
			{
				type: 'p',
				text: 'A production-grade marketing site, and — more usefully — a set of habits that transfer:'
			},
			{
				type: 'ul',
				items: [
					'Data separated from presentation, so structured data and visible content cannot drift',
					'A design system where nothing invents its own values',
					'Mobile-first CSS with one direction of media query',
					'Accessibility built in from the element up, not bolted on',
					'Security handled properly where it matters — timing-safe comparison, server-only modules, escaped serialisation',
					'Progressive enhancement, verified by a test rather than assumed',
					'Honesty as a design principle: about what the data can show, about what a library does, and about your own bugs'
				]
			},
			{
				type: 'note',
				text: 'That last one is worth keeping. Twice in this project a test told me something I did not want to hear, and both times the right move was to believe the test. The instinct to adjust the test until it passes is the single most expensive habit in software.'
			},
			{
				type: 'p',
				text: 'Now go build something with it.'
			}
		]
	}
];
