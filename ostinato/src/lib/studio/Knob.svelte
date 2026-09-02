<script lang="ts">
	import { Spring } from 'svelte/motion';
	import { on } from 'svelte/events';
	import type { Attachment } from 'svelte/attachments';

	/**
	 * A KNOB
	 * ======
	 *
	 * The control every instrument is covered in, and one the web does not
	 * have. Drag up to turn it up, down to turn it down; scroll over it; or
	 * focus it and use the arrow keys. It is a `slider` to assistive
	 * technology, which is what it is.
	 *
	 * `value` is `$bindable`, so a parent writes `<Knob bind:value={track.gain}>`
	 * and the knob writes straight into the track. `onstart` fires once at the
	 * beginning of a gesture — before the first change — which is where the
	 * studio pushes an undo snapshot: one entry per twist, not one per pixel.
	 */
	let {
		value = $bindable(0),
		min = 0,
		max = 1,
		step = 0.01,
		label,
		format = (v: number) => v.toFixed(2),
		size = 56,
		disabled = false,
		onstart,
		onend
	}: {
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		label: string;
		format?: (value: number) => string;
		size?: number;
		disabled?: boolean;
		onstart?: () => void;
		/** The gesture finished: pointer up, key released, wheel settled. */
		onend?: () => void;
	} = $props();

	/**
	 * `$props.id()` — an id that is unique per component instance and identical
	 * on the server and in the browser, so `aria-labelledby` matches after
	 * hydration. Two knobs on one page get two ids without anybody numbering
	 * them.
	 */
	const id = $props.id();

	/** Where the value sits in its range, 0–1. */
	const unit = $derived((value - min) / (max - min));

	/**
	 * THE POINTER IS A SPRING
	 * -----------------------
	 * The *value* changes instantly — audio must — but the *pointer* on the
	 * dial follows it with a little weight, so a jump from a preset or an undo
	 * reads as a movement rather than a teleport. `Spring.of` ties the spring's
	 * target to a derived expression; it must be created during component
	 * initialisation, which this is.
	 */
	const angle = Spring.of(() => unit * 270 - 135, { stiffness: 0.25, damping: 0.7 });

	let dragging = $state(false);

	function set(next: number) {
		const clamped = Math.min(max, Math.max(min, next));
		// Snap to the step, then clean up the floating point noise that
		// multiplying by 0.01 leaves behind.
		value = Number((Math.round(clamped / step) * step).toFixed(6));
	}

	/**
	 * Drag. The pointer is captured so the gesture continues outside the
	 * element, and `on` from `svelte/events` attaches the window listeners —
	 * it returns the function that removes them, which is what makes the
	 * cleanup three lines instead of a `removeEventListener` for each.
	 */
	function pointerdown(event: PointerEvent) {
		if (disabled || event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).focus();
		onstart?.();

		const startY = event.clientY;
		const startValue = value;
		const range = max - min;
		dragging = true;

		const move = on(window, 'pointermove', (e) => {
			// 150 pixels for the whole range; a tenth of that with Shift held.
			const fine = e.shiftKey ? 0.1 : 1;
			set(startValue + ((startY - e.clientY) / 150) * range * fine);
		});
		const up = on(window, 'pointerup', () => {
			dragging = false;
			move();
			up();
			onend?.();
		});
	}

	function keyup() {
		if (!disabled) onend?.();
	}

	function keydown(event: KeyboardEvent) {
		if (disabled) return;
		const big = step * 10;
		const moves: Record<string, number> = {
			ArrowUp: step,
			ArrowRight: step,
			ArrowDown: -step,
			ArrowLeft: -step,
			PageUp: big,
			PageDown: -big
		};
		const delta = moves[event.key];
		if (delta !== undefined) {
			event.preventDefault();
			onstart?.();
			set(value + delta * (event.shiftKey ? 10 : 1));
		} else if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			onstart?.();
			set(event.key === 'Home' ? min : max);
		}
	}

	/**
	 * Scrolling over a knob turns it, which means the page must *not* scroll.
	 * Browsers make `wheel` listeners passive by default — they cannot call
	 * `preventDefault` — so this one is attached with `{ passive: false }`
	 * through an attachment rather than an `onwheel` attribute.
	 */
	const wheel: Attachment<HTMLElement> = (node) => {
		let settle: ReturnType<typeof setTimeout> | null = null;
		return on(
			node,
			'wheel',
			(event) => {
				if (disabled) return;
				event.preventDefault();
				if (!settle) onstart?.();
				set(value - Math.sign(event.deltaY) * step * (event.shiftKey ? 1 : 5));
				// A wheel gesture has no "up"; a pause of a quarter second is its end.
				if (settle) clearTimeout(settle);
				settle = setTimeout(() => {
					settle = null;
					onend?.();
				}, 250);
			},
			{ passive: false }
		);
	};

	/* Arc geometry: radius 20 in a 48 box; 270° of a 125.66 circumference. */
	const ARC = 2 * Math.PI * 20 * 0.75;
	const filled = $derived(((angle.current + 135) / 270) * ARC);
</script>

<div class={['knob', { 'knob--disabled': disabled }]} style:--size="{size}px">
	<div
		class={['knob__dial', { 'knob__dial--dragging': dragging }]}
		role="slider"
		tabindex={disabled ? -1 : 0}
		aria-labelledby={id}
		aria-valuemin={min}
		aria-valuemax={max}
		aria-valuenow={value}
		aria-valuetext={format(value)}
		aria-disabled={disabled || undefined}
		onpointerdown={pointerdown}
		onkeydown={keydown}
		onkeyup={keyup}
		{@attach wheel}
	>
		<svg viewBox="0 0 48 48" aria-hidden="true">
			<g transform="rotate(135 24 24)">
				<circle class="knob__track" cx="24" cy="24" r="20" stroke-dasharray="{ARC} 200" />
				<circle class="knob__fill" cx="24" cy="24" r="20" stroke-dasharray="{filled} 200" />
			</g>
			<g transform="rotate({angle.current} 24 24)">
				<line class="knob__pointer" x1="24" y1="24" x2="24" y2="8" />
			</g>
		</svg>
	</div>
	<span class="knob__value mono">{format(value)}</span>
	<span class="knob__label" {id}>{label}</span>
</div>

<style>
	.knob {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		width: max-content;
		user-select: none;
	}

	.knob__dial {
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		cursor: ns-resize;
		touch-action: none;
	}

	.knob__dial--dragging {
		cursor: grabbing;
	}

	.knob--disabled .knob__dial {
		cursor: default;
		opacity: 0.5;
	}

	svg {
		width: 100%;
		height: 100%;
	}

	.knob__track,
	.knob__fill {
		fill: none;
		stroke-width: 4;
		stroke-linecap: round;
	}

	.knob__track {
		stroke: var(--surface-active);
	}

	.knob__fill {
		stroke: var(--accent);
	}

	.knob__pointer {
		stroke: var(--text);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.knob__value {
		font-size: var(--fs-xs);
		color: var(--text);
		min-width: 3ch;
		text-align: center;
	}

	.knob__label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
</style>
