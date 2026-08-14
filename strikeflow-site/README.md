# StrikeFlow — marketing site

A production-grade marketing site for a fictional real-time options flow data product,
built on **SvelteKit 3** (release candidate) and Svelte 5.

It exists as the worked example for a course, so every non-obvious decision is
explained in a comment where the decision lives, rather than in documentation that
drifts out of date.

---

## What it is

- Marketing pages only — no product, no accounts, no dashboard
- Email capture gated behind a free PDF guide
- Built mobile-first, in vanilla CSS, with no UI framework

## Stack

| Concern      | Choice                                              |
| ------------ | --------------------------------------------------- |
| Framework    | SvelteKit 3 RC (`@sveltejs/kit@next`), Svelte 5      |
| Language     | TypeScript, `strict` plus `noUncheckedIndexedAccess` |
| Styling      | Vanilla CSS with custom properties. No Tailwind      |
| Icons        | `phosphor-svelte`                                    |
| Charts       | TradingView `lightweight-charts` v5                  |
| Fonts        | Fontsource — Montserrat (headings), Sofia Sans (body) |
| Validation   | Valibot (Standard Schema)                            |
| Adapter      | `@sveltejs/adapter-node`                             |
| Tests        | Vitest (unit), Playwright (e2e, desktop + mobile)    |

## Requirements

- **Node 22.17+** (SvelteKit 3 requires it — check with `node -v`)
- **pnpm 10+**

## Getting started

```bash
pnpm install          # also syncs fonts and generates SvelteKit types
cp .env.example .env  # then edit it
pnpm run dev
```

To build the gated PDF (needs a Chromium download the first time):

```bash
pnpm exec playwright install chromium
pnpm run ebook:build
```

## Scripts

| Command                 | What it does                                            |
| ----------------------- | ------------------------------------------------------- |
| `pnpm run dev`          | Dev server                                              |
| `pnpm run build`        | Production build                                        |
| `pnpm run preview`      | Serve the production build locally                      |
| `pnpm run check`        | `svelte-check` — TypeScript across `.ts` and `.svelte`  |
| `pnpm run lint`         | Prettier check + ESLint                                 |
| `pnpm run format`       | Rewrite files with Prettier                             |
| `pnpm run test:unit`    | Vitest                                                  |
| `pnpm run test:e2e`     | Playwright, desktop and mobile                          |
| `pnpm run ebook:build`  | Render the gated PDF from `scripts/ebook-content.js`    |
| `pnpm run fonts:sync`   | Copy font files out of `node_modules` into `static/`    |
| `pnpm run fonts:measure`| Recompute metric-matched fallback values (server must be running) |

## Layout

```
src/
  env.ts                     Typed, validated environment variables (SvelteKit 3)
  app.html                   Shell — font preloads live here
  lib/
    components/
      layout/                Header (with a <dialog> mobile drawer), footer
      ui/                    Button, Card, Badge, Logo
      marketing/             Feature grid, pricing table, FAQ, CTA band
      charts/                Lightweight Charts wrapper
      blog/                  Post body renderer
    data/                    Single source of truth: site, nav, features, pricing, FAQ, team, posts
    seo/                     Seo.svelte, JSON-LD builders, sitemap route manifest
    server/                  Lead store, HMAC token signing, rate limiting (server-only)
    styles/                  fonts / tokens / reset / base / utilities
    utils/                   Deterministic market data generation
  routes/
    +layout.ts               prerender = true for the whole site
    guide/                   Lead capture — remote form(), thank-you, gated download
    blog/[slug]/             Articles with Article + Person + BreadcrumbList schema
    legal/                   Risk disclosure, privacy, terms
    sitemap.xml/  robots.txt/  llms.txt/
private/ebook/               The gated PDF. Deliberately NOT in static/
```

## Things worth knowing before you change something

- **`$lib` is now `#lib`.** SvelteKit 3 uses Node subpath imports, and **file
  extensions are mandatory**: `#lib/data/site.ts`, not `#lib/data/site`.
- **There is no `svelte.config.js`.** All configuration lives in `vite.config.ts`
  inside the `sveltekit()` plugin.
- **The whole site prerenders**, except `/guide` and `/guide/thank-you`. A page
  hosting a remote `form()` cannot be prerendered — the form's action is derived
  from the request URL.
- **`src/lib/server/` cannot be imported into client code.** The build fails rather
  than leaking the signing key. That is a framework guarantee.
- **Do not add `scroll-behavior: smooth` to `html`.** See the comment in
  `src/lib/styles/reset.css` — it deadlocked the e2e suite and breaks scroll
  restoration.
- **Do not guess the font fallback metrics.** Run `pnpm run fonts:measure`.
  Estimated values previously caused a 181px layout shift on mobile.

## Disclaimer

StrikeFlow is a fictional company invented for teaching purposes. The market data is
synthetic and labelled as such in the UI. The legal pages are realistic sample copy,
not legal advice, and have not been reviewed by a lawyer.
