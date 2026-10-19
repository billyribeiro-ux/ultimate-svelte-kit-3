/**
 * WHERE THE SPANS GO
 * ==================
 *
 * SvelteKit emits an OpenTelemetry span for every `handle`, `load`, form
 * action, remote function and (since 3.1) `+server` handler, and
 * OpenTelemetry's job is to hand those to an *exporter*. The usual exporter
 * sends them to a collector over the network. This one keeps the last few
 * hundred in memory, which is all a single-process app needs in order to
 * answer "what did the last request actually do?" on its own diagnostics page.
 *
 * It is deliberately not a replacement for a real collector. It forgets on
 * restart, it holds one process's spans, and it is bounded by `TRACE_BUFFER`
 * so that a busy hour cannot turn into a memory leak. It is the thing you want
 * during development and the thing you outgrow the week you run two instances.
 */

import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

export interface SpanRecord {
	traceId: string;
	spanId: string;
	parentId: string | null;
	name: string;
	/** Unix milliseconds. */
	start: number;
	/** Milliseconds, to a tenth. */
	duration: number;
	ok: boolean;
	attributes: Record<string, string | number | boolean>;
}

/*
 * Module-level state on the server is shared by every request, which is
 * usually the bug. Here it is the point: the ring *is* the cross-request
 * memory, it contains nothing private to any one request, and it is read only
 * by the diagnostics page.
 *
 * It hangs off `globalThis` rather than off this module, and that is the
 * adapter's doing. SvelteKit 3 configures a server as module-level state, so
 * one module graph can hold one server — and `adapters/ostinato` deploys three.
 * It therefore bundles each function on its own, as a real platform would, and
 * the instrumentation file separately again: four copies of this module in one
 * process — three functions and one instrumentation bundle, which is what
 * `grep -rl __ostinato_spans build/` finds — one of which records spans and
 * another of which reads them. The process is the only scope they share, so
 * the ring lives there.
 */
const shared = globalThis as typeof globalThis & {
	__ostinato_spans?: { ring: SpanRecord[]; capacity: number };
};
const spans = (shared.__ostinato_spans ??= { ring: [], capacity: 200 });
const ring = spans.ring;

export function setCapacity(size: number): void {
	spans.capacity = size;
	while (ring.length > spans.capacity) ring.shift();
}

/** `[seconds, nanoseconds]` → milliseconds. */
const ms = ([s, ns]: readonly [number, number]) => s * 1000 + ns / 1e6;

/**
 * Where a request went, without what it carried. A query string is where a
 * remote query's argument travels, and where a share link keeps its pattern;
 * the diagnostics page is public, so the ring keeps the path and drops the
 * rest.
 */
function pathOnly(value: string): string {
	try {
		const url = new URL(value);
		return url.origin + url.pathname;
	} catch {
		return value;
	}
}

export function record(span: ReadableSpan): void {
	const attributes: SpanRecord['attributes'] = {};
	for (const [key, value] of Object.entries(span.attributes)) {
		if (key === 'http.url' && typeof value === 'string') attributes[key] = pathOnly(value);
		else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			attributes[key] = value;
		}
	}

	ring.push({
		traceId: span.spanContext().traceId,
		spanId: span.spanContext().spanId,
		parentId: span.parentSpanContext?.spanId ?? null,
		name: span.name,
		start: Math.round(ms(span.startTime)),
		duration: Math.round(ms(span.duration) * 10) / 10,
		// 0 is UNSET, 1 is OK, 2 is ERROR — an unset status is a span nobody complained about.
		ok: span.status.code !== 2,
		attributes
	});

	while (ring.length > spans.capacity) ring.shift();
}

/** Newest first. A copy, so a reader cannot reach into the ring. */
export function recentSpans(limit = spans.capacity): SpanRecord[] {
	return ring.slice(-limit).reverse();
}

/** The spans of one request, oldest first, for drawing as a waterfall. */
export function trace(traceId: string): SpanRecord[] {
	return ring.filter((span) => span.traceId === traceId);
}

/**
 * The exporter OpenTelemetry calls. `export` is handed a batch of finished
 * spans and a callback to say how it went; there is no way for a push into an
 * array to go wrong, so it always says success.
 */
export class RingExporter implements SpanExporter {
	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		for (const span of spans) record(span);
		resultCallback({ code: ExportResultCode.SUCCESS });
	}

	shutdown(): Promise<void> {
		return Promise.resolve();
	}
}
