/**
 * WHAT A PAGE CAN BE ASKED ABOUT ITSELF
 * =====================================
 *
 * Two checks that a person looking at a screenshot is bad at, written as
 * functions to run *inside* the page — Playwright's `page.evaluate(fn, arg)`
 * sends a function's source text to the browser and runs it there. So each
 * is self-contained: no imports, no variables from this module, everything
 * it needs passed as its one argument. `e2e/visual.e2e.ts` asserts on them;
 * `scripts/screens.ts` prints them beside its pictures.
 */

export interface Overflow {
	readonly scrollWidth: number;
	readonly clientWidth: number;
	readonly offenders: readonly string[];
}

/**
 * Does the page scroll sideways, and what sticks out?
 *
 * Two kinds of sticking out. An element past the right edge of the screen,
 * unless it is inside one of the `allowed` scrollers (the table wrapper, the
 * tab strip, the two canvases — each scrolls inside itself on purpose). And
 * a form control past its card's *content box*: a field that runs over the
 * card's padding onto its border does not widen the page, so the first
 * check never saw the date field poking out of the new-trip card at 360px.
 */
export function overflowInPage(allowed: string): Overflow {
	const name = (el: Element) =>
		`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${
			typeof el.className === 'string' && el.className
				? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
				: ''
		}`;
	const shown = (el: Element, rect: DOMRect) => {
		if (rect.width <= 1 || rect.height <= 1) return false;
		const style = getComputedStyle(el);
		return style.position !== 'fixed' && style.visibility !== 'hidden';
	};

	const offenders: string[] = [];
	for (const el of document.querySelectorAll('body *')) {
		const rect = el.getBoundingClientRect();
		if (!shown(el, rect) || el.closest(allowed)) continue;
		if (rect.right > innerWidth + 1) {
			offenders.push(
				`${name(el)} ends at ${Math.round(rect.right)}, past the ${innerWidth}px screen`
			);
		}
	}

	const controls = '.card :is(input, select, textarea, button, .datefield, .input-group)';
	for (const el of document.querySelectorAll(controls)) {
		const rect = el.getBoundingClientRect();
		const card = el.closest('.card');
		if (!card || !shown(el, rect) || el.closest(allowed)) continue;
		const box = card.getBoundingClientRect();
		const style = getComputedStyle(card);
		const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
		const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
		if (rect.right > right + 1 || rect.left < left - 1) {
			offenders.push(
				`${name(el)} spans ${Math.round(rect.left)}–${Math.round(rect.right)}, ` +
					`outside its card's content box ${Math.round(left)}–${Math.round(right)}`
			);
		}
	}

	const html = document.documentElement;
	return { scrollWidth: html.scrollWidth, clientWidth: html.clientWidth, offenders };
}

export interface TargetRules {
	/** The smallest a control may be drawn, in CSS pixels. */
	readonly drawn: number;
	/** The smallest area a finger may press, the drawn box plus any `::after` reach. */
	readonly hit: number;
}

/**
 * Every visible button, link, input, select and option — and anything else
 * that says it is a button with `role="button"`, which is what a map marker
 * is — measured twice: is it drawn at least `drawn` pixels tall and wide,
 * and does a press anywhere in a `hit`-pixel box around its centre land on
 * it? The second is asked of the browser itself — `elementFromPoint` just
 * inside each edge of that box — so a pseudo-element that extends the
 * target counts, and a neighbour drawn over it does not.
 *
 * The element is scrolled to the middle of the screen first (the sticky
 * header must not be what the probe hits), and the page is scrolled back
 * to the top at the end. A marker is not scrolled itself — its map clips
 * it, and scrolling inside a map would move the picture under the probe —
 * so its map is brought to the middle instead, and a marker outside what
 * its map shows is not on the screen to press. With a modal dialog open
 * only the dialog is swept: everything behind it is under the scrim,
 * unpressable on purpose. A checkbox or radio inside a `<label>` is
 * measured as its label, because the label is what a finger presses.
 *
 * Two exemptions, each as narrow as it can be. A link inside a sentence is
 * exempt altogether, as WCAG 2.5.8 exempts it. A map marker is exempt from
 * the drawn floor only, down to WCAG's own 24px: a pin is drawn at 26px so
 * the route under it stays readable, which is the map's legibility, not
 * its target — the press is still the full `hit` box, and the map groups
 * any markers whose press boxes would touch.
 */
export function smallTargetsInPage({ drawn, hit }: TargetRules): string[] {
	const name = (el: Element) =>
		`${el.tagName.toLowerCase()}${
			typeof el.className === 'string' && el.className
				? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
				: ''
		} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 32)}"`;

	const problems: string[] = [];
	const seen = new Set<Element>();
	// With a modal dialog open, the page behind it is under the scrim and not a target at all.
	const scope =
		document.querySelector(
			'[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'
		) ?? document;
	const candidates = scope.querySelectorAll<HTMLElement>(
		'button, a[href], input:not([type="hidden"]), select, [role="option"], [role="button"]'
	);

	for (const el of candidates) {
		const label = el instanceof HTMLInputElement ? el.closest('label') : null;
		const subject: HTMLElement = label ?? el;
		if (seen.has(subject)) continue;
		seen.add(subject);

		const style = getComputedStyle(el);
		if (style.visibility === 'hidden' || el.closest('[inert], [aria-hidden="true"]')) continue;
		if (el.tagName === 'A' && style.display === 'inline') continue;

		let rect = subject.getBoundingClientRect();
		// Not rendered, visually hidden (the 1px clip), or parked off the page like the skip link.
		if (rect.width <= 1 || rect.height <= 1) continue;
		if (rect.bottom + scrollY < 0 || rect.right + scrollX < 0) continue;

		const map = subject.matches('.maplibregl-marker') ? subject.closest('.maplibregl-map') : null;
		const floor = map ? Math.min(drawn, 24) : drawn;
		if (rect.width < floor || rect.height < floor) {
			problems.push(
				`${name(subject)} is drawn ${Math.round(rect.width)}×${Math.round(rect.height)}`
			);
			continue;
		}

		// The middle of its scroller too: at a scroller's edge the reach would be clipped by the scroller, not missing.
		(map ?? subject).scrollIntoView({ block: 'center', inline: 'center' });
		rect = subject.getBoundingClientRect();
		if (map) {
			const view = map.getBoundingClientRect();
			const x = rect.left + rect.width / 2;
			const y = rect.top + rect.height / 2;
			if (x < view.left || x > view.right || y < view.top || y > view.bottom) continue;
		}
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const reachX = Math.max(0, (hit - rect.width) / 2);
		const reachY = Math.max(0, (hit - rect.height) / 2);
		const probes: [string, number, number][] = [];
		if (reachY > 0) {
			probes.push(
				['above', cx, rect.top - reachY + 0.5],
				['below', cx, rect.bottom + reachY - 0.5]
			);
		}
		if (reachX > 0) {
			probes.push(
				['left of', rect.left - reachX + 0.5, cy],
				['right of', rect.right + reachX - 0.5, cy]
			);
		}

		const misses = probes
			.filter(([, x, y]) => x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight)
			.filter(([, x, y]) => {
				const found = document.elementFromPoint(x, y);
				// A toast passing over the page is a moment, not a layout: a press there is not a miss.
				if (found?.closest('[data-sonner-toaster]')) return false;
				return !found || !(found === subject || subject.contains(found));
			})
			.map(([where]) => where);
		if (misses.length > 0) {
			problems.push(
				`${name(subject)} (${Math.round(rect.width)}×${Math.round(rect.height)}) ` +
					`misses a ${hit}px press ${misses.join(', ')} it`
			);
		}
	}

	scrollTo(0, 0);
	return problems;
}
