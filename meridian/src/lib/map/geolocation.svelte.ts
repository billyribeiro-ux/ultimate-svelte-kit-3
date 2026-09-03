/**
 * WHERE AM I, AS A REACTIVE VALUE
 * ===============================
 *
 * `createSubscriber` from `svelte/reactivity` turns an external source of
 * events into something a template can read like state. The function it is
 * given runs when the value is first *read inside an effect* — a template,
 * a `$derived` — and its cleanup runs when nothing reads it any more.
 *
 * So the browser's position watch starts the moment a component shows
 * `geo.fix` and stops the moment it stops showing it. Nobody calls
 * `start()`; nobody forgets to call `stop()`; the "Where am I" button
 * toggles a boolean and the watch follows. That is the whole point of the
 * pattern, and it is why this is a class with getters rather than a store.
 */

import { createSubscriber } from 'svelte/reactivity';

export interface Fix {
	readonly lng: number;
	readonly lat: number;
	/** metres */
	readonly accuracy: number;
	/** Unix milliseconds */
	readonly at: number;
}

export class Geolocation {
	#fix: Fix | null = null;
	#error: string | null = null;
	#subscribe: () => void;

	constructor() {
		this.#subscribe = createSubscriber((update) => {
			if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
				this.#error = 'unsupported';
				update();
				return;
			}

			const id = navigator.geolocation.watchPosition(
				(position) => {
					this.#fix = {
						lng: position.coords.longitude,
						lat: position.coords.latitude,
						accuracy: position.coords.accuracy,
						at: position.timestamp
					};
					this.#error = null;
					update();
				},
				(error) => {
					this.#error = error.message || 'unavailable';
					update();
				},
				{ enableHighAccuracy: false, maximumAge: 30_000, timeout: 20_000 }
			);

			return () => navigator.geolocation.clearWatch(id);
		});
	}

	/** The last position, or `null` before the first one arrives. Reading it starts the watch. */
	get fix(): Fix | null {
		this.#subscribe();
		return this.#fix;
	}

	get error(): string | null {
		this.#subscribe();
		return this.#error;
	}
}
