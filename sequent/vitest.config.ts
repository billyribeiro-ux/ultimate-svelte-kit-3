import { defineConfig } from 'vitest/config';

/**
 * One test runner for the whole workspace.
 *
 * `requireAssertions` turns a test body that never reaches an expectation into
 * a failure rather than a pass. In a matching engine that matters more than
 * usual: a test asserting inside a loop that turns out to run zero times is
 * green, and it is testing nothing at all.
 */
export default defineConfig({
	test: {
		include: ['packages/*/src/**/*.spec.ts', 'apps/*/src/**/*.spec.ts'],
		// Recovery tests replay whole sessions against real SQLite files.
		testTimeout: 30_000,
		expect: { requireAssertions: true }
	}
});
