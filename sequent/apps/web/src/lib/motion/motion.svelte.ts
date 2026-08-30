/**
 * The motion system, and an argument about restraint.
 *
 * ## Motion on a trading screen is information, not decoration
 *
 * The two earlier projects animate to persuade: a marketing page wants you to
 * feel something, so a headline can afford to arrive in pieces over 1.2
 * seconds. This one is stared at for nine hours by somebody whose attention is
 * the scarcest resource in the building, and every pixel that moves without
 * meaning is a false alarm.
 *
 * So the rule here is stricter than "use motion tastefully". It is:
 *
 *   **Nothing moves unless the movement is the message.**
 *
 * A price that flashes green flashed *because it went up*, and a trader reads
 * that flash faster than they can read the number. A tape entry that slides in
 * from the top is telling you it is new. A bar that eases to its new width lets
 * you see liquidity being eaten rather than teleporting. Every one of those is
 * data arriving through a channel that does not require reading.
 *
 * What is banned: entrance animations on data, parallax, anything that delays a
 * number appearing, anything that runs on a loop. If a trader has to wait for
 * an animation to finish before they can act, the animation has cost money.
 *
 * ## Where the cinema goes
 *
 * The restraint is not timidity — it is budgeting. Three moments in this app
 * *are* cinematic, and they earn it by being rare and consequential: signing
 * in, an instrument opening, and the kill switch. Those get the full treatment,
 * and they land precisely because nothing else does.
 *
 * ## Why GSAP and not CSS
 *
 * Most of what follows could be a CSS transition, and where it can be, it is —
 * a hover state has no business in JavaScript. GSAP earns its place for three
 * things CSS cannot do:
 *
 *   **Interrupting cleanly.** A price that ticks three times in 200ms needs the
 *   second flash to take over from the first mid-flight, from wherever it got
 *   to. CSS animations restart from the beginning, which produces a visible
 *   stutter exactly when the market is busiest.
 *
 *   **Sequencing.** A timeline that coordinates six elements with overlapping
 *   offsets is a paragraph in GSAP and an unmaintainable pile of
 *   `animation-delay` in CSS.
 *
 *   **Animating what CSS cannot.** Counting a number from one value to another
 *   is not a CSS property.
 */

import { gsap } from 'gsap';
import type { Attachment } from 'svelte/attachments';

/* -------------------------------------------------------------------------- */
/* Reduced motion                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Whether the person using this has asked for less movement.
 *
 * Checked live rather than read once, because it can change while the page is
 * open — somebody toggling it in system settings expects the page to obey
 * without a reload.
 *
 * ## What "reduce" does and does not mean
 *
 * It does not mean "no feedback". A trader who has set it still needs to know a
 * price moved, and silently removing the flash would remove information rather
 * than motion. So the reduced path keeps the *colour* change and drops the
 * *movement* — the signal survives, the vestibular trigger does not.
 *
 * Treating the preference as "turn animations off" is the common mistake, and
 * it usually makes an interface worse for the people who asked for it.
 */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return true;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/*
 * GSAP's global defaults.
 *
 * `power2.out` for almost everything: fast at the start, settling at the end.
 * That is what physical objects do, and it is what makes an interface feel
 * responsive — the movement has visibly *begun* within a frame or two of the
 * click, even if it takes 300ms to finish.
 *
 * `power2.in` — slow start, fast finish — is what things do when they fall, and
 * on a button press it reads as lag.
 */
gsap.defaults({ ease: 'power2.out', duration: 0.35 });

/* -------------------------------------------------------------------------- */
/* Durations                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Named durations, so the whole app agrees on what "quick" means.
 *
 * The numbers are not arbitrary. Below about 100ms a change reads as a jump
 * rather than a movement, and the eye cannot follow where anything went. Above
 * about 400ms an interface starts to feel like it is thinking, and the user
 * starts to feel like they are waiting.
 *
 * The exception is `cinematic`, which is deliberately long because the moments
 * it is for are moments you want somebody to *stop* and register.
 */
export const DURATION = {
	/** A flash, a state change, a colour. Barely perceptible as motion. */
	instant: 0.12,
	/** The default. Panels, rows, bars. */
	quick: 0.35,
	/** A panel entering, a sheet sliding up. */
	settled: 0.55,
	/** Sign-in, market open, kill switch. Three places, and no more. */
	cinematic: 1.1
} as const;

export { gsap };

/* -------------------------------------------------------------------------- */
/* Attachments                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Svelte attachments, which is the right shape for this and worth saying why.
 *
 * An attachment is a function that runs in an effect when its element mounts,
 * and may return a cleanup function. That gives us three things a component
 * wrapper would not: the animation code never appears in the markup, it runs
 * **only in the browser** (effects do not run during server rendering, so
 * there is no `typeof window` check anywhere below), and cleanup is structural
 * rather than remembered.
 *
 * That last point matters more than it sounds. Every animation here holds a
 * reference to a DOM node; without a cleanup that kills the tween, a page with
 * a live-updating list leaks one tween per row per update, forever.
 *
 * ## Why not actions
 *
 * This file used to export Svelte *actions* returning `{ update, destroy }`.
 * The official docs now mark that return shape as legacy — "prior to the
 * `$effect` rune, actions could return an object with `update` and `destroy`
 * methods … using effects is preferred" — and recommend attachments outright
 * for 5.29+. The two that genuinely react to changing values (`flash` and
 * `count`) use the documented pattern for controlling re-runs: the value
 * arrives as a **getter** and is read inside a child `$effect`, so the
 * per-node setup runs once and only the update logic re-runs. This is also why
 * the file is `motion.svelte.ts` — the `.svelte.ts` suffix is what lets a
 * shared module use runes.
 */

export interface RevealOptions {
	/** Seconds to wait. Use for staggering siblings. */
	readonly delay?: number;
	/** How far it travels, in pixels. Small — this is a hint, not a journey. */
	readonly distance?: number;
	readonly duration?: number;
}

/**
 * The longest any entrance may run, delay included.
 *
 * ## Why there is a ceiling at all
 *
 * An element that is still moving is an element that is harder to click. The
 * browser hit-tests against wherever it is *now*, so the click lands — but the
 * user aimed at where it was, and on a control that matters they miss.
 *
 * This was found by a test rather than by looking: Playwright refuses to click
 * anything that has not stopped moving, and it sat waiting on the admin page
 * for the full 30-second timeout. A human would not have timed out; they would
 * have clicked slightly wrong and blamed themselves.
 *
 * 0.45s total is short enough that the page is settled before anybody has
 * finished reading the heading, which is the only budget an entrance is
 * entitled to on a screen somebody came here to *use*.
 */
const REVEAL_BUDGET = 0.45;

/**
 * Fade and lift an element into place, once, on mount.
 *
 * Used on **containers**, never on the numbers inside them. A panel arriving is
 * a page-load event and animating it is orientation; a price arriving is data
 * and delaying it is a lie about what the market was doing.
 *
 * Never used on the order ticket, and that is a rule rather than an oversight:
 * it is the one control on the venue somebody might need to reach in the first
 * half-second, and an entrance animation on it would be an animation that can
 * cost money.
 *
 * `will-change` is set for the duration and removed after. Leaving it on
 * permanently promotes the element to its own compositor layer forever, which
 * on a page with forty of them costs more memory than the animation ever saved.
 *
 * The options are plain values, not a getter: an entrance runs once, so there
 * is nothing for it to react to. The attachment body reads no reactive state,
 * which per the docs means it never re-runs.
 */
export function reveal(options: RevealOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		const { distance = 10 } = options;

		// Delay and duration are clamped together, so adding a seventh panel to a
		// staggered page cannot quietly push the last one past the budget.
		const delay = Math.min(options.delay ?? 0, REVEAL_BUDGET * 0.5);
		const duration = Math.min(options.duration ?? DURATION.quick, REVEAL_BUDGET - delay);

		if (prefersReducedMotion()) {
			// Nothing to do: the element is already where it should be, and it has no
			// starting style to undo, because `from` sets that rather than the CSS.
			return;
		}

		const tween = gsap.from(node, {
			opacity: 0,
			y: distance,
			duration,
			delay,
			clearProps: 'transform,opacity,willChange',
			onStart: () => (node.style.willChange = 'transform, opacity')
		});

		return () => {
			tween.kill();
			node.style.willChange = '';
		};
	};
}

/**
 * Reveal a group of children with a stagger.
 *
 * One tween over a NodeList rather than N tweens with computed delays: GSAP
 * batches them onto a single ticker callback, so a list of forty rows costs one
 * `requestAnimationFrame` handler instead of forty.
 */
export function revealChildren(
	options: RevealOptions & { selector?: string } = {}
): Attachment<HTMLElement> {
	return (node) => {
		const { selector = ':scope > *', distance = 10, duration = DURATION.quick } = options;

		if (prefersReducedMotion()) return;

		const tween = gsap.from(node.querySelectorAll(selector), {
			opacity: 0,
			y: distance,
			duration,
			// Capped total: a long list must not take three seconds to appear just
			// because it is long. `amount` spreads the whole stagger across a fixed
			// window rather than adding a fixed gap per item.
			stagger: { amount: Math.min(0.4, 0.05 * node.children.length) },
			clearProps: 'transform,opacity'
		});

		return () => tween.kill();
	};
}

/* -------------------------------------------------------------------------- */
/* The flash                                                                   */
/* -------------------------------------------------------------------------- */

export type Direction = 'up' | 'down' | 'neutral';

/**
 * Flash a cell when its value changes.
 *
 * The oldest idea in market data and still the best one: colour arrives
 * pre-attentively — the eye registers it before the brain reads the number — so
 * a trader watching forty prices sees *which* one moved without scanning.
 *
 * ## The interruption problem
 *
 * The reason this is GSAP and not a CSS class you add and remove on a timer:
 * during a busy minute a price ticks several times a second. With CSS, the
 * second change removes and re-adds the class, the animation restarts from
 * frame zero, and the result is a visible flicker precisely when the market is
 * most active — the moment the trader most needs to read it.
 *
 * `overwrite: 'auto'` makes the new tween take over from wherever the old one
 * was, so rapid ticks blend into a sustained glow rather than a strobe.
 *
 * ## Why the direction arrives as a getter
 *
 * `{@attach flash(directionFor(level))}` would read `level` while the
 * attachment expression is evaluated, and the docs are explicit about what
 * that means: the attachment is torn down and recreated on every change.
 * Passing `() => directionFor(level)` and reading it inside a child `$effect`
 * is the documented alternative — the node-level setup runs once, and only
 * this effect re-runs when the level changes.
 */
export function flash(getDirection: () => Direction): Attachment<HTMLElement> {
	const colourFor = (value: Direction) =>
		value === 'up'
			? 'var(--bid-soft)'
			: value === 'down'
				? 'var(--ask-soft)'
				: 'var(--surface-raised)';

	return (node) => {
		// Plain variables, not $state: nothing renders these, they exist so one
		// run of the effect can compare against the last. Making them reactive
		// would re-run the effect once more per change for nobody's benefit.
		let previous: Direction | undefined;

		function run(value: Direction) {
			if (value === 'neutral') return;

			if (prefersReducedMotion()) {
				/*
				 * The signal survives; the movement does not.
				 *
				 * Somebody who asked for reduced motion still needs to know the price
				 * moved. Removing the flash entirely would remove *information* under
				 * the guise of removing animation, which is the usual way this
				 * preference gets implemented badly.
				 */
				node.style.backgroundColor = colourFor(value);
				setTimeout(() => (node.style.backgroundColor = ''), 900);
				return;
			}

			gsap.fromTo(
				node,
				{ backgroundColor: colourFor(value) },
				{
					backgroundColor: 'rgba(0,0,0,0)',
					duration: 0.9,
					ease: 'power1.out',
					overwrite: 'auto',
					clearProps: 'backgroundColor'
				}
			);
		}

		$effect(() => {
			const value = getDirection();

			// Deliberately nothing on the first run. A page that loads with forty
			// prices flashing says "forty things just happened", and nothing
			// happened at all.
			if (previous !== undefined && (value !== previous || value !== 'neutral')) {
				run(value);
			}

			previous = value;
		});

		return () => gsap.killTweensOf(node);
	};
}

/* -------------------------------------------------------------------------- */
/* Counting                                                                    */
/* -------------------------------------------------------------------------- */

export interface CountOptions {
	readonly value: number;
	/** Turns the raw number into what the reader sees. */
	readonly format: (value: number) => string;
	readonly duration?: number;
}

/**
 * Roll a number from its old value to its new one.
 *
 * The one animation here that genuinely cannot be CSS: there is no property to
 * transition, because the thing changing is text content.
 *
 * Reserved for **one** number on the page — the last traded price. Rolling
 * every number would make the screen impossible to read, and rolling a number
 * somebody is about to type into an order is actively dangerous.
 *
 * `snap: { value: 1 }` keeps the intermediate frames on whole scaled units. A
 * price mid-roll showing 455032.7 is not a price, and money that renders a
 * fractional minor unit for four frames looks broken in a way that erodes
 * confidence in everything else on the screen.
 *
 * Same getter pattern as `flash`, for the same documented reason.
 */
export function count(getOptions: () => CountOptions): Attachment<HTMLElement> {
	return (node) => {
		const state = { value: 0 };
		let mounted = false;

		$effect(() => {
			const { value, format, duration } = getOptions();

			if (!mounted || prefersReducedMotion() || value === state.value) {
				// First paint, or nothing to roll: write the text directly. This
				// branch also catches a format change with an unchanged value.
				mounted = true;
				state.value = value;
				node.textContent = format(value);
				return;
			}

			gsap.to(state, {
				value,
				duration: duration ?? DURATION.quick,
				ease: 'power2.out',
				// `true` rather than 'auto': there is exactly one tween per node and
				// the newest target is always the right one.
				overwrite: true,
				snap: { value: 1 },
				onUpdate: () => (node.textContent = format(state.value))
			});
		});

		return () => gsap.killTweensOf(state);
	};
}

/* -------------------------------------------------------------------------- */
/* The cinematic three                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A full-width sweep across the viewport.
 *
 * The venue's one dramatic gesture, used for exactly two things: the market
 * opening, and trading being halted. Both are moments where the correct
 * reaction is to stop and look, and where a toast in the corner would be
 * catastrophically under-stated — a firm-wide halt cancelled every order the
 * firm had resting, and somebody needs to *feel* that.
 *
 * It is also the argument for the restraint everywhere else. This lands because
 * the rest of the screen never does anything like it.
 *
 * `pointer-events: none` throughout: a trader who is mid-click when the market
 * opens must not have their click swallowed by a decoration.
 *
 * Not an attachment, because it is not attached to anything — it is an event,
 * fired from an effect when the phase changes, and it owns its own elements.
 */
export function sweep(tone: 'open' | 'halt'): void {
	if (typeof document === 'undefined') return;

	const colour = tone === 'open' ? 'var(--bid)' : 'var(--ask)';

	if (prefersReducedMotion()) {
		// A brief static wash rather than a travelling band. Same information,
		// nothing crossing the field of view.
		const wash = document.createElement('div');
		wash.setAttribute('aria-hidden', 'true');
		wash.style.cssText = `position:fixed;inset:0;background:${colour};opacity:0.12;pointer-events:none;z-index:60;`;
		document.body.append(wash);
		setTimeout(() => wash.remove(), 600);
		return;
	}

	const band = document.createElement('div');
	band.setAttribute('aria-hidden', 'true');
	band.style.cssText = [
		'position:fixed',
		'inset-block:0',
		'inline-size:45vmax',
		'pointer-events:none',
		'z-index:60',
		`background:linear-gradient(90deg, transparent, ${colour}, transparent)`,
		'opacity:0'
	].join(';');

	document.body.append(band);

	gsap
		.timeline({ onComplete: () => band.remove() })
		.fromTo(
			band,
			{ x: '-50vmax', opacity: 0 },
			{ x: '100vw', opacity: 0.22, duration: DURATION.cinematic, ease: 'power2.inOut' }
		)
		.to(band, { opacity: 0, duration: 0.3 }, '-=0.35');
}

/**
 * The sign-in entrance.
 *
 * The only place in the app that gets a composed timeline, because it is the
 * only screen with nothing urgent on it. Somebody signing in is not mid-trade;
 * they can afford a second, and a venue that feels considered at the front door
 * is making a claim about the care taken behind it.
 *
 * Note the overlap offsets (`-=0.4`). Sequential animations feel like a slide
 * deck; overlapping ones feel like one movement with internal structure, which
 * is the difference between a transition and a title sequence.
 *
 * An attachment already has the right shape when it takes no options, so this
 * one is used bare: `{@attach signInEntrance}`.
 */
export const signInEntrance: Attachment<HTMLElement> = (node) => {
	if (prefersReducedMotion()) return;

	const card = node.querySelector('[data-motion="card"]');
	const rule = node.querySelector('[data-motion="rule"]');
	const fields = node.querySelectorAll('[data-motion="field"]');

	const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

	if (card) timeline.from(card, { opacity: 0, y: 24, duration: 0.7 });
	if (rule)
		timeline.from(rule, { scaleX: 0, transformOrigin: 'left center', duration: 0.6 }, '-=0.4');
	if (fields.length) {
		timeline.from(fields, { opacity: 0, y: 10, duration: 0.45, stagger: 0.07 }, '-=0.35');
	}

	return () => timeline.kill();
};
