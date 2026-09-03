/**
 * WHERE THE SPANS GO
 * ==================
 *
 * With `tracing.server` on, SvelteKit emits an OpenTelemetry span for every
 * `handle`, `load`, form action and remote function, and OpenTelemetry hands
 * finished spans to an *exporter*. The usual one sends them to a collector
 * over the network. This one keeps the last few hundred in memory, which is
 * all a single-process app needs to answer "what did that request actually
 * do?" on its own diagnostics page — including, for this project, how long
 * a live query stayed open and which command woke it.
 *
 * It is deliberately not a collector. It forgets on restart, holds one
 * process's spans, and is bounded so that a busy hour cannot become a leak.
 */

import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

export interface SpanRecord {
	readonly traceId: string;
	readonly spanId: string;
	readonly parentId: string | null;
	readonly name: string;
	/** Unix milliseconds. */
	readonly start: number;
	/** Milliseconds, to a tenth. */
	readonly duration: number;
	readonly ok: boolean;
	readonly attributes: Record<string, string | number | boolean>;
}

const CAPACITY = 300;

/*
 * Module-level state on the server is shared by every request, which is
 * usually the bug. Here it is the point: the ring *is* the cross-request
 * memory, it holds nothing private to any one person, and only the
 * diagnostics page reads it.
 */
const ring: SpanRecord[] = [];

/** `[seconds, nanoseconds]` → milliseconds. */
const ms = ([s, ns]: readonly [number, number]) => s * 1000 + ns / 1e6;

export function record(span: ReadableSpan): void {
	const attributes: Record<string, string | number | boolean> = {};
	for (const [key, value] of Object.entries(span.attributes)) {
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
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

	while (ring.length > CAPACITY) ring.shift();
}

/** Newest first. A copy, so a reader cannot reach into the ring. */
export function recentSpans(limit = CAPACITY): SpanRecord[] {
	return ring.slice(-limit).reverse();
}

/** One request's spans, oldest first, for drawing as a waterfall. */
export function trace(traceId: string): SpanRecord[] {
	return ring.filter((span) => span.traceId === traceId);
}

/**
 * The exporter OpenTelemetry calls with each batch of finished spans and a
 * callback to say how it went. A push into an array cannot go wrong, so it
 * always says success.
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
