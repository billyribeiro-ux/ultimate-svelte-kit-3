/**
 * INSTRUMENTATION
 * ===============
 *
 * SvelteKit 3 runs this file before any application code, with nothing to
 * switch on: in development through the Vite server, in production because
 * adapter-node wires it in front of the entry point. The ordering is the
 * reason the file exists — an OpenTelemetry provider has to be registered
 * as the *global* one before anything asks for a tracer, or those early
 * spans go to a no-op provider and vanish.
 *
 * What is registered is small: one tracer provider, one processor that
 * hands each finished span straight to the exporter, and the exporter in
 * `lib/server/tracing.ts` that keeps them in memory. `register()` also
 * installs the async-context manager, which is what lets
 * `event.tracing.current` find the right span from inside an `await`.
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { RingExporter } from '#lib/server/tracing.ts';

const provider = new NodeTracerProvider({
	spanProcessors: [new SimpleSpanProcessor(new RingExporter())]
});

provider.register();
