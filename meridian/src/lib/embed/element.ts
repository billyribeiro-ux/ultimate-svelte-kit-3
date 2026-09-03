/**
 * Importing the component is what defines the element: `<svelte:options
 * customElement={{ tag: 'meridian-route' }}>` registers it with
 * `customElements.define` as a side effect of the import. This module is the
 * one entry for both places that need it — the settings page, which imports
 * it on mount to show a preview, and the standalone build in
 * `vite.element.config.ts`, which turns it into one file a host page can
 * include with a `<script>` tag.
 */

import MeridianRoute from './MeridianRoute.svelte';

export { MeridianRoute };
