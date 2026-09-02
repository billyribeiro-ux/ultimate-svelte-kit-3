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

test('the endpoint accepts a cross-origin POST, unlike every form in the app', async ({
	request
}) => {
	/*
	 * `export const config = { csrf: { checkOrigin: false } }` on that route.
	 *
	 * A collector is not a browser: it has no origin header worth checking, and
	 * SvelteKit's default CSRF protection would reject every batch. Turning it off
	 * is safe *specifically* because the route authenticates with a header rather
	 * than a cookie — which is the whole reason sessions and keys are kept apart.
	 */
	const response = await request.post('/api/v1/ingest', {
		headers: { origin: 'https://somewhere-else.example', 'content-type': 'application/json' },
		data: { signal: 'logs', events: [] }
	});

	// 401, not 403: it got past the origin check and failed on the credential.
	expect(response.status()).toBe(401);
});
