import { describe, expect, it } from 'vitest';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { recentSpans, RingExporter } from './tracing.ts';

describe('the span ring', () => {
	it('keeps where a request went and drops what it carried', () => {
		const provider = new BasicTracerProvider({
			spanProcessors: [new SimpleSpanProcessor(new RingExporter())]
		});
		const span = provider.getTracer('test').startSpan('sveltekit.handle.root', {
			attributes: {
				'http.route': '/(app)/studio',
				'http.url': 'http://localhost:4173/studio?p=AQAAsecret-pattern'
			}
		});
		span.end();

		const [recorded] = recentSpans(1);
		expect(recorded?.attributes['http.url']).toBe('http://localhost:4173/studio');
		expect(recorded?.attributes['http.route']).toBe('/(app)/studio');
	});
});
