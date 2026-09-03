<script lang="ts">
	// A sandbox for the library while it is being written. `pnpm run dev` in
	// this folder serves it; nothing here is published.
	import { Compass, Route, Sparkline, formatDistance } from '../lib/index.js';

	const route = new Route([
		{ id: 'lis', name: 'Lisbon', lng: -9.1393, lat: 38.7223 },
		{ id: 'mad', name: 'Madrid', lng: -3.7038, lat: 40.4168 },
		{ id: 'bcn', name: 'Barcelona', lng: 2.1734, lat: 41.3851 }
	]);
</script>

<h1>@meridian/waypoint</h1>
<p>{formatDistance(route.total)} over {route.legs.length} legs</p>
<ul>
	{#each route.legs as leg (leg.from.id)}
		<li>
			<Compass bearing={leg.bearing} size={32} />
			{leg.from.name} → {leg.to.name}: {formatDistance(leg.distance)}
		</li>
	{/each}
</ul>
<Sparkline values={route.legs.map((leg) => leg.distance)} label="Leg lengths" />
<button onclick={() => route.move(0, 2)}>Rotate</button>
