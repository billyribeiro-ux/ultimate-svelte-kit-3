/**
 * ONE ANSWER TO "DOES THIS PERSON WANT MOTION?"
 * =============================================
 *
 * CSS reads `prefers-reduced-motion` itself and zeroes every `--dur-*` in
 * `tokens.css`. JavaScript cannot read a token, so everything that moves
 * from a script — the itinerary's FLIP, the map's `fitBounds`, the globe's
 * camera, the hero timeline, the root layout's view transitions — reads
 * this instead.
 *
 * It is the framework's own answer. `svelte/motion` exports a `MediaQuery`
 * for exactly this setting, built once when that module loads: `current`
 * flips when the operating system setting does, with no listener to
 * manage, and is `false` on the server, where there is no window to ask.
 * This module used to build the same query by hand; now the line below
 * only gives the framework's instance the name the app reads, so there is
 * one query, and a component can never end up with a second one that
 * disagrees.
 */

export { prefersReducedMotion as reducedMotion } from 'svelte/motion';
