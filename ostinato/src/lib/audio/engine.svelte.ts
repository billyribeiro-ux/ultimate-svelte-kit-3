/**
 * THE AUDIO ENGINE
 * ================
 *
 * One `AudioContext`, one master fader, one analyser for the meters, and a
 * channel strip per track — gain, pan, and an analyser of its own — created
 * the first time anybody asks for it.
 *
 * WHY THE CONTEXT IS CREATED LAZILY
 * ---------------------------------
 * Browsers refuse to start audio without a user gesture, and they are right to.
 * An `AudioContext` created at page load sits in the `suspended` state until
 * something the person did — a click, a key — resumes it. So the context is
 * created on the first *use*, which is always inside a click handler, and the
 * `state` getter below tells the interface whether sound can currently happen.
 *
 * THAT `state` GETTER IS THE INTERESTING PART
 * -------------------------------------------
 * `AudioContext.state` is not Svelte state. It is a property on a browser
 * object that changes when the browser decides — a tab goes to the background,
 * headphones are unplugged — and announces it with a `statechange` event.
 * `createSubscriber` is the bridge: it hands us an `update` function, and any
 * effect that read `engine.state` re-runs when we call it. The listener is
 * attached only while something is actually watching, and removed when nothing
 * is, which is the difference between a subscription and a leak.
 */

import { createSubscriber, SvelteMap } from 'svelte/reactivity';
import { on } from 'svelte/events';
import type { Track } from '#lib/pattern/model.ts';

export interface Channel {
	/** Connect a voice here. */
	input: GainNode;
	gain: GainNode;
	panner: StereoPannerNode;
	/** For the level meter. Small FFT: a meter wants a level, not a spectrum. */
	analyser: AnalyserNode;
}

export class AudioEngine {
	#context: AudioContext | null = null;
	#master: GainNode | null = null;
	#analyser: AnalyserNode | null = null;
	#update: (() => void) | null = null;
	#subscribe: () => void;
	#volume = $state(0.9);

	/**
	 * `SvelteMap`, because a component does read from it: the diagnostics page
	 * lists the live channels, and the mixer asks `has(track.id)` to decide
	 * whether to draw a meter. The values are audio nodes and are never proxied
	 * — `SvelteMap` makes the *map* reactive, not what is in it.
	 */
	readonly channels = new SvelteMap<string, Channel>();

	constructor() {
		this.#subscribe = createSubscriber((update) => {
			this.#update = update;
			return () => {
				this.#update = null;
			};
		});
	}

	/** The context, created on first use — which must be inside a user gesture. */
	get context(): AudioContext {
		if (this.#context) return this.#context;

		const ctx = new AudioContext({ latencyHint: 'interactive' });
		this.#context = ctx;

		this.#master = ctx.createGain();
		this.#master.gain.value = this.#volume;
		this.#analyser = ctx.createAnalyser();
		this.#analyser.fftSize = 2048;
		this.#master.connect(this.#analyser).connect(ctx.destination);

		// Whatever is watching `state` re-runs on every change, and once now,
		// because going from "no context" to "a suspended one" is itself a change.
		on(ctx, 'statechange', () => this.#update?.());
		this.#update?.();

		return ctx;
	}

	/**
	 * `'idle'` before the context exists, then whatever the browser says.
	 * Reactive when read inside an effect or a template, plain when not.
	 */
	get state(): AudioContextState | 'idle' {
		this.#subscribe();
		return this.#context?.state ?? 'idle';
	}

	/** Seconds on the audio clock; the only clock the scheduler trusts. */
	get now(): number {
		return this.#context?.currentTime ?? 0;
	}

	get master(): GainNode {
		void this.context;
		return this.#master!;
	}

	get analyser(): AnalyserNode {
		void this.context;
		return this.#analyser!;
	}

	get volume(): number {
		return this.#volume;
	}

	/*
	 * A setter rather than an `$effect` that watches `volume` and pokes the gain
	 * node. The value and its consequence change in the same place, there is
	 * nothing to synchronise, and `setTargetAtTime` gives the fader a twenty
	 * millisecond glide so it never clicks.
	 */
	set volume(value: number) {
		this.#volume = Math.min(1, Math.max(0, value));
		if (this.#master && this.#context) {
			this.#master.gain.setTargetAtTime(this.#volume, this.#context.currentTime, 0.02);
		}
	}

	/**
	 * The channel strip for a track, made on first request.
	 *
	 * `getOrInsertComputed` (Svelte 5.57) is exactly this operation: look it up,
	 * and if it is not there, build it *once* and keep it. The old spelling was
	 * `get`, an `if`, a `new` and a `set`, and the old bug was building a second
	 * strip because two callers raced through the `if` — a track with two
	 * outputs plays at double volume, which is a good bug to never write again.
	 */
	channel(track: Pick<Track, 'id' | 'gain' | 'pan'>): Channel {
		const ctx = this.context;

		const channel = this.channels.getOrInsertComputed(track.id, () => {
			const input = ctx.createGain();
			const gain = ctx.createGain();
			const panner = ctx.createStereoPanner();
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			input.connect(gain).connect(panner).connect(analyser).connect(this.master);
			return { input, gain, panner, analyser };
		});

		// Settings are applied on every request, so a knob moved between two
		// steps is heard on the next one. Glided, for the same reason as the fader.
		channel.gain.gain.setTargetAtTime(track.gain, ctx.currentTime, 0.02);
		channel.panner.pan.setTargetAtTime(track.pan, ctx.currentTime, 0.02);

		return channel;
	}

	/** Drop the strips for tracks that no longer exist. */
	prune(liveIds: readonly string[]): void {
		for (const [id, channel] of this.channels) {
			if (liveIds.includes(id)) continue;
			channel.analyser.disconnect();
			this.channels.delete(id);
		}
	}

	async resume(): Promise<void> {
		const ctx = this.context;
		if (ctx.state !== 'running') await ctx.resume();
	}

	async suspend(): Promise<void> {
		if (this.#context?.state === 'running') await this.#context.suspend();
	}

	/**
	 * Peak level of a node's most recent buffer, 0–1. Not reactive and not meant
	 * to be — the meter that draws it runs on `requestAnimationFrame`, which is
	 * the right clock for something that changes sixty times a second.
	 */
	static level(analyser: AnalyserNode, scratch: Float32Array<ArrayBuffer>): number {
		analyser.getFloatTimeDomainData(scratch);
		let peak = 0;
		for (let i = 0; i < scratch.length; i += 1) {
			const v = Math.abs(scratch[i]!);
			if (v > peak) peak = v;
		}
		return peak;
	}
}
