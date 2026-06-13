# Design-sync notes — Lemon AI Center

## What this sync is
- Lemon AI Center is an **application**, not a component library. No `dist/`, no
  `main`/`module`/`exports`, no `.d.ts` component exports. 37 of 46 `src/components/*`
  are coupled to Zustand stores / Firebase and can't render in isolation.
- Synced as a **token / brand design system** (off-script, hand-authored layout —
  outside the package converter's envelope). The deliverable is the brand layer:
  the Tailwind token system as a standalone stylesheet + 5 Brand reference cards.
- Project: "Lemon Studios Design System" (`ff63b558-2fe3-4a61-9267-777afaf6dfac`).

## Source of truth (where to re-derive tokens on re-sync)
- Color tokens: `src/styles/globals.css` — `:root` (light) + `[data-theme="dark"]`.
- Tailwind name → var mapping: `tailwind.config.ts` (`theme.extend.colors`, `fontFamily`).
- Editorial classes (`.ed-section`, `.ed-section-label`, `.ed-rule`, `.ed-rule-double`):
  `src/styles/globals.css` `@layer components` (~line 178). They use `@apply` in the
  app; the synced `_ds_bundle.css` ships them as **resolved plain CSS** (designs don't
  get Tailwind). If the app's `@apply` rules change, re-resolve them by hand.
- Fonts: Fraunces + Inter, loaded from Google Fonts at runtime via `@import` in
  `styles.css` (mirrors the `<link>` in `index.html`). `[FONT_REMOTE]` — no local
  font files shipped, by design.

## Bundle shape (off-script — no converter)
- `styles.css` → `@import` Google Fonts + `tokens/tokens.css` + `_ds_bundle.css`.
- `_ds_bundle.js` is **empty-bodied** (assigns `window.LemonDS = {}`) — there are no
  importable components. Designs compose from the token classes, not from JS exports.
- 5 cards under `components/Brand/`: Colors, Typography, Surfaces, Editorial, Controls.
- No `_ds_sync.json` anchor written — off-script honest choice; next sync re-verifies all.

## Known render warns
- None. All 5 cards verified in headless Chromium at 900×760: correct paper bg
  (#f5ede2), Fraunces loaded, tokens resolved. (Controls card has no h1/h2/h3, so a
  font-probe selector on those tags returns "none" — not a failure.)

## Re-sync risks (watch list)
- **Hand-authored, no converter.** A re-sync does NOT run `package-build.mjs`/`resync.mjs`
  cleanly here — there's nothing for them to build. Re-derive `tokens/tokens.css` and
  `_ds_bundle.css` from `src/styles/globals.css` by hand, re-verify the cards, re-upload.
- **Token drift.** If `globals.css` `:root`/`[data-theme="dark"]` values change, the
  synced `tokens/tokens.css` goes stale silently. Diff the two on re-sync.
- **`@apply` resolution.** The `.ed-*` classes are hand-resolved; if the app edits the
  `@apply` directives, the resolved CSS must be updated to match.
- **conventions.md vocabulary.** Validated against the built CSS at sync time (0 missing).
  On re-sync, re-grep every class named in `conventions.md` against `_ds_bundle.css`.
- **Upgrade path:** if the team later extracts reusable primitives into a state-free
  package with a real build + `.d.ts`, switch `shape` to the package converter and sync
  components properly. That's the real "components" sync this repo can't do today.
