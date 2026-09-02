/**
 * A COLOUR PER SERVICE
 * ====================
 *
 * Derived from the name, never assigned from a pool.
 *
 * Assigning from a pool is the obvious implementation and it is wrong in a way
 * that only shows up in use: the same service is teal in one trace and amber in
 * the next, because the pool is handed out in whatever order the spans happened
 * to arrive. "The teal one" then stops being a way to refer to anything, and
 * comparing two traces side by side — which is most of what anybody does with a
 * trace viewer — means re-reading every label.
 *
 * Hashing the name fixes that for free and across page loads, machines and
 * people. The cost is collisions: two services can land on the same hue. That
 * is a real cost and it is smaller than the alternative, because a collision
 * makes two rows look similar while an unstable palette makes *every* row
 * unrecognisable.
 */

/**
 * FNV-1a, 32-bit.
 *
 * A hash, not a cryptographic one — the requirement is that small changes in the
 * input scatter, which FNV does, and that it produces the same number in every
 * JavaScript engine, which `Math.imul` guarantees by forcing 32-bit
 * multiplication. Without `imul`, the multiply goes through a double and loses
 * the low bits, so the "hash" degenerates and half the services get the same
 * colour.
 */
export function hueFor(service: string): number {
	let hash = 2166136261;
	for (let i = 0; i < service.length; i += 1) {
		hash ^= service.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 360;
}

/**
 * The bar colour for a service, in `oklch`.
 *
 * `oklch` rather than `hsl`, and this is not a preference. In HSL, yellow at 50%
 * lightness is far brighter than blue at 50% — the number means "halfway between
 * black and full colour", which is a different amount of light for every hue. A
 * palette built from it has bars whose white label is unreadable and bars that
 * glare. `oklch` lightness is *perceptual*, so one lightness value gives every
 * hue the same apparent brightness, and one contrast decision holds for all 360.
 */
export function barColour(service: string, lightness = 0.45, chroma = 0.09): string {
	return `oklch(${lightness} ${chroma} ${hueFor(service)})`;
}
