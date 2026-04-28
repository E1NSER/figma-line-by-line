# Changelog

All notable changes to **Line-by-line Background** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-27

First public release on the Figma Community.

### Features

- Wraps any selected `TextNode` in a `Line Highlight` frame and draws one
  background rectangle per visible line — including soft-wrapped lines and
  hard `\n` breaks.
- Per-line rectangles hug the actual rendered width of each line, not the
  full text-frame width.
- Settings panel exposes:
  - Background color
  - Horizontal padding
  - Vertical padding
  - Row gap (visible space between rectangles, applied via `lineHeight`)
  - Corner radius
- "Refresh highlight" and "Edit highlight…" relaunch buttons appear on the
  wrapper for one-click updates after editing the text.
- Live update: while the settings panel is open, edits to the text refresh
  the highlight automatically (~150 ms debounce).
- No network access — `networkAccess.allowedDomains` is locked to `none`,
  so nothing about your file ever leaves Figma.
