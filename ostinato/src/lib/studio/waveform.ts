/**
 * DRAW A SAMPLE
 * =============
 *
 * The shape of a decoded file, for the sound panel. An attachment factory:
 * `{@attach waveform(buffer, hue)}` on a canvas, and the drawing re-runs when
 * either argument changes.
 *
 * The canvas is sized from its CSS box at draw time rather than from a prop,
 * so a panel that changes width — the sheet becoming a sidebar — is redrawn
 * by the `ResizeObserver` below rather than by anybody remembering to.
 */

import type { Attachment } from 'svelte/attachments';

export function waveform(
	buffer: AudioBuffer | undefined,
	hue: string
): Attachment<HTMLCanvasElement> {
	return (canvas) => {
		const draw = () => {
			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			const ratio = window.devicePixelRatio || 1;
			const width = canvas.clientWidth;
			const height = canvas.clientHeight;
			canvas.width = Math.max(1, Math.round(width * ratio));
			canvas.height = Math.max(1, Math.round(height * ratio));
			ctx.scale(ratio, ratio);
			ctx.clearRect(0, 0, width, height);

			if (!buffer) return;

			// One column per pixel: the loudest sample in that slice of time, up
			// and down. Drawing every sample would be tens of thousands of lines
			// for a shape a hundred columns describes.
			const data = buffer.getChannelData(0);
			const perColumn = Math.max(1, Math.floor(data.length / width));
			ctx.fillStyle = `oklch(72% 0.17 ${hue})`;

			for (let x = 0; x < width; x += 1) {
				let peak = 0;
				const start = x * perColumn;
				for (let i = start; i < start + perColumn && i < data.length; i += 1) {
					const v = Math.abs(data[i]!);
					if (v > peak) peak = v;
				}
				const h = Math.max(1, peak * height);
				ctx.fillRect(x, (height - h) / 2, 1, h);
			}
		};

		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		return () => observer.disconnect();
	};
}
