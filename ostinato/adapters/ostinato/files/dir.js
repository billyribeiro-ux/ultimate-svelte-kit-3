/*
 * Where the build is. Kept in its own module — and, by the bundling config in
 * `../index.js`, its own chunk at the top of `build/` — because it answers from
 * its own location.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const dir = path.dirname(fileURLToPath(import.meta.url));
