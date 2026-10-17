/**
 * The modules that exist only after a build. `../index.js` resolves each of
 * them to a generated file while bundling; these declarations let the runtime
 * be type-checked before that file exists.
 *
 * The three servers are *not* here. They used to be — `SERVER_PAGES` and
 * friends, each declaring a `server` — until `handler.js` started loading them
 * by path at run time instead, for the reason it gives. A dynamic `import()`
 * of a computed path has no module name to declare, so `handler.js` types the
 * result where it lands. What `builder.generateServerInstance` writes is still
 * one export, a `server` with `init` and `respond`; the manifest inside it is
 * SvelteKit's own business — `SSRManifest` stopped being a public type in 3.0
 * — so nothing here names it either.
 */

declare module 'ENTRIES' {
	export const origin: string | null;
	export const base: string;
	export const appDir: string;
	/** The deployables, in the order `handler.js` tries them. */
	export const functions: readonly ['pages', 'api', 'router'];
	export const prerendered: Set<string>;
	export const patterns: { pages: string[]; api: string[] };
	export const precompress: boolean;
	/** Set on every static file and prerendered page — responses no hook ever sees. */
	export const headers: Record<string, string>;
}

declare module 'PARTITION' {
	export { pick } from '../partition.js';
}
