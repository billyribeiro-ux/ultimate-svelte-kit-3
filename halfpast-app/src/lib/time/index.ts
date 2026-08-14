/**
 * The time layer.
 *
 * Everything in this app that touches a clock goes through here, and nothing
 * outside it is allowed to call `new Date()` on a stored value and start reading
 * hours off it. Keeping that boundary is what makes the twice-yearly clock
 * changes a solved problem rather than a recurring incident.
 *
 * Read the files in this order the first time:
 *
 *   grid.ts          the five-minute cells the diary is made of
 *   zone.ts          wall-clock time ⇄ real time, and what happens when clocks move
 *   availability.ts  the engine: rules + diary + service ⇒ bookable start times
 *   format.ts        instants ⇒ words a customer can read
 */

export * from './grid.ts';
export * from './zone.ts';
export * from './availability.ts';
export * from './format.ts';
