/**
 * SAMPLES
 * =======
 *
 * The files somebody drops on a `sample` track, decoded once and kept by track
 * id. A `SvelteMap`, because the grid reads `has(track.id)` to show whether a
 * track has anything to play; the `AudioBuffer` values are left alone, as
 * `SvelteMap` leaves all values alone.
 */

import { SvelteMap } from 'svelte/reactivity';
import type { AudioEngine } from './engine.svelte.ts';

export class SampleBank {
	readonly buffers = new SvelteMap<string, AudioBuffer>();
	readonly names = new SvelteMap<string, string>();
	#engine: AudioEngine;

	constructor(engine: AudioEngine) {
		this.#engine = engine;
	}

	/**
	 * Decode a file for a track. `decodeAudioData` needs a context, which is why
	 * this lives near the engine rather than in the pattern model.
	 *
	 * Ten seconds is the cap. A sample track plays one hit per step; a
	 * three-minute song on it is a mistake, and decoding it would hold thirty
	 * megabytes of floats for the rest of the session.
	 */
	async load(trackId: string, file: File): Promise<void> {
		const bytes = await file.arrayBuffer();
		const buffer = await this.#engine.context.decodeAudioData(bytes);

		if (buffer.duration > 10) {
			throw new RangeError(
				`"${file.name}" is ${buffer.duration.toFixed(1)}s long; samples are capped at 10s`
			);
		}

		this.buffers.set(trackId, buffer);
		this.names.set(trackId, file.name);
	}

	clear(trackId: string): void {
		this.buffers.delete(trackId);
		this.names.delete(trackId);
	}

	get(trackId: string): AudioBuffer | undefined {
		return this.buffers.get(trackId);
	}
}
