/**
 * Builds (and refreshes) a wrapper FrameNode that contains the original text
 * plus one rectangle per visible line, behind the text.
 */
import {
  measureLines,
  loadAllFontsForNode,
  measureNaturalSingleLineHeight,
  measureNaturalLineStep
} from "./lines";

export interface HighlightConfig {
  color: { r: number; g: number; b: number };
  paddingX: number;
  paddingY: number;
  rowGap: number;
  cornerRadius: number;
  version: 1;
}

export const DEFAULT_CONFIG: HighlightConfig = {
  color: { r: 1, g: 1, b: 1 },
  paddingX: 8,
  paddingY: 6,
  rowGap: 4,
  cornerRadius: 0,
  version: 1
};

const PLUGIN_KEY = "lineHighlight";
const RECT_NAME_PREFIX = "bg/";

export function getConfig(node: BaseNode): HighlightConfig {
  const raw = node.getPluginData(PLUGIN_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<HighlightConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function setConfig(node: BaseNode, cfg: HighlightConfig): void {
  node.setPluginData(PLUGIN_KEY, JSON.stringify(cfg));
}

export function isWrapper(node: BaseNode | null | undefined): node is FrameNode {
  if (!node || node.type !== "FRAME") return false;
  return (node as FrameNode).getPluginData(PLUGIN_KEY) !== "";
}

export function findWrapperAncestor(
  node: BaseNode | null | undefined
): FrameNode | null {
  let current: BaseNode | null = node ?? null;
  while (current) {
    if (isWrapper(current)) return current;
    current = current.parent ?? null;
  }
  return null;
}

export function findInnerText(wrapper: FrameNode): TextNode | null {
  for (const child of wrapper.children) {
    if (child.type === "TEXT") return child;
  }
  return null;
}

export async function applyHighlight(
  text: TextNode,
  cfg: HighlightConfig
): Promise<FrameNode> {
  await loadAllFontsForNode(text);

  const parent = text.parent ?? figma.currentPage;
  const indexInParent =
    "children" in parent
      ? (parent as ChildrenMixin).children.indexOf(text)
      : -1;

  const wrapper = figma.createFrame();
  wrapper.name = "Line Highlight";
  wrapper.fills = [];
  wrapper.strokes = [];
  wrapper.clipsContent = false;
  wrapper.x = text.x;
  wrapper.y = text.y;
  wrapper.resize(Math.max(0.01, text.width), Math.max(0.01, text.height));

  if (
    "insertChild" in parent &&
    indexInParent >= 0 &&
    typeof (parent as ChildrenMixin).insertChild === "function"
  ) {
    (parent as ChildrenMixin).insertChild(indexInParent, wrapper);
  } else if ("appendChild" in parent) {
    (parent as ChildrenMixin).appendChild(wrapper);
  } else {
    figma.currentPage.appendChild(wrapper);
  }

  wrapper.appendChild(text);
  text.x = 0;
  text.y = 0;

  setConfig(wrapper, cfg);
  await rebuildBackgrounds(wrapper, text, cfg);
  applyRelaunch(wrapper, text);

  return wrapper;
}

export async function refreshHighlight(wrapper: FrameNode): Promise<void> {
  const text = findInnerText(wrapper);
  if (!text) return;

  await loadAllFontsForNode(text);

  const cfg = getConfig(wrapper);

  await rebuildBackgrounds(wrapper, text, cfg);
  applyRelaunch(wrapper, text);
}

async function rebuildBackgrounds(
  wrapper: FrameNode,
  text: TextNode,
  cfg: HighlightConfig
): Promise<void> {
  for (const child of [...wrapper.children]) {
    if (
      child !== text &&
      child.type === "RECTANGLE" &&
      child.name.indexOf(RECT_NAME_PREFIX) === 0
    ) {
      child.remove();
    }
  }

  // Geometry
  //
  //   naturalH1     — visible single-line glyph height (cap + descender),
  //                   measured with AUTO leading.
  //   naturalStep   — line-to-line distance with the font's AUTO leading.
  //   targetStep    — desired line-to-line distance = naturalStep + rowGap.
  //   rectHeight    = naturalH1 + 2·paddingY
  //   rect_i.y      = line.top − paddingY
  //
  // To make `rowGap` actually push lines apart we set the text's lineHeight
  // to PIXELS so the visible step equals `targetStep`. Figma's
  // PIXELS:Y line-height does NOT always produce a visible step of Y — the
  // difference depends on font ascent/descent. We therefore run a tiny
  // calibration loop that nudges the lineHeight value until the measured
  // step (from `text.height`) matches the target. With AUTO-leading clones
  // for line counting (see lines.ts) the loop converges in 1–2 iterations.
  //
  // We always reset to AUTO first so:
  //   • naturalStep / naturalH1 are measured from a clean baseline,
  //   • leftover PIXELS lineHeight from older plugin versions is wiped out.
  resetTextLineHeightToAuto(text);

  const naturalH1 = await measureNaturalSingleLineHeight(text);
  const naturalStep = await measureNaturalLineStep(text, naturalH1);
  const rectHeight = Math.max(0.01, naturalH1 + cfg.paddingY * 2);

  let lines: import("./lines").LineInfo[];
  if (cfg.rowGap > 0 && naturalStep > 0) {
    const targetStep = naturalStep + cfg.rowGap;
    lines = await calibrateLineHeight(text, targetStep, naturalH1);
  } else {
    lines = await measureLines(text);
  }

  text.x = 0;
  text.y = 0;
  wrapper.resize(Math.max(0.01, text.width), Math.max(0.01, text.height));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.width <= 0) continue;

    const rect = figma.createRectangle();
    rect.name = `${RECT_NAME_PREFIX}${i}`;
    rect.fills = [{ type: "SOLID", color: cfg.color }];
    rect.strokes = [];
    if (cfg.cornerRadius > 0) {
      rect.cornerRadius = cfg.cornerRadius;
    }

    let width = line.width + cfg.paddingX * 2;

    let x: number;
    if (
      text.textAlignHorizontal === "JUSTIFIED" &&
      i < lines.length - 1
    ) {
      width = text.width + cfg.paddingX * 2;
      x = -cfg.paddingX;
    } else if (text.textAlignHorizontal === "CENTER") {
      x = (text.width - line.width) / 2 - cfg.paddingX;
    } else if (text.textAlignHorizontal === "RIGHT") {
      x = text.width - line.width - cfg.paddingX;
    } else {
      x = -cfg.paddingX;
    }

    const y = line.top - cfg.paddingY;

    rect.resize(Math.max(0.01, width), rectHeight);
    rect.x = x;
    rect.y = y;

    wrapper.appendChild(rect);
  }

  wrapper.appendChild(text);
}

/**
 * Sets `text.lineHeight` to a PIXELS value chosen so the visible glyph step
 * (read via `measureLines`) matches `targetStep`. Returns the final line
 * info from the last measurement.
 */
async function calibrateLineHeight(
  text: TextNode,
  targetStep: number,
  naturalH1: number
): Promise<import("./lines").LineInfo[]> {
  let lh = targetStep;
  applyTextLineHeightPx(text, lh);
  let lines = await measureLines(text);

  for (let iter = 0; iter < 4; iter++) {
    if (lines.length < 2) break;
    const measuredStep = lines[1].top - lines[0].top;
    const delta = targetStep - measuredStep;
    if (Math.abs(delta) < 0.5) break;
    lh = Math.max(naturalH1, lh + delta);
    applyTextLineHeightPx(text, lh);
    lines = await measureLines(text);
  }

  return lines;
}

function applyTextLineHeightPx(text: TextNode, value: number): void {
  const lh: LineHeight = { unit: "PIXELS", value };
  try {
    text.setRangeLineHeight(0, text.characters.length, lh);
  } catch (e) {
    try {
      text.lineHeight = lh;
    } catch {
      console.warn("Could not set lineHeight on text node", e);
    }
  }
}

function resetTextLineHeightToAuto(text: TextNode): void {
  const lh: LineHeight = { unit: "AUTO" };
  const len = text.characters.length;
  if (len === 0) return;
  try {
    text.setRangeLineHeight(0, len, lh);
  } catch (e) {
    try {
      text.lineHeight = lh;
    } catch {
      console.warn("Could not reset lineHeight to AUTO on text node", e);
    }
  }
}

function applyRelaunch(wrapper: FrameNode, text: TextNode): void {
  wrapper.setRelaunchData({
    refresh: "Recompute line backgrounds",
    settings: "Edit highlight settings"
  });
  text.setRelaunchData({
    refresh: "Recompute line backgrounds",
    settings: "Edit highlight settings"
  });
}
