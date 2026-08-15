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
