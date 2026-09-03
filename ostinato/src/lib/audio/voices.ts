/**
 * THE INSTRUMENTS
 * ===============
 *
 * Every sound in Ostinato is built from oscillators, noise and filters at the
 * moment it is needed — no samples, except the ones somebody drops onto a
 * `sample` track. That is a deliberate choice for a project about a framework:
 * a synthesised drum kit is a few hundred lines that anybody can read, and a
 * sample pack is two hundred megabytes that nobody can.
 *
 * Each function here takes a *context*, a *destination*, a *time* and the
 * track's *settings*, and schedules a sound to start at that time. Nothing
 * plays now; everything plays *then*. That is how Web Audio wants to be used
 * — see `scheduler.svelte.ts` for why — and it is what lets the same functions
 * render a whole pattern to a file through an `OfflineAudioContext`, which is
 * a `BaseAudioContext` exactly like the live one except that it runs as fast
 * as it can and writes the result to a buffer.
 *
 * HOW A DRUM IS MADE
 * ------------------
 * Every acoustic hit is a burst of energy that decays. The recipe for each
 * synthesised drum is the same three questions: *what* decays (a pitch, a
 * noise, or both), *how fast*, and *through what filter*. The numbers below
 * are the answers that sounded right after an afternoon of listening; none of
 * them are sacred and every one of them is worth changing.
 */

import { velocityGain } from '#lib/music/time.ts';

export interface Voice {
	/** Where the sound starts, on the context's clock. */
	time: number;
	/** 0–127. */
	velocity: number;
	/** 0–1, the track's tone knob. */
	tone: number;
	/** 0–1, the track's decay knob. */
	decay: number;
}

export interface Melodic extends Voice {
	frequency: number;
	/** How long the note is held before the release, in seconds. */
	duration: number;
}

/** Between `min` and `max`, by `unit` in `[0, 1]`. */
const lerp = (min: number, max: number, unit: number) => min + (max - min) * unit;

/**
 * A second of white noise, made once per context and reused.
 *
 * `WeakMap` keyed by the context: an `OfflineAudioContext` is created per
 * export and thrown away, and a plain `Map` would keep every one of them — and
 * its buffer — alive for the life of the page.
 */
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: BaseAudioContext): AudioBufferSourceNode {
	let buffer = noiseBuffers.get(ctx);
	if (!buffer) {
		buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
		noiseBuffers.set(ctx, buffer);
	}
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	return source;
}

/**
 * A gain node that opens instantly at `time` and closes exponentially.
 *
 * `exponentialRampToValueAtTime` cannot reach zero — exponential curves never
 * do — so the target is a value small enough to be silence and the node is
 * stopped just after. Ramping to literal `0` throws.
 */
function envelope(ctx: BaseAudioContext, time: number, peak: number, seconds: number): GainNode {
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(Math.max(peak, 0.0001), time);
	gain.gain.exponentialRampToValueAtTime(0.0001, time + seconds);
	return gain;
}

/**
 * KICK
 * ----
 * A sine wave whose pitch falls from about 150Hz to 40Hz in a few dozen
 * milliseconds. The fall *is* the "click" at the front of a kick; the tail is
 * the sine settling at its low pitch and fading. `tone` sets how high the
 * pitch starts, `decay` how long the tail lasts.
 */
export function kick(ctx: BaseAudioContext, out: AudioNode, v: Voice): void {
	const seconds = lerp(0.15, 0.9, v.decay);
	const osc = ctx.createOscillator();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(lerp(100, 220, v.tone), v.time);
	osc.frequency.exponentialRampToValueAtTime(42, v.time + 0.06);

	const env = envelope(ctx, v.time, velocityGain(v.velocity), seconds);
	osc.connect(env).connect(out);
	osc.start(v.time);
	osc.stop(v.time + seconds + 0.05);
}

/**
 * SNARE
 * -----
 * Two things at once, which is what a real snare is: a drum head (a short
 * triangle wave around 180Hz) and the wires underneath it (band-passed noise).
 * `tone` tilts the balance towards the noise; `decay` lengthens the wires.
 */
export function snare(ctx: BaseAudioContext, out: AudioNode, v: Voice): void {
	const peak = velocityGain(v.velocity);
	const seconds = lerp(0.12, 0.4, v.decay);

	const body = ctx.createOscillator();
	body.type = 'triangle';
	body.frequency.setValueAtTime(lerp(160, 240, v.tone), v.time);
	body.frequency.exponentialRampToValueAtTime(110, v.time + 0.08);
	const bodyEnv = envelope(ctx, v.time, peak * lerp(0.9, 0.4, v.tone), 0.12);
	body.connect(bodyEnv).connect(out);
	body.start(v.time);
	body.stop(v.time + 0.2);

	const wires = noise(ctx);
	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.value = lerp(1800, 4200, v.tone);
	filter.Q.value = 0.8;
	const wiresEnv = envelope(ctx, v.time, peak * lerp(0.5, 1, v.tone), seconds);
	wires.connect(filter).connect(wiresEnv).connect(out);
	wires.start(v.time);
	wires.stop(v.time + seconds + 0.05);
}

/**
 * HI-HAT
 * ------
 * High-passed noise and nothing else. A closed hat is a very short one; the
 * `decay` knob opens it. `tone` moves the high-pass cutoff — lower is darker,
 * higher is thinner and more like a shaker.
 */
export function hat(ctx: BaseAudioContext, out: AudioNode, v: Voice): void {
	const seconds = lerp(0.03, 0.35, v.decay);
	const source = noise(ctx);
	const filter = ctx.createBiquadFilter();
	filter.type = 'highpass';
	filter.frequency.value = lerp(5000, 11000, v.tone);

	const env = envelope(ctx, v.time, velocityGain(v.velocity) * 0.6, seconds);
	source.connect(filter).connect(env).connect(out);
	source.start(v.time);
	source.stop(v.time + seconds + 0.05);
}

/**
 * CLAP
 * ----
 * A clap is several people not clapping at quite the same moment: three or
 * four very short bursts of noise, ten milliseconds apart, then one longer
 * tail. Rendering it as one burst sounds like a snare with the head removed;
 * the stagger is the whole character.
 */
export function clap(ctx: BaseAudioContext, out: AudioNode, v: Voice): void {
	const peak = velocityGain(v.velocity);
	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.value = lerp(1000, 2200, v.tone);
	filter.Q.value = 1.2;
	filter.connect(out);

	for (let i = 0; i < 4; i += 1) {
		const at = v.time + i * 0.011;
		const burst = noise(ctx);
		const isTail = i === 3;
		const env = envelope(
			ctx,
			at,
			peak * (isTail ? 0.9 : 0.7),
			isTail ? lerp(0.1, 0.4, v.decay) : 0.02
		);
		burst.connect(env).connect(filter);
		burst.start(at);
		burst.stop(at + (isTail ? 0.5 : 0.03));
	}
}

/**
 * BASS
 * ----
 * A sawtooth through a low-pass filter whose cutoff *moves* — it opens with
 * the note and closes as it decays. That moving filter is the sound of every
 * analogue synth bass ever recorded. `tone` is how far the filter opens.
 */
export function bass(ctx: BaseAudioContext, out: AudioNode, v: Melodic): void {
	const peak = velocityGain(v.velocity) * 0.7;
	const release = lerp(0.05, 0.4, v.decay);
	const end = v.time + v.duration + release;

	const osc = ctx.createOscillator();
	osc.type = 'sawtooth';
	osc.frequency.value = v.frequency;

	const filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	filter.Q.value = 6;
	const open = lerp(300, 3000, v.tone);
	filter.frequency.setValueAtTime(open, v.time);
	filter.frequency.exponentialRampToValueAtTime(
		Math.max(80, open * 0.15),
		v.time + v.duration + release
	);

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.0001, v.time);
	gain.gain.exponentialRampToValueAtTime(peak, v.time + 0.005);
	gain.gain.setValueAtTime(peak, v.time + v.duration);
	gain.gain.exponentialRampToValueAtTime(0.0001, end);

	osc.connect(filter).connect(gain).connect(out);
	osc.start(v.time);
	osc.stop(end + 0.02);
}

/**
 * LEAD
 * ----
 * Two detuned square waves — the second a few cents sharp — which is where the
 * width comes from, through a gentler filter than the bass. `tone` brightens,
 * `decay` lengthens the release.
 */
export function lead(ctx: BaseAudioContext, out: AudioNode, v: Melodic): void {
	const peak = velocityGain(v.velocity) * 0.35;
	const release = lerp(0.08, 0.6, v.decay);
	const end = v.time + v.duration + release;

	const filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.value = lerp(900, 6000, v.tone);
	filter.Q.value = 1;

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.0001, v.time);
	gain.gain.exponentialRampToValueAtTime(peak, v.time + 0.01);
	gain.gain.setValueAtTime(peak, v.time + v.duration);
	gain.gain.exponentialRampToValueAtTime(0.0001, end);
	filter.connect(gain).connect(out);

	for (const detune of [-6, 6]) {
		const osc = ctx.createOscillator();
		osc.type = 'square';
		osc.frequency.value = v.frequency;
		osc.detune.value = detune;
		osc.connect(filter);
		osc.start(v.time);
		osc.stop(end + 0.02);
	}
}

/**
 * SAMPLE
 * ------
 * Somebody's own file. `tone` is a low-pass cutoff, so a bright sample can be
 * darkened without another knob; `decay` is how much of the file plays.
 */
export function sample(ctx: BaseAudioContext, out: AudioNode, v: Voice, buffer: AudioBuffer): void {
	const seconds = Math.min(buffer.duration, lerp(0.05, buffer.duration, v.decay));
	const source = ctx.createBufferSource();
	source.buffer = buffer;

	const filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.value = lerp(600, 18000, v.tone);

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(velocityGain(v.velocity), v.time);
	// Fade the last ten milliseconds so a truncated sample does not click.
	gain.gain.setValueAtTime(velocityGain(v.velocity), v.time + Math.max(0, seconds - 0.01));
	gain.gain.linearRampToValueAtTime(0, v.time + seconds);

	source.connect(filter).connect(gain).connect(out);
	source.start(v.time);
	source.stop(v.time + seconds + 0.01);
}
