/**
 * UNIVERSAL HOOKS
 * ===============
 *
 * `src/hooks.ts` runs on **both** the server and the client. One hook lives
 * here, because the browser has to agree with the server about it: what an
 * `ErrorValue` looks like on the wire.
 *
 * SvelteKit serialises what crosses the boundary — `load` results, remote
 * function arguments and results — with devalue, which knows about `Map`,
 * `Set`, `Date` and typed arrays, and nothing about a class called
 * `ErrorValue`. A transporter teaches it: `encode` returns a plain value for
 * an instance (and something falsy for anything else, which is how devalue
 * asks "is this yours?"), `decode` builds the instance back. A published
 * sheet's values arrive with real errors in them — `instanceof ErrorValue`
 * works, `.code` works — instead of `{ code: '#DIV/0!' }` objects that every
 * consumer would have to remember to rehydrate.
 */

import type { Transport } from '@sveltejs/kit/hooks';
import { ErrorValue, type ErrorCode } from '#lib/formula/values.ts';

export const transport: Transport = {
	ErrorValue: {
		encode: (value) => value instanceof ErrorValue && [value.code, value.message],
		decode: ([code, message]: [ErrorCode, string]) => new ErrorValue(code, message)
	}
};
