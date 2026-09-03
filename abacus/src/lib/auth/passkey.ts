/**
 * THE BROWSER'S HALF OF A PASSKEY
 * ===============================
 *
 * Two functions the sign-in page calls. Each is the same shape: ask the
 * server for options, hand them to the browser's credential API through
 * `@simplewebauthn/browser` (which does the base64url work and the feature
 * detection), and send the browser's answer back to be verified. The
 * private key never appears anywhere in this file, because it never leaves
 * the authenticator.
 */

import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration
} from '@simplewebauthn/browser';
import {
	beginAuthentication,
	beginRegistration,
	finishAuthentication,
	finishRegistration
} from '#lib/remote/auth.remote.ts';
import type { User } from '#lib/server/identity.ts';

export const passkeysSupported = (): boolean =>
	typeof window !== 'undefined' && browserSupportsWebAuthn();

/** What the person's device calls itself, for the passkey's label. */
function deviceLabel(): string {
	const ua = navigator.userAgent;
	if (/iPhone|iPad/.test(ua)) return 'iPhone or iPad';
	if (/Android/.test(ua)) return 'Android device';
	if (/Macintosh/.test(ua)) return 'Mac';
	if (/Windows/.test(ua)) return 'Windows PC';
	if (/Linux/.test(ua)) return 'Linux machine';
	return 'This device';
}

/** Create a passkey — for a new account with `name`, or as an extra key for the current one. */
export async function registerPasskey(name: string): Promise<User> {
	const { options, challengeId } = await beginRegistration({ name });
	const response = await startRegistration({ optionsJSON: options });
	return finishRegistration({ challengeId, response, label: deviceLabel() });
}

/** Sign in with any passkey registered here; the browser shows the picker. */
export async function signInWithPasskey(): Promise<User> {
	const { options, challengeId } = await beginAuthentication();
	const response = await startAuthentication({ optionsJSON: options });
	return finishAuthentication({ challengeId, response });
}

/** A message a person can act on, from the errors the credential API throws. */
export function explain(error: unknown): string {
	if (error instanceof Error) {
		if (error.name === 'NotAllowedError') return 'The passkey prompt was cancelled or timed out.';
		if (error.name === 'InvalidStateError')
			return 'This device already has a passkey for that account.';
		if (error.name === 'NotSupportedError') return 'This browser cannot create passkeys.';
		return error.message;
	}
	return 'Something went wrong with the passkey.';
}
