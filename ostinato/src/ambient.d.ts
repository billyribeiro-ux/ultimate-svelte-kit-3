/**
 * The virtual module `adapters/ostinato` provides through its `vite.plugins.pre`
 * entry. TypeScript cannot see into a Vite plugin, so the shape is declared here.
 */
declare module 'virtual:adapter' {
	export const name: string;
	export const entries: readonly ['pages', 'api', 'router'];
	export const precompress: boolean;
}
