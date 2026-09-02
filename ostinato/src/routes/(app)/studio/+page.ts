import type { PageLoad } from './$types.js';
import { decodePattern } from '#lib/pattern/codec.ts';
import type { Pattern } from '#lib/pattern/model.ts';
import { preset, PRESETS } from '#lib/pattern/presets.ts';
import { getPattern } from '#lib/remote/patterns.remote.ts';

/**
 * WHERE THE STUDIO'S PATTERN COMES FROM
 * =====================================
 *
 *   ?remix=<id>   a published pattern, fetched with a remote query
 *   ?p=<code>     a shared link — the pattern is the address
 *   ?preset=name  one of the built-in grooves
 *   nothing       whatever this browser was working on last, restored in the
 *                 page once it has mounted (`localStorage` is not available
 *                 here, and a `load` that ran differently on the server and
 *                 in the browser would hydrate to a mismatch)
 *
 * A universal `load`: it runs on the server for the first visit and in the
 * browser for every navigation after, and a remote query called inside it
 * behaves the same in both. The pattern it returns crosses to the browser
 * through the `transport` hook, `Note`s intact.
 */
export const load: PageLoad = async ({ url }) => {
	const remix = url.searchParams.get('remix');
	if (remix) {
		const published = await getPattern(remix);
		return {
			source: 'remix' as const,
			pattern: published.pattern,
			remixOf: published.id,
			title: `Remix: ${published.title}`
		};
	}

	const code = url.searchParams.get('p');
	if (code) {
		try {
			return {
				source: 'link' as const,
				pattern: decodePattern(code),
				remixOf: null,
				title: 'Studio'
			};
		} catch {
			// A damaged link opens an empty studio with a message, not an error page.
			return { source: 'broken' as const, pattern: null, remixOf: null, title: 'Studio' };
		}
	}

	const name = url.searchParams.get('preset');
	if (name && name in PRESETS) {
		return {
			source: 'preset' as const,
			pattern: preset(name) as Pattern,
			remixOf: null,
			title: 'Studio'
		};
	}

	return { source: 'fresh' as const, pattern: null, remixOf: null, title: 'Studio' };
};
