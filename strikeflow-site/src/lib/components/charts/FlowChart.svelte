<!--
	FLOW CHART — TradingView Lightweight Charts
	===========================================

	Three things here are worth understanding, because they're the parts people
	usually get wrong when wrapping an imperative chart library in a component.

	1. WE USE {@attach}, NOT onMount.
	   An attachment is a function that runs when the element is added to the DOM and
	   returns a cleanup function. Unlike `onMount`, it receives the element directly
	   (no `bind:this` and no null check), and it re-runs automatically if any state
	   it reads SYNCHRONOUSLY changes. It's the modern replacement for both
	   `onMount`-plus-`bind:this` and `use:` actions.

	2. THE LIBRARY IS DYNAMICALLY IMPORTED.
	   `lightweight-charts` is ~48kB gzipped and touches the DOM, so it can't run
	   during server rendering. `await import(...)` inside the attachment does two
	   jobs at once: it guarantees the code only executes in the browser, and it tells
	   the bundler to split it into its own chunk. The initial page load — the thing
	   Largest Contentful Paint measures — never downloads it. It arrives after the
	   page is already interactive.

	3. A CHART IS NOT ACCESSIBLE ON ITS OWN.
	   It renders to <canvas>, which to a screen reader is a blank rectangle. Every
	   number the chart conveys is therefore ALSO available as real text — in the stat
	   row beside it and in a visually-hidden summary. If your chart is the only place
	   some information exists, that information doesn't exist for a chunk of your users.

	The data is clearly labelled as illustrative. Presenting simulated data as a live
	feed on a financial site would be a misrepresentation.
-->

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { prefersReducedMotion } from 'svelte/motion';
	import {
		generateSeries,
		nextPoint,
		mulberry32,
		formatUsd,
		type PricePoint
	} from '#lib/utils/market-data.ts';

	interface Props {
		/** Chart height in pixels. Kept short on phones by the caller. */
		height?: number;
		/** Ticker shown in the header strip. */
		symbol?: string;
		/** Append a new bar on a timer. Automatically disabled for reduced-motion users. */
		live?: boolean;
		/** Change for a different deterministic shape. */
		seed?: number;
	}

	let { height = 300, symbol = 'SPY', live = true, seed = 20260814 }: Props = $props();

	/*
	 * Generated synchronously, so it exists during server rendering. The stat row is
	 * therefore real text in the initial HTML — visible before any JavaScript runs,
	 * and readable by a crawler.
	 *
	 * `$derived` rather than a plain `const` because `seed` is a prop. A plain const
	 * would capture whatever `seed` was on first render and silently ignore later
	 * changes — which is exactly what Svelte's `state_referenced_locally` warning is
	 * telling you when you see it.
	 */
	const initial = $derived(generateSeries({ seed }));

	/*
	 * The live tail.
	 *
	 * `null` until the first tick arrives, at which point the readouts switch from
	 * the generated values to the live ones. Modelling it as "one nullable object"
	 * rather than three separate `$state` variables means the three numbers can never
	 * disagree with each other mid-update.
	 */
	let tick = $state<{ last: number; changeAbs: number; changePct: number } | null>(null);

	const last = $derived(tick?.last ?? initial.last);
	const changeAbs = $derived(tick?.changeAbs ?? initial.changeAbs);
	const changePct = $derived(tick?.changePct ?? initial.changePct);

	const isUp = $derived(changeAbs >= 0);

	/*
	 * `prefersReducedMotion` from `svelte/motion` is a ready-made reactive media
	 * query. `.current` is `false` during SSR and updates in the browser. Reading it
	 * inside `$derived` means the chart stops ticking the moment a user changes the
	 * setting — no reload needed.
	 *
	 * A chart that animates forever is a genuine accessibility problem: WCAG 2.2.2
	 * requires that moving content lasting more than five seconds can be paused.
	 * Honouring the OS setting satisfies that without a pause button nobody finds.
	 */
	const shouldAnimate = $derived(live && !prefersReducedMotion.current);

	/**
	 * The chart attachment.
	 *
	 * An attachment runs inside an effect, and an effect depends on exactly the
	 * reactive values it reads SYNCHRONOUSLY — before its first `await`. Reads after
	 * the `await import(…)` below, or inside the timer's callback, are not tracked
	 * at all. So the three reads at the top are the whole dependency list: change
	 * `seed` (through `initial`), `live`, or the reduced-motion setting, and Svelte
	 * tears the old chart down via the returned cleanup and builds a new one.
	 *
	 * `height` is deliberately not on that list. It reaches the chart through CSS —
	 * the container's `min-height` — and `autoSize` follows the container, so a
	 * height change resizes the chart in place instead of rebuilding it.
	 */
	const chart: Attachment<HTMLDivElement> = (node) => {
		// Guards the async gap: if the component unmounts while the dynamic import is
		// still in flight, we must not go on to create a chart in a detached node.
		let disposed = false;
		let teardown: (() => void) | undefined;

		// Read everything this chart is built from NOW, before the await. These reads
		// are what make the attachment re-run when they change; the same reads after
		// the await would be silently ignored, and would see a later moment's values
		// than the ones this chart was built for.
		const data = initial;
		const animate = shouldAnimate;
		// Seeded separately (seed + 1) so the live tail is deterministic too, but
		// doesn't simply repeat the initial series.
		const tailSeed = seed + 1;

		// A fresh chart means a fresh tail.
		tick = null;

		void (async () => {
			const { createChart, AreaSeries, HistogramSeries, ColorType, CrosshairMode, LineStyle } =
				await import('lightweight-charts');

			if (disposed) return;

			const api = createChart(node, {
				// ResizeObserver-backed. Saves writing one ourselves, and it correctly
				// handles the container changing size without the window resizing —
				// which a `window.onresize` handler would miss entirely. With autoSize
				// on, the library ignores `width` and `height` options, so we pass
				// neither: the container's CSS size is the one source of truth.
				autoSize: true,
				layout: {
					background: { type: ColorType.Solid, color: 'transparent' },
					textColor: '#7f8ba3',
					fontFamily: "'Sofia Sans Variable', system-ui, sans-serif",
					attributionLogo: false
				},
				grid: {
					vertLines: { color: 'rgba(43, 53, 73, 0.35)' },
					horzLines: { color: 'rgba(43, 53, 73, 0.35)' }
				},
				rightPriceScale: {
					borderVisible: false,
					scaleMargins: { top: 0.12, bottom: 0.28 }
				},
				timeScale: {
					borderVisible: false,
					timeVisible: true,
					secondsVisible: false
				},
				crosshair: {
					mode: CrosshairMode.Normal,
					vertLine: {
						color: '#4f7dff',
						width: 1,
						style: LineStyle.Dashed,
						labelBackgroundColor: '#3b63e8'
					},
					horzLine: { color: '#4f7dff', labelBackgroundColor: '#3b63e8' }
				},
				handleScroll: false,
				handleScale: false
			});

			let timer: ReturnType<typeof setInterval> | undefined;

			// Assigned the moment the chart exists, so every path below — the early
			// return included — still disposes of it.
			teardown = () => {
				clearInterval(timer);
				// `remove()` disposes the canvas, the ResizeObserver and every internal
				// listener. Skip it and you leak a full chart instance on every
				// navigation — which on a SPA compounds until the tab dies.
				api.remove();
			};

			/*
			 * v5 API note: series are created with `addSeries(Definition, options)`.
			 * The v4 style — `chart.addAreaSeries(options)` — was removed. Most
			 * tutorials you'll find online are still v4, and this is the line that
			 * breaks.
			 */
			const priceSeries = api.addSeries(AreaSeries, {
				lineColor: '#4f7dff',
				lineWidth: 2,
				topColor: 'rgba(79, 125, 255, 0.28)',
				bottomColor: 'rgba(79, 125, 255, 0.01)',
				priceLineVisible: false,
				lastValueVisible: false
			});

			const volumeSeries = api.addSeries(HistogramSeries, {
				priceFormat: { type: 'volume' },
				// An empty priceScaleId makes this an overlay with its own invisible
				// scale, so volume bars sit under the price line instead of squashing it.
				priceScaleId: ''
			});

			volumeSeries.priceScale().applyOptions({
				scaleMargins: { top: 0.78, bottom: 0 }
			});

			// `slice()` because `setData` wants a mutable array and our source arrays
			// are `readonly` — a copy is cheaper than weakening the type.
			priceSeries.setData(data.price.slice());
			volumeSeries.setData(data.volume.slice());
			api.timeScale().fitContent();

			if (animate) {
				const random = mulberry32(tailSeed);

				const lastPoint = data.price[data.price.length - 1];
				const firstValue = data.price[0]?.value ?? data.last;
				if (!lastPoint) return;

				let cursor: PricePoint = lastPoint;
				// Kept locally: this callback is the only thing that moves the tail, so
				// it already knows the previous value. Reading the `last` derived here
				// would not be tracked — a timer callback never is — but it would tie
				// the callback to the readout it is about to overwrite.
				let previousValue = cursor.value;

				timer = setInterval(() => {
					cursor = nextPoint(cursor, random);

					priceSeries.update({ time: cursor.time, value: cursor.value });
					volumeSeries.update({
						time: cursor.time,
						value: Math.round(180 + random() * 500),
						color:
							cursor.value >= previousValue ? 'rgba(22, 199, 132, 0.5)' : 'rgba(234, 57, 67, 0.5)'
					});

					previousValue = cursor.value;

					tick = {
						last: cursor.value,
						changeAbs: Number((cursor.value - firstValue).toFixed(2)),
						changePct: Number((((cursor.value - firstValue) / firstValue) * 100).toFixed(2))
					};
				}, 1600);
			}
		})();

		return () => {
			disposed = true;
			teardown?.();
		};
	};
</script>

<figure class="chart">
	<div class="chart__head">
		<div class="chart__id">
			<span class="chart__symbol">{symbol}</span>
			<span class="chart__meta">Illustrative sample data</span>
		</div>

		<div class="chart__readout tabular">
			<span class="chart__price">{formatUsd(last)}</span>
			<span class={['chart__change', isUp ? 'is-up' : 'is-down']}>
				{isUp ? '+' : ''}{changeAbs.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
			</span>
		</div>
	</div>

	<!--
		The canvas mount point.

		`aria-hidden` because the canvas conveys nothing to assistive tech; the
		<figcaption> below carries the same information as text. Hiding it prevents a
		screen reader announcing an empty graphic.
	-->
	<div
		class="chart__canvas"
		style="min-height: {height}px"
		aria-hidden="true"
		{@attach chart}
	></div>

	<figcaption class="chart__caption">
		<span class="visually-hidden">
			Illustrative intraday price chart for {symbol}. Latest value {formatUsd(last)}, a change of
			{changeAbs.toFixed(2)} dollars or {changePct.toFixed(2)} percent across the session shown. This
			is sample data for demonstration, not live market data.
		</span>
		<span aria-hidden="true">Sample intraday flow — not live market data</span>
	</figcaption>
</figure>

<style>
	.chart {
		margin: 0;
		background-color: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.chart__head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-4) var(--space-4) var(--space-2);
		border-bottom: 1px solid var(--border);
	}

	.chart__id {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		min-width: 0;
	}

	.chart__symbol {
		font-family: var(--font-heading);
		font-size: var(--fs-md);
		font-weight: var(--weight-bold);
		color: var(--text-primary);
		letter-spacing: var(--tracking-snug);
	}

	.chart__meta {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}

	.chart__readout {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.chart__price {
		font-family: var(--font-heading);
		font-size: var(--fs-lg);
		font-weight: var(--weight-semibold);
		color: var(--text-primary);
	}

	.chart__change {
		font-size: var(--fs-sm);
		font-weight: var(--weight-semibold);
	}

	/*
	 * Colour is a redundant cue here, never the only one: the sign (+ / −) is always
	 * present in the text. Roughly one in twelve men has some form of colour vision
	 * deficiency, and red/green is the common axis — which is an unfortunate default
	 * for finance UI.
	 */
	.chart__change.is-up {
		color: var(--bull-400);
	}

	.chart__change.is-down {
		color: var(--bear-400);
	}

	.chart__canvas {
		width: 100%;
	}

	.chart__caption {
		padding: var(--space-2) var(--space-4) var(--space-3);
		font-size: var(--fs-xs);
		color: var(--text-muted);
		border-top: 1px solid var(--border);
	}

	@media (min-width: 48em) {
		.chart__head {
			padding-inline: var(--space-5);
		}

		.chart__caption {
			padding-inline: var(--space-5);
		}
	}
</style>
