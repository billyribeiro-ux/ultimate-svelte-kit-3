import { describe, expect, it } from 'vitest';
import { publishDiaryChange, watchDiary, watcherCount } from './diary-events.ts';

/**
 * Collect values from a stream until it stops or `ms` passes.
 *
 * The timeout aborts the controller rather than calling `.return()` on the
 * generator. That distinction bit once: a generator suspended at `await` does
 * not unwind when you call `.return()` on it — the call queues behind the await
 * that is never going to resolve. Aborting the signal is what the generator is
 * actually waiting on, so it is what ends the stream.
 */
function collect(stream: AsyncGenerator<void>, controller: AbortController, ms: number) {
	const timer = setTimeout(() => controller.abort(), ms);

	return (async () => {
		let seen = 0;
		try {
			for await (const _ of stream) {
				void _;
				seen += 1;
			}
		} finally {
			clearTimeout(timer);
		}
		return seen;
	})();
}

/** Let the event loop turn, so a suspended generator gets to resume. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('watchDiary', () => {
	it('yields when a change is published', async () => {
		const controller = new AbortController();
		const counted = collect(watchDiary('biz-1', { signal: controller.signal }), controller, 200);

		await tick();
		publishDiaryChange('biz-1');

		expect(await counted).toBe(1);
	});

	it('yields once per change when they are spread out', async () => {
		const controller = new AbortController();
		const counted = collect(watchDiary('biz-2', { signal: controller.signal }), controller, 300);

		await tick();
		publishDiaryChange('biz-2');
		await tick();
		publishDiaryChange('biz-2');
		await tick();
		publishDiaryChange('biz-2');

		expect(await counted).toBe(3);
	});

	it('coalesces a burst into a single wake-up', async () => {
		// Three bookings land in the same millisecond. The watcher is about to
		// re-read the diary anyway, and one re-read will see all three — so three
		// separate wake-ups would be three identical queries. This is the whole
		// reason `pending` is a flag rather than a counter.
		const controller = new AbortController();
		const counted = collect(watchDiary('biz-3', { signal: controller.signal }), controller, 200);

		await tick();
		publishDiaryChange('biz-3');
		publishDiaryChange('biz-3');
		publishDiaryChange('biz-3');

		expect(await counted).toBe(1);
	});

	it('ignores changes to a different business', async () => {
		const controller = new AbortController();
		const counted = collect(watchDiary('biz-4', { signal: controller.signal }), controller, 150);

		await tick();
		publishDiaryChange('somebody-else');

		expect(await counted).toBe(0);
	});

	it('wakes every watcher of the same business', async () => {
		const controller = new AbortController();
		const a = collect(watchDiary('biz-5', { signal: controller.signal }), controller, 200);
		const b = collect(watchDiary('biz-5', { signal: controller.signal }), controller, 200);

		await tick();
		expect(watcherCount('biz-5')).toBe(2);
		publishDiaryChange('biz-5');

		expect(await a).toBe(1);
		expect(await b).toBe(1);
	});

	it('removes its listener when the stream ends', async () => {
		const controller = new AbortController();
		const counted = collect(watchDiary('biz-6', { signal: controller.signal }), controller, 100);

		await tick();
		expect(watcherCount('biz-6')).toBe(1);

		await counted;

		// Every closed tab must take its listener with it, or a busy salon's
		// notice board grows a subscriber per page view and never shrinks.
		expect(watcherCount('biz-6')).toBe(0);
	});

	it('yields on the interval even when nothing changes', async () => {
		// Time passing is itself a change: a slot expires when the notice period
		// reaches it, and no database write announces that.
		const controller = new AbortController();
		const counted = collect(
			watchDiary('biz-7', { signal: controller.signal, intervalMs: 25 }),
			controller,
			200
		);

		expect(await counted).toBeGreaterThanOrEqual(3);
		expect(watcherCount('biz-7')).toBe(0);
	});

	it('does not throw when publishing with nobody listening', () => {
		expect(() => publishDiaryChange('nobody-here')).not.toThrow();
	});
});
