<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { devicePixelRatio } from 'svelte/reactivity/window';
	import { AudioEngine } from '#lib/audio/engine.svelte.ts';

	/**
	 * A LEVEL METER
	 * =============
	 *
	 * A bar that follows the peak of a channel. Drawn on a canvas, sixty times a
	 * second, by an attachment — because a value that changes every frame is
	 * not something to put through the reactivity system. `requestAnimationFrame`
	 * is the right clock for it, and an attachment is the right place: it gets
	 * the element, runs its loop, and returns the function that stops it.
	 */
	let { analyser, hue }: { analyser: AnalyserNode; hue: string } = $props();

	let width = $state(0);
	let height = $state(0);

	/**
	 * An attachment *factory*: it closes over `analyser`, so when the prop
	 * changes Svelte tears the old loop down and starts a new one on the new
	 * node. `devicePixelRatio` from `svelte/reactivity/window` is read inside,
	 * which makes the canvas re-scale when a window moves between screens.
	 */
	function meter(node: AnalyserNode): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			const scratch = new Float32Array(node.fftSize);
			const ratio = devicePixelRatio.current ?? 1;
			let frame = 0;
			let shown = 0;

			const draw = () => {
				const ctx = canvas.getContext('2d');
				if (!ctx) return;

				canvas.width = Math.max(1, Math.round(width * ratio));
				canvas.height = Math.max(1, Math.round(height * ratio));

				const peak = AudioEngine.level(node, scratch);
				// Rise instantly, fall slowly: the ballistics of every meter ever built.
				shown = peak > shown ? peak : shown * 0.92;

				ctx.clearRect(0, 0, canvas.width, canvas.height);
				const filled = Math.round(canvas.width * Math.min(1, shown));
				ctx.fillStyle = shown > 0.9 ? 'oklch(70% 0.2 30)' : `oklch(72% 0.17 ${hue})`;
				ctx.fillRect(0, 0, filled, canvas.height);

				frame = requestAnimationFrame(draw);
			};

			frame = requestAnimationFrame(draw);
			return () => cancelAnimationFrame(frame);
		};
	}
</script>

<!-- `bind:clientWidth` / `bind:clientHeight`: read-only bindings the browser keeps current with a ResizeObserver. -->
<div class="meter" bind:clientWidth={width} bind:clientHeight={height} aria-hidden="true">
	<canvas {@attach meter(analyser)}></canvas>
</div>

<style>
	.meter {
		width: 100%;
		height: 6px;
		border-radius: var(--radius-pill);
		background: var(--surface-active);
		overflow: hidden;
	}

	canvas {
		width: 100%;
		height: 100%;
	}
</style>
