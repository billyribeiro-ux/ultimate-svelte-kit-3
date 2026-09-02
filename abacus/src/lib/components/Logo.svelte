<script lang="ts">
	import { draw } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';

	/**
	 * The mark: four beads on a rod — an abacus, drawn as one stroke.
	 *
	 * `draw` animates a path's `stroke-dashoffset` from its full length to
	 * zero, so the logo writes itself on first paint. It runs once, on mount,
	 * because the header is never destroyed by a navigation. For anybody who
	 * asked for reduced motion the duration is zero and the stroke is simply
	 * there.
	 */
	let { size = 28 }: { size?: number } = $props();

	const duration = $derived(prefersReducedMotion.current ? 0 : 900);
</script>

<svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
	<path
		in:draw={{ duration }}
		d="M4 16 H28 M8 8 V24 M14 8 V24 M20 8 V24 M26 8 V24"
		stroke="var(--accent)"
		stroke-width="2.5"
		stroke-linecap="round"
	/>
	<circle cx="8" cy="12" r="2.4" fill="var(--accent)" />
	<circle cx="14" cy="20" r="2.4" fill="var(--accent)" />
	<circle cx="20" cy="12" r="2.4" fill="var(--accent)" />
	<circle cx="26" cy="20" r="2.4" fill="var(--accent)" />
</svg>
