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
		 * `prefer-svelte-reactivity` is right almost everywhere and wrong in the
		 * engine.
		 *
		 * The rule flags a plain `Map` or `Set` in a rune-enabled file and
		 * suggests `SvelteMap`/`SvelteSet`. That is the correct advice for
		 * anything a component renders from. The dependency graph is not rendered
		 * from: it is read and rewritten on every keystroke for every cell that
		 * depends on the one being edited, and a reactive proxy around it would
		 * be a signal write per edge to notify nobody. The engine publishes one
		 * version number when a batch finishes; that is what the grid watches.
		 */
		files: ['src/lib/engine/**/*.svelte.ts'],
		rules: { 'svelte/prefer-svelte-reactivity': 'off' }
	},
	{
		// Test helpers and specs may reach for whatever is clearest.
		files: ['**/*.spec.ts', '**/*.test.ts'],
		rules: { 'svelte/prefer-svelte-reactivity': 'off' }
	}
);
