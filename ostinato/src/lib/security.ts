/**
 * THE HEADERS EVERY RESPONSE CARRIES
 * ==================================
 *
 * Two things send responses. `handleSecurity` in `hooks.server.ts` decorates
 * everything SvelteKit renders. The adapter serves the rest itself, without
 * running SvelteKit or its hooks at all: the built assets, and the one
 * prerendered page — the landing page, which is the page most people see
 * first. Both read this module, so the two cannot drift apart.
 */
export const SECURITY_HEADERS = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	// An instrument that makes sound has no business hearing any.
	'permissions-policy': 'microphone=(), camera=(), geolocation=()'
} as const;

/**
 * What a file needs on top. A prerendered page carries its content security
 * policy in a `<meta http-equiv>` tag, because a file has no response of its
 * own to put a header on, and browsers ignore `frame-ancestors` in a meta tag.
 * So the directive that stops another site framing the landing page has to
 * travel as a header the adapter sends — and for that, the older
 * `X-Frame-Options: DENY` says the same thing and needs no second policy.
 */
export const FILE_HEADERS = { ...SECURITY_HEADERS, 'x-frame-options': 'DENY' } as const;
