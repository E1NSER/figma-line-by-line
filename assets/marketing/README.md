# Marketing assets

Source files and generated PNGs for the Figma Community listing of
**Line-by-line Background**.

All PNGs are produced from the `.svg` files in this folder by
`npm run assets` (script: `scripts/build-marketing-assets.mjs`,
renderer: `@resvg/resvg-js`).

## Brand

Aligned with [E1NSER.](https://www.einser.at/) corporate identity:

- **Headline / display font**: Space Mono Bold (700)
- **Body font**: Space Mono Regular (400) for short marketing copy
- **Ink**: `#111827`
- **Accent**: `#E3FF04` (electric lime)
- **Surface**: `#FFFFFF`, with `#F3F4F6` for muted surfaces

The renderer picks up Space Mono from `~/Library/Fonts/` on macOS;
install it via [Google Fonts](https://fonts.google.com/specimen/Space+Mono)
if you regenerate the assets on a different machine.

## Files

| File | Size | Use on the Community listing |
| --- | --- | --- |
| `icon.png` | 128 × 128 | Plugin icon (also shown at 32 px in the Plugins menu) |
| `cover.png` | 1920 × 960 | Hero image at the top of the listing |
| `screenshot-1-apply.png` | 1600 × 1000 | Step 1 — select text and apply |
| `screenshot-2-settings.png` | 1600 × 1000 | Step 2 — settings panel |
| `screenshot-3-live.png` | 1600 × 1000 | Step 3 — live editing reflows the highlight |

The screenshot mockups are designed in SVG so they render crisp at any
display size. If you want true product screenshots, capture them in Figma
(Cmd-Shift-4 on macOS) at 1600 × 1000 and drop the PNGs in here under
the same names — the listing flow does not require they come from this
repo.

## Regenerating

```bash
npm run assets
```

This rerenders every `.svg` in this folder to a sibling `.png`. The
`icon.svg` is rendered at the explicit 128 × 128 raster declared in
`scripts/build-marketing-assets.mjs`; everything else uses its native
SVG `width`/`height`.
