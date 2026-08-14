/**
 * THE MOTION SYSTEM
 *
 * One import point for every animation behaviour in the project.
 *
 * Every attachment here follows the same three rules, and if you add one it must too:
 *
 *   1. **Never gate content behind it.** If the animation does not run, the content
 *      must still be readable. Motion is an enhancement.
 *   2. **Return `null` fast under reduced motion.** Do not animate, and do not make
 *      the user download an animation library they asked not to see.
 *   3. **Clean up completely.** Return a teardown that reverts the GSAP context.
 *      A leaked ScrollTrigger keeps recalculating on every scroll event forever.
 */

export { loadMotion, prefersReducedMotion, releaseMotionGate, type MotionApi } from './gsap.ts';
export { duration, stagger, travel, trigger, easePath } from './config.ts';

export { reveal, revealGroup, type RevealOptions } from './reveal.ts';
export { headline, type HeadlineOptions } from './headline.ts';
export { heroSequence, parallax } from './hero.ts';
export { counter, type CounterOptions } from './counter.ts';
export { magnetic, type MagneticOptions } from './magnetic.ts';
