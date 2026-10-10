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
		 * `no-navigation-without-resolve` has been in eslint-plugin-svelte's
		 * `recommended` set since 3.23.0, but the rule declares which SvelteKit
		 * majors it applies to, and until 3.23.1 that list stopped at 2 — so on a
		 * Kit 3 project it sat dormant, and lint was green because the rule was
		 * asleep, not absent. 3.23.1 added `3`, and the rule woke up to 22 sites
		 * here (19 `href`s and 3 `goto`s). It wants every `href` and every `goto()`
		 * wrapped in `resolve()` from `$app/paths`, so that a deployment under a
		 * base path — `/groovebox/` — rewrites every link. Right in general; off
		 * here, for reasons the rule cannot know.
		 *
		 * The app is served at the root of its origin by its own adapter, and
		 * `resolve()` is used where it earns its place: the one link to a route
		 * with a parameter (`PatternView.svelte`). Two navigations have no
		 * `resolve` spelling at all — `goto('', { shallow: true })`, which is the
		 * documented way to add a history entry without going anywhere, and
		 * `href={page.url.href}`, which reloads the address already in the bar.
		 * And `OstinatoPlayer.svelte` is a custom element that runs on *other
		 * people's* pages, where there is no SvelteKit and `$app/paths` has
		 * nothing to say. Turning the rule back on is a one-line change the day
		 * `paths.base` stops being empty.
		 */
		rules: { 'svelte/no-navigation-without-resolve': 'off' }
	}
);
