/**
 * THE EBOOK SIGNUP — a SvelteKit 3 remote function
 * ================================================
 *
 * This file runs ONLY on the server, but you import it directly into a component as
 * if it were a local function. SvelteKit replaces the import with a fetch call at
 * build time. That gives you one typed function signature spanning client and
 * server, with no manually-written endpoint, no `fetch('/api/...')`, and no
 * hand-maintained request/response types.
 *
 * The `.remote.ts` suffix is what marks the file. It's not a convention you could
 * rename — SvelteKit looks for that segment specifically.
 *
 * WHY A `form()` AND NOT A `command()`?
 * A `command()` fires from an event handler and needs JavaScript. A `form()` is
 * spread onto a real `<form>` element, so it submits as an ordinary HTTP POST when
 * JavaScript hasn't loaded, has failed, or has been disabled. It then progressively
 * enhances itself once hydrated. For the single most important conversion point on
 * the site, working without JavaScript is not a nice-to-have.
 */

import * as v from 'valibot';
import { form, getRequestEvent } from '$app/server';
import { redirect, invalid } from '@sveltejs/kit';

import { leadStore, normaliseEmail, type Lead } from '#lib/server/leads.ts';
import { createDownloadToken } from '#lib/server/tokens.ts';
import { rateLimit } from '#lib/server/rate-limit.ts';

/**
 * The validation schema.
 *
 * Valibot implements the Standard Schema spec, which is the interface SvelteKit
 * accepts here — so Zod, Arktype or anything else compliant would drop in
 * unchanged. We use Valibot because it tree-shakes: you ship only the validators you
 * actually import, which for a marketing form is a few hundred bytes rather than
 * Zod's ~13kB.
 *
 * This schema runs on the SERVER. That is the important half: client-side validation
 * is a convenience for honest users, and anyone can bypass it with `curl`. Never
 * treat it as a security boundary.
 */
const guideSchema = v.object({
	email: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty('Enter your email address'),
		v.email('That does not look like a valid email address'),
		// Guards against a database column overflow and against absurd input.
		// RFC 5321 caps a full address at 254 characters.
		v.maxLength(254, 'That email address is too long')
	),

	experience: v.picklist(
		['new', 'some', 'experienced', 'professional'],
		'Choose which best describes you'
	),

	/*
	 * The consent checkbox.
	 *
	 * READ THIS BEFORE CHANGING IT — it encodes a genuine HTML quirk.
	 *
	 * An unchecked checkbox sends NOTHING. Not `false`, not an empty string — the
	 * field is simply absent from the submitted form data. So a schema of
	 * `v.boolean()` can never be satisfied by an unchecked box: the value isn't
	 * `false`, it's missing.
	 *
	 * SvelteKit enforces this at the type level. If you write a non-optional boolean
	 * here, the `form()` overload resolves to a string literal explaining the problem
	 * and your handler stops type-checking. That's a deliberately designed compile
	 * error, and it's a much better teacher than a runtime bug where consent silently
	 * never validates.
	 *
	 * So: optional with a default of `false`, then a `check` that demands `true`.
	 * Under GDPR consent must be a clear affirmative action — the box has to start
	 * genuinely unchecked, which is exactly what this models.
	 */
	consent: v.pipe(
		v.optional(v.boolean(), false),
		v.check(
			(value) => value === true,
			'Please confirm you would like to receive the guide by email'
		)
	),

	/*
	 * HONEYPOT.
	 *
	 * A field a human never sees (hidden in CSS) and therefore never fills in. Bots
	 * that blindly complete every input in a form will fill it, and that's our tell.
	 *
	 * The leading underscore is a SvelteKit convention: fields whose names start with
	 * `_` are not repopulated into the form when validation fails. It exists for
	 * passwords, and it suits a honeypot too.
	 *
	 * Why this rather than a CAPTCHA? It costs nothing, adds no third-party script,
	 * requires no interaction, and is invisible to screen-reader users when done
	 * correctly. It won't stop a targeted attacker — but it stops the drive-by
	 * spambots that make up almost all of the volume.
	 */
	_company: v.optional(v.string(), '')
});

export const requestGuide = form(guideSchema, async (data, issue) => {
	/*
	 * `getRequestEvent()` gives us the current request from inside a remote function,
	 * without threading it through as an argument. It's how you reach cookies,
	 * headers and the client address here.
	 */
	const event = getRequestEvent();

	/* ---- 1. Rate limit -------------------------------------------------- */
	const limit = rateLimit(`guide:${event.getClientAddress()}`, {
		limit: 5,
		windowMs: 60_000
	});

	if (!limit.allowed) {
		// Attached to the email field so it renders next to the input the user is
		// looking at, rather than in a form-level error block they might miss.
		invalid(
			issue.email(
				`Too many attempts. Please wait ${limit.retryAfterSeconds} seconds and try again.`
			)
		);
	}

	/* ---- 2. Honeypot ---------------------------------------------------- */
	/*
	 * Note what we DON'T do: tell them. Returning "bot detected" hands the author of
	 * the bot a free test harness for evading the check. We behave exactly as if the
	 * signup succeeded, and simply don't store anything.
	 */
	const isBot = data._company.trim().length > 0;

	const email = normaliseEmail(data.email);

	/* ---- 3. Persist ----------------------------------------------------- */
	if (!isBot) {
		const alreadyKnown = await leadStore.has(email);

		if (!alreadyKnown) {
			const lead: Lead = {
				email,
				experience: data.experience,
				consentedToMarketing: data.consent,
				capturedAt: new Date().toISOString(),
				source: 'guide-landing'
			};

			await leadStore.save(lead);
		}

		// A real deployment sends the welcome email here — and does it via a queue,
		// not inline, so a slow mail provider can't hold the user's request open.
	}

	/* ---- 4. Issue a signed download link -------------------------------- */
	const token = createDownloadToken(email);

	/*
	 * `redirect()` throws. Nothing after this line runs — which is exactly what you
	 * want, and also why you must never wrap a redirect in a try/catch that swallows
	 * everything. That is a genuinely common bug: the catch eats the redirect and the
	 * user sits on the form wondering what happened.
	 *
	 * 303 (See Other) rather than 302, because 303 tells the browser to follow up
	 * with a GET. That's the Post/Redirect/Get pattern, and it's what stops a browser
	 * refresh from resubmitting the form.
	 */
	redirect(303, `/guide/thank-you?t=${encodeURIComponent(token)}`);
});
