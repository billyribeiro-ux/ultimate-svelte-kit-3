/**
 * COUNT-UP NUMBERS
 * ================
 *
 * Statistics that tick up from zero when they scroll into view.
 *
 * WHY THIS IS TRICKIER THAN IT LOOKS
 * ----------------------------------
 * Our stat values are strings, not numbers: `"<250ms"`, `"1.4M"`, `"7 yrs"`, `"16"`.
 * A naive counter would either refuse them or destroy the formatting. So we split
 * each value into three parts — prefix, number, suffix — animate only the middle,
 * and reassemble on every frame.
 *
 * THE ACCESSIBILITY TRAP
 * ----------------------
 * Rewriting text content sixty times a second inside a live region makes a screen
 * reader announce every intermediate value. The user hears "one… four… nine…
 * seventeen…" for two seconds. It is genuinely awful, and it is exactly what an
 * unthinking implementation does.
 *
 * The fix is to render the final value as real text for assistive technology, and
 * animate a separate copy that is hidden from it. The DOM has the truth from the
 * first frame; only the pixels are lying.
 */

import type { Attachment } from 'svelte/attachments';
import { loadMotion } from './gsap.ts';
import { duration } from './config.ts';

/** Split "1.4M" into { prefix: "", value: 1.4, suffix: "M", decimals: 1 }. */
function parseStat(raw: string): {
	prefix: string;
	value: number;
	suffix: string;
	decimals: number;
} | null {
	// Prefix = anything before the first digit ("<", "$", "~")
	// Number = digits, with optional thousands separators and one decimal point
	// Suffix = everything after ("ms", "M", " yrs", "%")
	const match = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/.exec(raw.trim());
	if (!match) return null;

	const [, prefix = '', numberText = '', suffix = ''] = match;
	const value = Number(numberText.replace(/,/g, ''));
	if (!Number.isFinite(value)) return null;

	const decimals = numberText.includes('.') ? (numberText.split('.')[1]?.length ?? 0) : 0;

	return { prefix, value, suffix, decimals };
}

/** Re-apply thousands separators, so 1400 renders as "1,400" not "1400". */
function format(value: number, decimals: number): string {
	return value.toLocaleString('en-US', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	});
}

export interface CounterOptions {
	duration?: number;
	delay?: number;
}

export function counter(options: CounterOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		let cancelled = false;
		let context: { revert: () => void } | undefined;

		void loadMotion().then((motion) => {
			// Reduced motion: the element already contains the final value as text.
			// Nothing to do, and nothing was ever hidden.
			if (!motion || cancelled) return;

			const raw = node.textContent?.trim() ?? '';
			const parsed = parseStat(raw);
			// Values with no number at all ("Self-funded", "New York") pass through
			// untouched rather than throwing or rendering "NaN".
			if (!parsed) return;

			const { gsap } = motion;
			const { duration: dur = duration.cinematic, delay = 0 } = options;

			context = gsap.context(() => {
				/*
				 * Two layers:
				 *   - the original text, kept in the DOM but hidden from sight,
				 *     so assistive technology reads the real value immediately
				 *   - a visual clone, hidden from assistive technology, which we animate
				 */
				const accessible = document.createElement('span');
				accessible.className = 'visually-hidden';
				accessible.textContent = raw;

				const visual = document.createElement('span');
				visual.setAttribute('aria-hidden', 'true');
				visual.textContent = `${parsed.prefix}${format(0, parsed.decimals)}${parsed.suffix}`;

				node.textContent = '';
				node.append(accessible, visual);

				const state = { value: 0 };

				gsap.to(state, {
					value: parsed.value,
					duration: dur,
					delay,
					// Integers should never render a decimal point mid-count.
					snap: parsed.decimals === 0 ? { value: 1 } : undefined,
					onUpdate: () => {
						visual.textContent =
							parsed.prefix + format(state.value, parsed.decimals) + parsed.suffix;
					},
					// Guarantees the final frame is exactly the target. Floating-point
					// drift can otherwise leave you on "1,399,999" forever.
					onComplete: () => {
						visual.textContent = raw;
					},
					scrollTrigger: { trigger: node, start: 'top 88%' }
				});
			}, node);
		});

		return () => {
			cancelled = true;
			context?.revert();
		};
	};
}
