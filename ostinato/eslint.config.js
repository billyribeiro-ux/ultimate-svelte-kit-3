import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		/*
		 * `prefer-svelte-reactivity` is right almost everywhere and wrong in one
		 * place.
		 *
		 * The rule flags a plain `Map` or `Set` in a rune-enabled file and suggests
		 * `SvelteMap`/`SvelteSet`. That is the correct advice for anything a
		 * component renders from. The scheduler's voice pool is not rendered from:
		 * it is read and written inside a 25ms timer that runs for the whole time a
		 * pattern plays, and a reactive proxy around it would write a signal per
		 * voice per tick to notify nobody. The file's own header says the same at
		 * more length; turning the rule off for it is the honest way to record that
		 * the exception is deliberate.
		 */
		files: ['src/lib/audio/scheduler.svelte.ts'],
		rules: { 'svelte/prefer-svelte-reactivity': 'off' }
	},
	{
		// Test helpers and specs may reach for whatever is clearest.
		files: ['**/*.spec.ts', '**/*.test.ts'],
		rules: { 'svelte/prefer-svelte-reactivity': 'off' }
	},
	{
		/*
		 * `no-navigation-without-resolve` is on — it is in the recommended set —
		 * and every internal `href` and `goto()` goes through `resolve()` from
		 * `$app/paths`. The base path is the reason the rule gives, and the
		 * smaller one here: this app is served at the root of its origin. The
		 * bigger one is that `resolve('/(app)/p/[id]', { id })` names a route *id*,
		 * checked against the route table, so renaming a folder is a type error
		 * rather than a link that 404s in production.
		 *
		 * The few links with nothing to resolve say so on the line, with an
		 * `eslint-disable-next-line` and the reason: `goto('', { shallow: true })`,
		 * which adds a history entry without going anywhere; the reload banner's
		 * `href={page.url.href}`; a `blob:` download; and vanity addresses, which
		 * are not routes until the `reroute` hook makes them one.
		 *
		 * The one folder it is off for is `src/lib/embed/`: a custom element that
		 * runs on *other people's* pages, where there is no SvelteKit and
		 * `$app/paths` has nothing to say. Its link is to this app's origin,
		 * spelled out, which is exactly what it should be.
		 */
		files: ['src/lib/embed/**'],
		rules: { 'svelte/no-navigation-without-resolve': 'off' }
	}
);
