import { expect, test } from '@playwright/test';

/**
 * THE INGEST ENDPOINT
 * ===================
 *
 * Tested with `request` rather than a browser, because it is an API for
 * machines: no cookie, no CSRF, a bearer key and a JSON body. Driving it through
 * a page would test the browser's `fetch` rather than the endpoint.
 *
 * `test.use({ storageState: undefined })` matters here: a request context that
 * carried the session cookie would authenticate as a person, and the whole point
 * of these tests is that the key path is separate.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('a batch with no key is refused', async ({ request }) => {
	const response = await request.post('/api/v1/ingest', {
		data: { signal: 'logs', events: [] }
	});

	expect(response.status()).toBe(401);
	// `WWW-Authenticate` so a collector's HTTP library can say what kind of
	// credential was expected, rather than the operator guessing.
	expect(response.headers()['www-authenticate']).toBeTruthy();
});

test('a batch with a nonsense key is refused the same way', async ({ request }) => {
	const response = await request.post('/api/v1/ingest', {
		headers: { authorization: 'Bearer sxt_not-a-real-key-at-all' },
		data: { signal: 'logs', events: [] }
	});

	expect(response.status()).toBe(401);
});

test('a malformed body is a 400 with the field that is wrong', async ({ request }) => {
	const response = await request.post('/api/v1/ingest', {
		headers: { authorization: 'Bearer sxt_not-a-real-key-at-all' },
		data: { signal: 'nonsense' }
	});

	// 401 before 400: authentication is checked first, so an unauthenticated
	// caller cannot use the validation messages to map the API's shape.
	expect(response.status()).toBe(401);
});

test('a cross-origin JSON POST reaches the handler', async ({ request }) => {
	/*
	 * This pair of tests is the whole CSRF story, and it exists because the route
	 * used to carry `export const config = { csrf: { checkOrigin: false } }` with
	 * a comment claiming credit for this behaviour. That key does nothing —
	 * SvelteKit runs the check before it resolves a route, from app-level
	 * configuration — and the test passed anyway, which is exactly why nobody
	 * noticed. Removing the config changes neither of these results.
	 *
	 * What actually decides it is the content type. JSON is not something a
	 * cross-site HTML form can produce, so the check never applies to a collector.
	 */
	const response = await request.post('/api/v1/ingest', {
		headers: { origin: 'https://somewhere-else.example', 'content-type': 'application/json' },
		data: { signal: 'logs', events: [] }
	});

	// 401, not 403: it got past the origin check and failed on the credential.
	expect(response.status()).toBe(401);
});

test('a cross-origin form-encoded POST is still refused as cross-site', async ({ request }) => {
	/*
	 * The other half. `application/x-www-form-urlencoded` *is* something a
	 * cross-site form can send, so this is refused before any handler runs — with
	 * no route config anywhere able to change it.
	 */
	const response = await request.fetch('/api/v1/ingest', {
		method: 'POST',
		headers: {
			origin: 'https://somewhere-else.example',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: 'signal=logs'
	});

	expect(response.status()).toBe(403);
});
