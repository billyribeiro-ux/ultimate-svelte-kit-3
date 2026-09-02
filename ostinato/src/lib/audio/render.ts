/**
 * RENDER A PATTERN TO A FILE
 * ==========================
 *
 * `OfflineAudioContext` is the live context's twin: the same nodes, the same
 * `scheduleStep`, but it runs as fast as the machine allows and hands back a
 * buffer instead of playing. Two bars of a groove render in well under a
 * second. The result goes through `encodeWav` and becomes a download.
 *
 * Because it is the *same* scheduling function as the live player, the file
 * is the groove — not an approximation of it with slightly different swing.
 */

import { stepSeconds } from '#lib/music/time.ts';
import { STEPS, type Pattern, type Track } from '#lib/pattern/model.ts';
import { scheduleStep } from './schedule.ts';
import { encodeWav } from './wav.ts';

export interface RenderOptions {
	bars?: number;
	sampleRate?: number;
	/** Decoded files for `sample` tracks, by track id. */
	samples?: (trackId: string) => AudioBuffer | undefined;
}

export async function renderPattern(
	pattern: Pattern,
	options: RenderOptions = {}
): Promise<AudioBuffer> {
	const bars = options.bars ?? 2;
	const sampleRate = options.sampleRate ?? 44100;
	// Half a second of tail so the last hit's decay is not cut off.
	const seconds = stepSeconds(pattern.bpm) * STEPS * bars + 0.5;

	const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);

	// Offline, a channel strip is a gain and a pan — the meters are not needed.
	const strips = new Map<string, GainNode>();
	const outputs = {
		output(track: Track) {
			let strip = strips.get(track.id);
			if (!strip) {
				strip = ctx.createGain();
				strip.gain.value = track.gain;
				const panner = ctx.createStereoPanner();
				panner.pan.value = track.pan;
				strip.connect(panner).connect(ctx.destination);
				strips.set(track.id, strip);
			}
			return strip;
		},
		sample: (track: Track) => options.samples?.(track.id)
	};

	for (let bar = 0; bar < bars; bar += 1) {
		for (let step = 0; step < STEPS; step += 1) {
			scheduleStep(ctx, outputs, pattern, step, (bar * STEPS + step) * stepSeconds(pattern.bpm));
		}
	}

	return ctx.startRendering();
}

/** An `AudioBuffer` as a WAV file, ready for a Blob URL or a download. */
export function bufferToWav(buffer: AudioBuffer): Blob {
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
		buffer.getChannelData(i)
	);
	return new Blob([encodeWav(channels, buffer.sampleRate)], { type: 'audio/wav' });
}

/** True if any sample is louder than silence — what a test asks of a render. */
export function hasSound(buffer: AudioBuffer, threshold = 0.001): boolean {
	for (let c = 0; c < buffer.numberOfChannels; c += 1) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < data.length; i += 1) {
			if (Math.abs(data[i]!) > threshold) return true;
		}
	}
	return false;
}
