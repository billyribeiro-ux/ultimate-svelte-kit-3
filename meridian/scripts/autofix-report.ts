/**
 * THE AUTOFIXER, OVER EVERY COMPONENT
 * ===================================
 *
 * `pnpm run lint:svelte`, and a step of `pnpm run verify`. The Svelte
 * autofixer is the static analysis behind the Svelte MCP server's
 * `svelte-autofixer` tool: the compiler's own warnings plus checks for the
 * mistakes people make with runes — an `$effect` that writes state a
 * `$derived` could compute, a `bind:this` an attachment would do better.
 * Agents run it on the code they write. This runs it on all of it.
 *
 * It reports two kinds of finding, and they are treated differently:
 *
 *   - an ISSUE is the compiler or the linter saying the code is wrong. It is
 *     never accepted: the answer is to fix it, the same as for a warning from
 *     `svelte-check --fail-on-warnings`.
 *   - a SUGGESTION is advice — "check whether this could be a `$derived`".
 *     Some of it is right and gets followed. The rest has been checked and
 *     declined, and `.autofixer-accepted.json` says where and why: each entry
 *     names a file, a piece of the suggestion's text, how many times that
 *     file earns it, and the reason. A new suggestion fails here until
 *     somebody either follows it or writes down why not.
 *
 * The count is exact in both directions. One more than accepted is a new
 * effect nobody has looked at; one fewer is an entry that outlived its code,
 * and a list of exceptions that only ever grows stops meaning anything.
 *
 * It imports the same function the `svelte-mcp svelte-autofixer` command
 * calls, rather than spawning that command once per file: the command prints
 * its result with `console.log`, which is Node's inspect format and not JSON,
 * and the package exports the function with its types.
 *
 *   node scripts/autofix-report.ts
 */

import { globSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelteAutofixer } from '@sveltejs/mcp';
import * as v from 'valibot';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The app compiles with `experimental.async` (`vite.config.ts`); the library
 * does not (its own `vite.config.ts`), because a published component cannot
 * assume its consumer turned it on. The autofixer has to be told which.
 */
const SOURCES = [
	{ dir: 'src', async: true },
	{ dir: 'packages/waypoint/src', async: false }
] as const;

const Acceptance = v.strictObject({
	file: v.pipe(v.string(), v.minLength(1)),
	suggestion: v.pipe(v.string(), v.minLength(1)),
	count: v.pipe(v.number(), v.integer(), v.minValue(1)),
	reason: v.pipe(v.string(), v.minLength(20))
});

const AcceptedFile = v.strictObject({
	$comment: v.optional(v.string()),
	accepted: v.array(Acceptance)
});

type Acceptance = v.InferOutput<typeof Acceptance>;

const { accepted } = v.parse(
	AcceptedFile,
	JSON.parse(readFileSync(join(root, '.autofixer-accepted.json'), 'utf8'))
);

const files = SOURCES.flatMap(({ dir, async }) =>
	globSync([`${dir}/**/*.svelte`, `${dir}/**/*.svelte.ts`], { cwd: root })
		.map((file) => file.replaceAll('\\', '/'))
		.sort()
		.map((file) => ({ file, async }))
);

const results = await Promise.all(
	files.map(async ({ file, async }) => ({
		file,
		...(await svelteAutofixer({
			code: await readFile(join(root, file), 'utf8'),
			desired_svelte_version: 5,
			async,
			filename: file
		}))
	}))
);

const problems: string[] = [];
const claimed = new Map<Acceptance, number>();
let suggestions = 0;

for (const { file, issues, suggestions: advice } of results) {
	for (const issue of issues) problems.push(`${file}\n  issue: ${issue}`);

	for (const text of advice) {
		suggestions += 1;
		const entry = accepted.find((a) => a.file === file && text.includes(a.suggestion));
		if (entry) claimed.set(entry, (claimed.get(entry) ?? 0) + 1);
		else problems.push(`${file}\n  suggestion nobody has answered: ${text}`);
	}
}

for (const entry of accepted) {
	const found = claimed.get(entry) ?? 0;
	if (found !== entry.count) {
		problems.push(
			`${entry.file}\n  accepted ${entry.count} × "${entry.suggestion}", found ${found}: ` +
				(found > entry.count
					? 'read the new one, then follow it or raise the count with a reason'
					: 'lower the count, or delete the entry if none are left')
		);
	}
}

console.log(
	`autofixer: ${files.length} files, ` +
		`${results.reduce((n, r) => n + r.issues.length, 0)} issues, ` +
		`${suggestions} suggestions, ${accepted.length} accepted entries`
);

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}

console.log('every suggestion is either followed or answered in .autofixer-accepted.json');
