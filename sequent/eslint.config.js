/**
 * Linting, and what it is actually for here.
 *
 * TypeScript already catches the things a linter historically caught, so most
 * of what is left is either style — which Prettier settles, and which
 * `eslint-config-prettier` therefore switches off so the two never disagree —
 * or genuine correctness rules that a type checker cannot see.
 *
 * The two that earn their place in this codebase:
 *
 *   `no-floating-promises` — an un-awaited promise in a venue that writes to a
 *   log is a write nobody is waiting for and whose failure nobody will see.
 *   Where we genuinely do not want to wait (`void getMyOrders().refresh()`), the
 *   `void` operator says so out loud.
 *
 *   `no-unused-vars` with an underscore escape — an unused parameter is usually
 *   a signature that drifted, and the `_`-prefix convention is how you say "this
 *   one is deliberate" without turning the rule off everywhere.
 */

import path from 'node:path';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

// The one ignore list, shared with git. Two lists drift, and the day they do,
// the linter walks into `build/` and reports thousands of errors in minified
// output — which is exactly the failure `tsconfig.json` already had once.
const gitignorePath = path.resolve(import.meta.dirname, '../.gitignore');

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
			// typescript-eslint's own advice: the type checker already knows what is
			// defined, and this rule does not understand ambient declarations.
			'no-undef': 'off',

			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			]
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
		// Generated output and the course's own build artefacts are not ours to
		// lint. `.svelte-kit` in particular contains generated route types that
		// legitimately break several rules.
		ignores: ['**/.svelte-kit/**', '**/build/**', '**/dist/**']
	}
);
