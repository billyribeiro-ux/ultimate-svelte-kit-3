<script module lang="ts">
	import type { Point } from '#lib/series/downsample.ts';

	export interface Series {
		/** Stable across renders. Decides the colour, so it must not be an index. */
		readonly key: string;
		readonly label: string;
		readonly points: readonly Point[];
	}
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { axisRange } from '#lib/series/downsample.ts';
	import { downsample } from '#lib/charts/downsampler.ts';
	import { formatTick, formatTimeTick, linear, niceTicks, timeTicks } from '#lib/charts/scale.ts';
	import { hueFor } from '#lib/trace/colour.ts';
	import { formatDuration } from '#lib/time/range.ts';

	/**
	 * A TIME-SERIES CHART, ON CANVAS
	 * ==============================
	 *
	 * WHY CANVAS AND NOT SVG
	 * ----------------------
	 * SVG is the better answer for most charts, and it is the wrong one here. An
	 * SVG line of two thousand points is two thousand path segments in the DOM;
	 * eight series of those is sixteen thousand nodes that the browser lays out,
	 * styles and hit-tests on every frame of a range drag. Canvas draws the same
	 * picture as pixels and the DOM stays empty.
	 *
	 * The thing canvas gives up is accessibility, and it gives it up completely: a
	 * canvas is a rectangle of pixels with no structure at all. That is not a
	 * reason to avoid canvas, it is a reason to supply the structure separately —
	 * which is what the summary table below the chart is. It is not a consolation
	 * prize; for "what was the p95 at 3pm" it is faster than reading the picture.
	 *
	 * WHY THE CROSSHAIR READS THE FULL SERIES
	 * ---------------------------------------
	 * The line is drawn from downsampled points, and LTTB keeps *real* samples —
	 * so reading a value off the drawn array gives you a number that really
	 * occurred, at the wrong time. The crosshair therefore searches the original
	 * series. The distinction matters exactly when it is hardest to notice: the
	 * downsampled array is right most of the time and wrong on the spikes, which
	 * are the points people put the pointer on.
	 */
	interface Props {
		series: readonly Series[];
		/** The window the x axis covers. Fixed, not derived from the data. */
		from: number;
		to: number;
		/** Rendered under the pointer. Durations format differently from counts. */
		unit?: 'count' | 'duration';
		height?: number;
		label: string;
	}

	let { series, from, to, unit = 'count', height = 220, label }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	/** Measured, not guessed. The height is a prop; only the width has to be observed. */
	let width = $state(0);
	let pointer = $state<{ x: number; at: number } | null>(null);

	/**
	 * The drawn points, downsampled.
	 *
	 * `$state.raw` because it is replaced wholesale and never mutated, and because
	 * a deep proxy over two thousand `{x, y}` objects would make every read in the
	 * draw loop a proxy trap — which is thousands of traps per frame, for data
	 * that is not being watched for changes.
	 */
	let drawn = $state.raw<readonly Series[]>([]);

	/**
	 * One point per two pixels.
	 *
	 * A line cannot show more detail than the display has pixels, and beyond about
	 * one point per pixel the extra samples land on top of each other and darken
	 * the line rather than adding information. Two is a little conservative and
	 * leaves the shape intact on a high-DPI screen.
	 */
	const threshold = $derived(Math.max(64, Math.floor(width / 2)));

	/*
	 * Downsample whenever the data or the width changes.
	 *
	 * The token guards against replies arriving out of order — a smaller series
	 * finishing after a bigger one that was requested later would otherwise leave
	 * the chart showing the older answer permanently.
	 */
	let token = 0;
	$effect(() => {
		const mine = ++token;
		const input = series;
		const target = threshold;

		void Promise.all(
			input.map(async (entry) => ({
				...entry,
				points: await downsample(entry.points, target)
			}))
		).then((result) => {
			if (mine === token) drawn = result;
		});
	});

	const bounds = $derived(axisRange(drawn.flatMap((entry) => entry.points)));

	/** Room for the axes. Left is widest because a y label is up to five characters. */
	const PAD = { top: 8, right: 8, bottom: 22, left: 48 };

	const measure: Attachment<HTMLElement> = (element) => {
		const observer = new ResizeObserver(([entry]) => {
			if (entry) width = entry.contentRect.width;
		});
		observer.observe(element);
		width = element.getBoundingClientRect().width;
		return () => observer.disconnect();
	};

	/**
	 * Draw.
	 *
	 * An effect rather than an attachment, because it depends on state that
	 * changes constantly — the pointer position, the data, the size — and an
	 * attachment re-runs by *re-attaching*, which would mean tearing down and
	 * recreating the observer sixty times a second.
	 */
	$effect(() => {
		const element = canvas;
		if (!element || width === 0) return;

		/*
		 * Device pixels, not CSS pixels.
		 *
		 * A canvas sized in CSS pixels on a 2× display is drawn at half resolution
		 * and scaled up — which is why so many web charts have soft, slightly blurry
		 * lines. The backing store is sized in device pixels and the context is
		 * scaled once, after which every coordinate below is in CSS pixels again.
		 */
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		element.width = Math.round(width * dpr);
		element.height = Math.round(height * dpr);

		const ctx = element.getContext('2d');
		if (!ctx) return;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);

		/*
		 * Colours from the stylesheet, read once per draw.
		 *
		 * Hard-coding them here would give a chart that ignores the light theme, and
		 * threading them in as props would make every caller responsible for knowing
		 * the token names. `getComputedStyle` on the canvas resolves the same
		 * variables the rest of the interface uses, so the chart follows the theme
		 * with no wiring at all.
		 */
		const styles = getComputedStyle(element);
		const gridColour = styles.getPropertyValue('--border').trim() || '#333';
		const textColour = styles.getPropertyValue('--text-faint').trim() || '#888';

		const x = linear([from, to], [PAD.left, width - PAD.right]);
		const y = linear([bounds.min, bounds.max], [height - PAD.bottom, PAD.top]);

		ctx.font = `10px ${styles.getPropertyValue('--font-mono').trim() || 'monospace'}`;
		ctx.textBaseline = 'middle';

		/* ---- Gridlines and labels ---- */

		ctx.strokeStyle = gridColour;
		ctx.fillStyle = textColour;
		ctx.lineWidth = 1;

		for (const tick of niceTicks(bounds.min, bounds.max, 4)) {
			// The half-pixel offset is why some canvas lines are crisp and others are
			// two grey pixels: a 1px line centred on an integer straddles the boundary.
			const at = Math.round(y(tick)) + 0.5;
			ctx.beginPath();
			ctx.moveTo(PAD.left, at);
			ctx.lineTo(width - PAD.right, at);
			ctx.stroke();

			ctx.textAlign = 'right';
			ctx.fillText(unit === 'duration' ? formatDuration(tick) : formatTick(tick), PAD.left - 6, at);
		}

		ctx.textAlign = 'center';
		for (const tick of timeTicks(from, to, Math.max(2, Math.floor(width / 90)))) {
			ctx.fillText(formatTimeTick(tick, to - from), x(tick), height - PAD.bottom / 2);
		}

		/* ---- The series ---- */

		ctx.lineWidth = 1.5;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';

		for (const entry of drawn) {
			if (entry.points.length === 0) continue;

			ctx.strokeStyle = `oklch(0.72 0.14 ${hueFor(entry.key)})`;
			ctx.beginPath();

			let started = false;
			for (const point of entry.points) {
				if (!Number.isFinite(point.y)) {
					/*
					 * A gap, drawn as a gap.
					 *
					 * The alternative is to join across it, which draws a straight line
					 * through a period when nothing was reported — and a straight line is
					 * indistinguishable from a steady value. An outage is exactly when
					 * somebody is looking at this chart.
					 */
					started = false;
					continue;
				}

				const px = x(point.x);
				const py = y(point.y);
				if (started) ctx.lineTo(px, py);
				else ctx.moveTo(px, py);
				started = true;
			}

			ctx.stroke();
		}

		/* ---- Crosshair ---- */

		if (pointer) {
			ctx.strokeStyle = textColour;
			ctx.setLineDash([2, 3]);
			ctx.beginPath();
			ctx.moveTo(Math.round(pointer.x) + 0.5, PAD.top);
			ctx.lineTo(Math.round(pointer.x) + 0.5, height - PAD.bottom);
			ctx.stroke();
			ctx.setLineDash([]);

			for (const entry of series) {
				const point = nearest(entry.points, pointer.at);
				if (!point || !Number.isFinite(point.y)) continue;

				ctx.fillStyle = `oklch(0.72 0.14 ${hueFor(entry.key)})`;
				ctx.beginPath();
				ctx.arc(x(point.x), y(point.y), 3, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	});

	/** Binary search for the sample closest to a time. The series is sorted by x. */
	function nearest(points: readonly Point[], at: number): Point | undefined {
		if (points.length === 0) return undefined;

		let low = 0;
		let high = points.length - 1;
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (points[mid]!.x < at) low = mid + 1;
			else high = mid;
		}

		const after = points[low]!;
		const before = points[Math.max(0, low - 1)]!;
		return Math.abs(after.x - at) < Math.abs(before.x - at) ? after : before;
	}

	function onpointermove(event: PointerEvent): void {
		const element = event.currentTarget as HTMLElement;
		const rect = element.getBoundingClientRect();
		const px = event.clientX - rect.left;

		if (px < PAD.left || px > rect.width - PAD.right) {
			pointer = null;
			return;
		}

		const x = linear([from, to], [PAD.left, rect.width - PAD.right]);
		pointer = { x: px, at: x.invert(px) };
	}

	const readout = $derived.by(() => {
		// Read into a local first: narrowing a `$state` field inside a callback does
		// not survive, because as far as the type system knows the getter could
		// return something different on the second call.
		const at = pointer?.at;
		if (at === undefined) return [];

		return series.map((entry) => ({
			key: entry.key,
			label: entry.label,
			point: nearest(entry.points, at)
		}));
	});

	function show(value: number | undefined): string {
		if (value === undefined || !Number.isFinite(value)) return '—';
		return unit === 'duration' ? formatDuration(value) : formatTick(value);
	}

	/** Min, max, mean and latest, per series. The accessible view of the picture. */
	const summary = $derived(
		series.map((entry) => {
			const finite = entry.points.filter((point) => Number.isFinite(point.y));
			const values = finite.map((point) => point.y);
			return {
				key: entry.key,
				label: entry.label,
				min: values.length > 0 ? Math.min(...values) : undefined,
				max: values.length > 0 ? Math.max(...values) : undefined,
				mean:
					values.length > 0
						? values.reduce((sum, value) => sum + value, 0) / values.length
						: undefined,
				latest: finite[finite.length - 1]?.y
			};
		})
	);
</script>

<figure class="chart" {@attach measure}>
	<figcaption class="chart__legend">
		{#each series as entry (entry.key)}
			<span class="legend">
				<span class="legend__swatch" style:--hue={hueFor(entry.key)} aria-hidden="true"></span>
				{entry.label}
			</span>
		{/each}
	</figcaption>

	<!--
		A pointer-only enhancement, and deliberately so.

		The warning this suppresses exists to catch interactions that a keyboard
		cannot reach. Everything the crosshair reveals — every value in the series —
		is in the table below, in a form that is faster to read with a screen reader
		than any hover readout could be. Adding a fake keyboard mode that walks the
		crosshair sample by sample would satisfy the linter and serve nobody.
	-->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="chart__plot"
		style:height="{height}px"
		{onpointermove}
		onpointerleave={() => (pointer = null)}
	>
		<!--
			`role="img"` with a label, not `role="presentation"`.

			A canvas with no role is announced as nothing at all. Labelling it as an
			image with a one-line summary means a screen reader says what it is; the
			table underneath is where the numbers are. Putting the numbers in the
			label instead produces a paragraph nobody can navigate.
		-->
		<!--
			`role="img"` on a canvas is what the ARIA practices recommend for a static
			graphic, and Svelte's rule flags it because a canvas is interactive in the
			general case. It is not one here: nothing is drawn in response to focus and
			nothing inside it can be tabbed to.
		-->
		<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
		<canvas bind:this={canvas} role="img" aria-label={label} style:height="{height}px"></canvas>

		{#if pointer}
			<!--
				The tooltip is HTML, not drawn into the canvas.

				Text drawn on a canvas cannot be selected, cannot be zoomed by the
				browser's text scaling, and does not inherit the font. It is also the
				single most fiddly thing to lay out in a canvas, because measuring it
				means `measureText` and doing the box arithmetic by hand.
			-->
			<div
				class="tooltip"
				class:tooltip--right={pointer.x > width * 0.6}
				style:left="{pointer.x}px"
				role="status"
			>
				<p class="tooltip__time">{formatTimeTick(pointer.at, to - from)}</p>
				{#each readout as row (row.key)}
					<p class="tooltip__row">
						<span class="legend__swatch" style:--hue={hueFor(row.key)} aria-hidden="true"></span>
						<span class="tooltip__label truncate">{row.label}</span>
						<span class="tooltip__value">{show(row.point?.y)}</span>
					</p>
				{/each}
			</div>
		{/if}

		{#if series.every((entry) => entry.points.length === 0)}
			<p class="chart__empty">No data in this range.</p>
		{/if}
	</div>

	<details class="chart__table">
		<summary>Read as a table</summary>
		<table>
			<caption class="visually-hidden">{label}</caption>
			<thead>
				<tr>
					<th scope="col">Series</th>
					<th scope="col">Min</th>
					<th scope="col">Mean</th>
					<th scope="col">Max</th>
					<th scope="col">Latest</th>
				</tr>
			</thead>
			<tbody>
				{#each summary as row (row.key)}
					<tr>
						<th scope="row">{row.label}</th>
						<td>{show(row.min)}</td>
						<td>{show(row.mean)}</td>
						<td>{show(row.max)}</td>
						<td>{show(row.latest)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</figure>

<style>
	.chart {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-3);
	}

	.chart__legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.legend {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.legend__swatch {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: var(--radius-sm);
		background: oklch(0.72 0.14 var(--hue));
		flex: none;
	}

	.chart__plot {
		position: relative;
		/*
		 * A vertical swipe scrolls the page; a horizontal one reads the chart.
		 *
		 * Without this, a touch that starts on the chart is claimed by the browser's
		 * scroll before any pointer event arrives, and the crosshair never fires on a
		 * phone at all.
		 */
		touch-action: pan-y;
	}

	canvas {
		display: block;
		width: 100%;
	}

	.chart__empty {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}

	.tooltip {
		position: absolute;
		top: 0;
		/* Offset from the crosshair rather than under the pointer, so a finger does
		   not cover the thing it is pointing at. */
		transform: translateX(0.75rem);
		pointer-events: none;
		min-width: 9rem;
		max-width: 14rem;
		padding: var(--space-2);
		background: var(--surface-raised);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
		font-size: var(--fs-xs);
	}

	/* Flips to the other side near the right edge rather than being clipped. */
	.tooltip--right {
		transform: translateX(calc(-100% - 0.75rem));
	}

	.tooltip__time {
		margin: 0 0 var(--space-1);
		color: var(--text-faint);
		font-family: var(--font-mono);
	}

	.tooltip__row {
		display: grid;
		grid-template-columns: 0.55rem minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
	}

	.tooltip__value {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}

	.chart__table {
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.chart__table summary {
		cursor: pointer;
	}

	.chart__table table {
		width: 100%;
		margin-top: var(--space-2);
		border-collapse: collapse;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.chart__table :is(th, td) {
		padding: var(--space-1);
		text-align: right;
		border-bottom: 1px solid var(--border);
	}

	.chart__table :is(thead th, tbody th) {
		text-align: left;
		color: var(--text);
	}
</style>
