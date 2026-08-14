import { part1 } from './part1.js';
import { part2 } from './part2.js';
import { part3 } from './part3.js';

/**
 * The full chapter list, in order.
 *
 * Split across three files purely so each stays a manageable size — the builder
 * treats this as one flat array.
 */
export const chapters = [...part1, ...part2, ...part3];
