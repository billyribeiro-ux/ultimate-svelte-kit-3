# Design evidence

`screens/` holds the screenshot matrix: every screen, in light and dark, on a
1440×900 desktop, a Pixel 7 and a 360px phone (`narrow`, the width the type
scale is tuned for), as PNGs under `screens/<theme>/<device>/`. Besides the
pages it captures the states a page alone does not show: a filter with no
match, a sign-in with a bad email, an expense tab read by a stranger, the
embed frame, a success toast, the open phone menu and the stop dialog (whose
first focus the script prints).
The folder is ignored by git — the pictures are a few megabytes and change
with every CSS edit — so regenerate them locally when reviewing a design
change. The brief the pass follows is summarised in `src/lib/styles/tokens.css`
and the comments in each component.

The pictures are for a person. What a machine can judge is gated elsewhere,
on every `pnpm run verify`:

- `scripts/contrast.ts` (in `pnpm run lint`) — every token pair in `tokens.css`
  against its WCAG floor;
- `e2e/visual.e2e.ts` (in `pnpm run test:e2e`) — the same screens as this
  matrix, in both themes and at the same three widths (the desktop, the Pixel
  7, and the Pixel 7 at 360px, a project that runs only this suite): no
  sideways scroll, no element past the right edge or out of its card, 44px
  touch targets on the phones — the map's pins and bubbles included — an axe
  run with no violations, no layout shift on the three pages people land on,
  their largest paint inside 2.5 seconds on a throttled 4G connection, and
  one map canvas at most;
- `scripts/bundle-guard.ts` (after the build) — GSAP only in the home page's
  chunk, and no new chunk over 20 KB gzipped.

## Regenerate

From `meridian/`, against the same built server the end-to-end suite uses.

`PUBLIC_ORIGIN` must be the same for the build and for the server. It is
baked into the bundle at build time — `paths.origin`, the origin SvelteKit
checks a form submission against and fetches its own prerendered data from —
so a build that picked up `.env`'s `http://localhost:5173` and a server on
4173 answers every sign-in with a 403 and `/explore` with a 500.
`playwright.config.ts` puts the same values on the whole
`prepare && build && start` command for this reason; so does this:

```sh
export DATABASE_URL=file:e2e.db PUBLIC_ORIGIN=http://localhost:4173 \
  BETTER_AUTH_SECRET=e2e-only-secret-of-at-least-thirty-two-characters \
  STOP_LIMIT=200 PORT=4173
node scripts/prepare-e2e-db.js && pnpm run build
node build/index.js &
node scripts/screens.ts            # everything
node scripts/screens.ts --only=home,trips --theme=dark --device=phone,narrow
node scripts/screens.ts --skip-globe   # no WebGL on this machine
```

`scripts/screens.ts` signs in as the seed's `ana@meridian.test`, forces the
theme through both `localStorage` (`meridian:theme`, read by the boot script in
`app.html`) and `emulateMedia({ colorScheme })` (read by `light-dark()`), and
prints two reports as it goes:

- **Contrast** — the same table `scripts/contrast.ts` checks, from the shared
  module `src/lib/design/contrast.ts`: the WCAG 2.x ratio of every text token
  on every surface tier for both sides of each `light-dark()` in `tokens.css`
  (4.5:1 for text, 3:1 for the focus ring and a chosen segment's edge, 1.5:1
  as a hairline floor).
- **Overflow** — on both phones, for every page: whether the document scrolls
  sideways and which elements stick out past the right edge or past their
  card's content box (`src/lib/design/page-checks.ts`, shared with the visual
  end-to-end test). The table wrapper, the tab strip and the two canvases are
  allowed to scroll inside themselves and are excluded.

The script exits non-zero when a pair fails or a page has an overflow problem,
the same two things the gates fail on.

Full-page captures are the default; the trip tabs, the dialogs and the long
explore list are captured at viewport size (a map does not scroll, and a
9,000px page trips Chromium's capture texture limit).
