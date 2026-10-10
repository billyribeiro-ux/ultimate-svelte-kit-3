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

## Regenerate

From `meridian/`, against the same built server the end-to-end suite uses:

```sh
node scripts/prepare-e2e-db.js && pnpm run build
DATABASE_URL=file:e2e.db PUBLIC_ORIGIN=http://localhost:4173 \
  BETTER_AUTH_SECRET=e2e-only-secret-of-at-least-thirty-two-characters \
  STOP_LIMIT=200 PORT=4173 node build/index.js &
node scripts/screens.ts            # everything
node scripts/screens.ts --only=home,trips --theme=dark --device=phone,narrow
node scripts/screens.ts --skip-globe   # no WebGL on this machine
```

`scripts/screens.ts` signs in as the seed's `ana@meridian.test`, forces the
theme through both `localStorage` (`meridian:theme`, read by the boot script in
`app.html`) and `emulateMedia({ colorScheme })` (read by `light-dark()`), and
prints two reports as it goes:

- **Contrast** — the WCAG 2.x ratio of every text token on every surface tier
  for both sides of each `light-dark()` in `tokens.css` (4.5:1 for text, 3:1 for
  the focus ring and a chosen segment's edge, 1.5:1 as a hairline floor). The
  script exits non-zero when a pair fails.
- **Overflow** — on both phones, for every page: whether the document scrolls
  sideways and which elements stick out past the right edge. The table
  wrapper, the tab strip and the two canvases are allowed to scroll inside
  themselves and are excluded.

Full-page captures are the default; the trip tabs, the dialogs and the long
explore list are captured at viewport size (a map does not scroll, and a
9,000px page trips Chromium's capture texture limit).
