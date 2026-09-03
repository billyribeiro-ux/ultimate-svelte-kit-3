import type { Page } from '@playwright/test';

/**
 * A PASSKEY DEVICE THAT EXISTS FOR ONE TEST
 * =========================================
 *
 * A browser under test has no fingerprint reader. Chromium's DevTools
 * protocol can attach a *virtual authenticator*: a software device that
 * creates key pairs, signs challenges and answers the "is the user
 * present?" question by itself. Everything else is real — the browser's
 * `navigator.credentials` API, the JSON the library sends, the signatures
 * the server verifies — so a green test here means a person with a real
 * device gets the same result.
 *
 * `hasResidentKey` makes the device store discoverable credentials, which
 * is what lets "Sign in with a passkey" work without typing a name first.
 * `automaticPresenceSimulation` answers the touch prompt at once.
 */
export async function attachAuthenticator(page: Page) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
	return {
		id: authenticatorId,
		/** The credentials the device holds — one per registration. */
		async credentials() {
			const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
			return credentials;
		},
		async detach() {
			await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
			await cdp.detach();
		}
	};
}

/** Register a new account through the sign-in page. Leaves the page on `next`. */
export async function register(page: Page, name: string, next = '/sheets') {
	await page.goto(`/signin?next=${encodeURIComponent(next)}`);
	await page.getByLabel('What should we call you?').fill(name);
	await page.getByRole('button', { name: 'Create a passkey' }).click();
	await page.waitForURL((url) => url.pathname === next);
}
