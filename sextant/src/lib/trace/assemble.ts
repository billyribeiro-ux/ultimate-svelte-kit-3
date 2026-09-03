/**
 * ASSEMBLING A TRACE
 * ==================
 *
 * A trace is a tree of spans. The spans arrive as a flat list, in no useful
 * order, and with pieces missing.
 *
 * WHY THIS IS NOT `groupBy(parentId)`
 * -----------------------------------
 * Four things are true of real trace data, and each one breaks the obvious
 * implementation:
 *
 *   1. **A child arrives before its parent.** Services flush independently, so
 *      the database's insertion order is arrival order, not causal order. A
 *      build that requires the parent first drops the child.
 *
 *   2. **The parent never arrives.** The service that would have sent it
 *      crashed, was sampled out, or is not instrumented. Those spans are not
 *      noise — they are frequently the *interesting* ones, and dropping them
 *      hides exactly the request that failed.
 *
 *   3. **The root is missing.** Same reason. A trace with no root still has to
 *      render, and it has to render as one tree rather than as six.
 *
 *   4. **A cycle.** A malformed sender, a replayed span with a rewritten id, or
 *      a hash collision on a truncated id. Rare, and a recursive render on a
 *      cycle is not a wrong picture — it is a stack overflow that takes the tab
 *      with it.
 *
 * So: index first, link second, adopt orphans under a synthetic root, and break
 * cycles explicitly. Every one of those is a few lines, and leaving any of them
 * out produces a viewer that works on the traces you tested with.
 */

export interface SpanInput {
	readonly spanId: string;
	readonly parentId: string | null;
	readonly name: string;
	readonly service: string;
	/** Epoch milliseconds. */
	readonly start: number;
	readonly duration: number;
	readonly status: 'ok' | 'error';
	readonly attributes?: Record<string, unknown>;
}

export interface SpanNode extends SpanInput {
	readonly children: SpanNode[];
	/** Depth from the root, for indenting a waterfall without recursion at render time. */
	depth: number;
	/**
	 * Duration minus time accounted for by children.
	 *
	 * The number people are actually looking for. A span that took 900ms is not
	 * interesting if 890ms of it was one child; a span that took 900ms with 40ms
	 * of children is 860ms of unexplained work in *this* service, which is where
	 * the problem is.
	 */
	selfTime: number;
	/** Present only on a root this code invented. The interface says so. */
	readonly synthetic?: boolean;
}

export interface Trace {
	readonly traceId: string;
	readonly root: SpanNode;
	/** Every span, in depth-first render order. Flat, so a virtualizer can slice it. */
	readonly flat: readonly SpanNode[];
	readonly start: number;
	readonly end: number;
	readonly spanCount: number;
	readonly errorCount: number;
	readonly services: readonly string[];
	/** Spans whose parent was never seen. Surfaced, not hidden. */
	readonly orphanCount: number;
	/** True when a parent chain looped and had to be broken. Always a data bug. */
	readonly hadCycle: boolean;
}

/**
 * How deep a trace may render.
 *
 * Not a guess: a real trace is rarely past 30 levels, and anything past this is
 * either a runaway recursion in the traced application — which is worth showing
 * as a truncation rather than as a hang — or a cycle the check below missed.
 */
const MAX_DEPTH = 200;

export function assemble(traceId: string, spans: readonly SpanInput[]): Trace | null {
	if (spans.length === 0) return null;

	/*
	 * Index by id first, in one pass, before any linking.
	 *
	 * This is what makes arrival order irrelevant: by the time anything looks for
	 * a parent, every span that exists is findable. The version that links as it
	 * walks works perfectly on data sorted by start time and drops children on
	 * data that is not.
	 */
	const byId = new Map<string, SpanNode>();
	for (const span of spans) {
		// A duplicate id is a re-delivered span, not two spans. Keeping the first is
		// arbitrary but consistent, and consistent is what stops a trace rendering
		// differently on two loads.
		if (byId.has(span.spanId)) continue;
		byId.set(span.spanId, { ...span, children: [], depth: 0, selfTime: span.duration });
	}

	const roots: SpanNode[] = [];
	let orphanCount = 0;

	for (const node of byId.values()) {
		if (node.parentId === null) {
			roots.push(node);
			continue;
		}

		const parent = byId.get(node.parentId);
		if (!parent) {
			/*
			 * The parent never arrived. This span is not noise — it is often the
			 * interesting one, because the service that would have sent the parent is
			 * the one that failed.
			 */
			orphanCount += 1;
			roots.push(node);
			continue;
		}

		parent.children.push(node);
	}

	const hadCycle = breakCycles(byId, roots);

	/*
	 * Order children by start time.
	 *
	 * A waterfall whose bars are not in time order is unreadable, and the input
	 * order is arrival order. Ties break on span id so that two spans starting in
	 * the same millisecond — which is common, because that is the resolution most
	 * senders report — render in the same order every time rather than in
	 * whatever order the sort happened to leave them.
	 */
	for (const node of byId.values()) {
		node.children.sort((a, b) => a.start - b.start || (a.spanId < b.spanId ? -1 : 1));
	}
	roots.sort((a, b) => a.start - b.start || (a.spanId < b.spanId ? -1 : 1));

	const root = rootFor(traceId, roots);

	/* Self time, before flattening, because it needs the children. */
	for (const node of byId.values()) {
		let covered = 0;
		for (const child of node.children) covered += child.duration;
		// Clamped at zero: children can legitimately sum to more than the parent
		// when they ran concurrently, and a negative "self time" is a number nobody
		// can interpret.
		node.selfTime = Math.max(0, node.duration - covered);
	}

	const flat: SpanNode[] = [];
	flatten(root, 0, flat);

	let start = Infinity;
	let end = -Infinity;
	let errorCount = 0;
	const services = new Set<string>();

	for (const node of byId.values()) {
		if (node.start < start) start = node.start;
		if (node.start + node.duration > end) end = node.start + node.duration;
		if (node.status === 'error') errorCount += 1;
		services.add(node.service);
	}

	return {
		traceId,
		root,
		flat,
		start,
		end,
		spanCount: byId.size,
		errorCount,
		services: [...services].sort(),
		orphanCount,
		hadCycle
	};
}

/**
 * One root, whatever the data says.
 *
 * A single real root is used as-is. Anything else — no root, or several because
 * of orphans — gets a synthetic one spanning them all, so the renderer has
 * exactly one case to handle and the interface can say plainly that the real
 * root is missing.
 */
function rootFor(traceId: string, roots: readonly SpanNode[]): SpanNode {
	const first = roots[0];
	if (roots.length === 1 && first) return first;

	let start = Infinity;
	let end = -Infinity;
	for (const node of roots) {
		if (node.start < start) start = node.start;
		if (node.start + node.duration > end) end = node.start + node.duration;
	}

	return {
		spanId: `synthetic:${traceId}`,
		parentId: null,
		name: roots.length === 0 ? 'trace' : 'incomplete trace',
		service: '',
		start: Number.isFinite(start) ? start : 0,
		duration: Number.isFinite(end - start) ? end - start : 0,
		status: 'ok',
		children: [...roots],
		depth: 0,
		selfTime: 0,
		synthetic: true
	};
}

/**
 * Detach any span whose parent chain loops, and re-root it.
 *
 * Walks up from each node with a bounded number of steps. A cycle is always a
 * data bug — a malformed sender, a replayed span with a rewritten id — and the
 * cost of not checking is not a wrong picture but a stack overflow during
 * render, which takes the tab with it.
 *
 * Returns whether anything was broken, so the interface can say so rather than
 * silently showing a trace that is missing spans.
 */
function breakCycles(byId: Map<string, SpanNode>, roots: SpanNode[]): boolean {
	let broken = false;

	for (const node of byId.values()) {
		const seen = new Set<string>([node.spanId]);
		let current = node.parentId ? byId.get(node.parentId) : undefined;
		let steps = 0;

		while (current && steps < MAX_DEPTH) {
			if (seen.has(current.spanId)) {
				// Detach this node from its parent and promote it to a root. Cutting
				// at the node rather than at the loop's head keeps the rest of the
				// subtree intact, which is more of the trace than the alternative.
				const parent = node.parentId ? byId.get(node.parentId) : undefined;
				if (parent) {
					const index = parent.children.indexOf(node);
					if (index >= 0) parent.children.splice(index, 1);
				}
				roots.push(node);
				broken = true;
				break;
			}

			seen.add(current.spanId);
			current = current.parentId ? byId.get(current.parentId) : undefined;
			steps += 1;
		}
	}

	return broken;
}

/**
 * Depth-first order, iteratively.
 *
 * Recursion here would be simpler and would blow the stack on the runaway traces
 * that most need looking at — a service retrying in a loop produces a chain
 * thousands deep, and that trace is the bug report.
 */
function flatten(root: SpanNode, depth: number, out: SpanNode[]): void {
	const stack: { node: SpanNode; depth: number }[] = [{ node: root, depth }];

	while (stack.length > 0) {
		const { node, depth: at } = stack.pop()!;
		node.depth = at;
		out.push(node);

		if (at >= MAX_DEPTH) continue;

		// Reversed, because a stack pops in reverse — without this the waterfall
		// renders each level's children backwards, which looks like the trace
		// happened in the wrong order.
		for (let i = node.children.length - 1; i >= 0; i -= 1) {
			stack.push({ node: node.children[i]!, depth: at + 1 });
		}
	}
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export interface SpanBar {
	readonly node: SpanNode;
	/** Fraction of the trace's width, in [0, 1]. */
	readonly offset: number;
	readonly width: number;
}

/**
 * Where each bar goes in a waterfall, as fractions.
 *
 * Fractions rather than pixels, so the same layout works at any width and
 * survives a resize without recomputing — and so the layout can be computed on
 * the server for the initial render.
 *
 * The minimum width is not cosmetic: a 0.2ms span in a 4s trace is 0.005% of the
 * width, which rounds to zero pixels and disappears. A span that exists must be
 * visible and clickable, even if its bar is no longer proportional — and a
 * viewer that silently omits the fast spans is one that cannot be used to find
 * out that something was fast.
 */
export function layout(trace: Trace, minWidth = 0.002): SpanBar[] {
	const span = Math.max(1, trace.end - trace.start);

	return trace.flat.map((node) => ({
		node,
		offset: Math.min(1, Math.max(0, (node.start - trace.start) / span)),
		width: Math.min(1, Math.max(minWidth, node.duration / span))
	}));
}

/**
 * Total time per service, for the summary strip above a waterfall.
 *
 * Uses **self time**, not duration. Summing durations double-counts every parent
 * with its children, so a trace where the gateway calls two services would
 * report the gateway as responsible for 100% of the time plus whatever the
 * children took — a total over 100%, which is the giveaway that a dashboard is
 * summing the wrong column.
 */
export function serviceTotals(trace: Trace): { service: string; total: number }[] {
	const totals = new Map<string, number>();

	for (const node of trace.flat) {
		if (node.synthetic) continue;
		totals.set(node.service, (totals.get(node.service) ?? 0) + node.selfTime);
	}

	return [...totals]
		.map(([service, total]) => ({ service, total }))
		.sort((a, b) => b.total - a.total);
}
