/**
 * TOASTS, IMPERATIVELY
 * ====================
 *
 * `toast('Saved')` from anywhere — an event handler, a form's `enhance`
 * callback, a catch block — with no `<Toasts />` host to remember to render.
 *
 * `mount` creates a component instance at a target, `unmount` removes it, and
 * `{ outro: true }` lets its `transition:fly` play on the way out. The same
 * two functions SvelteKit itself uses to start the app, used here for the one
 * component that genuinely does not belong to any page.
 */

import { mount, unmount } from 'svelte';
import Toast from './Toast.svelte';

let current: ReturnType<typeof mount> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, tone: 'info' | 'error' = 'info'): void {
	if (typeof document === 'undefined') return;

	// One at a time. A second toast replaces the first rather than stacking;
	// two overlapping status messages are one too many to read.
	if (current) void unmount(current, { outro: false });
	if (timer) clearTimeout(timer);

	current = mount(Toast, { target: document.body, props: { message, tone } });

	timer = setTimeout(() => {
		if (current) void unmount(current, { outro: true });
		current = null;
	}, 2800);
}
