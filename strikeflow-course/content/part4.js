/**
 * Chapters on motion. These sit between the content chapters and the test
 * chapters, because the tests we write afterwards cover the motion safety rules.
 */

export const part4 = [
	/* ============================================================ */
	{
		slug: 'motion-principles',
		title: 'What makes motion look expensive',
		summary:
			'Three principles that separate cinematic motion from a page that merely moves — and the one performance rule you cannot break.',
		goal: 'You will understand *why* professional motion feels the way it does, before writing any of it.',
		blocks: [
			{
				type: 'p',
				text: "Most websites with animation look worse than websites without it. That is not because animation is bad — it is because motion is a craft with rules, and almost nobody learns them before reaching for a library."
			},
			{
				type: 'p',
				text: 'There are three, and they explain nearly everything.'
			},
			{ type: 'h3', id: 'ease', text: '1. The easing curve' },
			{
				type: 'p',
				text: 'Easing is how speed changes over the course of a movement. It is the single biggest factor in whether motion reads as cheap or expensive.'
			},
			{
				type: 'ul',
				items: [
					'**Linear** — constant speed throughout. Nothing in the physical world moves like this. It reads as robotic.',
					'**ease-in-out** — the CSS default-ish curve. Symmetrical, inoffensive, and the visual signature of a website that did not think about it.',
					'**A strong "out" curve** — very fast start, long deceleration. This is what film and high-end interfaces use.'
				]
			},
			{
				type: 'why',
				title: 'Why a strong out-curve reads as quality',
				text: 'It matches physics. A real object that arrives somewhere was already moving fast and slowed as it settled — it did not accelerate gently from a standstill for no reason. Your eye has watched physical objects your entire life and knows the difference instantly, even if you have never consciously noticed it.'
			},
			{
				type: 'code',
				file: 'src/lib/motion/config.ts',
				lang: 'ts',
				code: `export const easePath = {
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
} as const;`
			},
			{
				type: 'note',
				text: 'Those strings are SVG path data describing a Bézier curve, which GSAP\'s CustomEase turns into an easing function. The horizontal axis is time; the vertical axis is progress. You can draw your own at [gsap.com/docs/v3/Eases/CustomEase](https://gsap.com/docs/v3/Eases/CustomEase).'
			},
			{ type: 'h3', id: 'overlap', text: '2. Overlap' },
			{
				type: 'p',
				text: 'Amateur sequences play one thing, then the next, then the next. Professional sequences start the next element while the previous is still around 60% through.'
			},
			{
				type: 'code',
				lang: 'ts',
				file: 'the difference',
				code: `// Sequential — reads as a queue of unrelated things taking turns
timeline.to(badge,   { opacity: 1 });
timeline.to(heading, { opacity: 1 });
timeline.to(lede,    { opacity: 1 });

// Overlapping — reads as one choreographed gesture
timeline.to(badge,   { opacity: 1 });
timeline.to(heading, { opacity: 1 }, '-=0.45');  // 0.45s before the previous ends
timeline.to(lede,    { opacity: 1 }, '-=0.85');`
			},
			{
				type: 'p',
				text: 'That last argument is GSAP\'s **position parameter**, and it is where choreography actually lives:'
			},
			{
				type: 'ul',
				items: [
					'*(omitted)* — immediately after the previous tween ends. Sequential, and usually wrong.',
					'`\'<\'` — at the same moment the previous tween *started*.',
					'`\'<0.3\'` — 0.3 seconds after the previous tween started.',
					'`\'-=0.6\'` — 0.6 seconds before the end of the timeline so far, i.e. overlapping into it.',
					'`0.5` — absolute: half a second from the very beginning.'
				]
			},
			{ type: 'h3', id: 'restraint', text: '3. Restraint' },
			{
				type: 'ul',
					items: [
					'**Distance:** 16–44px. Large travel looks cheap and draws attention to the animation rather than the content.',
					'**Duration:** 0.3–1.2s. Under 0.2s is a state change, not a movement. Over 1.4s and the user is waiting for your website to finish having an opinion.',
					'**Stagger:** 0.045–0.11s between items. At 0.3s a six-item grid takes nearly two seconds and reads as a queue.',
					'**Direction:** consistent. Everything rises. Mixed directions read as chaos.'
				]
			},
			{
				type: 'warn',
				text: 'The most common failure is animating *everything*. If every heading, card, icon and divider performs on entry, the page becomes exhausting and nothing stands out — which defeats the purpose, since the point of motion is to direct attention. In this project the headline reveal is used on three headings on the home page — seven across the whole site — out of dozens.'
			},
			{ type: 'h3', id: 'performance', text: 'The performance rule you cannot break' },
			{
				type: 'p',
				text: '**Animate only `transform` and `opacity`.** Nothing else.'
			},
			{
				type: 'p',
				text: 'When a browser draws a frame it may do up to three things: **layout** (work out where everything goes), **paint** (draw the pixels), and **composite** (arrange the finished layers). Layout is by far the most expensive.'
			},
			{
				type: 'ul',
				items: [
					'Animating `width`, `height`, `top`, `left`, `margin` or `padding` forces **layout on every frame** — for the whole page, because moving one element can push others around.',
					'Animating `background-color` or `box-shadow` forces **paint** on every frame.',
					'Animating `transform` and `opacity` touches only **composite**, which the GPU does, and which can happen without re-running the other two.'
				]
			},
			{
				type: 'why',
				title: 'What this means in practice',
				text: 'To move something, use `transform: translate` — not `top`. To resize, use `transform: scale` — not `width`. On a fast desktop you may not see the difference; on a mid-range Android phone it is the difference between 60fps and a slideshow. This is why the parallax in our hero moves a positioned element rather than animating a gradient.'
			},
			{
				type: 'checkpoint',
				text: 'You can explain why a strong out-curve looks better than ease-in-out, what the position parameter does, and why animating `width` is a mistake.'
			}
		]
	},

	/* ============================================================ */
	{
		slug: 'motion-without-breaking-the-page',
		title: 'Animating without breaking the page',
		summary:
			'The hardest problem in web animation is not the animation — it is making sure your content is never hidden when the animation does not run.',
		goal: 'A motion system that is impossible to make blank the page, and that reduced-motion users never pay for.',
		blocks: [
			{ type: 'terminal', code: 'pnpm add gsap' },
			{
				type: 'note',
				text: 'GSAP became fully free in 2024, including every plugin — ScrollTrigger, SplitText, MorphSVG, the lot. Older tutorials describe a paid "Club GreenSock" tier for these. That is out of date.'
			},
			{ type: 'h3', id: 'problem', text: 'The problem nobody warns you about' },
			{
				type: 'p',
				text: 'A scroll reveal works by starting an element invisible and fading it in. Simple enough — until you ask *when* it becomes invisible.'
			},
			{
				type: 'p',
				text: 'GSAP is a large library, loaded asynchronously. There is a window — 200ms on a good connection, several seconds on a bad one — where your page has rendered but the animation library has not arrived. Two obvious approaches both fail badly:'
			},
			{
				type: 'ul',
				items: [
					'**Hide it in CSS, reveal with JavaScript.** If the JavaScript never arrives — blocked request, failed chunk after a bad deploy, browser extension — the content is gone **forever**. A blank page. This is the worst bug in the category and it is shockingly common.',
					'**Hide it in JavaScript once GSAP loads.** The element renders visible, then jumps to hidden, then animates in. A visible flicker on every single page load.'
				]
			},
			{ type: 'h3', id: 'solution', text: 'The solution: three mechanisms, one effect' },
			{
				type: 'p',
				text: 'An inline script in the HTML shell, running before the browser paints anything:'
			},
			{
				type: 'code',
				file: 'src/app.html',
				lang: 'html',
				code: `<script>
	(function () {
		var root = document.documentElement;
		try {
			var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			if (!reduced) {
				root.classList.add('motion-pending');
				setTimeout(function () {
					root.classList.remove('motion-pending');
				}, 2500);
			}
		} catch (error) {
			root.classList.remove('motion-pending');
		}
	})();
</script>`
			},
			{
				type: 'p',
				text: 'Then CSS that hides content **only** while that class is present:'
			},
			{
				type: 'code',
				file: 'src/lib/styles/motion.css',
				lang: 'css',
				code: `.motion-pending [data-reveal] {
	opacity: 0;
	transform: translate3d(0, 28px, 0);
}

/* … */

/* Hero parts are choreographed by \`motion/hero.ts\`, which sets its own start
   positions. They just need to be invisible until it does. */
.motion-pending [data-hero] {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.motion-pending [data-reveal],
	.motion-pending [data-hero] {
		opacity: 1;
		transform: none;
	}
}`
			},
			{
				type: 'why',
				title: 'Count the ways the content can appear',
				text: 'There are exactly three, and all of them end visible: (1) GSAP loads and takes over, (2) the 2.5 second failsafe fires because GSAP never loaded, (3) the class was never added at all — JavaScript disabled, or reduced motion requested. There is no fourth path. That is what makes it safe to hide content at all.'
			},
			{
				type: 'warn',
				text: 'The script must be **inline**, in the `<head>`. An external file — however tiny — is a network round-trip, during which the browser has already painted, and you get the flicker you were trying to avoid. This is the one inline script in the whole project, and it earns its place.'
			},
			{ type: 'h3', id: 'ordering', text: 'The ordering that removes the flicker' },
			{
				type: 'p',
				text: 'When GSAP does arrive, the order matters enormously. First apply the hidden state as an **inline style**; only then release the CSS gate; only then animate:'
			},
			{
				type: 'code',
				file: 'src/lib/motion/reveal.ts',
				lang: 'ts',
				code: `gsap.set(targets, {
	opacity: 0,
	...offset,
	...(scale ? { scale: 0.97 } : {}),
	/* … */
	force3D: true
});

releaseMotionGate();

gsap.to(targets, {
	opacity: 1,
	y: 0,
	x: 0,
	scale: 1,
	duration: dur,
	delay,
	stagger: items ? staggerAmount : 0,
	// …
	clearProps: 'transform',
	scrollTrigger: {
		trigger: node,
		start,
		toggleActions: repeat ? 'play reverse play reverse' : 'play none none none'
	}
});`
			},
			{
				type: 'warn',
				text: 'Swap `gsap.set` and `releaseMotionGate()` and you get a one-frame flash of fully-visible content on every page load. The element must never be un-hidden between the CSS gate letting go and the inline style taking over.'
			},
			{ type: 'h3', id: 'reduced-motion', text: 'Reduced motion is not optional' },
			{
				type: 'p',
				text: 'Every operating system has a "reduce motion" setting. People turn it on for real reasons — vestibular disorders, where large moving content causes genuine nausea and dizziness, not mild annoyance.'
			},
			{
				type: 'code',
				file: 'src/lib/motion/gsap.ts',
				lang: 'ts',
				code: `export function loadMotion(): Promise<MotionApi | null> {
	if (!browser || prefersReducedMotion()) {
		releaseMotionGate();
		return Promise.resolve(null);   // never even imports GSAP
	}

	motionPromise ??= (async () => {
		const [{ gsap }, { ScrollTrigger }, { SplitText }, { CustomEase }] =
			await Promise.all([
				import('gsap'),
				import('gsap/ScrollTrigger'),
				import('gsap/SplitText'),
				import('gsap/CustomEase')
			]);
		gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);
		// ...
	})();

	return motionPromise;
}`
			},
			{
				type: 'why',
				title: 'Note where the check happens',
				text: 'It returns `null` **before** the dynamic imports. So a reduced-motion user does not merely see no animation — they never download the ~90kB animation library at all. Respecting the setting should mean not making that person pay for something they explicitly asked not to see.'
			},
			{
				type: 'note',
				text: 'Returning `null` rather than a no-op object is deliberate: every caller is forced to handle it, which makes the reduced-motion path impossible to forget.'
			},
			{ type: 'h3', id: 'attachment', text: 'The reveal, as a Svelte attachment' },
			{
				type: 'code',
				file: 'src/lib/motion/reveal.ts',
				lang: 'ts',
				code: `export function reveal(options: RevealOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		let cancelled = false;
		let context: { revert: () => void } | undefined;

		void loadMotion().then((motion) => {
			if (!motion || cancelled) return;

			const { gsap } = motion;

			// …

			context = gsap.context(() => {
				gsap.set(targets, {
					opacity: 0,
					...offset,
					...(scale ? { scale: 0.97 } : {}),
					force3D: true
				});

				releaseMotionGate();

				gsap.to(targets, {
					opacity: 1,
					y: 0,
					x: 0,
					scale: 1,
					duration: dur,
					delay,
					stagger: items ? staggerAmount : 0,
					clearProps: 'transform',
					scrollTrigger: {
						trigger: node,
						start,
						toggleActions: repeat ? 'play reverse play reverse' : 'play none none none'
					}
				});
			}, node);
		});

		return () => {
			cancelled = true;
			context?.revert();
		};
	};
}`
			},
			{
				type: 'ul',
				items: [
					'`cancelled` guards the async gap. If the component unmounts before GSAP arrives, we must not animate a detached element.',
					'`gsap.context()` scopes everything created inside it. One `revert()` kills every tween and ScrollTrigger — no manual bookkeeping.',
					'`clearProps: \'transform\'` strips the inline transform when the tween finishes. A leftover `translate3d(0,0,0)` creates a containing block that quietly breaks any `position: fixed` descendant.',
					'The returned function is the cleanup. **Skip it and every client-side navigation leaks a ScrollTrigger** that keeps recalculating on every scroll event, forever.'
				]
			},
			{
				type: 'note',
				text: '`start: \'top 85%\'` means "begin when the top of the element reaches 85% of the way down the viewport" — just as it comes into view. Wait until it is fully on screen and the user watches a static element suddenly move, which looks broken.'
			},
			{
				type: 'checkpoint',
				text: 'Disable JavaScript in your browser devtools and reload. Every piece of content should be visible. Then enable "reduce motion" in your OS settings and check the network tab — GSAP should not appear.'
			}
		]
	},

	/* ============================================================ */
	{
		slug: 'the-hero-sequence',
		title: 'The hero sequence',
		summary:
			'Masked line-by-line headline reveals with SplitText, and one timeline that choreographs the whole above-the-fold area.',
		goal: 'A page-load sequence that reads as directed rather than assembled.',
		blocks: [
			{ type: 'h3', id: 'mask', text: 'The masked line reveal — how the trick works' },
			{
				type: 'p',
				text: 'The most recognisable "expensive website" effect: a headline whose lines rise into view from behind an invisible edge.'
			},
			{
				type: 'p',
				text: 'SplitText wraps each visual line of text in a `<div>`. We then wrap *that* in a second `<div>` with `overflow: hidden`. Now sliding the inner div down by 100% of its own height does not merely move it off-position — it is **clipped out of existence** by its parent. Animating back to zero makes the text appear to emerge from behind a hard edge.'
			},
			{
				type: 'why',
				title: 'The overflow:hidden is doing all the work',
				text: 'Without the mask you get text sliding up from nowhere, overlapping whatever sits above it, and the effect looks cheap. With it, you get film titles. It is the entire difference, and it is one CSS property.'
			},
			{
				type: 'code',
				file: 'src/lib/motion/headline.ts',
				lang: 'ts',
				code: `split = new SplitText(node, {
	type: by,
	mask: by,
	linesClass: 'split-line',
	/* … */
	autoSplit: true,
	/* … */
	aria: 'auto'
});

const targets = by === 'lines' ? split.lines : split.words;

gsap.set(targets, { yPercent: 115, opacity: 0, rotate, force3D: true });
releaseMotionGate();

gsap.to(targets, {
	yPercent: 0,
	opacity: 1,
	rotate: 0,
	duration: dur,
	delay,
	stagger: staggerAmount,
	/* … */
});`
			},
			{
				type: 'warn',
				text: "`aria: 'auto'` is **not optional**. SplitText shreds your heading into dozens of divs, which a screen reader would otherwise announce one fragment at a time — \"Read\", \"institutional\", \"options flow\" as three disconnected utterances. This option restores the original string as an accessible name and hides the fragments. Skip it and you have made your headline actively worse for the people who least benefit from a visual flourish."
			},
			{
				type: 'note',
				text: '`autoSplit: true` matters on mobile. A headline split at desktop width keeps its old line breaks after the user rotates their phone, and the mask then clips mid-sentence.'
			},
			{
				type: 'code',
				file: 'src/lib/styles/motion.css',
				lang: 'css',
				code: `.split-line {
	padding-bottom: 0.12em;
	/* Undoes the padding so the visual line spacing is unchanged. */
	margin-bottom: -0.12em;
}`
			},
			{
				type: 'warn',
				text: 'Without that padding the mask clips the **descenders** — the tails of g, j, p, q and y — because the wrapper is exactly the line height and descenders hang below it. It is subtle enough that you see "the type looks a bit off" without working out why.'
			},
			{ type: 'h3', id: 'lines-not-chars', text: 'Lines, not characters' },
			{
				type: 'p',
				text: 'You can split by character, and it looks impressive in a demo reel. Do not do it for a headline someone needs to read: it takes far longer to resolve into words, and on a long headline it reads as a gimmick. Lines are what film titles use. Words are acceptable for three or four of them. Characters are for a logo.'
			},
			{ type: 'h3', id: 'timeline', text: 'One timeline, not six animations' },
			{
				type: 'code',
				file: 'src/lib/motion/hero.ts',
				lang: 'ts',
				code: `const timeline = gsap.timeline({
	// …
	delay: 0.12,
	defaults: { ease: 'sf.out' }
});

if (badge) {
	timeline.to(badge, {
		opacity: 1,
		y: 0,
		scale: 1,
		duration: duration.base
	});
}

if (lines.length) {
	timeline.to(
		lines,
		{
			yPercent: 0,
			opacity: 1,
			duration: duration.cinematic,
			stagger: stagger.base
		},
		// …
		'-=0.45'
	);
}

if (panel) {
	timeline.to(
		panel,
		{
			opacity: 1,
			y: 0,
			scale: 1,
			// …
			duration: duration.cinematic + 0.15
		},
		// …
		'<0.3'
	);
}

if (lede) {
	timeline.to(lede, { opacity: 1, y: 0, duration: duration.base }, '-=0.85');
}

if (actions?.children.length) {
	timeline.to(
		actions.children,
		{
			opacity: 1,
			y: 0,
			duration: duration.base,
			stagger: stagger.tight,
			clearProps: 'transform' // so \`magnetic\` can take over cleanly
		},
		'-=0.5'
	);
}`
			},
			{
				type: 'why',
				title: 'Why one timeline instead of six independent animations',
				text: 'Six independent animations are six things that happen to start at roughly the same time. A timeline is one thing with six parts, and it lets you express *relationships* — "start the lede 0.85 seconds before the timeline so far ends". That relationship is what produces overlap, and overlap is the entire difference between choreographed and queued.'
			},
			{
				type: 'note',
				text: 'The panel is deliberately slower than the text (1.5s versus 0.7s). Giving larger objects longer durations is how you communicate weight — it is the same instinct that makes a lorry and a bicycle look different in motion.'
			},
			{ type: 'h3', id: 'reading-order', text: 'Animate in reading order' },
			{
				type: 'p',
				text: 'The sequence goes badge → headline → panel → lede → buttons. That is roughly the order you want someone to read the page.'
			},
			{
				type: 'why',
				title: 'This is not decorative',
				text: 'Motion directs the eye — that is what it is *for*. Directing it anywhere other than where you want the person to read is working against yourself. If your animation draws attention to a decorative divider before the headline, you have used a powerful tool to make your page harder to read.'
			},
			{
				type: 'checkpoint',
				text: 'Reload the home page and watch closely. The lines should emerge from behind a hard edge, and the chart should arrive while the headline is still settling — not after it finishes.'
			}
		]
	},

	/* ============================================================ */
	{
		slug: 'micro-interactions',
		title: 'Micro-interactions and page transitions',
		summary:
			'Magnetic buttons, counting statistics, parallax, and cross-page transitions — plus a hard-won lesson about never overriding native scrolling.',
		goal: 'The details that make an interface feel physical rather than drawn.',
		blocks: [
			{ type: 'h3', id: 'magnetic', text: 'Magnetic buttons' },
			{
				type: 'p',
				text: 'The button leans very slightly toward the cursor as it approaches, and springs back when it leaves. It is on almost every award-winning agency site of the last five years, and it is also the easiest effect to overdo.'
			},
			{
				type: 'code',
				file: 'src/lib/motion/magnetic.ts',
				lang: 'ts',
				code: `const hasFinePointer = window.matchMedia('(pointer: fine) and (hover: hover)').matches;
if (!hasFinePointer) return;

const moveX = gsap.quickTo(node, 'x', { duration: 0.45, ease: 'power3.out' });
const moveY = gsap.quickTo(node, 'y', { duration: 0.45, ease: 'power3.out' });

function handleMove(event: PointerEvent) {
	const rect = node.getBoundingClientRect();

	// …
	const offsetX = event.clientX - (rect.left + rect.width / 2);
	const offsetY = event.clientY - (rect.top + rect.height / 2);

	// …
	const normalX = offsetX / (rect.width / 2 + radius);
	const normalY = offsetY / (rect.height / 2 + radius);

	// …
	moveX(gsap.utils.clamp(-1, 1, normalX) * strength);
	moveY(gsap.utils.clamp(-1, 1, normalY) * strength);
}

function handleLeave() {
	// …
	gsap.to(node, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' });
}`
			},
			{
				type: 'ul',
				items: [
					'**Maximum ~8px of travel.** More and the button appears to dodge the user, which is genuinely annoying to click.',
					'**Damped** — the element moves a *fraction* of the cursor offset. It should feel attracted, not attached.',
					'**Desktop only.** `pointer: fine` plus `hover: hover` is the reliable test for "there is a cursor that hovers".',
					'**Clamped**, so a fast cursor sweeping past cannot fling it.'
				]
			},
			{
				type: 'why',
				title: 'Why quickTo instead of gsap.to',
				text: '`pointermove` fires at the display refresh rate — 120Hz on a recent phone or a ProMotion display. Creating a new tween on every event is enormously wasteful. `quickTo` builds the tween once and each call merely retargets it. That is roughly an order of magnitude cheaper and it is the documented way to drive GSAP from a high-frequency event.'
			},
			{
				type: 'warn',
				text: 'Once GSAP owns an element\'s `transform`, CSS must not also write it. Our button had `transform: translateY(-1px)` on hover; GSAP overwrote it mid-hover and the two visibly fought. Where two systems can write the same property, exactly one must own it — we removed the CSS transform and used a shadow instead.'
			},
			{ type: 'h3', id: 'counter', text: 'Counting statistics — and the accessibility trap' },
			{
				type: 'p',
				text: 'Numbers ticking up from zero when they scroll into view. Straightforward, with one trap that an unthinking implementation walks straight into.'
			},
			{
				type: 'warn',
				text: 'Rewriting text sixty times a second makes a screen reader announce **every intermediate value**. The user hears "one… four… nine… seventeen…" for two seconds. It is genuinely awful.'
			},
			{
				type: 'code',
				file: 'src/lib/motion/counter.ts',
				lang: 'ts',
				code: `/* … */
const accessible = document.createElement('span');
accessible.className = 'visually-hidden';
accessible.textContent = raw;

const visual = document.createElement('span');
visual.setAttribute('aria-hidden', 'true');
visual.textContent = \`\${parsed.prefix}\${format(0, parsed.decimals)}\${parsed.suffix}\`;

node.textContent = '';
node.append(accessible, visual);`
			},
			{
				type: 'p',
				text: 'Two layers make this safe: a visually-hidden span carries the real value for assistive tech from the very first frame, and a second span, marked `aria-hidden` so it is never announced, is the one that actually counts up. Only the pixels are lying. There is a second detail too — our values are strings like `"<250ms"` and `"1.4M"`, so the counter splits each into prefix, number and suffix, animates only the middle, and reassembles on every frame.'
			},
			{
				type: 'note',
				text: '`onComplete` sets the exact original string. Floating-point drift can otherwise leave you on "1,399,999" forever, which is the kind of bug that survives to production because it is only wrong by one.'
			},
			{ type: 'h3', id: 'parallax', text: 'Parallax, used sparingly' },
			{
				type: 'code',
				file: 'src/lib/motion/hero.ts',
				lang: 'ts',
				code: `gsap.to(node, {
	yPercent: speed * 100,
	ease: 'none', // parallax must be linear — it tracks scroll, not time
	scrollTrigger: {
		trigger: node.parentElement ?? node,
		start: 'top top',
		end: 'bottom top',
		scrub: true
	}
});`
			},
			{
				type: 'ul',
				items: [
					'**Backgrounds only.** Parallaxing text or anything clickable makes the page feel like it is fighting the user.',
					'**Subtle.** `0.15` means 15% of scroll speed. Above ~0.3 people notice the effect rather than the depth, which is the point at which it stops working.',
					'**`ease: \'none\'`** — parallax must be linear. Any easing detaches it from the scroll and it feels broken.',
					'**`scrub: true`** — progress is driven by the scrollbar like a video timeline, not played on its own clock.'
				]
			},
			{
				type: 'note',
				text: 'We move a positioned element rather than animating a background gradient. Animating a gradient is a paint operation every frame; moving an element is a compositor operation. Identical visual, an order of magnitude cheaper.'
			},
			{ type: 'h3', id: 'view-transitions', text: 'Cross-page transitions' },
			{
				type: 'code',
				file: 'src/routes/+layout.svelte',
				lang: 'ts',
				code: `onNavigate((navigation) => {
	if (!document.startViewTransition || prefersReducedMotion()) return;

	return new Promise((resolve) => {
		document.startViewTransition(async () => {
			resolve();
			await navigation.complete;
		});
	});
});`
			},
			{
				type: 'p',
				text: 'The View Transitions API lets the **browser itself** animate between two DOM states — it snapshots the outgoing page, swaps in the new one, and cross-fades. The animation is then defined in plain CSS:'
			},
			{
				type: 'code',
				file: 'src/lib/styles/motion.css',
				lang: 'css',
				code: `@media (prefers-reduced-motion: no-preference) {
	::view-transition-old(root) {
		animation: vt-fade-out 160ms cubic-bezier(0.4, 0, 1, 1) forwards;
	}

	::view-transition-new(root) {
		animation: vt-fade-in 220ms cubic-bezier(0, 0, 0.2, 1) forwards;
	}
}`
			},
			{
				type: 'warn',
				text: 'Keep it fast — ours is 220ms. A page transition is dead time in which the user can do nothing. Long elaborate page transitions are the single most common way a "cinematic" site becomes an irritating one.'
			},
			{ type: 'h3', id: 'scroll-lesson', text: 'The lesson this project learned twice' },
			{
				type: 'p',
				text: 'GSAP offers `ScrollTrigger.normalizeScroll(true)`. It is widely recommended and it fixes a real problem: on mobile, the address bar shrinking as you scroll resizes the viewport and makes ScrollTrigger positions drift.'
			},
			{
				type: 'p',
				text: 'The way it fixes that is by taking over scrolling entirely and reimplementing it in JavaScript. We used it, and our end-to-end tests deadlocked — Playwright scrolled an element into view, saw it still moving, scrolled again, restarting the animation. Forever.'
			},
			{
				type: 'warn',
				text: 'That is **exactly** the bug we had already fixed once, in chapter 13, when `scroll-behavior: smooth` on `html` broke the same tests. Twice, from two different directions, the same root cause: globally overriding native scrolling. `ScrollTrigger.config({ ignoreMobileResize: true })` fixes the same underlying problem and leaves native scrolling alone.'
			},
			{
				type: 'why',
				title: 'The general principle',
				text: 'Do not globally override native browser behaviour — scrolling, focus, or history. You will fix one problem and create three you cannot see, because the things that break are the things you do not test: assistive technology, browser gestures, and anything that scrolls then measures. If you need custom behaviour, scope it to the one place that needs it.'
			},
			{
				type: 'checkpoint',
				text: 'Hover a primary button and feel the pull. Scroll past the statistics and watch them count. Navigate between pages and see the cross-fade. Then turn on reduced motion and confirm all three are simply absent.'
			}
		]
	}
];
