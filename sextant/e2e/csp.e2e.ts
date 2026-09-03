import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { auditPolicy, hashesIn, nonceIn, parsePolicy } from '../src/lib/security/csp.ts';

/**
 * THE POLICY THAT ACTUALLY REACHED THE BROWSER
 * ============================================
 *
 * `csp.spec.ts` tests the audit against strings. This runs the same audit
 * against the header a real server put on a real response, which is the only
 * version that matters — a policy can be perfect in `vite.config.ts` and absent
 * on the wire because a proxy stripped it, a route answered before the hook, or
 * the build was configured for a different mode.
 *
 * It also does the thing a header check cannot: loads the application under that
 * policy and watches for violations. A CSP that is present and breaks the page
 * is worse than none, because the first person to hit it will remove it.
 */

test('every response carries a policy that survives its own audit', async ({ page }) => {
	const response = await page.goto('/demo/explore');
	const header = response?.headers()['content-security-policy'];

	expect(header, 'no Content-Security-Policy header on the page').toBeTruthy();

	const policy = parsePolicy(header!);
	const problems = auditPolicy(policy);

	// The message is the failure output: a list of what is wrong, in the words
	// somebody would need to fix it.
	expect(problems, problems.join('\n')).toEqual([]);
});

test('a signed-in page gets a nonce, because it streams', async ({ page }) => {
	const response = await page.goto('/demo/explore');
	const policy = parsePolicy(response!.headers()['content-security-policy']!);

	/*
	 * `mode: 'auto'` and the consequence of it, asserted rather than the setting.
	 *
	 * This page renders a shell and appends `resolve(…)` scripts as each awaited
	 * value arrives — after the header has been sent. A hash cannot cover a script
	 * that does not exist yet, so a dynamically rendered page must get a nonce.
	 * Switching back to `mode: 'hash'` fails here, and it fails for the reason
	 * written in `vite.config.ts` rather than mysteriously three screens later.
	 */
	const nonce = nonceIn(policy);
	expect(nonce, 'a streamed page needs a nonce, not a hash').toBeTruthy();
	expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);

	expect(policy.get('script-src')).not.toContain("'unsafe-inline'");
});

test('every inline script the server emits is one the policy allows', async ({ request }) => {
	/*
	 * The check a browser cannot do cleanly.
	 *
	 * Playwright injects its own inline scripts for tracing and screenshots, and a
	 * policy strict enough to be worth having blocks those too — so watching the
	 * console for `script-src` violations reports the harness, every time, and
	 * says nothing about the application.
	 *
	 * Fetching the HTML and checking what is in it has no harness in the way.
	 * Every inline `<script>` must be covered, or the page is broken for real
	 * people the moment it ships. Covered means one of two things, and both are
	 * checked because `mode: 'auto'` can emit either: the script carries the
	 * response's nonce, or its sha256 is listed in `script-src`.
	 *
	 * This is the test that found the bug. Under `mode: 'hash'` the shell's
	 * bootstrap matched and every streamed `resolve(…)` script did not — which is
	 * every result on the page, arriving nowhere, with no error a user could see.
	 */
	const response = await request.get('/demo/explore');
	const html = await response.text();
	const policy = parsePolicy(response.headers()['content-security-policy']!);
	const allowed = new Set<string>(hashesIn(policy));
	const nonce = nonceIn(policy);

	// `(?![^>]*\bsrc=)` keeps this to the *inline* scripts — the ones with a body
	// to cover — rather than the module preloads, which `script-src 'self'` covers.
	const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].map(
		(match) => ({ attributes: match[1]!, body: match[2]! })
	);

	expect(
		inline.length,
		'no inline script on the page at all — has the bootstrap moved?'
	).toBeGreaterThan(1);

	for (const { attributes, body } of inline) {
		const digest = `sha256-${createHash('sha256').update(body).digest('base64')}`;
		const carriesNonce = nonce !== null && attributes.includes(nonce);

		expect(
			carriesNonce || allowed.has(digest),
			`an inline script is covered by neither the nonce nor a hash: ${body.slice(0, 60)}…`
		).toBe(true);
	}
});

test('nothing the page needs is blocked, scripts aside', async ({ page }) => {
	/*
	 * The other half: the resources a header check cannot see.
	 *
	 * `script-src` is excluded here and covered by the test above, for the harness
	 * reason explained there. What is left is what this policy is most likely to
	 * get subtly wrong, and did: the canvas charts read themselves back as data
	 * URLs, the tail opens an `EventSource`, and one JetBrains Mono subset is
	 * small enough that Vite inlines it as `data:font/woff2` — which
	 * `font-src 'self'` blocked until this test said so.
	 */
	const violations: string[] = [];

	page.on('console', (message) => {
		const text = message.text();
		if (!/Content Security Policy/i.test(text)) return;
		if (/script-src/.test(text)) return; // the harness's own injected scripts
		violations.push(text);
	});

	await page.goto('/demo/explore');
	await expect(page.getByRole('grid')).toBeVisible();
	await expect(page.getByRole('row').first()).toBeVisible();

	const series =
		'from logs | summarize n = count() by service, bucket = bin(timestamp, 5m) | sort bucket asc';
	await page.goto(`/demo/explore?q=${encodeURIComponent(series)}&range=-6h&view=chart`);
	await expect(page.getByRole('img', { name: /over time/i })).toBeVisible();

	await page.getByRole('button', { name: 'Live tail' }).click();
	await expect(page.getByRole('button', { name: /tail/i }).first()).toBeVisible();

	expect(violations, 'the policy blocked something the page needs').toEqual([]);
});
