# Figma Community listing copy

Drop these strings into the Figma Community publish flow when you submit
**Line-by-line Background**. Tone is aligned with [E1NSER.](https://www.einser.at/):
plain, technical, no marketing fluff, Space Mono on the supporting visuals.

---

## Plugin name

```
Line-by-line Background
```

## Tagline (≤ 60 chars)

```
Per-line backgrounds for any text frame.
```

## Short description (≤ 200 chars, used in cards)

```
Adds a background rectangle behind every visible line of text — including
soft wraps. Each rectangle hugs the actual line width. Color, padding,
row gap, and corner radius editable per highlight.
```

## Long description

> Paste the block below into the "Description" field. It uses paragraphs
> and a short bullet list, which is what the Community listing renders
> cleanly.

```
Like a marker swept across each visible line of text, but in Figma —
including soft-wrapped lines and hard line breaks. Each rectangle hugs
the actual rendered width of its line, not the full text-frame width.

The original text node stays fully editable. The plugin wraps it in a
frame and adds rectangles behind it. Re-editing the text? The highlight
refreshes itself while the settings panel is open (~150 ms debounce).

What you can tweak per highlight:
• Background color
• Horizontal padding
• Vertical padding
• Row gap (visible space between rectangles)
• Corner radius

How to use:
1. Select a text node.
2. Run "Apply line backgrounds" from the plugin menu.
3. Open "Edit highlight…" from the wrapper's relaunch menu to fine-tune.
4. Type freely — the backgrounds reflow to match.

Privacy: zero network access. The manifest locks
networkAccess.allowedDomains to "none", so nothing about your file ever
leaves Figma.

Built by E1NSER. — a digital studio in Vienna.
https://www.einser.at/
```

## Tags (pick up to 12; Figma autocompletes from a fixed list)

Recommended primary tags:

```
text
typography
highlight
background
layout
utility
designsystem
accessibility
landing page
marketing
prototyping
hero
```

If the Figma autocomplete rejects any of these, fall back to:
`design-tools`, `production`, `presentation`.

## Categories (Community pickers)

- **Type**: Plugin
- **Audience**: Designers, Design system maintainers
- **Pricing**: Free

## Support contact

```
hallo@einser.at
```

> Use the same address as the einser.at footer for consistency.
> Alternatively, point users at GitHub Issues if you publish the
> repo publicly.

## Creator

```
E1NSER. — Digitalagentur Wien
https://www.einser.at/
```

## Version notes (release 1.0.0)

> Goes in the "What's new" textarea on first publish.

```
First public release.

• Wraps any selected text node in a "Line Highlight" frame and draws one
  background rectangle per visible line — soft wraps and hard breaks
  included.
• Per-line rectangles hug the actual rendered width of each line.
• Settings panel for color, horizontal/vertical padding, row gap, and
  corner radius — editable per highlight.
• "Refresh highlight" and "Edit highlight…" relaunch buttons on the
  wrapper.
• Live update: edits to the text refresh the highlight automatically
  while the settings panel is open.
• Zero network access.
```
