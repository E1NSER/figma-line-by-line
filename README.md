# Line-by-line Background

Per-line background rectangles for any text frame in Figma — like a marker
swept across each visible line of text, including soft-wrapped lines and
hard `\n` breaks. Each rectangle hugs the actual rendered width of its
line, not the full text-frame width.

The original text node stays fully editable. The plugin wraps it in a frame
and adds rectangles behind it. Re-editing the text? The highlight refreshes
itself.

## Highlights

- One rectangle per visible line, hugging that line's true width.
- Works with hard line breaks **and** soft wraps.
- Settings panel for color, horizontal/vertical padding, row gap, and corner
  radius — all editable per highlight.
- Auto-refresh while the settings panel is open (~150 ms debounce).
- Relaunch buttons on the wrapper frame: **Refresh highlight** and
  **Edit highlight…**.
- Zero network access. Nothing about your file leaves Figma —
  `networkAccess.allowedDomains` is locked to `none`.

## Usage

1. Select one or more **TextNode**s on the canvas.
2. Run **Plugins → Line-by-line Background → Apply line backgrounds**.
3. Each text gets wrapped in a frame named `Line Highlight` with a
   rectangle behind every visible line.

After editing the text, either:

- Click the **Refresh highlight** relaunch button that appears in the
  right-hand panel when the wrapper frame is selected, or
- Keep the plugin window open while editing — backgrounds update live.

To change colors, padding, row gap, or corner radius, run **Edit
settings…** with the wrapper (or the inner text) selected.

## Settings

| Setting | What it does |
| --- | --- |
| Background color | Fill of every line rectangle. |
| Padding X | Horizontal padding inside each rectangle (left & right of the text). |
| Padding Y | Vertical padding inside each rectangle (above & below the glyphs). |
| Row gap | Visible space between adjacent rectangles, in pixels. The plugin sets the text's line height so the gap matches exactly. |
| Corner radius | Rounded corners on each rectangle. |

## Install (development)

```bash
npm install
npm run build
```

Then in Figma desktop:

1. Open any file.
2. **Plugins → Development → Import plugin from manifest…**
3. Pick `manifest.json` from this folder.

For incremental development run `npm run watch` and reload the plugin
from the Figma plugin development menu.

## How it works

The Figma Plugin API does not expose per-line geometry. The plugin:

1. Resets the text's `lineHeight` to Figma's automatic value, so every
   refresh starts from a clean, font-driven baseline.
2. Clones the text node off-canvas to measure the natural single-glyph
   height (`naturalH1`) and the natural line-to-line distance
   (`naturalStep`).
3. If `rowGap > 0`, sets the text's `lineHeight` (in pixels) so the
   *visible* step equals `naturalStep + rowGap`. A small calibration loop
   compensates for the fact that Figma's `PIXELS:Y` line-height does not
   render at exactly Y pixels of glyph-top spacing — the difference
   depends on font ascent/descent.
4. Detects line breaks (hard `\n` and soft wraps) by walking tokens and
   watching clone heights at each token boundary. Clones are forced to
   AUTO leading so heights form a clean arithmetic series and counting
   stays correct regardless of the original's line height.
5. Measures each line's rendered width by trimming a clone to that line
   and reading `clone.width` with `textAutoResize = "WIDTH_AND_HEIGHT"`.
6. Places one rectangle per line at `y = line.top − paddingY` with
   height `naturalH1 + 2·paddingY`.

See [`src/lines.ts`](src/lines.ts) for the measurement algorithm and
[`src/highlight.ts`](src/highlight.ts) for the wrapper frame builder.

## File layout

```
.
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── src/
│   ├── code.ts        // main thread (Figma API)
│   ├── ui.html        // settings panel markup
│   ├── ui.ts          // settings panel logic
│   ├── lines.ts       // line detection + width measurement
│   └── highlight.ts   // build / refresh wrapper frame
└── dist/              // build output (loaded by Figma)
```

## Scripts

- `npm run build` — one-off production build to `dist/`.
- `npm run watch` — rebuild on file change (recommended during development).
- `npm run typecheck` — TypeScript only, no emit.

## License

[MIT](LICENSE) © 2026 Sascha Eisner
