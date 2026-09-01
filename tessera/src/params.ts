import { defineParams } from '@sveltejs/kit/params';
import * as v from 'valibot';
import { LOCALES } from '#lib/i18n/index.ts';

/**
 * PARAMETER MATCHERS
 * ==================
 *
 * One file, not a folder.
 *
 * SvelteKit 2 had `src/params/locale.js`, each matcher its own module exporting
 * `match(param) { return … }`. SvelteKit 3 replaced that with a single
 * `src/params.ts` exporting `params` from `defineParams`, and the failure if you
 * bring the old layout forward is `No matcher found for parameter 'locale'` at
 * build time — from a directory that looks exactly right.
 *
 * The change is worth more than tidiness. A definition here is a **Standard
 * Schema**, so it can *transform*: `params.lang` reaches a load function typed
 * as `Locale` rather than `string`, and there is no second validation step for
 * anybody to forget. A plain predicate still works — `defineParams` accepts a
 * function too — but only a schema carries the type through.
 */
export const params = defineParams({
	/**
	 * The optional language segment at the front of every route.
	 *
	 * The route is `[[lang=locale]]`, so `/fr/boards` gives `params.lang === 'fr'`
	 * and `/boards` gives `undefined`. Without the matcher the optional parameter
	 * would swallow the first segment of every URL — `/boards` would parse as the
	 * language "boards" and then 404 at the second segment, which is a genuinely
	 * baffling half-hour.
	 *
	 * It also means the *router* enforces the language list, so no page has to
	 * defend against an unsupported one. `hooks.ts` catches those first and
	 * rewrites them away, turning a 404 into the application in English.
	 */
	locale: v.picklist(LOCALES)
});
