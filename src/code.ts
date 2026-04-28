/**
 * Plugin main thread. Handles the three menu commands:
 *
 *   apply    - wrap selected TextNodes with line backgrounds (or refresh
 *              existing wrappers).
 *   refresh  - recompute backgrounds on existing wrappers.
 *   settings - show the settings panel; while open, document changes on tracked
 *              text nodes trigger a debounced refresh.
 */

import {
  applyHighlight,
  refreshHighlight,
  getConfig,
  setConfig,
  findWrapperAncestor,
  isWrapper,
  DEFAULT_CONFIG,
  HighlightConfig
} from "./highlight";

const SETTINGS_KEY = "defaultConfig";

const cmd = figma.command;

const TRACKED_PROPS = new Set<string>([
  "characters",
  "width",
  "height",
  "fontSize",
  "fontName",
  "lineHeight",
  "letterSpacing",
  "textAlignHorizontal",
  "textAlignVertical",
  "textAutoResize"
]);

let liveTimer: ReturnType<typeof setTimeout> | null = null;
const PENDING_WRAPPERS = new Set<string>();
let liveListenerInstalled = false;
let refreshing = false;

/**
 * Wrapper id → timestamp of the most recent plugin-driven refresh.
 * Used to suppress documentchange events that are echoes of our own writes
 * (Figma dispatches those events asynchronously, after `refreshing` has
 * already been cleared, so the synchronous flag alone is not sufficient).
 */
const RECENTLY_REFRESHED = new Map<string, number>();
const REFRESH_QUIET_MS = 300;

function markRefreshed(wrapperId: string): void {
  const now = Date.now();
  RECENTLY_REFRESHED.set(wrapperId, now);
  if (RECENTLY_REFRESHED.size > 32) {
    const cutoff = now - REFRESH_QUIET_MS * 4;
    for (const [id, ts] of RECENTLY_REFRESHED) {
      if (ts < cutoff) RECENTLY_REFRESHED.delete(id);
    }
  }
}

function wasRecentlyRefreshed(wrapperId: string): boolean {
  const ts = RECENTLY_REFRESHED.get(wrapperId);
  if (ts === undefined) return false;
  return Date.now() - ts < REFRESH_QUIET_MS;
}

main().catch((err) => {
  console.error(err);
  figma.notify(`Error: ${(err as Error).message}`);
  figma.closePlugin();
});

async function main(): Promise<void> {
  if (cmd === "refresh") {
    await runRefresh();
    figma.closePlugin();
    return;
  }

  if (cmd === "settings") {
    await openSettings();
    return;
  }

  // Default / "apply" command.
  await runApply();
  figma.closePlugin();
}

async function runApply(): Promise<void> {
  const targets = collectTargets(figma.currentPage.selection);
  if (targets.texts.length === 0 && targets.wrappers.length === 0) {
    figma.notify("Select a text node first.");
    return;
  }

  const cfg = await loadDefaultConfig();
  let count = 0;

  refreshing = true;
  try {
    for (const wrapper of targets.wrappers) {
      try {
        await refreshHighlight(wrapper);
        markRefreshed(wrapper.id);
        count++;
      } catch (e) {
        console.error(e);
        figma.notify(`Refresh failed: ${(e as Error).message}`);
      }
    }

    for (const text of targets.texts) {
      try {
        const w = await applyHighlight(text, cfg);
        markRefreshed(w.id);
        count++;
      } catch (e) {
        console.error(e);
        figma.notify(`Apply failed: ${(e as Error).message}`);
      }
    }
  } finally {
    refreshing = false;
  }

  figma.notify(`Done. ${count} text node${count === 1 ? "" : "s"} updated.`);
}

async function runRefresh(): Promise<void> {
  const targets = collectTargets(figma.currentPage.selection);
  const wrappers = targets.wrappers;

  if (wrappers.length === 0) {
    figma.notify("Select a wrapped text node to refresh.");
    return;
  }

  let count = 0;
  refreshing = true;
  try {
    for (const w of wrappers) {
      try {
        await refreshHighlight(w);
        markRefreshed(w.id);
        count++;
      } catch (e) {
        console.error(e);
        figma.notify(`Refresh failed: ${(e as Error).message}`);
      }
    }
  } finally {
    refreshing = false;
  }
  figma.notify(`Refreshed ${count}.`);
}

interface CollectedTargets {
  texts: TextNode[];
  wrappers: FrameNode[];
}

function collectTargets(selection: readonly SceneNode[]): CollectedTargets {
  const texts: TextNode[] = [];
  const wrappers = new Set<FrameNode>();

  for (const node of selection) {
    const ancestor = findWrapperAncestor(node);
    if (ancestor) {
      wrappers.add(ancestor);
      continue;
    }
    if (node.type === "TEXT") {
      texts.push(node);
      continue;
    }
    if (isWrapper(node)) {
      wrappers.add(node);
      continue;
    }
    if ("findAll" in node) {
      const inside = (node as ChildrenMixin).findAll(
        (n) => n.type === "TEXT"
      ) as TextNode[];
      for (const t of inside) {
        const a = findWrapperAncestor(t);
        if (a) wrappers.add(a);
        else texts.push(t);
      }
    }
  }

  return { texts, wrappers: Array.from(wrappers) };
}

async function loadDefaultConfig(): Promise<HighlightConfig> {
  try {
    const raw = await figma.clientStorage.getAsync(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...(raw as Partial<HighlightConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveDefaultConfig(cfg: HighlightConfig): Promise<void> {
  try {
    await figma.clientStorage.setAsync(SETTINGS_KEY, cfg);
  } catch {
    // ignore
  }
}

async function openSettings(): Promise<void> {
  figma.showUI(__html__, { width: 280, height: 460, themeColors: true });

  const initialCfg = await getInitialConfigForUI();
  figma.ui.postMessage({
    type: "init",
    config: initialCfg.config,
    hasTarget: initialCfg.hasTarget
  });

  await setupLiveUpdate();

  figma.on("selectionchange", () => {
    void getInitialConfigForUI().then((res) => {
      figma.ui.postMessage({
        type: "init",
        config: res.config,
        hasTarget: res.hasTarget
      });
    });
  });

  figma.ui.onmessage = async (msg: {
    type: string;
    config?: HighlightConfig;
  }) => {
    if (msg.type === "apply" && msg.config) {
      await handleApplyFromUI(msg.config);
    } else if (msg.type === "live" && msg.config) {
      await handleLiveConfigChange(msg.config);
    } else if (msg.type === "close") {
      figma.closePlugin();
    }
  };
}

async function getInitialConfigForUI(): Promise<{
  config: HighlightConfig;
  hasTarget: boolean;
}> {
  const sel = figma.currentPage.selection;
  for (const node of sel) {
    const w = findWrapperAncestor(node);
    if (w) return { config: getConfig(w), hasTarget: true };
  }
  return { config: await loadDefaultConfig(), hasTarget: false };
}

async function handleApplyFromUI(cfg: HighlightConfig): Promise<void> {
  await saveDefaultConfig(cfg);

  const sel = figma.currentPage.selection;
  const targets = collectTargets(sel);

  let count = 0;
  refreshing = true;
  try {
    for (const w of targets.wrappers) {
      try {
        setConfig(w, cfg);
        await refreshHighlight(w);
        markRefreshed(w.id);
        count++;
      } catch (e) {
        console.error(e);
      }
    }
    for (const text of targets.texts) {
      try {
        const w = await applyHighlight(text, cfg);
        markRefreshed(w.id);
        count++;
      } catch (e) {
        console.error(e);
      }
    }
  } finally {
    refreshing = false;
  }

  if (count === 0) {
    figma.notify("Select a text node first.");
  } else {
    figma.notify(`Applied to ${count}.`);
  }
  figma.ui.postMessage({ type: "applied", count });
}

async function handleLiveConfigChange(cfg: HighlightConfig): Promise<void> {
  await saveDefaultConfig(cfg);
  const sel = figma.currentPage.selection;
  const wrappers = collectTargets(sel).wrappers;
  refreshing = true;
  try {
    for (const w of wrappers) {
      try {
        setConfig(w, cfg);
        await refreshHighlight(w);
        markRefreshed(w.id);
      } catch (e) {
        console.error(e);
      }
    }
  } finally {
    refreshing = false;
  }
}

async function setupLiveUpdate(): Promise<void> {
  if (liveListenerInstalled) return;
  liveListenerInstalled = true;

  // Required since the manifest declares `documentAccess: "dynamic-page"`.
  // Figma rejects `figma.on("documentchange", …)` in incremental mode unless
  // every page has been loaded first.
  if (typeof figma.loadAllPagesAsync === "function") {
    try {
      await figma.loadAllPagesAsync();
    } catch (e) {
      console.warn("loadAllPagesAsync failed", e);
    }
  }

  figma.on("documentchange", (event) => {
    if (refreshing) return;

    let touched = false;

    for (const change of event.documentChanges) {
      if (change.type !== "PROPERTY_CHANGE") continue;
      if (!change.properties.some((p) => TRACKED_PROPS.has(p))) continue;

      const node = (change as PropertyChange).node as SceneNode | undefined;
      if (!node || node.type !== "TEXT") continue;

      const wrapper = findWrapperAncestor(node);
      if (!wrapper) continue;

      // Suppress echoes of our own writes. Figma fires documentchange
      // asynchronously, so events caused by `refreshHighlight` (which mutates
      // `text.lineHeight`, width, etc.) can arrive after the synchronous
      // `refreshing` flag has been reset. Without this guard those echoes
      // re-queue the wrapper, which schedules another flushLive, which mutates
      // the text again, ad infinitum.
      if (wasRecentlyRefreshed(wrapper.id)) continue;

      PENDING_WRAPPERS.add(wrapper.id);
      touched = true;
    }

    if (!touched) return;

    if (liveTimer !== null) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      void flushLive();
    }, 150);
  });
}

async function getNodeByIdSafe(id: string): Promise<BaseNode | null> {
  if (typeof figma.getNodeByIdAsync === "function") {
    try {
      return (await figma.getNodeByIdAsync(id)) ?? null;
    } catch {
      return null;
    }
  }
  return figma.getNodeById(id);
}

async function flushLive(): Promise<void> {
  liveTimer = null;
  if (refreshing) return;
  refreshing = true;
  try {
    const ids = Array.from(PENDING_WRAPPERS);
    PENDING_WRAPPERS.clear();

    for (const id of ids) {
      const node = await getNodeByIdSafe(id);
      if (!node || node.type !== "FRAME") continue;
      if (!isWrapper(node)) continue;
      try {
        await refreshHighlight(node as FrameNode);
        markRefreshed(id);
      } catch (e) {
        console.error("live refresh failed", e);
      }
    }
  } finally {
    refreshing = false;
    PENDING_WRAPPERS.clear();
  }
}
