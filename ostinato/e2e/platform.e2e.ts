import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

/**
 * The parts of the app that are about *how it runs*: the adapter's split,
 * the tracing ring, the version check, and the content security policy.
 */

test('the adapter answers pages, api and the catch-all from different functions', async ({
	page,
	request
}) => {
	expect((await request.get('/studio')).headers()['x-ostinato-entry']).toBe('pages');
	expect((await request.get('/api/resolve?handle=x&slug=y')).headers()['x-ostinato-entry']).toBe(
		'api'
	);
	expect((await request.get('/no-such-page')).headers()['x-ostinato-entry']).toBe('router');
	expect((await request.get('/no-such-page')).status()).toBe(404);

	// Prerendered pages are files: no function answers at all.
	expect((await request.get('/')).headers()['x-ostinato-entry']).toBeUndefined();

	await page.goto('/diagnostics');
	// `getRuntime` is a remote function, so the `api` function answered it.
	await expect(page.getByText('adapter-ostinato · api')).toBeVisible();
	await expect(page.getByText('remote: true')).toBeVisible();
});

test('spans are recorded and a trace can be drawn', async ({ page }) => {
	await page.goto('/p/seedfour');
	await page.goto('/diagnostics');

	const rows = page.locator('.spans tbody tr');
	await expect(rows.first()).not.toContainText('No spans yet');
	await expect(page.locator('.spans')).toContainText('getRuntime');

	await rows.first().getByRole('button').click();
	await expect(page.locator('.waterfall__row').first()).toBeVisible();

	await page.getByRole('button', { name: 'Check now' }).click();
	await expect(page.getByText(/New version\?/).locator('..')).toContainText('no');
});

test('every inline script the server emits is covered by the policy', async ({ request }) => {
	for (const path of ['/studio', '/p/seedfour', '/']) {
		const response = await request.get(path);
		const html = await response.text();
		// A dynamic page sends the policy as a header; a prerendered one bakes it
		// into a `<meta http-equiv>` tag. Either way it is the policy in force.
		const policy =
			response.headers()['content-security-policy'] ??
			/<meta http-equiv="content-security-policy" content="([^"]*)"/
				.exec(html)?.[1]
				?.replaceAll('&#39;', "'") ??
			'';

		const allowed = new Set([...policy.matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1]));
		const nonce = /'nonce-([^']+)'/.exec(policy)?.[1] ?? null;

		const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
		expect(
			inline.length,
			`${path} has no inline script — has the bootstrap moved?`
		).toBeGreaterThan(0);

		for (const [, attributes, body] of inline) {
			const digest = `sha256-${createHash('sha256').update(body!).digest('base64')}`;
			const covered = (nonce !== null && attributes!.includes(nonce)) || allowed.has(digest);
			expect(covered, `${path}: uncovered inline script: ${body!.slice(0, 60)}…`).toBe(true);
		}
	}
});

test('nothing a page needs is blocked, scripts aside', async ({ page }) => {
	const violations: string[] = [];
	page.on('console', (message) => {
		const text = message.text();
		if (!/Content Security Policy/i.test(text)) return;
		if (/script-src/.test(text)) return; // the harness's own injected scripts
		violations.push(text);
	});

	await page.goto('/studio?preset=four-on-the-floor');
	await page.getByRole('button', { name: 'Play' }).click();
	await page.getByRole('button', { name: 'Stop' }).click();
	await page.goto('/p/seedfour');
	await expect(page.getByRole('img', { name: /Share card/ })).toBeVisible();

	expect(violations, 'the policy blocked something the page needs').toEqual([]);
});
