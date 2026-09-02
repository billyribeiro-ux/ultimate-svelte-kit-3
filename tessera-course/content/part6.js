/**
 * PART 6 — The canvas: a camera, a pointer, and geometry that is just numbers
 * (chapters 26–30)
 *
 * The half of the project a person actually touches. Almost all of it is plain
 * functions and one class, deliberately kept out of the components — a
 * `Board.svelte` that owned the drag logic would be four hundred lines testable
 * only by clicking.
 */

export const part6 = [
	{
		slug: 'the-camera',
		title: 'The camera',
		summary:
			'One `Tween` holding both instant and animated movement, the transform order that matters, and a fit that zoomed a one-shape board to 4× and hid a collaborator.',
		goal: 'Pan, zoom and frame a region, with direct manipulation exact and programmatic movement legible.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/canvas/camera.svelte.ts',
				lang: 'ts',
				code: `
/**
 * THE CAMERA
 * ==========
 *
 * One transform — pan and scale — and the two conversions everything else needs:
 * screen coordinates to board coordinates and back.
 *
 * WHY A TWEEN HOLDS THE STATE
 * ---------------------------
 * Direct manipulation must be exact. A box dragged with the pointer has to sit
 * under the pointer, not approach it over 300ms, and a camera that interpolates
 * during a pan feels like driving on ice.
 *
 * Programmatic movement must not be. "Zoom to fit" that teleports leaves people
 * with no idea where they went; the same move animated over a third of a second
 * is legible.
 *
 * Both live in one \`Tween\`, which is set with \`duration: 0\` for the first case
 * and its default for the second. The alternative — raw state plus a separate
 * animation path — is two sources of truth for one number, and they disagree the
 * first time somebody pans during a fit.
 */`
			},
			{
				type: 'why',
				title: 'One number, one owner',
				text: 'Direct manipulation must be exact: a box dragged with the pointer has to sit *under* the pointer, not approach it over 300ms, and a camera that interpolates during a pan feels like driving on ice. Programmatic movement must not be: "zoom to fit" that teleports leaves people with no idea where they went. The tempting design is raw state plus a separate animation path — and that is two sources of truth for one number, which disagree the first time somebody pans during a fit. One `Tween`, set with `duration: 0` for the first case and its default for the second.'
			},
			{
				type: 'code',
				file: 'src/lib/canvas/camera.svelte.ts',
				lang: 'ts',
				code: `
export class Camera {
	readonly #motion: Tween<Transform>;

	/**
	 * The viewport in CSS pixels.
	 *
	 * \`$state.raw\` — it is replaced wholesale by a \`ResizeObserver\` and never
	 * mutated, so per-property reactivity would cost two proxies for nothing.
	 */
	size = $state.raw<{ w: number; h: number }>({ w: 0, h: 0 });

	constructor(initial: Transform = { x: 0, y: 0, scale: 1 }) {
		// Must be constructed inside an effect root — in practice, during a
		// component's initialisation, which is where the board creates it.
		this.#motion = new Tween(initial, { duration: GLIDE_MS, easing: cubicOut });
	}

	get transform(): Transform {
		return this.#motion.current;
	}

	get scale(): number {
		return this.#motion.current.scale;
	}`
			},
			{
				type: 'note',
				text: '`size` is `$state.raw`. It is replaced wholesale by a `ResizeObserver` and never mutated, so per-property reactivity would cost two proxies for nothing. That is the rule for `$state.raw` generally: use it when the value is swapped rather than edited.'
			},

			{ type: 'h3', id: 'the-transform', text: 'The single biggest performance decision' },
			{
				type: 'code',
				file: 'src/lib/canvas/camera.svelte.ts',
				lang: 'ts',
				code: `
/** The CSS transform for the layer that holds every node. */
get css(): string {
	const { x, y, scale } = this.#motion.current;
	/*
	 * \`translate\` before \`scale\`, and \`translate3d\` rather than \`translate\`.
	 *
	 * The order is not stylistic: CSS applies these right to left, so this
	 * scales the content and then moves it, which is what the maths below
	 * assumes. Swap them and the board drifts as you zoom.
	 *
	 * The \`3d\` promotes the layer to the compositor, so panning a thousand nodes
	 * is a matrix change on one layer rather than a re-layout of a thousand
	 * elements. It is the single biggest performance decision in the renderer.
	 */
	return \`translate3d(\${x}px, \${y}px, 0) scale(\${scale})\`;
}

/** Screen (client) coordinates to board coordinates. */
toBoard(point: Point): Point {
	const { x, y, scale } = this.#motion.current;
	return { x: (point.x - x) / scale, y: (point.y - y) / scale };
}

/** Board coordinates to screen coordinates. */
toScreen(point: Point): Point {
	const { x, y, scale } = this.#motion.current;
	return { x: point.x * scale + x, y: point.y * scale + y };
}`
			},
			{
				type: 'p',
				text: 'Two things in that string. `translate` before `scale`, because CSS applies transforms right to left — this scales the content and *then* moves it, which is what the maths in `toBoard`/`toScreen` assumes. Swap them and the board drifts as you zoom.'
			},
			{
				type: 'p',
				text: 'And `translate3d` rather than `translate`, which promotes the layer to the compositor. Panning a thousand nodes becomes a matrix change on one layer rather than a re-layout of a thousand elements. Everything else in the renderer is a rounding error next to this.'
			},

			{ type: 'h3', id: 'zoom-at', text: 'Zooming about a point' },
			{
				type: 'code',
				file: 'src/lib/canvas/camera.svelte.ts',
				lang: 'ts',
				code: `
/** Move immediately, for pointer-driven panning. */
panBy(dx: number, dy: number): void {
	const { x, y, scale } = this.#motion.current;
	void this.#motion.set({ x: x + dx, y: y + dy, scale }, { duration: 0 });
}

/**
 * Zoom about a fixed screen point — the pointer, or the centre for a keyboard
 * shortcut.
 *
 * The board point under \`origin\` must not move. Solving for the new pan is
 * three lines and is the difference between zooming feeling like a camera and
 * feeling like the board is running away.
 */
zoomAt(origin: Point, factor: number): void {
	const current = this.#motion.current;
	const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
	if (scale === current.scale) return;

	const board = this.toBoard(origin);

	void this.#motion.set(
		{ x: origin.x - board.x * scale, y: origin.y - board.y * scale, scale },
		{ duration: 0 }
	);
}`
			},
			{
				type: 'p',
				text: 'The constraint is: *the board point under the pointer must not move*. Convert the screen point to board coordinates before changing the scale, then solve for the pan that puts it back under the same pixel. Three lines, and it is the difference between zooming feeling like a camera and feeling like the board is running away.'
			},

			{ type: 'h3', id: 'fit', text: 'The fit that hid a collaborator' },
			{
				type: 'code',
				file: 'src/lib/canvas/camera.svelte.ts',
				lang: 'ts',
				code: `
/**
 * Frame a rectangle, with breathing room.
 *
 * Returns without doing anything when the viewport has no size, which happens
 * on the very first render before the \`ResizeObserver\` has reported. Dividing
 * by zero there produces \`Infinity\`, the transform becomes \`NaN\`, and every
 * node disappears — from a board that is perfectly fine.
 *
 * \`magnify\` caps how far this may zoom *in*, and defaults to 1:1. Fitting is
 * about bringing things into view, not about making them bigger: a board with
 * one box in it would otherwise open at four times actual size, which looks
 * broken and — because the renderer culls anything outside the viewport —
 * means a colleague's next shape is drawn off screen and never appears. That
 * combination cost an afternoon, in a test that looked like a sync failure.
 */
fit(target: Rect, padding = 64, magnify = 1): Promise<void> {
	const { w, h } = this.size;
	if (w === 0 || h === 0) return Promise.resolve();
	if (target.w === 0 || target.h === 0) return Promise.resolve();

	const scale = clamp(
		Math.min((w - padding * 2) / target.w, (h - padding * 2) / target.h, magnify),
		MIN_SCALE,
		MAX_SCALE
	);

	return this.glideTo({
		x: w / 2 - (target.x + target.w / 2) * scale,
		y: h / 2 - (target.y + target.h / 2) * scale,
		scale
	});
}`
			},
			{
				type: 'warn',
				text: 'Two guards, both scars. The zero-size check exists because `fit()` runs on the first render before the `ResizeObserver` has reported: dividing by zero gives `Infinity`, the transform becomes `NaN`, and **every node disappears** from a board that is perfectly fine.'
			},
			{
				type: 'p',
				text: 'The `magnify = 1` cap is the better story. Fitting is about bringing things *into* view, not about making them bigger. Without the cap, a board with one box in it opens at four times actual size — which looks broken, and, because the renderer culls anything outside the viewport, means a colleague’s next shape is drawn off screen and never appears at all.'
			},
			{
				type: 'terminal',
				code: `
[collaboration] a shape drawn by one appears for the other  ✗

  expected: locator('[data-node]').filter({ hasText: 'From Mo' })
  received: 0 elements

diagnosis attempt 1: the sync engine is dropping operations
diagnosis attempt 2: the SSE stream is not delivering
actual cause:        fit() opened at 4× and the shape was
                     eighty pixels outside the viewport`
			},
			{
				type: 'p',
				text: 'An afternoon, on a test that looked like a sync failure and was a camera bug. The lesson is a debugging one: when a collaborative test fails, establish whether the *data* arrived before investigating the transport. A `console.log(document.nodes.size)` would have redirected that afternoon in thirty seconds.'
			},

			{
				type: 'checkpoint',
				items: [
					'Zooming keeps the point under the pointer still.',
					'Panning a thousand nodes is one compositor matrix change.',
					'`fit()` on an empty or unmeasured board does nothing rather than something wrong.'
				]
			}
		]
	},

	{
		slug: 'gestures',
		title: 'Pointers, wheels and one strange standard',
		summary:
			'Attachments rather than actions, pointer capture, `deltaMode`, and the blur listener that stops the canvas freezing.',
		goal: 'Handle mouse, trackpad, touch and keyboard on one surface, and re-attach nothing sixty times a second.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/canvas/gestures.ts',
				lang: 'ts',
				code: `
/**
 * GESTURES
 * ========
 *
 * Pointer, wheel and keyboard handling for the canvas, as **attachments**.
 *
 * \`{@attach}\` rather than \`use:\`. An action's \`{ update, destroy }\` return is
 * marked legacy in the Svelte 5 documentation, and attachments fix the thing
 * that made actions awkward here: an action runs once and has to be told when
 * its arguments change, while an attachment is an effect and simply re-runs.
 *
 * The subtlety that matters for this file is the opposite one — most of these
 * must *not* re-run. Re-attaching a wheel listener sixty times a second because
 * the camera moved would be a disaster, so anything that changes often is read
 * through a getter inside a nested \`$effect\`, which is the documented pattern
 * for controlling when an attachment re-runs.
 */`
			},
			{
				type: 'why',
				title: '`{@attach}` rather than `use:`',
				text: 'An action’s `{ update, destroy }` return is marked legacy in the Svelte 5 documentation, and attachments fix the thing that made actions awkward: an action runs once and has to be *told* when its arguments change, while an attachment is an effect and simply re-runs. The subtlety in this file is the opposite one — most of these must **not** re-run. Re-attaching a wheel listener because the camera moved would be a disaster, so anything that changes often is read through a getter inside a nested `$effect`.'
			},
			{
				type: 'code',
				file: 'src/lib/canvas/gestures.ts',
				lang: 'ts',
				code: `
/**
 * Keep the camera's idea of the viewport in step with the element's real size.
 *
 * A \`ResizeObserver\`, not a \`resize\` listener on \`window\`. The board's element
 * changes size when a side panel opens, when the on-screen keyboard appears, and
 * when the window is resized — and only the last of those fires a window event.
 */
export function viewportSize(camera: Camera): Attachment<HTMLElement> {
	return (element) => {
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const box = entry.contentRect;
			camera.size = { w: box.width, h: box.height };
		});

		observer.observe(element);

		// Measure once immediately. The observer fires asynchronously, and the first
		// frame otherwise renders with a zero-sized viewport — which makes \`fit()\`
		// divide by zero and every node disappear.
		const box = element.getBoundingClientRect();
		camera.size = { w: box.width, h: box.height };

		return () => observer.disconnect();
	};
}`
			},
			{
				type: 'p',
				text: 'A `ResizeObserver`, not a `resize` listener on `window`. The board’s element changes size when a side panel opens, when the on-screen keyboard appears, and when the window is resized — and only the last of those fires a window event.'
			},
			{
				type: 'p',
				text: 'The immediate measurement afterwards is not redundant. The observer fires asynchronously, so the first frame otherwise renders with a zero-sized viewport — which is the `fit()` divide-by-zero from the last chapter, arriving from a different direction.'
			},

			{ type: 'h3', id: 'the-wheel', text: 'The wheel, and two things nobody tells you' },
			{
				type: 'code',
				file: 'src/lib/canvas/gestures.ts',
				lang: 'ts',
				code: `
const onWheel = (event: WheelEvent) => {
	if (!options.enabled()) return;

	/*
	 * \`ctrlKey\` on a wheel event means a trackpad pinch, on every platform and
	 * in every browser. It is a genuine standard hiding behind a strange name,
	 * and it is the only way to tell a pinch from a scroll.
	 */
	if (event.ctrlKey || event.metaKey) {
		event.preventDefault();
		camera.zoomAt(pointOf(event, element), Math.exp(-event.deltaY * ZOOM_SENSITIVITY));
		return;
	}

	event.preventDefault();

	/*
	 * \`deltaMode\` is not always pixels.
	 *
	 * A mouse wheel on Firefox reports \`DOM_DELTA_LINE\`, where \`deltaY\` is
	 * about 3 — so treating it as pixels makes the board barely move, and the
	 * bug only appears on one browser with one kind of input device.
	 */
	const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
	camera.panBy(-event.deltaX * scale, -event.deltaY * scale);`
			},
			{
				type: 'note',
				text: '`ctrlKey` on a wheel event means **a trackpad pinch**, on every platform and in every browser, whether or not a control key is anywhere near the machine. It is a genuine de-facto standard hiding behind a strange name, and it is the only way to tell a pinch from a scroll.'
			},
			{
				type: 'warn',
				text: '`deltaMode` is not always pixels. A mouse wheel on Firefox reports `DOM_DELTA_LINE`, where `deltaY` is about 3 — so treating it as pixels makes the board barely move. The bug appears on one browser with one kind of input device, which is exactly the sort of thing that survives to production.'
			},

			{ type: 'h3', id: 'capture', text: 'Pointer capture' },
			{
				type: 'code',
				file: 'src/lib/canvas/gestures.ts',
				lang: 'ts',
				code: `
};

const onPointerDown = (event: PointerEvent) => {
	if (event.pointerType === 'touch') {
		touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (touches.size === 2) pinchDistance = spread(touches);
		return;
	}

	// Middle button, or space held — the two conventions people arrive with.
	const wantsPan = event.button === 1 || (event.button === 0 && spaceHeld);
	if (!wantsPan || !options.enabled()) return;

	event.preventDefault();
	panning = true;
	last = { x: event.clientX, y: event.clientY };

	/*
	 * Capture the pointer.
	 *
	 * Without it, a fast pan that leaves the element stops dead and the board
	 * is left mid-gesture with no pointerup ever arriving. With it, every
	 * subsequent event for this pointer is delivered here until release.
	 */
	element.setPointerCapture(event.pointerId);
};`
			},
			{
				type: 'p',
				text: 'Without capture, a fast pan that leaves the element stops dead and the board is left mid-gesture with no `pointerup` ever arriving. With it, every subsequent event for that pointer is delivered here until release.'
			},
			{
				type: 'warn',
				text: 'Pointer capture has a consequence that bites later, in chapter 31: it redirects the *compatibility mouse events* too, so an `ondblclick` handler on a captured child element never fires. Tessera’s rename-on-double-click had to move up to the canvas because of it. Worth knowing now rather than discovering at 11pm.'
			},

			{ type: 'h3', id: 'the-frozen-canvas', text: 'The listener that stops the canvas freezing' },
			{
				type: 'code',
				file: 'src/lib/canvas/gestures.ts',
				lang: 'ts',
				code: `
const onKeyDown = (event: KeyboardEvent) => {
	if (event.code !== 'Space') return;
	// Not while typing a label — space is a space.
	if (isTyping(event.target)) return;
	spaceHeld = true;
	element.dataset.grabbing = 'true';
};

const onKeyUp = (event: KeyboardEvent) => {
	if (event.code !== 'Space') return;
	spaceHeld = false;
	delete element.dataset.grabbing;
};

/*
 * A blur listener as well as keyup.
 *
 * Alt-tabbing away with space held never delivers the keyup, so the board
 * comes back stuck in pan mode and clicking selects nothing. It looks like
 * the canvas has frozen.
 */
const onBlur = () => {
	spaceHeld = false;
	panning = false;
	delete element.dataset.grabbing;
};

// \`passive: false\` — these handlers call \`preventDefault\`, and a passive
// listener that does so is ignored with only a console warning.
element.addEventListener('wheel', onWheel, { passive: false });
element.addEventListener('pointerdown', onPointerDown);
element.addEventListener('pointermove', onPointerMove);
element.addEventListener('pointerup', onPointerUp);
element.addEventListener('pointercancel', onPointerUp);
addEventListener('keydown', onKeyDown);
addEventListener('keyup', onKeyUp);
addEventListener('blur', onBlur);`
			},
			{
				type: 'p',
				text: 'Alt-tabbing away with space held never delivers the `keyup`, so the board comes back stuck in pan mode and clicking selects nothing. It looks like the canvas has frozen, and it is three lines to prevent. **Any state driven by a held key needs a `blur` listener**; there is no exception to this and it is always found the hard way.'
			},
			{
				type: 'p',
				text: 'And `{ passive: false }` on the wheel listener, because these handlers call `preventDefault` and a passive listener that does so is ignored with only a console warning — which is to say, a scroll you cannot prevent and no error to search for.'
			},

			{
				type: 'checkpoint',
				items: [
					'A trackpad pinch zooms and a two-finger scroll pans.',
					'A pan that leaves the window still ends when the button is released.',
					'Alt-tabbing mid-gesture leaves the canvas usable.'
				]
			}
		]
	},

	{
		slug: 'geometry',
		title: 'Geometry that is only numbers',
		summary:
			'Hit testing, bounds, elbow routing, and a routing decision that had to stay deterministic because the document is shared.',
		goal: 'Do every spatial calculation as a pure function, testable in Node in a millisecond.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/board/geometry.ts',
				lang: 'ts',
				code: `
/**
 * GEOMETRY
 * ========
 *
 * Board coordinates, not screen coordinates. Nothing in this file knows about
 * zoom, scroll or devicePixelRatio — that conversion lives in \`canvas/camera\`,
 * and keeping it out of here means every function below is a pure function of
 * numbers and can be tested without a browser.
 *
 * The y axis points down, matching the DOM and SVG. Every "top" here is a
 * smaller number than the corresponding "bottom", which is worth saying once
 * because half of the sign errors in canvas code come from someone assuming the
 * other convention for one function.`
			},
			{
				type: 'p',
				text: 'Nothing in this file knows about zoom, scroll or `devicePixelRatio` — that conversion lives in the camera. Keeping it out means every function here is a pure function of numbers and can be tested without a browser, which is what makes a hundred and thirty lines of spatial code trustworthy.'
			},
			{
				type: 'p',
				text: 'The sentence about the y axis is worth copying into any canvas project you write. Half the sign errors in this kind of code come from somebody assuming the other convention for one function.'
			},
			{
				type: 'code',
				file: 'src/lib/board/geometry.ts',
				lang: 'ts',
				code: `
export function contains(rect: Rect, point: Point): boolean {
	return (
		point.x >= rect.x &&
		point.x <= rect.x + rect.w &&
		point.y >= rect.y &&
		point.y <= rect.y + rect.h
	);
}

/** Do two rectangles share any area? Touching edges count as overlapping. */
export function intersects(a: Rect, b: Rect): boolean {
	return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** The smallest rectangle containing all of them, or \`null\` for none. */
export function bounds(rects: Iterable<Rect>): Rect | null {
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	let seen = false;

	for (const rect of rects) {
		seen = true;
		left = Math.min(left, rect.x);
		top = Math.min(top, rect.y);
		right = Math.max(right, rect.x + rect.w);
		bottom = Math.max(bottom, rect.y + rect.h);
	}

	return seen ? { x: left, y: top, w: right - left, h: bottom - top } : null;
}

/** Grow a rectangle on all sides. Negative shrinks. */
export function inflate(rect: Rect, by: number): Rect {
	return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

/** A rectangle from two corners, in any order. Used by the marquee. */
export function fromCorners(a: Point, b: Point): Rect {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y)
	};
}

export function centre(rect: Rect): Point {
	return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };`
			},
			{
				type: 'p',
				text: 'Small, boring, and each one used in three places. `bounds` returns `null` for an empty iterable rather than a zero rectangle at the origin, because "no shapes" and "a zero-size shape at 0,0" want different handling and collapsing them puts an `if` in every caller anyway.'
			},

			{ type: 'h3', id: 'ports', text: 'Where an arrow attaches' },
			{
				type: 'code',
				file: 'src/lib/board/geometry.ts',
				lang: 'ts',
				code: `
/**
 * The point on a node's edge where a connection attaches.
 *
 * \`auto\` picks the side facing the other end, which is what makes a diagram
 * rearrange itself sensibly when a box is dragged across the board.
 *
 * The choice is the dominant axis of the gap between centres: a total function
 * of two rectangles, with no trigonometry and no state. It does flip at the
 * diagonal — drag a box past 45 degrees and the arrow moves from the right edge
 * to the bottom one — and that is accepted rather than smoothed away.
 *
 * Hysteresis would remove the flip and would make the routing depend on where
 * the box came *from*. In a shared document that is a divergence: two people
 * whose boxes arrived at the same place by different paths would see the arrow
 * attached to different sides of the same node. Determinism wins.
 */
export function portPoint(rect: Rect, port: Port, towards: Point): Point {
	const middle = centre(rect);

	/*
	 * Narrowed to the four real sides before the switch, so the switch is
	 * exhaustive over exactly the cases that exist. Leaving \`'auto'\` in the union
	 * and adding an unreachable branch for it works and is worse: the branch has
	 * to return something, whatever it returns is a lie, and a future fifth port
	 * would land in it silently instead of failing to compile.
	 */
	const side: Exclude<Port, 'auto'> = port === 'auto' ? autoPort(middle, towards) : port;

	switch (side) {
		case 'top':
			return { x: middle.x, y: rect.y };
		case 'bottom':
			return { x: middle.x, y: rect.y + rect.h };
		case 'left':
			return { x: rect.x, y: middle.y };
		case 'right':
			return { x: rect.x + rect.w, y: middle.y };
	}
}

function autoPort(from: Point, to: Point): Exclude<Port, 'auto'> {
	const dx = to.x - from.x;
	const dy = to.y - from.y;

	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
	return dy >= 0 ? 'bottom' : 'top';
}`
			},
			{
				type: 'why',
				title: 'Determinism beats polish, in a shared document',
				text: '`auto` picks the dominant axis of the gap between centres, and it *flips* at the diagonal: drag a box past 45 degrees and the arrow jumps from the right edge to the bottom one. The obvious polish is hysteresis — remember which side it was on and require a bigger movement to change. Do that and the routing depends on where the box came *from*, which in a shared document is a **divergence**: two people whose boxes arrived at the same place by different paths see the arrow attached to different sides of the same node. The flicker is the price of everybody seeing the same diagram.'
			},
			{
				type: 'note',
				text: 'The narrowing before the switch is a small type-design idea worth stealing. `side` is `Exclude<Port, \'auto\'>`, so the switch is exhaustive over exactly the cases that exist. Leaving `\'auto\'` in the union and adding an unreachable branch works and is worse: the branch has to return something, whatever it returns is a lie, and a future fifth port lands in it silently instead of failing to compile.'
			},
			{
				type: 'code',
				file: 'src/lib/board/geometry.ts',
				lang: 'ts',
				code: `
/**
 * An orthogonal route between two nodes: the elbow polyline a system diagram
 * wants, rather than a straight line between centres.
 *
 * Three segments at most. A real router would avoid the other nodes; this one
 * deliberately does not, because a router that reroutes while you drag makes the
 * diagram feel unstable, and because "the line goes behind that box" is a
 * problem people fix by moving the box.
 */
export function route(from: Rect, to: Rect, fromPort: Port, toPort: Port): Point[] {
	const start = portPoint(from, fromPort, centre(to));
	const end = portPoint(to, toPort, centre(from));

	const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
	const middle = horizontal ? (start.x + end.x) / 2 : (start.y + end.y) / 2;

	if (horizontal) {
		return [start, { x: middle, y: start.y }, { x: middle, y: end.y }, end];
	}
	return [start, { x: start.x, y: middle }, { x: end.x, y: middle }, end];
}
`
			},
			{
				type: 'p',
				text: 'Three segments at most, and deliberately no obstacle avoidance. A real router would route around the other nodes; this one does not, because a router that reroutes while you drag makes the diagram feel unstable, and because "the line goes behind that box" is a problem people fix by moving the box.'
			},

			{ type: 'h3', id: 'hit-testing', text: 'Hit testing' },
			{
				type: 'code',
				file: 'src/lib/canvas/editor.svelte.ts',
				lang: 'ts',
				code: `
/** Which node is under a board point, topmost first. */
hitTest(point: Point): NodeView | null {
	const painted = this.document.painted();
	for (let i = painted.length - 1; i >= 0; i -= 1) {
		const node = painted[i]!;
		if (contains(node.rect, point)) return node;
	}
	return null;
}`
			},
			{
				type: 'p',
				text: 'Backwards through the painted order, so the topmost node wins — which is what "on top" means, and it is one `for` loop rather than a spatial index. A board with ten thousand shapes would want a quadtree; a diagram has tens, and building the index anyway would be the expensive kind of foresight this course keeps warning about.'
			},

			{
				type: 'checkpoint',
				items: [
					'Every function in `geometry.ts` is testable without a DOM.',
					'You can explain why the port choice must not have memory.',
					'Clicking overlapping shapes selects the one drawn on top.'
				]
			}
		]
	},

	{
		slug: 'snapping',
		title: 'Snapping that helps rather than fights',
		summary:
			'Two rules — screen-space thresholds and nearest-only — and why alignment beats the grid when both apply.',
		goal: 'Make shapes click into place without ever feeling like they are resisting you.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/canvas/snapping.ts',
				lang: 'ts',
				code: `
/**
 * ALIGNMENT AND SNAPPING
 * ======================
 *
 * When a shape is dragged near an edge or centre line of another shape, it
 * clicks into place and a guide is drawn. It is the difference between a diagram
 * that looks tidy and one that is tidy.
 *
 * TWO RULES THAT MAKE IT FEEL RIGHT RATHER THAN FIGHT
 * ---------------------------------------------------
 * The threshold is in **screen** pixels, not board units. Snapping that gets
 * stronger as you zoom in is exactly backwards — zooming in is what people do
 * when they want fine control.
 *
 * Only the **nearest** candidate on each axis wins. Collecting every match and
 * applying them all makes a shape jump between two equally close neighbours as
 * the pointer moves, which reads as the shape being unable to make up its mind.
 */`
			},
			{
				type: 'why',
				title: 'The threshold is in screen pixels',
				text: 'Snapping that gets stronger as you zoom in is exactly backwards: zooming in is what people do when they want **fine control**. Six board units is a hair at 10% zoom and half a shape at 400%. Six screen pixels is six screen pixels, and the implementation is one division: `SNAP_THRESHOLD / scale`.'
			},
			{
				type: 'p',
				text: 'The second rule is subtler and just as important. Only the *nearest* candidate on each axis wins. Collect every match and apply them all, and a shape jumps between two equally close neighbours as the pointer moves — which reads as the shape being unable to make up its mind.'
			},
			{
				type: 'code',
				file: 'src/lib/canvas/snapping.ts',
				lang: 'ts',
				code: `
/** How close, in screen pixels, before a shape snaps. */
export const SNAP_THRESHOLD = 6;

export interface Guide {
	readonly axis: 'x' | 'y';
	/** Board coordinate of the line. */
	readonly at: number;
	/** The span the guide is drawn across, so it reaches both shapes. */
	readonly from: number;
	readonly to: number;
}

export interface SnapResult {
	readonly dx: number;
	readonly dy: number;
	readonly guides: readonly Guide[];
}

/** The three interesting lines on each axis: both edges and the centre. */
function linesX(rect: Rect): number[] {
	return [rect.x, rect.x + rect.w / 2, rect.x + rect.w];
}

function linesY(rect: Rect): number[] {
	return [rect.y, rect.y + rect.h / 2, rect.y + rect.h];`
			},
			{
				type: 'p',
				text: 'Three lines per axis — both edges and the centre — which is what makes "align these two boxes by their middles" work without a separate feature.'
			},
			{
				type: 'code',
				file: 'src/lib/canvas/snapping.ts',
				lang: 'ts',
				code: `
/**
 * Work out how far to nudge \`moving\` so it lines up with something in \`others\`.
 *
 * @param scale the camera's zoom, so the threshold stays constant on screen.
 */
export function snapTo(moving: Rect, others: readonly Rect[], scale: number): SnapResult {
	const threshold = SNAP_THRESHOLD / Math.max(scale, 0.0001);

	let bestX: { delta: number; at: number; other: Rect } | null = null;
	let bestY: { delta: number; at: number; other: Rect } | null = null;

	for (const other of others) {
		for (const mine of linesX(moving)) {
			for (const theirs of linesX(other)) {
				const delta = theirs - mine;
				if (Math.abs(delta) > threshold) continue;
				if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
					bestX = { delta, at: theirs, other };
				}
			}
		}

		for (const mine of linesY(moving)) {
			for (const theirs of linesY(other)) {
				const delta = theirs - mine;
				if (Math.abs(delta) > threshold) continue;
				if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
					bestY = { delta, at: theirs, other };
				}
			}
		}
	}

	const guides: Guide[] = [];

	if (bestX) {
		guides.push({
			axis: 'x',
			at: bestX.at,
			// The guide spans both shapes, so it visibly connects them rather than
			// floating as an unexplained line.
			from: Math.min(moving.y, bestX.other.y),
			to: Math.max(moving.y + moving.h, bestX.other.y + bestX.other.h)
		});
	}

	if (bestY) {
		guides.push({
			axis: 'y',
			at: bestY.at,
			from: Math.min(moving.x, bestY.other.x),
			to: Math.max(moving.x + moving.w, bestY.other.x + bestY.other.w)
		});
	}

	return { dx: bestX?.delta ?? 0, dy: bestY?.delta ?? 0, guides };`
			},
			{
				type: 'p',
				text: 'A triple loop, which looks alarming and is nine comparisons per other shape. On a board of two hundred nodes that is eighteen hundred float comparisons per pointer move, which is nothing. When it stops being nothing the fix is to filter `others` by the visible region first — one line, and only worth writing when a profiler asks for it.'
			},
			{
				type: 'p',
				text: 'The guide spans **both** shapes rather than the viewport, so it visibly connects them instead of floating as an unexplained line. Small, and it is the difference between a guide that explains itself and one that is decoration.'
			},

			{ type: 'h3', id: 'grid-vs-snap', text: 'When both apply' },
			{
				type: 'code',
				file: 'src/lib/canvas/editor.svelte.ts',
				lang: 'ts',
				code: `
			.filter((node) => !drag.start.has(node.id))
			.map((node) => node.rect);

		const result = snapTo(proposed, others, this.camera.scale);
		this.guides = result.guides;

		/*
		 * Snapping wins over the grid.
		 *
		 * Applying both means a shape that has clicked onto a neighbour's edge is
		 * then rounded off it again, so it sits one or two units out and the
		 * guide is still showing. Alignment to another shape is what the person
		 * asked for; the grid is the fallback when nothing is nearby.
		 */
		if (result.dx !== 0 || result.dy !== 0) {
			dx += result.dx;
			dy += result.dy;
		} else {
			const anchor = [...drag.start.values()][0];
			if (anchor) {
				dx += snap(anchor.x + dx, GRID) - (anchor.x + dx);
				dy += snap(anchor.y + dy, GRID) - (anchor.y + dy);
			}
		}
	}
} else {
	this.guides = [];
}`
			},
			{
				type: 'warn',
				text: 'Snapping wins over the grid, and the `else` matters. Apply both and a shape that has clicked onto a neighbour’s edge is then rounded off it again — so it sits one or two units out **while the guide is still showing**, which is the interface visibly contradicting itself. Alignment to another shape is what the person asked for; the grid is the fallback when nothing is nearby.'
			},

			{
				type: 'checkpoint',
				items: [
					'Snapping feels the same at 25% and 400% zoom.',
					'A shape between two neighbours picks one and stays there.',
					'A snapped shape sits exactly on the guide.'
				]
			}
		]
	},

	{
		slug: 'the-editor',
		title: 'The editor',
		summary:
			'Selection, tools and commands as one testable class — plus the throttle that decides how often a drag writes to a shared document.',
		goal: 'Put every gesture’s meaning in a class the components merely render.',
		blocks: [
			{
				type: 'code',
				file: 'src/lib/canvas/editor.svelte.ts',
				lang: 'ts',
				code: `
/**
 * THE EDITOR
 * ==========
 *
 * Selection, tools and every command a person can invoke. The components render
 * this; they do not contain it. A \`Board.svelte\` that owned the drag logic would
 * be four hundred lines that can only be tested by clicking.
 *
 * HOW OFTEN A DRAG WRITES TO THE DOCUMENT
 * ---------------------------------------
 * The obvious implementation emits \`node.set x\` and \`node.set y\` on every
 * pointermove. At 120Hz on a modern trackpad, dragging five shapes is twelve
 * hundred operations a second, all but the last of which are overwritten by the
 * next one.
 *
 * The other extreme — update a local preview and commit once on release — keeps
 * the log perfectly clean and means collaborators see nothing at all until the
 * drag ends, then a shape teleports. In a tool whose entire premise is watching
 * each other work, that is the wrong trade.
 *
 * So: throttled to \`DRAG_HZ\`, with a final exact commit on release. Twenty
 * updates a second is smooth enough that nobody can tell it is not continuous,
 * and it is a sixth of the traffic. The intermediate operations are genuinely
 * wasted, and that waste is the price of the feature; compaction collects them
 * later.
 */`
			},
			{
				type: 'why',
				title: 'How often a drag writes to the document',
				text: 'This is a genuinely three-sided decision. Emit on every `pointermove` and a 120Hz trackpad dragging five shapes produces twelve hundred operations a second, all but the last overwritten by the next. Keep a local preview and commit once on release, and the log is perfectly clean while collaborators see **nothing at all** until you let go, then a shape teleports — in a tool whose entire premise is watching each other work. Twenty updates a second is smooth enough that nobody can tell it is not continuous, and a sixth of the traffic. The intermediate operations are genuinely wasted, and that waste is the price of the feature.'
			},
			{
				type: 'code',
				file: 'src/lib/canvas/editor.svelte.ts',
				lang: 'ts',
				code: `
export type Tool = 'select' | 'connect' | NodeKind;

interface DragState {
	readonly origin: Point;
	/** Where each dragged node started, so the whole gesture is one undo entry. */
	readonly start: Map<NodeId, Rect>;
	last: number;
}

export class BoardEditor {
	readonly selection = new SvelteSet<Stamp>();

	tool = $state<Tool>('select');

	/** The rubber band, in board coordinates. Replaced wholesale each frame. */
	marquee = $state.raw<Rect | null>(null);
	/** Alignment guides to draw while dragging. */
	guides = $state.raw<readonly Guide[]>([]);
	/** The node a new connection is being dragged from. */
	connectingFrom = $state<NodeId | null>(null);
	connectingTo = $state.raw<Point | null>(null);
	/** The element whose label is being edited in place. */
	editing = $state<Stamp | null>(null);

	#drag: DragState | null = null;
	#marqueeOrigin: Point | null = null;
	#additive = false;

	readonly document: BoardDocument;
	readonly camera: Camera;
	readonly history: History;
	readonly readOnly: boolean;

	constructor(document: BoardDocument, camera: Camera, history: History, readOnly: boolean) {
		this.document = document;
		this.camera = camera;
		this.history = history;
		this.readOnly = readOnly;
	}

	/* ---------------------------------------------------------------- */
	/* Selection                                                         */`
			},
			{
				type: 'p',
				text: '`SvelteSet` for the selection, so `{#each}` over it is reactive without a manual `= new Set(...)` reassignment. `$state.raw` for the marquee and the guides, which are replaced wholesale every frame.'
			},

			{ type: 'h3', id: 'creating', text: 'Creating, with undo built in' },
			{
				type: 'code',
				file: 'src/lib/canvas/editor.svelte.ts',
				lang: 'ts',
				code: `
/** The order key that puts a new node on top of everything. */
#topOrder(): OrderKey {
	const painted = this.document.painted();
	const highest = painted.at(-1);
	return highest ? between(highest.order, null) : MIDDLE;
}

addNode(kind: NodeKind, at: Point): NodeId | null {
	if (this.readOnly) return null;

	const id = this.document.addNode({
		kind,
		// Centred on the drop point rather than corner-anchored: people aim at
		// where they want the middle of the box, not its top-left pixel.
		x: snap(at.x - 84, GRID),
		y: snap(at.y - 44, GRID),
		order: this.#topOrder()
	});

	this.history.push({
		label: 'add',
		undo: () => this.document.removeNode(id),
		redo: () => {
			const fields = this.document.nodeFields(id);
			if (fields) this.document.restoreNode(id, fields);
		}
	});

	this.selectOnly([id]);
	this.editing = id;
	return id;`
			},
			{
				type: 'p',
				text: 'Two details worth stealing. A new node goes on top by minting an order key *above the highest* — `between(highest.order, null)` — which is chapter 08 doing exactly the job it was built for, in one line, touching no other shape.'
			},
			{
				type: 'p',
				text: 'And the node is centred on the drop point rather than corner-anchored, because people aim at where they want the middle of the box, not its top-left pixel.'
			},
			{
				type: 'note',
				text: 'Every command pushes an undo entry that is a *pair of closures*, and `redo` for a creation re-reads the fields and calls `restoreNode` — which mints a new stamp for the same id. That is chapter 09’s "undo of a delete is a new add" made concrete: the closure cannot capture a stamp, because the point is that the new event must be one no existing removal has observed.'
			},

			{ type: 'h3', id: 'dragging', text: 'A drag, end to end' },
			{
				type: 'code',
				file: 'src/lib/canvas/editor.svelte.ts',
				lang: 'ts',
				code: `
beginDrag(origin: Point): void {
	if (this.readOnly || this.selection.size === 0) return;

	const start = new Map<NodeId, Rect>();
	for (const node of this.selectedNodes) start.set(node.id, node.rect);

	this.#drag = { origin, start, last: 0 };
}

get dragging(): boolean {
	return this.#drag !== null;
}`
			},
			{
				type: 'p',
				text: 'The drag records where every selected node *started*, which is what makes the whole gesture one undo entry rather than twenty. It also means the drag is computed from the origin each frame rather than accumulated — so a dropped frame is not a lost pixel.'
			},
			{
				type: 'code',
				file: 'src/lib/canvas/editor.svelte.ts',
				lang: 'ts',
				code: `
	// Throttled. See the note at the top of the file.
	const now = performance.now();
	if (now - drag.last < 1000 / DRAG_HZ) return;
	drag.last = now;

	this.#applyDrag(drag, dx, dy);
}

endDrag(current: Point, free = false): void {
	const drag = this.#drag;
	this.#drag = null;
	this.guides = [];
	if (!drag) return;

	let dx = current.x - drag.origin.x;
	let dy = current.y - drag.origin.y;

	if (!free) {
		const anchor = [...drag.start.values()][0];
		if (anchor) {
			dx += snap(anchor.x + dx, GRID) - (anchor.x + dx);
			dy += snap(anchor.y + dy, GRID) - (anchor.y + dy);
		}
	}

	// The exact final position, whatever the throttle last managed to send.
	this.#applyDrag(drag, dx, dy);

	if (dx === 0 && dy === 0) return;

	const start = drag.start;
	this.history.push({
		label: 'move',
		undo: () => {
			for (const [id, rect] of start) this.document.moveNode(id, rect.x, rect.y);
		},
		redo: () => {
			for (const [id, rect] of start) this.document.moveNode(id, rect.x + dx, rect.y + dy);
		}
	});
}

#applyDrag(drag: DragState, dx: number, dy: number): void {
	for (const [id, rect] of drag.start) {
		this.document.moveNode(id, rect.x + dx, rect.y + dy);
	}
}`
			},
			{
				type: 'p',
				text: 'And the release commits the exact final position, whatever the throttle last managed to send. Without that line a drag ends wherever the last twentieth-of-a-second tick left it, which is up to fifty milliseconds of movement — visible, and infuriating, because it looks like the shape slipped.'
			},

			{ type: 'h3', id: 'marquee', text: 'The marquee' },
			{
				type: 'code',
				file: 'src/lib/canvas/editor.svelte.ts',
				lang: 'ts',
				code: `
updateMarquee(current: Point): void {
	if (!this.#marqueeOrigin) return;

	const rect = fromCorners(this.#marqueeOrigin, current);
	this.marquee = rect;

	const inside = this.document
		.painted()
		.filter((node) => intersects(rect, node.rect))
		.map((node) => node.id);

	/*
	 * Recomputed from scratch on every move rather than added to incrementally.
	 *
	 * A shape that the band has passed over and then retreated from must become
	 * unselected again, and tracking that with adds and removes means holding a
	 * second copy of "what was selected before the drag" anyway. This way the
	 * selection is a pure function of the rectangle.
	 */
	if (this.#additive) {
		for (const id of inside) this.selection.add(id);
	} else {
		this.selectOnly(inside);
	}
}`
			},
			{
				type: 'p',
				text: 'Recomputed from scratch on every move rather than added to incrementally. A shape the band has passed over and then retreated from must become unselected again, and tracking that with adds and removes means holding a second copy of "what was selected before the drag" anyway. This way the selection is a pure function of the rectangle — which is both simpler and impossible to get subtly wrong.'
			},

			{
				type: 'checkpoint',
				items: [
					'Dragging five shapes is one undo entry.',
					'A collaborator sees your drag move, not teleport.',
					'Dragging the marquee backwards over a shape deselects it.'
				]
			}
		]
	}
];
