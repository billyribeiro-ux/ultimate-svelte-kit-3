import { defineConfig, loadEnv } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';

/**
 * SvelteKit 3 has no `svelte.config.js` — everything lives here.
 *
 * A function rather than an object, so `loadEnv` can run before the plugin is
 * constructed. `paths.origin` needs a value from `.env`, and Vite has not
 * loaded those when a plain object literal is evaluated.
 */
export default defineConfig(({ mode }) => {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };

	return {
		plugins: [
			sveltekit({
				// The trusted origin for cross-site request checks. adapter-node v6
				// bakes this in at build time and its header fallback assumes https,
				// so a plain-HTTP preview computes the wrong origin and every POST
				// comes back 403.
				paths: { origin: env['PUBLIC_ORIGIN'] ?? 'http://localhost:4173' },

				/*
				 * Kit's own cross-site check is turned off, and replaced by a stricter
				 * one in `hooks.server.ts`. Read that before deciding this is reckless.
				 *
				 * Kit blocks a non-GET request when its `Content-Type` is form-like *or
				 * absent* and the `Origin` does not match. Two consequences:
				 *
				 *   1. A body-less `DELETE /api/v1/orders/ORD-1` sends no content type,
				 *      so it is blocked — and there is no way for an API client to know
				 *      it must send a content type on a request with no body.
				 *   2. A cross-origin `POST` with `Content-Type: application/json` is
				 *      *allowed*, because browsers cannot send one without a CORS
				 *      preflight. True, but it makes our safety depend on the browser.
				 *
				 * Our rule instead: **any state-changing request authenticated by a
				 * cookie must carry a matching Origin.** Bearer-token requests are
				 * exempt because CSRF is a cookie attack — a browser attaches cookies to
				 * a forged cross-site request automatically and never attaches an
				 * `Authorization` header. That covers case 1 and closes case 2.
				 */
				csrf: { trustedOrigins: ['*'] },

				compilerOptions: { runes: true, experimental: { async: true } },
				adapter: adapter(),
				experimental: { remoteFunctions: true }
			})
		],
		// The native libSQL binary cannot be bundled.
		ssr: { external: ['@libsql/client', 'libsql'] },
		server: { port: 5173 }
	};
});
