/**
 * THE EXIT CRITERIA, GENERATED ONCE AND CHECKED FOREVER
 * ====================================================
 *
 * The last chapter is a checklist: every surface the coverage plan assigned
 * to a chapter, with what you should be able to do with it and the chapter
 * that taught it. Written by hand, a list like that drifts the day it is
 * finished — a surface is planned and never taught, or deferred and still
 * listed as taught — and nobody can tell from reading it.
 *
 * So it is generated, from the two documents that decided the course: the
 * plan (`plan.json`, its `chapterPlan`: which chapter teaches what) and the
 * gap list (`GAPS.md`: what was then built, deferred with a reason, or
 * dropped). Neither lives in the repository — they were working documents —
 * so this runs once, by hand, and its output is committed:
 * `content/surfaces.json`. From then on `verify.js` holds the result to the
 * course on every build:
 *
 *   - every row names a chapter that exists, and every planned chapter has
 *     at least one row;
 *   - a row marked `taught` or `declined` names a chapter whose prose
 *     carries the surface in backticks;
 *   - a row marked `deferred` is named, in backticks, in the backlog of
 *     what-i-would-do-next.
 *
 * HOW A ROW IS DECIDED
 * --------------------
 * The plan's sentences are mined for code-shaped tokens — `$state`,
 * `page.state`, `goto`, `--fail-on-warnings`, `each_key_duplicate` — and each
 * is looked up, in this order: in backticks in the prose of the chapter the
 * plan assigned it to (taught there); in backticks anywhere else in the
 * course (taught where it landed); in a deferred item of the gap list
 * (deferred, with that item's id); in the gap list's dropped table (dropped:
 * known, not built, and why). Surfaces Meridian declines on purpose are
 * `declined` when the course says why, wherever it says it. A token that
 * none of these explain stops the run and is listed: either the course
 * owes a sentence, or the token belongs in `OMIT` below with the reason it
 * is not a surface.
 *
 * Run:  node meridian-course/tools/exit-criteria.js <plan.json> <GAPS.md>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chapters } from '../content/index.js';
import { GROUPS, NOT_TEACHING, countInBackticks, hasInBackticks, proseOf } from '../content/surfaces.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [planPath, gapsPath] = process.argv.slice(2);
if (!planPath || !gapsPath) {
	console.error('usage: node tools/exit-criteria.js <plan.json> <GAPS.md>');
	process.exit(2);
}

const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const gaps = readFileSync(gapsPath, 'utf8');

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

/** Code-shaped substrings of a plan sentence. Crude on purpose: OMIT and the review catch the noise. */
const PATTERNS = [
	/\$\$?[a-zA-Z]+(?:\.[a-zA-Z]+)*(?:\(\))?/g, // runes, $$props, and $app/… paths
	/\$app\/[a-z/-]+/g,
	/#lib\b/g,
	/(?<![\w/-])svelte\/[a-z/-]+/g,
	/@sveltejs\/[a-z/-]+/g,
	/\{[#@:/][a-z]+/g, // template blocks and tags
	/\{(?:const|let)\b/g,
	/<svelte:[a-z]+>?/g,
	/\b(?:bind|use|transition|in|out|animate|style|class):[a-zA-Z]+(?:\|[a-z]+)*/g,
	/\bdata-sveltekit-[a-z-]+/g,
	/(?<![\w-])--[a-zA-Z][\w-]*/g,
	/%sveltekit\.[\w.]+%/g,
	/(?<![\w$])[a-z]+(?:_[a-z0-9]+)+\b/g, // diagnostic codes
	/(?<![\w/+-])\+?[\w-]+(?:\.[\w-]+)*\.(?:ts|js|svelte|json|md|svx|html|css|yaml)\b/g, // files, +page.svelte too
	/(?<![\w$/.%-])[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)+(?:\(\))?(?![\w-])/g, // dotted names
	/(?<![\w$.-])[a-z]+[A-Z][a-zA-Z0-9]*\b/g, // camelCase
	/(?<![\w$.-])[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b/g, // PascalCase with a second capital
	/(?<![\w$.-])[a-z][a-zA-Z0-9]*(?=\()/g, // called functions
	/\bsv (?:add|create|check|migrate)\b/g, // sv commands
	/\bdb:[a-z*]+/g, // the database scripts
	/(?<=')unchecked(?=')/g // the validation opt-out, always written quoted
];

/** Single-word names that are surfaces, which the patterns above would miss. */
const WORDS = [
	'goto', 'snapshot', 'page', 'navigating', 'updated', 'resolve', 'asset', 'match',
	'query', 'form', 'command', 'prerender', 'requested', 'read', 'mount', 'unmount', 'hydrate',
	'tick', 'untrack', 'settled', 'fork', 'flip', 'fade', 'fly', 'slide', 'draw', 'crossfade',
	'scale', 'blur', 'Tween', 'Spring', 'MediaQuery', 'SvelteMap', 'SvelteSet', 'SvelteDate',
	'SvelteURL', 'render', 'invalid', 'error', 'redirect', 'sequence', 'reroute', 'transport',
	'handle', 'handleFetch', 'handleError', 'init', 'online', 'on', 'csp', 'csrf', 'preflight'
];

/**
 * Tokens the patterns find that are not surfaces of Svelte or SvelteKit:
 * prose words, product names, the project's own symbols that a chapter
 * shows rather than names. Each with the reason it is skipped.
 */
const OMIT = new Map(
	Object.entries({
		JavaScript: 'a language', TypeScript: 'a language', GitHub: 'a product', OpenTelemetry: 'a product',
		MapLibre: 'a library, taught by name in its chapter', LayerChart: 'a library', TanStack: 'a library',
		PostgreSQL: 'a product', MySQL: 'a database', libSQL: 'a database', VoiceOver: 'a product',
		SvelteKit: 'the framework', YouTube: 'a product', OpenCode: 'a product', WebP: 'an image format',
		'e.g': 'prose', 'i.e': 'prose', set: 'too common a word to place', var: 'CSS, not a surface',
		'd.ts': 'an extension', $app: 'a prefix, not a module', ignore: 'too common a word to place',
		places: 'a project query',
		// the project's own symbols, named in a plan sentence as context rather than as a surface
		SettingsForm: 'a project component', StopDialog: 'a project component', ThemeToggle: 'a project component', PlaceSearch: 'a project component',
		asEditor: 'a project variable', mapView: 'a project variable', spanRow: 'a project snippet',
		hasField: 'a project function', getViewer: 'a project function', setViewer: 'a project function',
		hasViewer: 'a project function', saveNote: 'a project command', 'user.id': 'a project attribute name',
		// names the plan used that the code settled differently
		'reveal.ts': 'the plan’s working name; the module is `hero.ts`',
		reveal: 'the plan’s working name; the attachment is `hero`',
		'fire-and-forget.svelte.ts': 'the plan’s guess; the module is `fire-and-forget.ts`, which holds no runes',
		'prerender.handle': 'a wildcard in the plan (`prerender.handle*`); the-config names each handler',
		nested_class: 'the plan’s shorthand for `perf_avoid_nested_class`, which is a row',
		'svelte/runtime-warnings': 'a documentation page; its warnings are rows',
		'svelte/browser-support': 'a documentation page, cited by name in the-config',
		LayoutData: 'carried by the generated `LayoutProps`, which the chapters name',
		typesVersions: 'the library resolves its types through `exports` conditions and does not need the older field',
		defaultValue: 'not used: the dialog’s fields are assignable deriveds, and nothing resets its form'
	})
);

/*
 * Plan sentences whose remaining tokens all belong to one item of the gap
 * list, which names the work but not every token in the sentence: the
 * chapter, the sentence's index in `teaches`, and the item.
 */
const SENTENCE_GAPS = [
	['companions-presence-and-settings', 1, 'B4-D53'], ['companions-presence-and-settings', 3, 'B4-D53'],
	['companions-presence-and-settings', 6, 'B4-D54'], ['dates-and-money-in-a-locale', 0, 'B4-D27'],
	['dates-and-money-in-a-locale', 2, 'B4-D28'], ['deploying', 0, 'B4-D64'], ['deploying', 1, 'B4-D64'],
	['deploying', 2, 'B4-D22'], ['deploying', 4, 'B4-D64'], ['embedding-a-trip', 3, 'B4-D61'],
	['environment-and-hooks', 1, 'B4-D8'], ['environment-and-hooks', 3, 'B4-D11'],
	['explore-and-diagnostics', 0, 'B4-D59'], ['explore-and-diagnostics', 3, 'B4-D60'],
	['explore-and-diagnostics', 4, 'B4-D60'], ['explore-and-diagnostics', 5, 'B4-D40'],
	['explore-and-diagnostics', 6, 'B4-D60'], ['notes-with-tiptap-through-an-attachment', 0, 'B4-D51'],
	['notes-with-tiptap-through-an-attachment', 1, 'B4-D52'], ['notes-with-tiptap-through-an-attachment', 4, 'B4-D20'],
	['packaging-and-proving', 1, 'B4-D64'], ['security-headers-and-csp', 4, 'B4-D55'],
	['security-headers-and-csp', 5, 'B4-D58'], ['signing-in-and-up', 1, 'B4-D55'],
	['the-command-palette', 1, 'B4-D47'], ['the-headless-pattern', 0, 'B5-D3'], ['the-map', 0, 'B4-D48'],
	['the-shell', 0, 'B4-D31'], ['the-shell', 2, 'B4-D31'], ['the-shell', 3, 'B4-D30'], ['the-shell', 4, 'B4-D31'],
	['the-shell', 5, 'B4-D32'], ['the-shell', 6, 'B4-D31'], ['the-trip-page', 2, 'B4-D39'],
	['the-trip-page', 3, 'B4-D40'], ['the-trip-page', 5, 'B4-D40'], ['the-trip-page', 6, 'B4-D41'],
	['the-wrapper-pattern', 0, 'B5-D4'], ['trips-and-a-new-trip', 1, 'B4-D56'],
	['two-components-for-any-app', 2, 'B2-D1'], ['unit-and-browser-tests', 1, 'B5-D7'],
	['what-the-compiler-says', 4, 'B5-D8'], ['expenses-with-tanstack-and-layerchart', 0, 'B4-D49'],
	['expenses-with-tanstack-and-layerchart', 3, 'B4-D49'], ['trips-and-a-new-trip', 4, 'B4-D40']
];

/* Plan sentences about something the gap list dropped, and the text that finds its row there. */
const SENTENCE_DROPPED = [
	['embedding-a-trip', 1, '`QUERY` handler'],
	['the-map', 2, '`pin-drop.ts`'],
	['trips-and-a-new-trip', 3, '`draw` on RouteThumb']
];

function tokensOf(sentence) {
	const found = new Set();
	for (const pattern of PATTERNS) for (const [m] of sentence.matchAll(pattern)) found.add(m);
	for (const word of WORDS) {
		if (new RegExp(`(^|[^\\w$.])${word.replace(/\$/g, '\\$')}(?![\\w])`).test(sentence)) found.add(word);
	}
	return [...found]
		.map((t) => t.replace(/[.,;:>-]+$/, ''))
		.filter((t) => t.length > 2 && !OMIT.has(t) && !/^\d/.test(t) && !/^(?:e2e|ch\d+)$/.test(t));
}

/* ------------------------------------------------------------------ */
/* The gap list                                                        */
/* ------------------------------------------------------------------ */

/** `- B4-D30 text…`, with its indented continuation lines. */
const deferred = [];
{
	let current = null;
	for (const line of gaps.split('\n')) {
		const m = line.match(/^- (B\d-D\d+) (.*)$/);
		if (m) {
			current = { id: m[1], text: m[2] };
			deferred.push(current);
		} else if (current && /^ {2}\S/.test(line)) current.text += ' ' + line.trim().replace(/^- /, '');
		else current = null;
	}
}

/** Appendix C: `| item | why dropped | citation |`. */
const dropped = gaps
	.slice(gaps.indexOf('## Appendix C'))
	.split('\n')
	.filter((l) => l.startsWith('| ') && !l.startsWith('| Item') && !l.startsWith('|---'))
	.map((l) => l.split(' | '))
	.map(([item, why]) => ({ item: item.slice(2), why }));

/** Surfaces Meridian declines on purpose (plan §2), counted as `declined` when the course says why. */
const DECLINED = new Set([
	'$app/forms', 'use:enhance', 'applyAction', 'ActionData', 'page.form', 'fail', 'createRawSnippet',
	'fromStore', 'toStore', 'SvelteURL', 'hydrate', '{@debug', 'svelte/store', 'svelte/legacy',
	'adapter-auto', '@vite-pwa/sveltekit', 'embedded', 'pushState', 'replaceState', 'invalidateAll',
	'<svelte:component>', '<svelte:self>', 'createEventDispatcher', 'export let', 'on:'
]);

const mentions = (text, token) => text.includes('`') && hasInBackticks(text, token);

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

const APP = /^(?:goto|invalidate|refreshAll|preloadData|preloadCode|beforeNavigate|afterNavigate|onNavigate|pushState|replaceState|snapshot|disableScrollHandling|page|navigating|updated|resolve|asset|match|query|form|command|prerender|requested|read|getRequestEvent|browser|building|dev|version)\b|^page\.|^updated\.|^query\.|^form\.|^App\.|^\$app\/|^#lib|^\.\/\$types|app\.d\.ts|^Remote[A-Z]|^Requested|PageProps|LayoutProps|RouteId|RouteParams|ResolvedPathname/;
const KIT = /^@sveltejs\/|^(?:error|redirect|isHttpError|isRedirect|isValidationError|json|text|invalid|fail|sequence|defineEnvVars|defineParams|getRequest|setResponse|createReadableStream|normalizeUrl|Handle[A-Z]?\w*|ServerInit|ClientInit|RequestEvent|Builder|Adapter|EnvVarConfig|MatcherParam|ParamValue)\b|^(?:paths|csp|csrf|output|prerender|version|serviceWorker|router|files|env|alias|experimental|compilerOptions|tracing|inspector|kit)\.|linkHeaderPreload|bundleStrategy|inlineStyleThreshold|pollInterval|trustedOrigins|checkOrigin|preloadStrategy/;
const CONCEPTS = /^\+|^data-sveltekit|^(?:handle|handleFetch|handleError|handleValidationError|reroute|transport|init|load|ssr|csr|trailingSlash|entries|cookies|setHeaders|locals|platform|depends|parent|untrack)\b|^event\.|^cookies\.|^query\.(?:live|batch)|\.remote\.|isDataRequest|isSubRequest|isRemoteRequest|getClientAddress/;
const RUNES = /^\$(?:state|derived|effect|props|bindable|inspect|host)|^\{|^<svelte:|^(?:bind|use|transition|in|out|animate|style|class):|\{@|^on[a-z]+$/;
const SVELTE = /^svelte(?:\/|$)|^(?:mount|unmount|hydrate|tick|untrack|settled|fork|flushSync|createContext|getContext|setContext|getAllContexts|createRawSnippet|createSubscriber|createAttachmentKey|fromAction|onMount|onDestroy|getAbortSignal|hydratable|Tween|Spring|MediaQuery|SvelteMap|SvelteSet|SvelteDate|SvelteURL|SvelteURLSearchParams|prefersReducedMotion|fade|fly|slide|draw|crossfade|scale|blur|flip|on|online|render|Snippet|Component|ComponentProps|MountOptions|TransitionConfig|AnimationConfig|Attachment|Action|ActionReturn|cubicOut|cubicIn|fromStore|toStore)\b/;
const DIAG = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;
const CLI = /^--|^sv\b|svelte-check|svelte-migrate|^@sveltejs\/mcp|AGENTS\.md|CLAUDE\.md|\.mcp\.json|autofixer|list-sections|get-documentation|svelte-autofixer|^defineAddon|sv-utils/;

function groupOf(token) {
	if (DIAG.test(token)) return GROUPS[5];
	if (CLI.test(token)) return GROUPS[6];
	if (RUNES.test(token)) return GROUPS[3];
	if (APP.test(token)) return GROUPS[0];
	if (CONCEPTS.test(token)) return GROUPS[2];
	if (KIT.test(token)) return GROUPS[1];
	if (SVELTE.test(token)) return GROUPS[4];
	return GROUPS[7];
}

/* ------------------------------------------------------------------ */
/* Classify                                                            */
/* ------------------------------------------------------------------ */

const prose = new Map(chapters.map((c) => [c.slug, proseOf(c)]));
/*
 * Where a surface may be found when it is not where the plan put it. Not the
 * chapters that only mention — and not the two catalogues, the compiler's
 * messages and the migration tables, which name hundreds of surfaces in
 * passing: there a surface counts as taught only when the plan put it there.
 */
const CATALOGUES = new Set(['what-the-compiler-says', 'migrating-a-major']);
const order = chapters.map((c) => c.slug).filter((slug) => !NOT_TEACHING.has(slug) && !CATALOGUES.has(slug));

/** The chapter that names `token` in backticks most often — where it is taught, when not where planned. */
function mostMentions(token) {
	let best = null;
	let most = 0;
	// A diagnostic code is taught where the plan sent all of them, the compiler's chapter;
	// `sv migrate` where the plan sent upgrades.
	const where = DIAG.test(token)
		? [...order, 'what-the-compiler-says']
		: /^sv migrate/.test(token)
			? [...order, 'migrating-a-major']
			: order;
	for (const slug of where) {
		const n = countInBackticks(prose.get(slug), token);
		if (n > most) [best, most] = [slug, n];
	}
	return best;
}

const rows = [];
const unexplained = [];
const seen = new Set();

/*
 * The plan's entries name a chapter by slug, an added one with a note after
 * it ("the-toolchain (new; part 0, …)"). The capstone's own entry plans this
 * list, not surfaces, so it is not a row's chapter.
 */
const slugOf = (entry) => entry.chapter.split(' ')[0];
/*
 * Two entries plan prose rather than surfaces: the capstone's own (this
 * list) and what-we-are-building's (the product description). They are not
 * planned chapters of the checklist.
 */
const PROSE_ONLY = new Set(['the-exit-criteria', 'what-we-are-building']);
const PLANNED = plan.chapterPlan.map(slugOf).filter((slug) => !PROSE_ONLY.has(slug));

for (const entry of plan.chapterPlan) {
	const planned = slugOf(entry);
	if (PROSE_ONLY.has(planned)) continue;
	if (!prose.has(planned)) throw new Error(`plan names a chapter the course does not have: ${planned}`);
	for (const sentence of entry.teaches) {
		for (const token of tokensOf(sentence)) {
			const key = `${planned}\u0000${token}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const where =
				!NOT_TEACHING.has(planned) && hasInBackticks(prose.get(planned), token)
					? planned
					: mostMentions(token);
			if (where) {
				rows.push({ planned, surface: token, chapter: where, status: DECLINED.has(token) ? 'declined' : 'taught', group: groupOf(token) });
				continue;
			}
			const later = deferred.find((d) => mentions(d.text, token));
			if (later) {
				rows.push({ planned, surface: token, chapter: planned, status: 'deferred', group: groupOf(token), gap: later.id });
				continue;
			}
			const gone = dropped.find((d) => mentions(d.item, token));
			if (gone) {
				rows.push({ planned, surface: token, chapter: planned, status: 'dropped', group: groupOf(token), reason: gone.why });
				continue;
			}
			const index = entry.teaches.indexOf(sentence);
			const owed = SENTENCE_GAPS.find(([c, i]) => c === planned && i === index);
			if (owed) {
				rows.push({ planned, surface: token, chapter: planned, status: 'deferred', group: groupOf(token), gap: owed[2] });
				continue;
			}
			const cut = SENTENCE_DROPPED.find(([c, i]) => c === planned && i === index);
			if (cut) {
				const row = dropped.find((d) => d.item.includes(cut[2]));
				if (!row) throw new Error(`no dropped row matches ${cut[2]}`);
				rows.push({ planned, surface: token, chapter: planned, status: 'dropped', group: groupOf(token), reason: row.why });
				continue;
			}
			unexplained.push(`${planned} [${entry.teaches.indexOf(sentence)}]: ${token}   ← “${sentence.slice(0, 70)}…”`);
		}
	}
}

if (process.argv.includes('--report')) {
	const count = (s) => rows.filter((r) => r.status === s).length;
	console.log(`${rows.length} rows: ${count('taught')} taught, ${count('declined')} declined, ${count('deferred')} deferred, ${count('dropped')} dropped; ${unexplained.length} unexplained`);
	console.log(unexplained.join('\n'));
	process.exit(0);
}

if (unexplained.length > 0 && !process.argv.includes('--backlog')) {
	console.error(`${unexplained.length} planned surface(s) the course neither teaches nor defers:\n${unexplained.join('\n')}`);
	process.exit(1);
}

/* ------------------------------------------------------------------ */
/* The backlog                                                         */
/* ------------------------------------------------------------------ */

/*
 * Every deferred item, for the backlog in what-i-would-do-next: what it is
 * and why it waits, split at the item's first sentence. The gap list was a
 * working document, so its private shorthand is translated on the way —
 * "plan §7" and "brief §5.2" become what they were, a chapter's slug becomes
 * a chapter reference — and an item that still holds a chapter number by
 * hand stops the run, because that number would be wrong in the course.
 */
const slugs = chapters.map((c) => c.slug).sort((a, b) => b.length - a.length);

/** The gap list's private references, and what each one was. */
const TRANSLATE = [
	[/ through B1-6 instead\./g, ' through `pnpm run lint:svelte` instead.'],
	[/can teach the compiler's/g, 'teaches the compiler’s'],
	[/Teach the option in prose in B1-13\./g, 'Chapter {{the-config}} names the option.'],
	[/`ClientInit` stays with B4-D\./g, '`ClientInit` stays with B4-D7.'],
	[/This is capstone exercise (\d+)/g, 'This is exercise $1 in chapter {{the-exit-criteria}}'],
	[/capstone exercise (\d+)/g, 'exercise $1 in chapter {{the-exit-criteria}}'],
	[/\s*\(feature \d\)/g, ''],
	[/, kit types:\d+\)/g, ', in SvelteKit’s types)'],
	[/\(`part5\.js:\d+`\)/g, '(chapter {{the-design-system}})'],
	[/the plan itself defers/g, 'the original plan deferred'],
	[/Note a \*\*plan error\*\*:/g, 'Note an error in the original plan:'],
	[/the largest single item in the plan/g, 'the largest single item on this list'],
	[/beyond the 29 MIGRATION_TASKS boxes/g, 'beyond the twenty boxes of the migration record'],
	[/ The stale comment at `live\.remote\.ts:34` is fixed in B5-7\./g, ''],
	[/first in line after this batch/g, 'first in line'],
	[/next after this batch/g, 'next in line'],
	[/B4-4 teaches `snapshot\(\)`/g, 'Chapter {{trips-and-a-new-trip}} teaches `snapshot()`'],
	[/The form-actions table lands in B4-7/g, 'The form-actions table is in chapter {{remote-functions-the-writes}}'],
	[/The-toolchain's catalogue table/g, 'The catalogue table in chapter {{the-toolchain}}'],
	[/`RouteThumb` \./g, '`RouteThumb`.'],
	[/Not in any batch's scope; three sentences\./g, 'Three sentences, and nobody has written them yet.'],
	// the dropped table's shorthand
	[/Not in brief §5\.2's exhaustive "What animates, exactly"/g, 'Not in the design brief’s exhaustive list of what animates'],
	[/^Brief: /g, 'The design brief: '],
	[/Declined by the plan; named in prose where the plan says/g, 'Declined from the start: named in prose where it matters, never written as code'],
	[/A DPE pass kept the peer range/g, 'A review kept the library’s peer range'],
	[/Possible \(`ENDPOINT_METHODS` includes it\)/g, 'Possible — SvelteKit accepts a `QUERY` handler —']
];

function clean(text, id) {
	let out = text;
	for (const [pattern, replacement] of TRANSLATE) out = out.replace(pattern, replacement);
	// "goes with D8" inside a B4 item means B4-D8, a row of the same table.
	const batch = id.slice(0, 2);
	out = out.replace(/(?<![\w-])D(\d+)\b/g, `${batch}-D$1`);
	out = out
		.replace(/\s*\(prose(?:; ([^)]*))?\)/g, (_, rest) => (rest ? ` (${rest})` : ''))
		.replace(/plan §7 open question/g, 'an open question')
		.replace(/\(plan §\d+(?:\.\d+)?(?: \(\d\))?\)/g, '')
		.replace(/the plan's/g, 'the original plan’s')
		.replace(/`?DESIGN-BRIEF\.md`? ?§[\d.]+/g, 'the design brief')
		.replace(/brief §[\d.]+/g, 'the design brief')
		.replace(/\s*\(B4-D, notes\)/g, '')
		.replace(/\s*\(ch\d+\)/g, '')
		.replace(/`meridian\//g, '`');
	for (const slug of slugs) {
		out = out.replace(new RegExp(`(?<![\\w{-])${slug}(?![\\w}-])`, 'g'), `chapter {{${slug}}}`);
	}
	out = out.replace(/(^|[.;:] )chapter \{\{/g, (_, before) => `${before}Chapter {{`);
	if (/\b([Cc]h\.|[Cc]hapters?)\s+\d/.test(out)) throw new Error(`a chapter number by hand in the backlog: ${out}`);
	if (/\bB\d-\d+\b|\bbatch\b|\bplan §/.test(out)) throw new Error(`a private reference left in the backlog: ${out}`);
	return out.trim();
}

function split(text) {
	// The first ". " that is not inside backticks ends the "what".
	let inCode = false;
	for (let i = 0; i < text.length - 1; i += 1) {
		if (text[i] === '`') inCode = !inCode;
		if (!inCode && text[i] === '.' && text[i + 1] === ' ' && !/\b(?:e\.g|i\.e|vs)$/.test(text.slice(0, i))) {
			return { what: text.slice(0, i + 1), why: text.slice(i + 2) };
		}
	}
	return { what: text, why: '' };
}

const backlog = deferred.map((d) => ({ id: d.id, ...split(clean(d.text, d.id)) }));

if (process.argv.includes('--backlog')) {
	for (const b of backlog) console.log(`${b.id} | ${b.what} || ${b.why}`);
	process.exit(0);
}

/*
 * One row per surface. The plan names some surfaces in several chapters;
 * the row keeps every chapter that planned it, and the strongest status any
 * of them reached — taught beats declined beats deferred beats dropped —
 * because a surface taught in one chapter is taught.
 */
const RANK = { taught: 0, declined: 1, deferred: 2, dropped: 3 };
const bySurface = new Map();
for (const row of rows) {
	const kept = bySurface.get(row.surface);
	if (!kept) bySurface.set(row.surface, { ...row, planned: [row.planned] });
	else {
		if (!kept.planned.includes(row.planned)) kept.planned.push(row.planned);
		if (RANK[row.status] < RANK[kept.status]) Object.assign(kept, { ...row, planned: kept.planned });
	}
}
/** What the row lets a reader claim, by status. */
const STATEMENT = {
	taught: 'use it, and say why Meridian does',
	declined: 'say why Meridian does not use it',
	deferred: 'say what it would take; it is on the backlog',
	dropped: 'say why it was not built'
};
const unique = [...bySurface.values()].map(({ planned, surface, chapter, status, group, gap, reason }) =>
	Object.fromEntries(
		Object.entries({
			surface,
			status,
			statement:
				status === 'taught' && chapter === 'migrating-a-major'
					? 'read it in older code, and say what replaced it'
					: status === 'taught' && DIAG.test(surface)
						? 'read it, and say what to change'
						: STATEMENT[status],
			group,
			chapter,
			planned,
			gap,
			reason: reason && clean(reason, 'B0')
		}).filter(([, v]) => v !== undefined)
	)
);
unique.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || order.indexOf(a.chapter) - order.indexOf(b.chapter) || a.surface.localeCompare(b.surface));

writeFileSync(join(root, 'content', 'backlog.json'), JSON.stringify(backlog, null, '\t') + '\n');

writeFileSync(
	join(root, 'content', 'surfaces.json'),
	JSON.stringify({ plannedChapters: PLANNED, rows: unique }, null, '\t') + '\n'
);
console.log(`content/surfaces.json: ${unique.length} surfaces; content/backlog.json: ${backlog.length} items`);
