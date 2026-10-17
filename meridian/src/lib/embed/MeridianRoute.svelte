<script lang="ts">
	/**
	 * <meridian-route slug="…" origin="…">
	 * ====================================
	 *
	 * A trip's route on any page: one script tag, one element, no framework
	 * on the host page. Every build that loads this folder compiles it with
	 * `customElement: true`, so Svelte wraps it in a custom element class —
	 * `element.ts` registers that class as `<meridian-route>` — with an open
	 * shadow root, so the host page's CSS cannot reach in and ours cannot
	 * leak out. The style block below is the whole of its styling. The two
	 * props become the element's two attributes, `slug` and `origin`, read
	 * as strings: Svelte takes them from the destructuring below, which is
	 * why they are destructured rather than read off one `props` object.
	 *
	 * It fetches `/api/route/<slug>.json` from the app's origin and draws the
	 * stops as a small projected line, the same way `RouteThumb` does inside
	 * the app. It is deliberately not the app's component: an element that
	 * imported the design tokens would bring the tokens with it.
	 */
	interface RouteStop {
		readonly id: string;
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

	/** A stop's place in the drawing, named by the stop it stands for. */
	interface Dot {
		readonly id: string;
		readonly x: string;
		readonly y: string;
	}

	/** Longitude across, latitude up, scaled to fit — right for a trip, wrong for the world. */
	function project(stops: readonly RouteStop[]): Dot[] {
		if (stops.length === 0) return [];
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
		return stops.map((s) => ({
			id: s.id,
			x: (offsetX + (s.lng - west) * scale).toFixed(1),
			y: (HEIGHT - offsetY - (s.lat - south) * scale).toFixed(1)
		}));
	}
</script>

<!--
	This boundary is the one in the project that is handed the thrown value
	itself. Inside the app SvelteKit passes every failure through
	`handleError` first and a `failed` snippet gets an `App.Error`; this
	element runs on somebody else's page with no SvelteKit around it, so what
	`load` threw — an `Error` — is what arrives. The two declarations are
	`$derived` so that a host page changing `slug` gets the new route.
-->
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

	{const route = $derived(await load(slug, base))}
	{const dots = $derived(project(route.stops))}

	<div class="card">
		<p class="title">{route.name}</p>
		<p class="muted">{route.startDate} → {route.endDate}</p>
		<svg viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="Route of {route.name}">
			{#if dots.length > 0}
				<polyline points={dots.map((dot) => `${dot.x},${dot.y}`).join(' ')} />
				{#each dots as dot (dot.id)}
					<circle cx={dot.x} cy={dot.y} r="4" />
				{/each}
			{/if}
		</svg>
		<ol>
			{#each route.stops as stop (stop.id)}
				<li>{stop.name}{stop.date ? ` · ${stop.date}` : ''}</li>
			{/each}
		</ol>
		<!-- `external` is the literal truth here: this element lives on somebody else's page. -->
		<a class="powered" href="{base}/t/{route.slug}" target="_blank" rel="noopener external">
			Planned with Meridian
		</a>
	</div>
</svelte:boundary>

<style>
	/*
	 * Six colours, hand-copied from `tokens.css` because a shadow root cannot
	 * read the host page's custom properties and this element must not bring
	 * the tokens with it: paper, raised paper, the hairline, ink, secondary
	 * ink, the sea for the route — each as the same `light-dark()` pair the
	 * token holds.
	 *
	 * `light-dark()` resolves against the element's `color-scheme`, which it
	 * inherits from the host page through the shadow boundary. So the host
	 * decides: a page that declares `color-scheme: light dark` gets the dark
	 * card on a dark system, and a page that declares nothing — light-only,
	 * whatever the visitor's system says — gets the light card. A
	 * `prefers-color-scheme` query would have asked the visitor's system
	 * instead, and put a dark card on a light page.
	 */
	:host {
		display: block;
		max-width: 22rem;
		font:
			14px/1.45 system-ui,
			sans-serif;
		color: light-dark(#171a1f, #eef1f5);
	}

	.card {
		border: 1px solid light-dark(#e2dccf, #2b323d);
		border-radius: 14px;
		padding: 14px 16px;
		background: light-dark(#ffffff, #171b22);
	}

	.title {
		margin: 0;
		font-weight: 600;
		font-size: 16px;
	}

	.muted {
		margin: 2px 0 8px;
		color: light-dark(#4b5160, #aeb6c2);
		font-size: 13px;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 6px;
		background: light-dark(#f8f5ee, #101318);
	}

	polyline {
		fill: none;
		stroke: light-dark(#0f766e, #2dd4bf);
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
		stroke-dasharray: 5 4;
	}

	circle {
		fill: light-dark(#ffffff, #171b22);
		stroke: light-dark(#0f766e, #2dd4bf);
		stroke-width: 2;
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
		color: light-dark(#0f766e, #2dd4bf);
	}
</style>
