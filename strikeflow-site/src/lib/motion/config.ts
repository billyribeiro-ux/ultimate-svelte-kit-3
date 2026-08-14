/**
 * THE MOTION LANGUAGE
 * ===================
 *
 * Every duration, easing curve and stagger value in the project lives here. It is
 * the same idea as `tokens.css`, applied to time instead of colour: when a component
 * invents its own `duration: 0.7` you get a site where nothing quite agrees with
 * anything else, and it reads as amateurish without anyone being able to say why.
 *
 * WHAT MAKES MOTION LOOK EXPENSIVE
 * --------------------------------
 * Three things, none of them complicated:
 *
 * 1. THE EASE. Linear motion looks like a machine. `ease-in-out` looks like a 2014
 *    jQuery site. Cinematic motion starts fast and decelerates for a long time —
 *    a strong "out" curve. The eye reads that as weight and inertia, because that
 *    is how physical objects actually behave.
 *
 * 2. OVERLAP. Amateur sequences play one thing, then the next, then the next.
 *    Professional sequences start the next element while the previous is still
 *    ~60% through. The result feels choreographed rather than queued.
 *
 * 3. DIRECTION AND DISTANCE. Everything moves a small distance in a consistent
 *    direction. 16–40px, always up on reveal. Big travel looks cheap; inconsistent
 *    direction looks chaotic.
 *
 * THE HARD PERFORMANCE RULE
 * -------------------------
 * We animate `transform` and `opacity` and nothing else. Those two are the only
 * properties a browser can composite on the GPU without re-running layout or paint.
 * Animating `width`, `height`, `top`, `left` or `margin` forces a layout on every
 * single frame, which is how you get janky 30fps motion on a mid-range phone.
 */

/**
 * Durations, in seconds (GSAP's unit).
 *
 * The range is deliberately narrow. Anything under ~0.2s reads as an instant state
 * change rather than a movement; anything over ~1.4s and the user is waiting for
 * your website to finish having an opinion.
 */
export const duration = {
	/** Micro-interactions: button presses, hover states. */
	instant: 0.18,
	/** Small UI moves. */
	quick: 0.32,
	/** The default for a scroll reveal. */
	base: 0.7,
	/** Hero elements, where weight matters. */
	slow: 1.05,
	/** The single largest move on the page. Use once. */
	cinematic: 1.35
} as const;

/**
 * Stagger — the delay between successive items in a group.
 *
 * Small numbers. 0.06–0.1s reads as one coordinated wave; 0.3s reads as a queue of
 * unrelated elements taking turns, which is the single most common way a good
 * animation is ruined.
 */
export const stagger = {
	tight: 0.045,
	base: 0.075,
	loose: 0.11
} as const;

/**
 * Easing curves, as SVG paths for GSAP's CustomEase.
 *
 * These are the signature of the site's motion. Written as cubic Bézier control
 * points, where the curve maps progress-through-time (x) to progress-through-the-
 * animation (y).
 */
export const easePath = {
	/**
	 * The house ease. Extremely fast start, very long tail.
	 *
	 * Reads as: the object was already moving and is now settling into place. This is
	 * the curve doing most of the work in making the site feel expensive.
	 */
	out: 'M0,0 C0.12,0.82 0.16,1 1,1',

	/**
	 * For elements that both enter and leave — drawers, modals.
	 * Symmetrical, so the exit mirrors the entrance.
	 */
	inOut: 'M0,0 C0.76,0 0.24,1 1,1',

	/**
	 * A restrained overshoot. Travels slightly past the target and settles back.
	 *
	 * Use sparingly — on one hero element, or a success state. Everywhere at once and
	 * the page looks bouncy, which reads as playful rather than premium.
	 */
	overshoot: 'M0,0 C0.16,0.9 0.28,1.06 1,1'
} as const;

/** Distances, in pixels. Consistent and small. */
export const travel = {
	sm: 16,
	base: 28,
	lg: 44
} as const;

/**
 * When a scroll-triggered element should start animating.
 *
 * "top 85%" means: begin when the top of the element reaches 85% of the way down
 * the viewport — i.e. just as it comes into view from below. Waiting until it is
 * fully on screen means the user sees a static element, then it moves, which looks
 * broken. Starting too early means the animation finishes before it is visible.
 */
export const trigger = {
	enter: 'top 85%',
	enterLate: 'top 70%'
} as const;
