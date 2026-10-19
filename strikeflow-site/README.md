# StrikeFlow — marketing site

A production-grade marketing site for a fictional real-time options flow data product,
built on **SvelteKit 3** (3.1.0) and Svelte 5.

It exists as the worked example for a course, so every non-obvious decision is
explained in a comment where the decision lives, rather than in documentation that
drifts out of date.

---

## What it is

- Marketing pages only — no product, no accounts, no dashboard
- Email capture gated behind a free PDF guide
- Built mobile-first, in vanilla CSS, with no UI framework

## Stack

| Concern    | Choice                                                |
| ---------- | ----------------------------------------------------- |
| Framework  | SvelteKit 3.1.0 (`@sveltejs/kit`), Svelte 5.57        |
| Language   | TypeScript, `strict` plus `noUncheckedIndexedAccess`  |
| Styling    | Vanilla CSS with custom properties. No Tailwind       |
| Icons      | `phosphor-svelte`                                     |
| Charts     | TradingView `lightweight-charts` v5                   |
| Fonts      | Fontsource — Montserrat (headings), Sofia Sans (body) |
| Motion     | GSAP 3.15 — ScrollTrigger, SplitText, CustomEase      |
| Validation | Valibot (Standard Schema)                             |
| Adapter    | `@sveltejs/adapter-node` 6                            |
| Tests      | Vitest 5 (unit), Playwright (e2e, desktop + mobile)   |

## Requirements

- **Node 24.22.0** — the current LTS, pinned in `.nvmrc` and `engines` (SvelteKit 3’s own floor is 22.17)
- **pnpm 12.14.0** — pinned in `packageManager`; any pnpm 10+ switches to it automatically

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

| Command                  | What it does                                                      |
| ------------------------ | ----------------------------------------------------------------- |
| `pnpm run dev`           | Dev server                                                        |
| `pnpm run build`         | Production build                                                  |
| `pnpm run preview`       | Serve the production build locally                                |
| `pnpm run check`         | `svelte-check` — TypeScript across `.ts` and `.svelte`            |
| `pnpm run lint`          | Prettier check + ESLint                                           |
| `pnpm run format`        | Rewrite files with Prettier                                       |
| `pnpm run test:unit`     | Vitest                                                            |
| `pnpm run test:e2e`      | Playwright, desktop and mobile                                    |
| `pnpm run ebook:build`   | Render the gated PDF from `scripts/ebook-content.js`              |
| `pnpm run fonts:sync`    | Copy font files out of `node_modules` into `static/`              |
| `pnpm run fonts:measure` | Recompute metric-matched fallback values (server must be running) |

CI runs `check`, `lint`, `test:unit`, `build` and `test:e2e`, then the course
checks: `../.github/workflows/strikeflow-site.yml`.

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
    motion/                  Motion language, lazy GSAP loader, reveal/hero/counter/magnetic
    seo/                     Seo.svelte, JSON-LD builders, sitemap route manifest
    server/                  Lead store, HMAC token signing, rate limiting (server-only)
    styles/                  fonts / tokens / reset / base / utilities
    utils/                   Deterministic market data generation
  routes/
    +layout.ts               prerender = true for the whole site
    +error.svelte            The site's error page — 404s and server failures, inside the layout
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
- **Do not use `ScrollTrigger.normalizeScroll(true)`.** It reimplements scrolling in
  JavaScript and deadlocks anything that scrolls then measures — the same root cause
  as the `scroll-behavior: smooth` bug above. See `src/lib/motion/gsap.ts`.
- **Never hide content behind an animation without a failsafe.** The motion gate in
  `src/app.html` has three independent paths that all end with content visible.
- **`resolve()` takes route IDs (leading slash) or pathnames (no slash), optionally
  with `?search` or `#hash`.** Build composite links _inside_ `resolve()` — see the
  blog byline and the thank-you page — rather than concatenating strings. External
  links carry `rel="external"`, which is also how the lint rule tells them apart.
- **Call `resolve()` where you render, never in a `load` function.** On the server it
  returns a path _relative to the current request_ (`./features`, `../guide/download`),
  and a load's request can be the page or its `__data.json`. Return the parts (the
  thank-you page returns its token) and build the link in the component. For the same
  reason the header compares `page.route.id`, not `resolve(href)`, to mark the current
  page.
- **adapter-node 6 has no `ORIGIN` env var.** Behind a proxy that hides the real host,
  set `paths.origin` in `vite.config.ts`. Static assets are served from a list fixed at
  build time, `GET`/`HEAD` only, with content-hash `ETag`s and no `Last-Modified`.
- **`node build` assumes https.** With no `paths.origin` and no `PROTOCOL_HEADER`, the
  origin is derived as `https://<host>`, so a local `node build` over plain http
  refuses every signup with 403 (the CSRF check). Smoke-test locally with
  `pnpm run preview`; behind your host's TLS, nothing is needed.
- **Behind a proxy, set `ADDRESS_HEADER`** (and `XFF_DEPTH` for `X-Forwarded-For`).
  Otherwise `getClientAddress()` returns the proxy's IP, every visitor shares one
  rate-limit bucket, and the sixth signup in any minute is refused.
- **pnpm 12 gates releases younger than 24 hours.** The built-in `minimumReleaseAge`
  default is non-strict: when an install needs a release that fresh, pnpm installs it and
  records it in `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` so frozen installs keep
  passing. It only refuses when you set `minimumReleaseAge` yourself. Entries go stale after
  a day; `minimumReleaseAgeExcludePrune` removes them on the next add/update/remove.

## Disclaimer

StrikeFlow is a fictional company invented for teaching purposes. The market data is
synthetic and labelled as such in the UI. The legal pages are realistic sample copy,
not legal advice, and have not been reviewed by a lawyer.
