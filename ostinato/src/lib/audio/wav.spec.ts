import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav.ts';

/**
 * A WAV header is forty-four bytes of numbers that every player checks and
 * nobody can read by eye. These tests read them back with the same `DataView`
 * a decoder would.
 */

function header(bytes: Uint8Array) {
	const view = new DataView(bytes.buffer);
	const text = (offset: number, length: number) =>
		String.fromCharCode(...bytes.subarray(offset, offset + length));
	return {
		riff: text(0, 4),
		wave: text(8, 4),
		format: view.getUint16(20, true),
		channels: view.getUint16(22, true),
		sampleRate: view.getUint32(24, true),
		bitsPerSample: view.getUint16(34, true),
		dataBytes: view.getUint32(40, true)
	};
}

describe('encodeWav', () => {
	it('writes a PCM header a player will accept', () => {
		const bytes = encodeWav([new Float32Array(100), new Float32Array(100)], 44100);
		const h = header(bytes);

		expect(h.riff).toBe('RIFF');
		expect(h.wave).toBe('WAVE');
		expect(h.format).toBe(1);
		expect(h.channels).toBe(2);
		expect(h.sampleRate).toBe(44100);
		expect(h.bitsPerSample).toBe(16);
		expect(h.dataBytes).toBe(100 * 2 * 2);
		expect(bytes.length).toBe(44 + 400);
	});

	it('interleaves channels and scales to 16-bit', () => {
		const left = Float32Array.from([1, 0, -1]);
		const right = Float32Array.from([0.5, 0, -0.5]);
		const view = new DataView(encodeWav([left, right], 8000).buffer);

		expect(view.getInt16(44, true)).toBe(0x7fff);
		expect(view.getInt16(46, true)).toBe(Math.round(0.5 * 0x7fff));
		expect(view.getInt16(48, true)).toBe(0);
		expect(view.getInt16(52, true)).toBe(-0x8000);
		expect(view.getInt16(54, true)).toBe(-0x4000);
	});

	it('clamps a hot mix instead of wrapping it', () => {
		const view = new DataView(encodeWav([Float32Array.from([1.7, -2.3])], 8000).buffer);
		expect(view.getInt16(44, true)).toBe(0x7fff);
		expect(view.getInt16(46, true)).toBe(-0x8000);
	});

	it('handles silence and an empty buffer', () => {
		expect(encodeWav([], 44100).length).toBe(44);
		expect(header(encodeWav([new Float32Array(0)], 44100)).dataBytes).toBe(0);
	});
});
