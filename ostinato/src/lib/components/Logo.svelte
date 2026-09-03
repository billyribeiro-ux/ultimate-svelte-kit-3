<script lang="ts">
	import { draw } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';

	/**
	 * The mark: a repeating figure — an ostinato — drawn as one stroke.
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
		d="M3 20 C6 20 6 12 9 12 S12 20 15 20 S18 12 21 12 S24 20 27 20 S30 12 30 12"
		stroke="var(--accent)"
		stroke-width="2.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<circle cx="9" cy="24" r="1.6" fill="var(--accent)" />
	<circle cx="21" cy="24" r="1.6" fill="var(--accent)" />
</svg>
