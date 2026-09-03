<svelte:options
	customElement={{
		tag: 'meridian-route',
		shadow: 'open',
		props: {
			slug: { attribute: 'slug', type: 'String' },
			origin: { attribute: 'origin', type: 'String' }
		}
	}}
/>

<script lang="ts">
	/**
	 * <meridian-route slug="…" origin="…">
	 * ====================================
	 *
	 * A trip's route on any page: one script tag, one element, no framework
	 * on the host page. Svelte compiles this component to a custom element
	 * — `customElements.define('meridian-route', …)` happens on import — with
	 * a shadow root, so the host page's CSS cannot reach in and ours cannot
	 * leak out. The style block below is the whole of its styling.
	 *
	 * It fetches `/api/route/<slug>.json` from the app's origin and draws the
	 * stops as a small projected line, the same way `RouteThumb` does inside
	 * the app. It is deliberately not the app's component: an element that
	 * imported the design tokens would bring the tokens with it.
	 */
	interface RouteStop {
		readonly name: string;
		readonly kind: string;
		readonly date: string | null;
		readonly lng: number;
		readonly lat: number;
	}

	interface RouteData {
		readonly name: string;
		readonly slug: string;
		readonly startDate: string;
		readonly endDate: string;
		readonly stops: readonly RouteStop[];
	}

	interface Props {
		slug?: string;
		origin?: string;
	}

	let { slug = '', origin = '' }: Props = $props();

	const base = $derived(origin || (typeof location === 'undefined' ? '' : location.origin));

	async function load(slug: string, base: string): Promise<RouteData> {
		if (!slug) throw new Error('meridian-route needs a slug attribute');
		const response = await fetch(`${base}/api/route/${slug}.json`);
		if (!response.ok) throw new Error(`Meridian answered ${response.status}`);
		return (await response.json()) as RouteData;
	}

	const WIDTH = 320;
	const HEIGHT = 160;

	/** Longitude across, latitude up, scaled to fit — right for a trip, wrong for the world. */
	function project(stops: readonly RouteStop[]): string {
		if (stops.length === 0) return '';
		const lngs = stops.map((s) => s.lng);
		const lats = stops.map((s) => s.lat);
		const west = Math.min(...lngs);
		const south = Math.min(...lats);
		const spanX = Math.max(Math.max(...lngs) - west, 0.5);
		const spanY = Math.max(Math.max(...lats) - south, 0.5);
		const inset = 14;
		const scale = Math.min((WIDTH - inset * 2) / spanX, (HEIGHT - inset * 2) / spanY);
		const offsetX = (WIDTH - spanX * scale) / 2;
		const offsetY = (HEIGHT - spanY * scale) / 2;
		return stops
			.map(
				(s) =>
					`${(offsetX + (s.lng - west) * scale).toFixed(1)},${(HEIGHT - offsetY - (s.lat - south) * scale).toFixed(1)}`
			)
			.join(' ');
	}
</script>

<svelte:boundary>
	{#snippet pending()}
		<div class="card"><p class="muted">Loading the route…</p></div>
	{/snippet}
	{#snippet failed(error)}
		<div class="card">
			<p class="muted">
				{error instanceof Error ? error.message : 'The route could not be loaded.'}
			</p>
		</div>
	{/snippet}

	{const route = await load(slug, base)}
	{const points = project(route.stops)}

	<div class="card">
		<p class="title">{route.name}</p>
		<p class="muted">{route.startDate} → {route.endDate}</p>
		<svg viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="Route of {route.name}">
			{#if points}
				<polyline {points} />
				{#each points.split(' ') as point, index (index)}
					{@const [x, y] = point.split(',')}
					<circle cx={x} cy={y} r="4" />
				{/each}
			{/if}
		</svg>
		<ol>
			{#each route.stops as stop, index (index)}
				<li>{stop.name}{stop.date ? ` · ${stop.date}` : ''}</li>
			{/each}
		</ol>
		<a class="powered" href="{base}/t/{route.slug}" target="_blank" rel="noopener">
			Planned with Meridian
		</a>
	</div>
</svelte:boundary>

<style>
	:host {
		display: block;
		max-width: 22rem;
		font:
			14px/1.45 system-ui,
			sans-serif;
		color: #1c2733;
	}

	.card {
		border: 1px solid #d8dee6;
		border-radius: 12px;
		padding: 14px 16px;
		background: #ffffff;
	}

	.title {
		margin: 0;
		font-weight: 600;
		font-size: 16px;
	}

	.muted {
		margin: 2px 0 8px;
		color: #667385;
		font-size: 13px;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 8px;
		background: #eef4f8;
	}

	polyline {
		fill: none;
		stroke: #1f6f8b;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	circle {
		fill: #ff6b57;
		stroke: #ffffff;
		stroke-width: 1.5;
	}

	ol {
		margin: 10px 0 0;
		padding-left: 1.2em;
		font-size: 13px;
	}

	.powered {
		display: inline-block;
		margin-top: 10px;
		font-size: 12px;
		color: #1f6f8b;
	}
</style>
