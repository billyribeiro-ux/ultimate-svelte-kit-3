/**
 * `<meridian-route>`, DEFINED
 * ===========================
 *
 * `MeridianRoute.element` is the custom element class Svelte generates for a
 * component compiled with `customElement: true` — which this folder is, in
 * both builds that load this file: the app's browser build
 * (`dynamicCompileOptions` in `vite.config.ts`) and the standalone one
 * (`vite.element.config.ts`). This module is the one entry for both places
 * that need the element: the settings page, which imports it on mount to
 * show a preview, and the standalone file a host page includes with a
 * `<script>` tag.
 *
 * WHY HERE, AND NOT `<svelte:options customElement={{ tag }}>`
 * ------------------------------------------------------------
 * The tag in the component would define the element as a side effect of
 * importing it, and it is what Svelte's docs show. It also makes the
 * component claim to be an element in every compile that does not set the
 * option — the server build, `svelte-check`, the Svelte autofixer — and
 * each of those warned `options_missing_custom_element`, which the `check`
 * script used to silence for the whole project. Naming the tag here keeps
 * the component an ordinary one everywhere, and nothing is silenced.
 *
 * `customElements.get` first, because defining one name twice throws, and a
 * dev server re-running this module on a change would do exactly that.
 */

import MeridianRoute from './MeridianRoute.svelte';

const TAG = 'meridian-route';

const element = MeridianRoute.element;
if (!element) throw new Error(`${TAG}: compiled without customElement: true`);
if (!customElements.get(TAG)) customElements.define(TAG, element);

export { MeridianRoute };
