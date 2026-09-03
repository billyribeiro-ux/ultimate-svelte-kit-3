/**
 * @meridian/waypoint
 * ==================
 *
 * The public surface of the package. Everything a consumer may import is
 * named here; anything not named here is not part of the package, however
 * useful it looks in `src/lib`.
 *
 * Two entry points: this one, which includes the Svelte components and the
 * reactive `Route` and therefore needs Svelte; and `@meridian/waypoint/geo`,
 * which is plain functions for anybody. `package.json` `exports` draws the
 * line — the root has a `svelte` condition, `./geo` does not.
 *
 * Relative imports end in `.js` even though the files are `.ts`. That is
 * Node's ESM resolution and TypeScript's choice to follow it: the published
 * files *are* `.js`, and an import that names the source extension would break
 * the moment it is compiled.
 */

export * from './geo/index.js';
export { Route, type Leg, type Waypoint } from './route.svelte.js';
export { default as Sparkline } from './Sparkline.svelte';
export { default as Compass } from './Compass.svelte';
