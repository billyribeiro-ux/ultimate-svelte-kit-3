## Project Configuration

- **Language**: TypeScript 6.0 (the newest major SvelteKit 3, svelte-check and typescript-eslint support; 7 is not yet)
- **Toolchain**: Node 24.21.0 (`.nvmrc`, the current LTS), pnpm 12.10.1 (`packageManager`), SvelteKit 3.0.1, Svelte 5.57, Vite 8.3, Vitest 5, Playwright 1.64 — as of October 2026
- **Package Manager**: pnpm (a workspace: the app at the root, the `@meridian/waypoint` library in `packages/waypoint`). Two peer warnings are allowed on purpose in `pnpm-workspace.yaml`; the comment there says which and why.
- **Add-ons**: experimental, prettier, eslint, vitest, playwright, sveltekit-adapter, drizzle, better-auth, mdsvex, paraglide, ai-tools

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
