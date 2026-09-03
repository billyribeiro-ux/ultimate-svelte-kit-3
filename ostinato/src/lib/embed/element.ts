/**
 * Importing the component is what defines the element: `<svelte:options
 * customElement={{ tag: 'ostinato-player' }}>` registers it with
 * `customElements.define` as a side effect of the import. This module exists
 * so that the app (`onMount(() => import(...))` on the embed page) and the
 * standalone build (`vite.embed.config.ts`) have the same entry.
 */

import OstinatoPlayer from './OstinatoPlayer.svelte';

export { OstinatoPlayer };
