/**
 * GESTURES
 * ========
 *
 * Pointer, wheel and keyboard handling for the canvas, as **attachments**.
 *
 * `{@attach}` rather than `use:`. An action's `{ update, destroy }` return is
 * marked legacy in the Svelte 5 documentation, and attachments fix the thing
 * that made actions awkward here: an action runs once and has to be told when
 * its arguments change, while an attachment is an effect and simply re-runs.
 *
 * The subtlety that matters for this file is the opposite one — most of these
 * must *not* re-run. Re-attaching a wheel listener sixty times a second because
 * the camera moved would be a disaster, so anything that changes often is read
 * through a getter inside a nested `$effect`, which is the documented pattern
 * for controlling when an attachment re-runs.
 */

import type { Attachment } from 'svelte/attachments';
import type { Point } from '#lib/board/index.ts';
import type { Camera } from './camera.svelte.ts';

/** How much one wheel notch zooms. Tuned so a trackpad pinch feels 1:1. */
const ZOOM_SENSITIVITY = 0.0015;

/**
 * Keep the camera's idea of the viewport in step with the element's real size.
 *
 * A `ResizeObserver`, not a `resize` listener on `window`. The board's element
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
		// frame otherwise renders with a zero-sized viewport — which makes `fit()`
		// divide by zero and every node disappear.
		const box = element.getBoundingClientRect();
		camera.size = { w: box.width, h: box.height };

		return () => observer.disconnect();
	};
}

export interface PanZoomOptions {
	/** Read fresh on each event, so panning can be suspended while a node is dragged. */
	readonly enabled: () => boolean;
}

/**
 * Pan and zoom: wheel, trackpad pinch, middle-drag, space-drag and two-finger
 * touch.
 *
 * Attached to the scroll container, once, for the life of the board. The camera
 * is captured by reference and never read during setup, so this effect has no
 * reactive dependencies and never re-runs.
 */
export function panZoom(camera: Camera, options: PanZoomOptions): Attachment<HTMLElement> {
	return (element) => {
		/** Active pointers, for pinch. `Map` because pointer ids are not dense. */
		const touches = new Map<number, Point>();
		let panning = false;
		let spaceHeld = false;
		let last: Point | null = null;
		let pinchDistance = 0;

		const onWheel = (event: WheelEvent) => {
			if (!options.enabled()) return;

			/*
			 * `ctrlKey` on a wheel event means a trackpad pinch, on every platform and
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
			 * `deltaMode` is not always pixels.
			 *
			 * A mouse wheel on Firefox reports `DOM_DELTA_LINE`, where `deltaY` is
			 * about 3 — so treating it as pixels makes the board barely move, and the
			 * bug only appears on one browser with one kind of input device.
			 */
			const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
			camera.panBy(-event.deltaX * scale, -event.deltaY * scale);
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
		};

		const onPointerMove = (event: PointerEvent) => {
			if (event.pointerType === 'touch') {
				if (!touches.has(event.pointerId)) return;
				touches.set(event.pointerId, { x: event.clientX, y: event.clientY });

				if (touches.size === 2 && options.enabled()) {
					const distance = spread(touches);
					if (pinchDistance > 0) {
						camera.zoomAt(midpoint(touches, element), distance / pinchDistance);
					}
					pinchDistance = distance;
				}
				return;
			}

			if (!panning || !last) return;
			camera.panBy(event.clientX - last.x, event.clientY - last.y);
			last = { x: event.clientX, y: event.clientY };
		};

		const onPointerUp = (event: PointerEvent) => {
			touches.delete(event.pointerId);
			if (touches.size < 2) pinchDistance = 0;

			if (!panning) return;
			panning = false;
			last = null;
			if (element.hasPointerCapture(event.pointerId))
				element.releasePointerCapture(event.pointerId);
		};

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

		// `passive: false` — these handlers call `preventDefault`, and a passive
		// listener that does so is ignored with only a console warning.
		element.addEventListener('wheel', onWheel, { passive: false });
		element.addEventListener('pointerdown', onPointerDown);
		element.addEventListener('pointermove', onPointerMove);
		element.addEventListener('pointerup', onPointerUp);
		element.addEventListener('pointercancel', onPointerUp);
		addEventListener('keydown', onKeyDown);
		addEventListener('keyup', onKeyUp);
		addEventListener('blur', onBlur);

		return () => {
			element.removeEventListener('wheel', onWheel);
			element.removeEventListener('pointerdown', onPointerDown);
			element.removeEventListener('pointermove', onPointerMove);
			element.removeEventListener('pointerup', onPointerUp);
			element.removeEventListener('pointercancel', onPointerUp);
			removeEventListener('keydown', onKeyDown);
			removeEventListener('keyup', onKeyUp);
			removeEventListener('blur', onBlur);
		};
	};
}

/** Client coordinates relative to an element's top-left corner. */
export function pointOf(event: { clientX: number; clientY: number }, element: Element): Point {
	const box = element.getBoundingClientRect();
	return { x: event.clientX - box.left, y: event.clientY - box.top };
}

function spread(touches: Map<number, Point>): number {
	const [a, b] = [...touches.values()];
	if (!a || !b) return 0;
	return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpoint(touches: Map<number, Point>, element: Element): Point {
	const [a, b] = [...touches.values()];
	if (!a || !b) return { x: 0, y: 0 };
	return pointOf({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }, element);
}

/** Is the event target something a person is typing into? */
export function isTyping(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}
