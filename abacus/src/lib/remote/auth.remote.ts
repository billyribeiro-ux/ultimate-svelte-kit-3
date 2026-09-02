/**
 * WHO YOU ARE
 * ===========
 *
 * The passkey ceremonies as remote functions — commands, because each half
 * is a call the browser makes from JavaScript with a WebAuthn result in
 * hand; there is no way to register a passkey with JavaScript off. Signing
 * out and changing the profile are forms, because they can be.
 */

import * as v from 'valibot';
import { command, form, query } from '$app/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.ts';
import { NameSchema } from '#lib/server/identity.ts';
import * as passkeys from '#lib/server/passkeys.ts';
import { currentUser, endSession, requireUser, startSession } from '#lib/server/session.ts';

export const whoAmI = query(() => currentUser());

/** The person's locale, for the sheet's number and date formats. */
export const getProfile = query(async () => {
	const user = currentUser();
	if (!user) return null;
	const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
	return row ? { id: row.id, name: row.name, locale: row.locale } : null;
});

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export const beginRegistration = command(v.object({ name: NameSchema }), ({ name }) =>
	passkeys.beginRegistration(name, currentUser())
);

/**
 * What the browser hands back from `navigator.credentials.create()`, as JSON.
 * The schema names every field the WebAuthn library reads; anything else a
 * client sends is dropped, and a client that sends the wrong shape is refused
 * before any cryptography runs. The library then checks the contents.
 */
const Base64UrlSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]*$/, 'Expected base64url'));
const AttachmentSchema = v.optional(v.picklist(['platform', 'cross-platform']));
const ExtensionOutputsSchema = v.object({
	appid: v.optional(v.boolean()),
	credProps: v.optional(v.object({ rk: v.optional(v.boolean()) })),
	hmacCreateSecret: v.optional(v.boolean())
});

const RegistrationResponseSchema = v.object({
	id: Base64UrlSchema,
	rawId: Base64UrlSchema,
	type: v.literal('public-key'),
	authenticatorAttachment: AttachmentSchema,
	clientExtensionResults: ExtensionOutputsSchema,
	response: v.object({
		clientDataJSON: Base64UrlSchema,
		attestationObject: Base64UrlSchema,
		authenticatorData: v.optional(Base64UrlSchema),
		transports: v.optional(v.array(v.string())),
		publicKeyAlgorithm: v.optional(v.number()),
		publicKey: v.optional(Base64UrlSchema)
	})
});

export const finishRegistration = command(
	v.object({
		challengeId: v.string(),
		response: RegistrationResponseSchema,
		label: v.pipe(v.string(), v.maxLength(40))
	}),
	async ({ challengeId, response, label }) => {
		const user = await passkeys.finishRegistration(challengeId, response, label);
		await startSession(user);
		void whoAmI().refresh();
		void getProfile().refresh();
		void listPasskeys().refresh();
		return user;
	}
);

/* ------------------------------------------------------------------ */
/* Signing in                                                          */
/* ------------------------------------------------------------------ */

export const beginAuthentication = command(() => passkeys.beginAuthentication());

/** The answer to `navigator.credentials.get()`: a signature over the challenge. */
const AuthenticationResponseSchema = v.object({
	id: Base64UrlSchema,
	rawId: Base64UrlSchema,
	type: v.literal('public-key'),
	authenticatorAttachment: AttachmentSchema,
	clientExtensionResults: ExtensionOutputsSchema,
	response: v.object({
		clientDataJSON: Base64UrlSchema,
		authenticatorData: Base64UrlSchema,
		signature: Base64UrlSchema,
		userHandle: v.optional(Base64UrlSchema)
	})
});

export const finishAuthentication = command(
	v.object({ challengeId: v.string(), response: AuthenticationResponseSchema }),
	async ({ challengeId, response }) => {
		const user = await passkeys.finishAuthentication(challengeId, response);
		await startSession(user);
		void whoAmI().refresh();
		void getProfile().refresh();
		return user;
	}
);

export const signOut = form(async () => {
	endSession();
	void whoAmI().refresh();
	void getProfile().refresh();
});

/* ------------------------------------------------------------------ */
/* Profile and passkeys                                                */
/* ------------------------------------------------------------------ */

export const updateProfile = form(
	v.object({
		name: NameSchema,
		locale: v.pipe(
			v.string(),
			v.regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?(-[A-Z]{2})?$/, 'A locale like en-US or de-DE')
		)
	}),
	async ({ name, locale }) => {
		const user = requireUser();
		await db.update(schema.users).set({ name, locale }).where(eq(schema.users.id, user.id));
		// The name is in the cookie, so the cookie is reissued.
		await startSession({ id: user.id, name });
		void whoAmI().refresh();
		void getProfile().refresh();
	}
);

export const listPasskeys = query(() => {
	const user = currentUser();
	return user ? passkeys.listPasskeys(user.id) : [];
});

export const removePasskey = form(v.object({ id: v.string() }), async ({ id }) => {
	await passkeys.removePasskey(requireUser().id, id);
	void listPasskeys().refresh();
});
