/**
 * Line detection and per-line width measurement for a TextNode.
 *
 * The Figma Plugin API does not expose per-line geometry, so we work around
 * this by cloning the text node off-canvas and reading `clone.height` /
 * `clone.width` after deleting characters or toggling `textAutoResize`.
 *
 * Callers must ensure the text node has `lineHeight: AUTO` before calling
 * `measureLines` (the highlight builder does this in `rebuildBackgrounds`).
 * This guarantees that the clone-based height measurements form a clean
 * arithmetic series — `H(n) = h1 + (n − 1) · step` — which is what the
 * line-counting math relies on.
 *
 *   `naturalH1`   — visible single-line height (≈ font cap + descender)
 *   `naturalStep` — line-to-line distance with AUTO leading
 *
 * Width per line is measured by cloning the original (preserving all per-range
 * styles), trimming the clone to the line's character range, switching it to
 * `WIDTH_AND_HEIGHT`, and reading `clone.width`.
 */

export interface LineInfo {
  start: number;
  end: number;
  characters: string;
  width: number;
  /** Y position of the line's visible glyph top inside the text node. */
  top: number;
  /** Height of one line's visible glyph extent. */
  height: number;
}

interface Token {
  start: number;
  end: number;
  kind: "word" | "space" | "newline";
}

const OFFSCREEN_X = -100000;
const OFFSCREEN_Y = -100000;

export async function measureLines(text: TextNode): Promise<LineInfo[]> {
  await loadAllFontsForNode(text);

  const characters = text.characters;
  if (characters.length === 0) return [];

  const naturalH1 = await measureNaturalSingleLineHeight(text);
  if (!Number.isFinite(naturalH1) || naturalH1 <= 0) return [];

  const naturalStepProbe = await measureNaturalLineStep(text, naturalH1);
  const stepForCounting = naturalStepProbe > 0 ? naturalStepProbe : naturalH1;

  const ranges = await detectLineRanges(text, naturalH1, stepForCounting);
  if (ranges.length === 0) return [];

  const N = ranges.length;
  let actualStep = stepForCounting;
  if (
    N >= 2 &&
    (text.textAutoResize === "WIDTH_AND_HEIGHT" ||
      text.textAutoResize === "HEIGHT")
  ) {
    const fromTotal = (text.height - naturalH1) / (N - 1);
    if (Number.isFinite(fromTotal) && fromTotal > 0) actualStep = fromTotal;
  }

  const result: LineInfo[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const w = r.end > r.start ? await measureLineWidth(text, r.start, r.end) : 0;
    result.push({
      start: r.start,
      end: r.end,
      characters: characters.slice(r.start, r.end),
      width: w,
      top: i * actualStep,
      height: naturalH1
    });
  }

  return result;
}

/**
 * Visible height of a single character with `lineHeight: AUTO` forced on the
 * clone — i.e. the font's natural single-line glyph extent, regardless of any
 * explicit lineHeight on the original node.
 */
export async function measureNaturalSingleLineHeight(
  text: TextNode
): Promise<number> {
  await loadAllFontsForNode(text);

  const clone = text.clone();
  figma.currentPage.appendChild(clone);
  clone.x = OFFSCREEN_X;
  clone.y = OFFSCREEN_Y;
  clone.textAutoResize = "WIDTH_AND_HEIGHT";
  reduceToFirstChar(clone);
  forceAutoLineHeight(clone);

  const h = clone.height;
  clone.remove();
  return h;
}

/**
 * Natural line-to-line distance with AUTO leading, computed as the difference
 * between a one-line and a two-line clone of the original text's first
 * character.
 */
export async function measureNaturalLineStep(
  text: TextNode,
  naturalH1: number
): Promise<number> {
  const clone = text.clone();
  figma.currentPage.appendChild(clone);
  clone.x = OFFSCREEN_X;
  clone.y = OFFSCREEN_Y;
  clone.textAutoResize = "WIDTH_AND_HEIGHT";
  reduceToFirstChar(clone);
  forceAutoLineHeight(clone);

  // Insert "<probe>\n<probe>" — the second char inherits the style of the
  // existing first character via 'BEFORE'.
  const probe = clone.characters[0];
  clone.insertCharacters(1, "\n" + probe, "BEFORE");
  forceAutoLineHeight(clone);
  const h2 = clone.height;
  clone.remove();

  const step = h2 - naturalH1;
  return step > 0 ? step : 0;
}

export async function loadAllFontsForNode(text: TextNode): Promise<void> {
  const seen = new Set<string>();
  const fonts: FontName[] = [];
  const segments = text.getStyledTextSegments(["fontName"]);
  for (const s of segments) {
    const f = s.fontName as FontName;
    const key = `${f.family}::${f.style}`;
    if (!seen.has(key)) {
      seen.add(key);
      fonts.push(f);
    }
  }
  if (fonts.length === 0) {
    fonts.push({ family: "Inter", style: "Regular" });
  }
  await Promise.all(fonts.map((f) => figma.loadFontAsync(f)));
}

function reduceToFirstChar(clone: TextNode): void {
  const total = clone.characters.length;
  if (total > 1) clone.deleteCharacters(1, total);
  if (clone.characters.length === 0) {
    clone.insertCharacters(0, "x", "AFTER");
  }
  if (clone.characters[0] === "\n") {
    clone.insertCharacters(0, "x", "AFTER");
    clone.deleteCharacters(1, 2);
  }
}

function forceAutoLineHeight(clone: TextNode): void {
  try {
    clone.setRangeLineHeight(0, clone.characters.length, { unit: "AUTO" });
  } catch {
    // Some font/style combos disallow setRangeLineHeight on the whole range
    // (e.g. when there are missing fonts). Continue silently — the clone
    // still inherits the original's lineHeight, which is good enough for the
    // single-character measurement to be in the right ballpark.
  }
}

function lineCountFromHeight(
  height: number,
  h1: number,
  step: number
): number {
  if (step <= 0) return Math.max(1, Math.round(height / Math.max(0.01, h1)));
  return Math.max(1, Math.round((height - h1) / step) + 1);
}

async function detectLineRanges(
  text: TextNode,
  naturalH1: number,
  naturalStep: number
): Promise<{ start: number; end: number }[]> {
  const characters = text.characters;
  const isAutoWidth = text.textAutoResize === "WIDTH_AND_HEIGHT";

  if (isAutoWidth) {
    return splitByNewlines(characters);
  }

  const targetWidth = text.width;
  const clone = text.clone();
  figma.currentPage.appendChild(clone);
  clone.x = OFFSCREEN_X;
  clone.y = OFFSCREEN_Y;
  clone.textAutoResize = "HEIGHT";
  // Force AUTO leading on the clone so clone heights form a clean arithmetic
  // series  H(n) = naturalH1 + (n − 1) · naturalStep.  Without this, when
  // the original has an explicit PIXELS lineHeight (which is what we apply
  // for `rowGap`), Figma's clone heights skew non-linearly and the
  // `lineCountFromHeight` math overcounts.
  forceAutoLineHeight(clone);
  // Lock width so the clone wraps the same way as the original. In HEIGHT
  // mode the height parameter is ignored — Figma auto-grows it to fit.
  if (targetWidth >= 0.01) {
    clone.resize(targetWidth, Math.max(0.01, naturalH1));
  }

  const tokens = tokenize(characters);

  const heightAt = new Map<number, number>();
  heightAt.set(clone.characters.length, clone.height);

  for (let i = tokens.length - 1; i >= 0; i--) {
    const targetLen = tokens[i].end;
    if (clone.characters.length > targetLen) {
      clone.deleteCharacters(targetLen, clone.characters.length);
    }
    if (!heightAt.has(targetLen)) {
      heightAt.set(targetLen, clone.height);
    }
  }

  clone.remove();

  const lineStarts: number[] = [0];
  let prevLineCount = 1;

  for (const token of tokens) {
    const h = heightAt.get(token.end);
    if (h === undefined) continue;
    const lc = lineCountFromHeight(h, naturalH1, naturalStep);

    if (lc > prevLineCount) {
      if (token.kind === "newline") {
        if (
          token.end <= characters.length &&
          lineStarts[lineStarts.length - 1] !== token.end
        ) {
          lineStarts.push(token.end);
        }
      } else {
        if (lineStarts[lineStarts.length - 1] !== token.start) {
          lineStarts.push(token.start);
        }
      }
    }

    prevLineCount = lc;
  }

  const ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < lineStarts.length; i++) {
    const s = lineStarts[i];
    let e = i + 1 < lineStarts.length ? lineStarts[i + 1] : characters.length;
    if (e > s && characters[e - 1] === "\n") e -= 1;
    if (e < s) e = s;
    ranges.push({ start: s, end: e });
  }

  return ranges;
}

function splitByNewlines(s: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\n") {
      ranges.push({ start: cursor, end: i });
      cursor = i + 1;
    }
  }
  ranges.push({ start: cursor, end: s.length });
  return ranges;
}

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\n") {
      out.push({ start: i, end: i + 1, kind: "newline" });
      i++;
    } else if (isInlineWhitespace(s[i])) {
      const start = i;
      while (i < s.length && s[i] !== "\n" && isInlineWhitespace(s[i])) i++;
      out.push({ start, end: i, kind: "space" });
    } else {
      const start = i;
      while (i < s.length && s[i] !== "\n" && !isInlineWhitespace(s[i])) i++;
      out.push({ start, end: i, kind: "word" });
    }
  }
  return out;
}

function isInlineWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\u00a0";
}

async function measureLineWidth(
  text: TextNode,
  start: number,
  end: number
): Promise<number> {
  if (end <= start) return 0;

  const clone = text.clone();
  figma.currentPage.appendChild(clone);
  clone.x = OFFSCREEN_X;
  clone.y = OFFSCREEN_Y;
  clone.textAutoResize = "WIDTH_AND_HEIGHT";

  const total = clone.characters.length;
  if (end < total) clone.deleteCharacters(end, total);
  if (start > 0) clone.deleteCharacters(0, start);

  const w = clone.width;
  clone.remove();
  return w;
}
