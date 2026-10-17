/**
 * ONE ANSWER TO "DOES THIS PERSON WANT MOTION?"
 * =============================================
 *
 * CSS reads `prefers-reduced-motion` itself and zeroes every `--dur-*` in
 * `tokens.css`. JavaScript cannot read a token, so everything that moves
 * from a script — the itinerary's FLIP, the map's `fitBounds`, the globe's
 * camera, the hero timeline — reads this instead. `MediaQuery` from
 * `svelte/reactivity` is the query as a reactive value: `current` flips
 * when the operating system setting does, with no listener to manage and
 * `false` on the server, where there is no window to ask.
 *
 * One instance for the whole app, so there is one source of truth, and a
 * component never ends up with a second query that disagrees.
 */

import { MediaQuery } from 'svelte/reactivity';

export const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');
