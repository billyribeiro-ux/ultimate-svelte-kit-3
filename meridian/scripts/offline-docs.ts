/**
 * THE DOCS INDEX, ANSWERED LOCALLY
 * ================================
 *
 * Imported by `autofix-report.ts` just before `@sveltejs/mcp`, for one side
 * effect. Importing that package also starts its MCP server, and the
 * server's resource setup fetches the docs index from svelte.dev without
 * waiting for the answer or handling a refusal. The report never reads it —
 * the autofixer is the compiler and a linter, run locally — but svelte.dev
 * answers Node's `fetch` from some networks with a 403 page that is not
 * JSON, the rejection goes unhandled, and Node exits 1 after a clean report.
 * A lint step must not depend on a website being in a good mood.
 *
 * So the docs index is answered here, empty — the package's own schema
 * accepts `{}` and lists no sections — and every other request goes to the
 * real `fetch`.
 */

const network = globalThis.fetch;

globalThis.fetch = (input, init) => {
	const url = input instanceof Request ? input.url : String(input);
	return url.startsWith('https://svelte.dev/docs/')
		? Promise.resolve(Response.json({}))
		: network(input, init);
};
