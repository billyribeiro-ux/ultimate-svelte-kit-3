import { expect, test } from '@playwright/test';

/**
 * THE READ API
 * ============
 *
 * Driven with `request` rather than a browser, because the caller is a machine:
 * a header, a JSON body, and no cookie. `storageState` is cleared so the request
 * context cannot accidentally authenticate as the signed-in person — which would
 * test the session path and prove nothing about the key path.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A key with the `read` scope.
 *
 * Minted through the settings form in a real browser, because that is the only
 * place a key exists in clear — the database stores a hash, by design. Doing it
 * once in `beforeAll` costs one page load and keeps the tests below honest: they
 * use a key a person could actually have created.
 */
let key = '';

test.beforeAll(async ({ browser }) => {
	const context = await browser.newContext({ storageState: 'e2e/.auth/state.json' });
	const page = await context.newPage();

	await page.goto('/demo/settings');
	await page.getByLabel('Name').fill(`read key ${Date.now()}`);
	await page.getByLabel('Scope').selectOption('read');
	await page.getByRole('button', { name: 'Create key' }).click();

	// Shown exactly once, in the alert that appears after creation.
	const revealed = page.getByRole('alert').getByText(/^sxt_/);
	await expect(revealed).toBeVisible();
	key = (await revealed.textContent())?.trim() ?? '';

	await context.close();
});

test('a QUERY with no key is refused, with a WWW-Authenticate header', async ({ request }) => {
	const response = await request.fetch('/api/v1/query', {
		method: 'QUERY',
		data: { q: 'from logs | take 1' }
	});

	expect(response.status()).toBe(401);
	expect(response.headers()['www-authenticate']).toBeTruthy();
});

test('QUERY runs a query and reports how it was answered', async ({ request }) => {
	const response = await request.fetch('/api/v1/query', {
		method: 'QUERY',
		headers: { authorization: `Bearer ${key}` },
		data: { q: 'from logs | where level == "error" | take 5', range: '-6h' }
	});

	expect(response.status()).toBe(200);
	const body = await response.json();

	expect(body.method).toBe('QUERY');
	expect(body.rows.length).toBeGreaterThan(0);
	expect(body.rows.length).toBeLessThanOrEqual(5);

	// The projection from chapter 24: documented columns only, no `id`, no
	// `tenant_id`, no Drizzle key names.
	expect(body.columns).toContain('trace_id');
	expect(body.columns).not.toContain('traceId');
	expect(body.columns).not.toContain('tenant_id');

	// Whether the filter reached SQL, so a caller can tell a fast query from a
	// slow one without timing it.
	expect(body.pushed).toContain('filter');
});

test('POST is accepted as an alias, and says so', async ({ request }) => {
	/*
	 * The compatibility path. `QUERY` is the method that means what this endpoint
	 * does; `POST` exists because a proxy or an HTTP client that has never heard
	 * of `QUERY` will refuse it outright, and an API nobody can call is not an
	 * API. The response names the method so a client can tell which it got.
	 */
	const response = await request.post('/api/v1/query', {
		headers: { authorization: `Bearer ${key}` },
		data: { q: 'from logs | summarize n = count()', range: '-6h' }
	});

	expect(response.status()).toBe(200);
	const body = await response.json();
	expect(body.method).toBe('POST');
	expect(typeof body.rows[0].n).toBe('number');
});

test('a broken query comes back with the checker’s own message and span', async ({ request }) => {
	/*
	 * The same checker the editor uses, not a laxer path for machines.
	 *
	 * A query the interface refuses must be refused here too — otherwise the API
	 * becomes the place people go to run the thing the product said was wrong.
	 */
	const response = await request.fetch('/api/v1/query', {
		method: 'QUERY',
		headers: { authorization: `Bearer ${key}` },
		data: { q: 'from spans | where duration > 500' }
	});

	expect(response.status()).toBe(400);
	const body = await response.json();

	expect(body.message).toMatch(/duration/i);
	expect(body.hint).toMatch(/ms|unit/i);
	// The span, so a client can underline exactly what the editor would.
	expect(body.span.end).toBeGreaterThan(body.span.start);
});

test('an ingest key may not read', async ({ request, browser }) => {
	const context = await browser.newContext({ storageState: 'e2e/.auth/state.json' });
	const page = await context.newPage();

	await page.goto('/demo/settings');
	await page.getByLabel('Name').fill(`ingest key ${Date.now()}`);
	await page.getByLabel('Scope').selectOption('ingest');
	await page.getByRole('button', { name: 'Create key' }).click();

	const revealed = page.getByRole('alert').getByText(/^sxt_/);
	await expect(revealed).toBeVisible();
	const ingestKey = (await revealed.textContent())?.trim() ?? '';
	await context.close();

	const response = await request.fetch('/api/v1/query', {
		method: 'QUERY',
		headers: { authorization: `Bearer ${ingestKey}` },
		data: { q: 'from logs | take 1' }
	});

	// 403, not 401: the credential is real and the scope is not. Answering 401
	// would tell a collector to go and fetch a better token, which it cannot.
	expect(response.status()).toBe(403);
});

test('truncation is in the payload, because a machine cannot read a banner', async ({
	request
}) => {
	const response = await request.fetch('/api/v1/query', {
		method: 'QUERY',
		headers: { authorization: `Bearer ${key}` },
		data: { q: 'from logs', range: '-6h', maxRows: 5 }
	});

	const body = await response.json();
	expect(body.rows).toHaveLength(5);
	expect(body.truncated).toBe(true);
});

test('QUERY is not a mutating form method, so the cross-site check never applies', async ({
	request
}) => {
	/*
	 * SvelteKit's CSRF check covers POST, PUT, PATCH and DELETE. `QUERY` is not in
	 * that set, so a cross-origin `QUERY` reaches the handler and fails on the
	 * credential — which is the correct place for it to fail.
	 *
	 * Nothing on the route opts out of anything: the `csrf` key in a route's
	 * `config` export is not read by SvelteKit, and this endpoint no longer
	 * pretends otherwise.
	 */
	const response = await request.fetch('/api/v1/query', {
		method: 'QUERY',
		headers: { origin: 'https://somewhere-else.example' },
		data: { q: 'from logs | take 1' }
	});

	expect(response.status()).toBe(401);
});
