/**
 * WAV
 * ===
 *
 * The oldest audio format still in daily use, and the simplest: a 44-byte
 * header followed by the samples, interleaved, as 16-bit integers. Every
 * editor opens it. No library is needed to write one, and none is used.
 *
 * Pure: arrays in, bytes out. `render.ts` is what turns an `AudioBuffer` into
 * the arrays, and the test for this file needs no browser.
 */

/**
 * @param channels one `Float32Array` of samples in `[-1, 1]` per channel
 * @param sampleRate samples per second, e.g. 44100
 */
export function encodeWav(
	channels: readonly Float32Array[],
	sampleRate: number
): Uint8Array<ArrayBuffer> {
	const channelCount = channels.length;
	const frames = channels[0]?.length ?? 0;
	const bytesPerSample = 2;
	const dataBytes = frames * channelCount * bytesPerSample;

	const buffer = new ArrayBuffer(44 + dataBytes);
	const view = new DataView(buffer);

	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
	};

	// The RIFF header. Every number is little-endian, hence the `true`s.
	ascii(0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	view.setUint32(16, 16, true); // size of the fmt chunk
	view.setUint16(20, 1, true); // 1 = PCM
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channelCount * bytesPerSample, true); // bytes per second
	view.setUint16(32, channelCount * bytesPerSample, true); // bytes per frame
	view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
	ascii(36, 'data');
	view.setUint32(40, dataBytes, true);

	// Interleave: L R L R … and clamp, because a hot mix can exceed ±1 and a
	// float that wraps around in 16 bits is the loudest possible click.
	let offset = 44;
	for (let frame = 0; frame < frames; frame += 1) {
		for (const channel of channels) {
			const sample = Math.max(-1, Math.min(1, channel[frame] ?? 0));
			view.setInt16(offset, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true);
			offset += bytesPerSample;
		}
	}

	return new Uint8Array(buffer);
}
