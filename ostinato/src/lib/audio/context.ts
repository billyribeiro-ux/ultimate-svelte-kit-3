/**
 * THE STUDIO, AS CONTEXT
 * ======================
 *
 * The engine, the scheduler and the sample bank are created once, by the
 * studio page, and every component under it — the grid, the mixer, the
 * transport, the meters — reaches them through context rather than through
 * props threaded five levels deep.
 *
 * `createContext` returns three functions. `get` throws if nothing has
 * provided a value, which is the behaviour you want from a component that
 * cannot work without an engine. `has` exists (since Svelte 5.57) for the one
 * that *can*: the embeddable player is its own root with nobody above it, and
 * asks before it reads.
 *
 * WHY NOT A MODULE-LEVEL SINGLETON
 * --------------------------------
 * `export const engine = new AudioEngine()` would work in the browser and be
 * wrong on the server, where one module instance is shared by every request.
 * There is no per-user data in an engine, so the harm would be small here —
 * but the habit is the thing, and context is the habit.
 */

import { createContext } from 'svelte';
import type { AudioEngine } from './engine.svelte.ts';
import type { SampleBank } from './samples.svelte.ts';
import type { Scheduler } from './scheduler.svelte.ts';

export interface Studio {
	engine: AudioEngine;
	scheduler: Scheduler;
	samples: SampleBank;
}

const [get, set, has] = createContext<Studio>();

export const getStudio = get;
export const setStudio = set;
export const hasStudio = has;
