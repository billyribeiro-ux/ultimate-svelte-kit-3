<script lang="ts">
	import { bearing, compassPoint, distance, formatDistance } from '@meridian/waypoint/geo';
	import gazetteer from '#lib/data/places.json' with { type: 'json' };
	import { getLocale } from '#lib/paraglide/runtime.js';

	/**
	 * A COMPONENT INSIDE MARKDOWN
	 * ===========================
	 *
	 * `<Leg from="lisbon" to="sintra" />` in a guide renders the distance and
	 * the compass direction between two gazetteer places, computed by the
	 * geodesy library. The guides are prerendered, so the arithmetic runs once
	 * at build time and the reader receives a sentence.
	 */
	interface Props {
		from: string;
		to: string;
	}

	let { from, to }: Props = $props();

	const place = (id: string) => {
		const found = gazetteer.find((p) => p.id === id);
		if (!found) throw new Error(`Leg: unknown place "${id}"`);
		return found;
	};

	const a = $derived(place(from));
	const b = $derived(place(to));
	const length = $derived(formatDistance(distance(a, b), getLocale()));
	const direction = $derived(compassPoint(bearing(a, b)));
</script>

<span class="leg">
	<strong>{a.name} → {b.name}</strong>
	<span class="leg__facts">{length} · {direction}</span>
</span>

<style>
	.leg {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: baseline;
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-sm);
		background: var(--sea-soft);
		color: var(--sea);
		font-size: var(--text-sm);
	}

	.leg__facts {
		font-variant-numeric: tabular-nums;
	}
</style>
