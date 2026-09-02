/**
 * The modules that exist only after a build. `../index.js` resolves each of
 * them to a generated file while bundling; these declarations let the runtime
 * be type-checked before that file exists.
 */

declare module 'SERVER' {
	export { Server } from '@sveltejs/kit';
}

declare module 'MANIFEST_PAGES' {
	export const manifest: import('@sveltejs/kit').SSRManifest;
}

declare module 'MANIFEST_API' {
	export const manifest: import('@sveltejs/kit').SSRManifest;
}

declare module 'MANIFEST_ROUTER' {
	export const manifest: import('@sveltejs/kit').SSRManifest;
}

declare module 'ENTRIES' {
	export const origin: string | null;
	export const base: string;
	export const appDir: string;
	export const prerendered: Set<string>;
	export const patterns: { pages: string[]; api: string[] };
	export const precompress: boolean;
}

declare module 'PARTITION' {
	export { pick } from '../partition.js';
}
