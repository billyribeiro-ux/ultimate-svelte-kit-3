# Ultimate SvelteKit 3

Two things live here:

| Folder | What it is |
| --- | --- |
| [`strikeflow-site/`](./strikeflow-site) | The finished project — a production-grade marketing site for a fictional real-time options flow product, built on SvelteKit 3 and Svelte 5. |
| [`strikeflow-course/`](./strikeflow-course) | A 27-chapter build-along course that teaches every step of building it. Open `strikeflow-course/dist/index.html`. |

## Quick start

```bash
cd strikeflow-site
pnpm install
cp .env.example .env
pnpm run dev
```

Requires **Node 22.17+** and **pnpm 10+**.

## Reading the course

```bash
open strikeflow-course/dist/index.html
```

No build step, no server. Each chapter is a real page with prev/next links.

## What the site demonstrates

- SvelteKit 3: config in `vite.config.ts`, `#lib` subpath imports, typed env vars,
  remote `form()` with working progressive enhancement
- A complete SEO layer — canonical/OG/Twitter plus a cross-referenced JSON-LD
  `@graph`, generated sitemap, robots.txt and llms.txt
- Vanilla CSS design system, mobile-first, `min-width` queries only
- TradingView Lightweight Charts v5 via `{@attach}`, code-split and SSR-safe
- Gated PDF download with HMAC-signed expiring tokens
- 29 unit tests, 54 end-to-end tests across desktop and mobile profiles
