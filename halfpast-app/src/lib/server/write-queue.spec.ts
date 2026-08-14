import { describe, expect, it } from 'vitest';
import { WriteQueue } from './write-queue.ts';

/** Resolves after `ms`, used to make overlap detectable. */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('WriteQueue', () => {
	it('never runs two tasks at the same time', async () => {
		const queue = new WriteQueue();
		let running = 0;
		let peak = 0;

		await Promise.all(
			Array.from({ length: 8 }, () =>
				queue.run(async () => {
					running += 1;
					peak = Math.max(peak, running);
					await wait(5);
					running -= 1;
				})
			)
		);

		expect(peak).toBe(1);
	});

	it('runs tasks in the order they arrived', async () => {
		const queue = new WriteQueue();
		const order: number[] = [];

		await Promise.all(
			// Deliberately descending waits: without a queue, task 4 would finish
			// first and the order would come back scrambled.
			[0, 1, 2, 3].map((n) =>
				queue.run(async () => {
					await wait(20 - n * 5);
					order.push(n);
				})
			)
		);

		expect(order).toEqual([0, 1, 2, 3]);
	});

	it('delivers a rejection to its own caller and nobody else', async () => {
		const queue = new WriteQueue();

		const failing = queue.run(async () => {
			throw new Error('boom');
		});
		const following = queue.run(async () => 'fine');

		await expect(failing).rejects.toThrow('boom');
		await expect(following).resolves.toBe('fine');
	});

	it('keeps draining after a task throws', async () => {
		const queue = new WriteQueue();
		const done: string[] = [];

		const results = await Promise.allSettled([
			queue.run(async () => {
				done.push('a');
			}),
			queue.run(async () => {
				done.push('b');
				throw new Error('boom');
			}),
			queue.run(async () => {
				done.push('c');
			})
		]);

		expect(done).toEqual(['a', 'b', 'c']);
		expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
	});

	it('reports its depth and returns to zero', async () => {
		const queue = new WriteQueue();
		expect(queue.depth).toBe(0);

		const tasks = [queue.run(() => wait(5)), queue.run(() => wait(5))];
		expect(queue.depth).toBe(2);

		await Promise.all(tasks);
		expect(queue.depth).toBe(0);
	});

	it('returns each task s own value', async () => {
		const queue = new WriteQueue();
		const values = await Promise.all([1, 2, 3].map((n) => queue.run(async () => n * 10)));
		expect(values).toEqual([10, 20, 30]);
	});
});
