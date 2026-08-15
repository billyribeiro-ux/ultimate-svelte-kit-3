import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import { BookingError, cancelBooking, loadBookingByToken } from '#lib/server/scheduling.ts';

/**
 * The customer's view of their own appointment.
 *
 * There is no account here and no session. The token in the URL is the whole
 * credential, which makes the security properties worth being explicit about:
 *
 *   - It is 130 bits of CSPRNG output, so it cannot be guessed.
 *   - It is looked up by a unique index, so the query is O(1) and there is no
 *     prefix matching to leak length information through timing.
 *   - It is never rendered anywhere except the confirmation email, and the page
 *     it opens carries `noindex` so a shared link cannot end up in a search
 *     result.
 *   - It grants exactly two abilities: see this appointment, and cancel it. It
 *     is not a login and cannot be traded for one.
 *
 * That is the same model as an unsubscribe link, and it is the right one: a
 * customer booking a haircut should not have to invent a password.
 */

const tokenSchema = v.pipe(
	v.string(),
	v.trim(),
	// Crockford Base32, 26 characters. Matching the exact shape means a malformed
	// token is rejected before it reaches the database.
	v.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'That link does not look right')
);

export interface ManagedBooking {
	reference: string;
	status: string;
	businessName: string;
	businessSlug: string;
	businessPhone: string | null;
	businessTimeZone: string;
	addressLine: string | null;
	city: string | null;
	postcode: string | null;
	staffName: string;
	serviceName: string;
	startsAt: number;
	endsAt: number;
	durationMinutes: number;
	priceCents: number;
	currency: string;
	customerName: string;
	customerNote: string | null;
	cancellationNoticeHours: number;
	/** Whether the cancel button should be offered at all. */
	canCancel: boolean;
}

export const getManagedBooking = query(tokenSchema, async (token): Promise<ManagedBooking> => {
	const found = await loadBookingByToken(token);
	if (!found) error(404, 'We could not find that booking.');

	const noticeMs = found.business.cancellationNoticeHours * 3_600_000;

	return {
		reference: found.reference,
		status: found.status,
		businessName: found.business.name,
		businessSlug: found.business.slug,
		businessPhone: found.business.phone,
		businessTimeZone: found.timeZone,
		addressLine: found.business.addressLine,
		city: found.business.city,
		postcode: found.business.postcode,
		staffName: found.staff.displayName,
		serviceName: found.serviceName,
		startsAt: found.startsAt.getTime(),
		endsAt: found.endsAt.getTime(),
		durationMinutes: found.durationMinutes,
		priceCents: found.priceCents,
		currency: found.currency,
		customerName: found.customer.name,
		customerNote: found.customerNote,
		cancellationNoticeHours: found.business.cancellationNoticeHours,
		canCancel: found.status === 'confirmed' && found.startsAt.getTime() - Date.now() >= noticeMs
	};
});

/**
 * Cancel, and send the updated booking back in the same round trip.
 *
 * This is a **single-flight mutation**, driven from the server.
 *
 * The naive version is: run the command, and once it resolves, re-fetch the
 * query to see what changed. That is two round trips — and on a phone with a
 * slow connection the second one is a visible pause during which the button has
 * stopped responding and the page still says the appointment is confirmed.
 *
 * Calling `getManagedBooking(token).refresh()` *inside the handler* tells
 * SvelteKit to re-run that query as part of this request and ship both results
 * back together. Queries are keyed by their arguments, so naming the same
 * `token` here is exactly what lets the framework find the matching query
 * instance in the browser and replace its value.
 *
 * The promise is deliberately not awaited — SvelteKit awaits it before
 * responding, and `void` marks that as intentional rather than forgotten.
 *
 * There is a client-driven variant, `command(...).updates(query)`, for when the
 * server cannot know which instances are on screen — a filtered list, say. It
 * additionally requires the handler to opt in with `requested(...)`, precisely
 * because an unbounded client-supplied refresh list would be a denial-of-service
 * vector. Here the server knows the exact instance, so it simply says so.
 */
export const cancelOwnBooking = command(
	v.object({
		token: tokenSchema,
		reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), '')
	}),
	async ({ token, reason }) => {
		const found = await loadBookingByToken(token);
		if (!found) error(404, 'We could not find that booking.');

		try {
			await cancelBooking({
				bookingId: found.id,
				by: 'customer',
				reason: reason || undefined
			});
		} catch (thrown) {
			if (thrown instanceof BookingError) {
				// 409 for "too late": the request was valid, the world moved on.
				error(thrown.code === 'too_late_to_cancel' ? 409 : 400, thrown.message);
			}
			throw thrown;
		}

		// The refreshed booking rides back with this response — no second request.
		void getManagedBooking(token).refresh();

		return { cancelled: true };
	}
);
