import * as v from 'valibot';
import type { ParamMatcher } from '@sveltejs/kit/params';
import { LOCALES } from '#lib/i18n/index.ts';

/**
 * Matches the optional language segment at the front of every route.
 *
 * In SvelteKit 3 a matcher is a **Standard Schema**, not a `(param) => boolean`.
 * That is a bigger change than it looks: a schema can *transform*, so the
 * matcher is also the parser, and `params.lang` arrives in load functions typed
 * as `Locale` rather than `string`. There is no second validation step in a load
 * function to forget.
 *
 * The route is `[[lang=locale]]`, so `/fr/boards` gives `params.lang === 'fr'`
 * and `/boards` gives `undefined`. Without the matcher the optional parameter
 * would swallow the first segment of every URL — `/boards` would parse as the
 * language "boards" and then 404 at the second segment, which is a genuinely
 * baffling half-hour.
 *
 * A matcher also means the *router* enforces the language list, so no page has
 * to defend against an unsupported one. `hooks.ts` catches those first and
 * rewrites them away, which turns a 404 into the application in English.
 */
export const match = v.picklist(LOCALES) satisfies ParamMatcher;
