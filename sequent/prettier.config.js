/**
 * Formatting, so nobody argues about it.
 *
 * The settings are not defaults, and each one is a deliberate difference:
 *
 *   `useTabs` — a tab is one character that every reader can size to their own
 *   taste. Somebody who needs eight columns to see the indentation gets eight;
 *   somebody on a narrow screen gets two. Spaces make that decision for them.
 *
 *   `singleQuote` — matches the rest of the codebase, which matters more than
 *   which quote is objectively better (neither is).
 *
 *   `trailingComma: 'none'` — this is a Node-native TypeScript project run with
 *   type stripping, and a trailing comma in a call argument list is one of the
 *   few places the syntax genuinely differs between parsers. Not having them
 *   removes the question.
 *
 *   `printWidth: 100` — 80 was chosen for terminals that no longer exist, and it
 *   forces SQL template literals and long type signatures to wrap in places that
 *   make them harder to read, not easier.
 *
 * @type {import("prettier").Config}
 */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	plugins: ['prettier-plugin-svelte'],
	overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }]
};

export default config;
