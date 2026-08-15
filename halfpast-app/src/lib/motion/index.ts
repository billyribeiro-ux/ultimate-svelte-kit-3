/**
 * The motion system.
 *
 * One rule holds the whole thing together: **the page is complete before any of
 * this runs.** Every animated element is already in its final position in the
 * server-rendered HTML. GSAP moves things *from* somewhere, never *to*
 * somewhere. Block the script, fail the chunk, ask for reduced motion — the page
 * is still correct, just still.
 *
 *   gsap.ts         lazy loading, the reduced-motion gate, shared defaults
 *   attachments.ts  reveal, stagger, countUp, magnetic — as `{@attach}` values
 *   flip.ts         the live grid's reflow, so slots move rather than jump
 */

export { loadMotion, prefersReducedMotion } from './gsap.ts';
export { reveal, stagger, countUp, magnetic } from './attachments.ts';
export { createFlip, type FlipRunner } from './flip.ts';
