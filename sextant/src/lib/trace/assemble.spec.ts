import { describe, expect, it } from 'vitest';
import { assemble, layout, serviceTotals, type SpanInput } from './assemble.ts';
import { seeded } from '#lib/sketch/testing.ts';

function span(
	spanId: string,
	parentId: string | null,
	start: number,
	duration: number,
	extra: Partial<SpanInput> = {}
): SpanInput {
	return {
		spanId,
		parentId,
		name: spanId,
		service: extra.service ?? 'api',
		start,
		duration,
		status: extra.status ?? 'ok',
		...extra
	};
}

/** The tree as `id(child, child)`, so structure assertions read as structure. */
function shape(node: { spanId: string; children: readonly { spanId: string }[] }): string {
	const children = (node.children as readonly Parameters<typeof shape>[0][]).map(shape);
	return children.length === 0 ? node.spanId : `${node.spanId}(${children.join(' ')})`;
}

describe('building the tree', () => {
	it('links parents to children', () => {
		const trace = assemble('t1', [
			span('root', null, 0, 100),
			span('a', 'root', 10, 40),
			span('b', 'root', 50, 30),
			span('a1', 'a', 15, 10)
		])!;

		expect(shape(trace.root)).toBe('root(a(a1) b)');
		expect(trace.spanCount).toBe(4);
	});

	it('does not care what order the spans arrive in', () => {
		/*
		 * Services flush independently, so the database's order is arrival order and
		 * not causal order. A build that links as it walks works perfectly on data
		 * sorted by start time and drops children on data that is not.
		 */
		const spans = [
			span('a1', 'a', 15, 10),
			span('b', 'root', 50, 30),
			span('root', null, 0, 100),
			span('a', 'root', 10, 40)
		];

		expect(shape(assemble('t1', spans)!.root)).toBe('root(a(a1) b)');

		// And in every other order too.
		const random = seeded(9);
		for (let i = 0; i < 50; i += 1) {
			const shuffled = [...spans].sort(() => random() - 0.5);
			expect(shape(assemble('t1', shuffled)!.root), `iteration ${i}`).toBe('root(a(a1) b)');
		}
	});

	it('orders children by start time, then by id', () => {
		// A waterfall whose bars are out of order is unreadable. Ties break on id so
		// two spans in the same millisecond render the same way on every load —
		// millisecond resolution is what most senders report.
		const trace = assemble('t1', [
			span('root', null, 0, 100),
			span('z', 'root', 10, 5),
			span('a', 'root', 10, 5),
			span('m', 'root', 5, 5)
		])!;

		expect(shape(trace.root)).toBe('root(m a z)');
	});

	it('renders depth-first, left to right', () => {
		// Reversing the stack push is what stops each level rendering backwards,
		// which looks like the trace happened in the wrong order.
		const trace = assemble('t1', [
			span('root', null, 0, 100),
			span('a', 'root', 0, 40),
			span('a1', 'a', 0, 10),
			span('a2', 'a', 20, 10),
			span('b', 'root', 50, 20)
		])!;

		expect(trace.flat.map((node) => node.spanId)).toEqual(['root', 'a', 'a1', 'a2', 'b']);
		expect(trace.flat.map((node) => node.depth)).toEqual([0, 1, 2, 2, 1]);
	});
});

describe('the pieces that are missing', () => {
	it('keeps a span whose parent never arrived', () => {
		/*
		 * Orphans are not noise — they are frequently the interesting ones, because
		 * the service that would have sent the parent is the one that failed.
		 */
		const trace = assemble('t1', [span('root', null, 0, 100), span('lost', 'gone', 10, 20)])!;

		expect(trace.orphanCount).toBe(1);
		expect(trace.flat.map((n) => n.spanId)).toContain('lost');
	});

	it('invents a root when there is none, and says so', () => {
		const trace = assemble('t1', [span('a', 'missing', 10, 20), span('b', 'missing', 40, 20)])!;

		expect(trace.root.synthetic).toBe(true);
		expect(trace.root.name).toBe('incomplete trace');
		expect(shape(trace.root)).toBe('synthetic:t1(a b)');
	});

	it('spans the synthetic root across everything below it', () => {
		const trace = assemble('t1', [span('a', 'x', 100, 50), span('b', 'x', 200, 75)])!;
		expect(trace.root.start).toBe(100);
		expect(trace.root.duration).toBe(175);
	});

	it('uses a single real root as-is', () => {
		const trace = assemble('t1', [span('root', null, 0, 10)])!;
		expect(trace.root.synthetic).toBeUndefined();
		expect(trace.root.spanId).toBe('root');
	});

	it('treats a duplicated span id as one span', () => {
		// A re-delivered span is not two spans, and keeping the first consistently
		// is what stops a trace rendering differently on two loads.
		const trace = assemble('t1', [
			span('root', null, 0, 100),
			span('a', 'root', 10, 40),
			span('a', 'root', 10, 40)
		])!;
		expect(trace.spanCount).toBe(2);
	});

	it('returns null for no spans at all', () => {
		expect(assemble('t1', [])).toBeNull();
	});
});

describe('cycles', () => {
	it('does not hang or overflow on a two-node loop', () => {
		/*
		 * Rare, and the cost of not checking is not a wrong picture — it is a stack
		 * overflow during render that takes the tab with it.
		 */
		const trace = assemble('t1', [span('a', 'b', 0, 10), span('b', 'a', 0, 10)])!;

		expect(trace.hadCycle).toBe(true);
		expect(trace.flat.length).toBeGreaterThan(0);
		expect(trace.spanCount).toBe(2);
	});

	it('handles a span that is its own parent', () => {
		const trace = assemble('t1', [span('a', 'a', 0, 10)])!;
		expect(trace.hadCycle).toBe(true);
		expect(trace.flat.map((n) => n.spanId)).toContain('a');
	});

	it('handles a longer loop', () => {
		const trace = assemble('t1', [
			span('a', 'c', 0, 10),
			span('b', 'a', 0, 10),
			span('c', 'b', 0, 10)
		])!;
		expect(trace.hadCycle).toBe(true);
		expect(trace.flat.length).toBeGreaterThan(0);
	});

	it('reports no cycle for ordinary data', () => {
		const trace = assemble('t1', [span('root', null, 0, 100), span('a', 'root', 0, 10)])!;
		expect(trace.hadCycle).toBe(false);
	});

	it('survives a chain thousands deep', () => {
		// A service retrying in a loop produces exactly this, and that trace is the
		// bug report — so it has to render rather than overflow.
		const spans: SpanInput[] = [span('s0', null, 0, 10_000)];
		for (let i = 1; i < 5_000; i += 1) spans.push(span(`s${i}`, `s${i - 1}`, i, 10_000 - i));

		const trace = assemble('deep', spans)!;
		expect(trace.spanCount).toBe(5_000);
		// Truncated at the depth limit rather than rendered forever.
		expect(trace.flat.length).toBeLessThanOrEqual(5_000);
		expect(Math.max(...trace.flat.map((n) => n.depth))).toBeLessThanOrEqual(200);
	});
});

describe('self time', () => {
	it('subtracts what the children account for', () => {
		/*
		 * The number people are actually looking for. A 900ms span is not
		 * interesting if 890ms of it was one child; 900ms with 40ms of children is
		 * 860ms of unexplained work in *this* service.
		 */
		const trace = assemble('t1', [
			span('root', null, 0, 900),
			span('a', 'root', 10, 400),
			span('b', 'root', 420, 460)
		])!;

		expect(trace.root.selfTime).toBe(40);
	});

	it('is the full duration for a leaf', () => {
		const trace = assemble('t1', [span('root', null, 0, 100)])!;
		expect(trace.root.selfTime).toBe(100);
	});

	it('clamps to zero for concurrent children', () => {
		// Children that ran in parallel can sum to more than the parent, and a
		// negative "self time" is a number nobody can interpret.
		const trace = assemble('t1', [
			span('root', null, 0, 100),
			span('a', 'root', 0, 90),
			span('b', 'root', 0, 90)
		])!;
		expect(trace.root.selfTime).toBe(0);
	});
});

describe('summaries', () => {
	it('collects services, errors and the time span', () => {
		const trace = assemble('t1', [
			span('root', null, 1_000, 500, { service: 'gateway' }),
			span('a', 'root', 1_100, 200, { service: 'orders', status: 'error' }),
			span('b', 'root', 1_300, 300, { service: 'orders' })
		])!;

		expect(trace.services).toEqual(['gateway', 'orders']);
		expect(trace.errorCount).toBe(1);
		expect(trace.start).toBe(1_000);
		expect(trace.end).toBe(1_600);
	});

	it('totals self time per service, not duration', () => {
		/*
		 * Summing durations double-counts every parent with its children, so a
		 * gateway calling two services reports over 100% of the trace — which is the
		 * giveaway that a dashboard is summing the wrong column.
		 */
		const trace = assemble('t1', [
			span('root', null, 0, 1_000, { service: 'gateway' }),
			span('a', 'root', 0, 400, { service: 'orders' }),
			span('b', 'root', 400, 500, { service: 'payments' })
		])!;

		const totals = serviceTotals(trace);
		expect(totals).toEqual([
			{ service: 'payments', total: 500 },
			{ service: 'orders', total: 400 },
			{ service: 'gateway', total: 100 }
		]);

		// And they add up to the root's duration rather than exceeding it.
		expect(totals.reduce((sum, entry) => sum + entry.total, 0)).toBe(1_000);
	});

	it('leaves a synthetic root out of the service totals', () => {
		const trace = assemble('t1', [span('a', 'gone', 0, 100, { service: 'orders' })])!;
		expect(serviceTotals(trace)).toEqual([{ service: 'orders', total: 100 }]);
	});
});

describe('layout', () => {
	it('positions bars as fractions of the trace', () => {
		const trace = assemble('t1', [span('root', null, 1_000, 400), span('a', 'root', 1_100, 200)])!;

		const bars = layout(trace);
		expect(bars[0]).toMatchObject({ offset: 0, width: 1 });
		expect(bars[1]).toMatchObject({ offset: 0.25, width: 0.5 });
	});

	it('keeps a very short span visible', () => {
		/*
		 * A 0.2ms span in a 4s trace is 0.005% of the width, which rounds to zero
		 * pixels and disappears. A viewer that silently omits fast spans cannot be
		 * used to find out that something was fast.
		 */
		const trace = assemble('t1', [span('root', null, 0, 4_000), span('quick', 'root', 100, 0.2)])!;

		const quick = layout(trace).find((bar) => bar.node.spanId === 'quick')!;
		expect(quick.width).toBeGreaterThanOrEqual(0.002);
	});

	it('never produces a bar outside the trace', () => {
		const random = seeded(21);
		const spans: SpanInput[] = [span('root', null, 0, 1_000)];
		for (let i = 0; i < 200; i += 1) {
			spans.push(span(`s${i}`, 'root', random() * 1_000, random() * 200));
		}

		for (const bar of layout(assemble('t1', spans)!)) {
			expect(bar.offset).toBeGreaterThanOrEqual(0);
			expect(bar.offset).toBeLessThanOrEqual(1);
			expect(bar.width).toBeLessThanOrEqual(1);
		}
	});

	it('does not divide by zero on an instantaneous trace', () => {
		const trace = assemble('t1', [span('root', null, 5_000, 0)])!;
		expect(layout(trace)[0]!.width).toBeGreaterThan(0);
	});
});
