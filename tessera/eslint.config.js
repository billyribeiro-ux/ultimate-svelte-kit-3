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
		 * `prefer-svelte-reactivity` is right almost everywhere and wrong here.
		 *
		 * The rule flags a plain `Map` or `Set` in a rune-enabled file and tells you
		 * to use `SvelteMap`/`SvelteSet`. That is good advice for state a component
		 * renders from. `document.svelte.ts` deliberately holds two representations:
		 * the CRDT model, in plain collections, and a reactive projection of it, in
		 * `SvelteMap`s. Making the model reactive would put a proxy around every
		 * tombstone, every add-stamp and every character of every label — structures
		 * no component ever reads — and pay a signal write for each one on every
		 * frame of a drag.
		 *
		 * The file's own header explains the split at length. Turning the rule off
		 * for this one file is the honest way to record that the exception is
		 * deliberate; scattering `eslint-disable` comments across nine lines would
		 * say it nine times and less clearly.
		 */
		files: ['src/lib/board/document.svelte.ts'],
		rules: { 'svelte/prefer-svelte-reactivity': 'off' }
	},

	{
		// Test helpers and specs may reach for whatever is clearest.
		files: ['**/*.spec.ts', 'src/lib/crdt/testing.ts'],
		rules: { 'svelte/prefer-svelte-reactivity': 'off' }
	}
);
