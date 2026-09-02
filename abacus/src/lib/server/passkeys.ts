/**
 * PASSKEYS
 * ========
 *
 * Signing in without a password. A passkey is a key pair: the private half
 * lives in the person's phone, laptop or security key and never leaves it;
 * the public half lives here, in `credentials`. Registering makes the pair;
 * signing in proves the private half is still there by signing a challenge
 * this server just made up.
 *
 * Every ceremony is two remote calls — *begin*, which returns options for
 * the browser's `navigator.credentials` and stores a one-time challenge, and
 * *finish*, which verifies the browser's answer against that challenge. The
 * verification is `@simplewebauthn/server`; what this file adds is the
 * bookkeeping every relying party has to do and most get wrong: single-use
 * challenges that expire, the counter that detects a cloned key, and the
 * origin and relying-party id checked against `PUBLIC_ORIGIN` rather than
 * against whatever the request claims.
 */

import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { error } from '@sveltejs/kit';
import { and, eq, lt } from 'drizzle-orm';
import { PUBLIC_ORIGIN } from '$app/env/public';
import { db, schema } from './db/index.ts';
import { base64url, fromBase64url, newId, type User } from './identity.ts';

export const RP_NAME = 'Abacus';
/** The relying-party id is the hostname, without port or scheme: `localhost`, `abacus.example`. */
export const RP_ID = new URL(PUBLIC_ORIGIN).hostname;

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();

/* ------------------------------------------------------------------ */
/* Challenges                                                          */
/* ------------------------------------------------------------------ */

async function storeChallenge(row: {
	kind: 'register' | 'login';
	challenge: string;
	userId: string | null;
	name: string | null;
}): Promise<string> {
	const id = newId(24);
	// Sweep the expired ones while we are here; a table of dead challenges
	// helps nobody.
	await db.delete(schema.challenges).where(lt(schema.challenges.expiresAt, Date.now()));
	await db
		.insert(schema.challenges)
		.values({ id, ...row, expiresAt: Date.now() + CHALLENGE_TTL_MS });
	return id;
}

/** The challenge, consumed: it is deleted on the way out, so it cannot be used twice. */
async function takeChallenge(id: string, kind: 'register' | 'login') {
	const row = await db.query.challenges.findFirst({
		where: and(eq(schema.challenges.id, id), eq(schema.challenges.kind, kind))
	});
	if (row) await db.delete(schema.challenges).where(eq(schema.challenges.id, id));
	if (!row || row.expiresAt < Date.now())
		error(400, 'That sign-in attempt has expired — try again');
	return row;
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

/**
 * Options for `navigator.credentials.create()`. For a new person, `name` is
 * what they typed and a user id is minted now — it travels through the
 * challenge row and becomes a row in `users` only when the ceremony
 * finishes. For an existing person adding a second passkey, their current
 * credentials are excluded so the same key is not registered twice.
 */
export async function beginRegistration(
	name: string,
	existing: User | null
): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
	const userId = existing?.id ?? newId();
	const exclude = existing
		? await db.query.credentials.findMany({ where: eq(schema.credentials.userId, existing.id) })
		: [];

	const options = await generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: RP_ID,
		userName: existing?.name ?? name,
		userDisplayName: existing?.name ?? name,
		userID: encoder.encode(userId),
		attestationType: 'none',
		excludeCredentials: exclude.map((c) => ({
			id: c.id,
			transports: JSON.parse(c.transports) as string[]
		})),
		authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
	});

	const challengeId = await storeChallenge({
		kind: 'register',
		challenge: options.challenge,
		userId,
		name: existing ? null : name
	});
	return { options, challengeId };
}

export async function finishRegistration(
	challengeId: string,
	response: RegistrationResponseJSON,
	label: string
): Promise<User> {
	const pending = await takeChallenge(challengeId, 'register');

	let verification;
	try {
		verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: pending.challenge,
			expectedOrigin: PUBLIC_ORIGIN,
			expectedRPID: RP_ID,
			// `preferred`, not `required`: a hardware key with no PIN is still a passkey.
			requireUserVerification: false
		});
	} catch (e) {
		error(400, `That passkey could not be verified: ${(e as Error).message}`);
	}
	if (!verification.verified) error(400, 'That passkey could not be verified');

	const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

	let user = await db.query.users.findFirst({ where: eq(schema.users.id, pending.userId!) });
	if (!user) {
		const [created] = await db
			.insert(schema.users)
			.values({ id: pending.userId!, name: pending.name ?? 'Someone' })
			.returning();
		user = created!;
	}

	await db.insert(schema.credentials).values({
		id: credential.id,
		userId: user.id,
		publicKey: base64url(credential.publicKey),
		counter: credential.counter,
		transports: JSON.stringify(credential.transports ?? []),
		deviceType: credentialDeviceType,
		backedUp: credentialBackedUp,
		label: label.trim().slice(0, 40) || 'Passkey'
	});

	return { id: user.id, name: user.name };
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

/**
 * Options for `navigator.credentials.get()`. No `allowCredentials`: the
 * passkey is *discoverable*, so the browser shows the person their accounts
 * for this site and nobody has to type a name first.
 */
export async function beginAuthentication(): Promise<{
	options: PublicKeyCredentialRequestOptionsJSON;
	challengeId: string;
}> {
	const options = await generateAuthenticationOptions({
		rpID: RP_ID,
		userVerification: 'preferred'
	});
	const challengeId = await storeChallenge({
		kind: 'login',
		challenge: options.challenge,
		userId: null,
		name: null
	});
	return { options, challengeId };
}

export async function finishAuthentication(
	challengeId: string,
	response: AuthenticationResponseJSON
): Promise<User> {
	const pending = await takeChallenge(challengeId, 'login');

	const stored = await db.query.credentials.findFirst({
		where: eq(schema.credentials.id, response.id),
		with: { user: true }
	});
	if (!stored) error(400, 'That passkey is not registered here');

	let verification;
	try {
		verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: pending.challenge,
			expectedOrigin: PUBLIC_ORIGIN,
			expectedRPID: RP_ID,
			requireUserVerification: false,
			credential: {
				id: stored.id,
				publicKey: fromBase64url(stored.publicKey),
				counter: stored.counter,
				transports: JSON.parse(stored.transports) as string[]
			}
		});
	} catch (e) {
		error(400, `That passkey could not be verified: ${(e as Error).message}`);
	}
	if (!verification.verified) error(400, 'That passkey could not be verified');

	/*
	 * The counter goes up every time the authenticator signs. A response with
	 * a counter at or below the stored one came from a *copy* of the key —
	 * the library refuses it — and the new value is stored so the next copy
	 * is caught too.
	 */
	await db
		.update(schema.credentials)
		.set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: Date.now() })
		.where(eq(schema.credentials.id, stored.id));

	return { id: stored.user.id, name: stored.user.name };
}

/* ------------------------------------------------------------------ */
/* Management                                                          */
/* ------------------------------------------------------------------ */

export interface PasskeySummary {
	id: string;
	label: string;
	deviceType: string;
	backedUp: boolean;
	createdAt: number;
	lastUsedAt: number | null;
}

export async function listPasskeys(userId: string): Promise<PasskeySummary[]> {
	const rows = await db.query.credentials.findMany({
		where: eq(schema.credentials.userId, userId)
	});
	return rows.map((c) => ({
		id: c.id,
		label: c.label,
		deviceType: c.deviceType,
		backedUp: c.backedUp,
		createdAt: c.createdAt,
		lastUsedAt: c.lastUsedAt
	}));
}

/** Remove one passkey — never the last, because then nobody could sign in. */
export async function removePasskey(userId: string, id: string): Promise<void> {
	const mine = await listPasskeys(userId);
	if (!mine.some((c) => c.id === id)) error(404, 'No such passkey');
	if (mine.length === 1) error(409, 'That is your only passkey. Add another before removing it.');
	await db
		.delete(schema.credentials)
		.where(and(eq(schema.credentials.id, id), eq(schema.credentials.userId, userId)));
}
