/**
 * Settings panel script. Runs in the iframe sandbox; talks to code.ts via
 * window.parent.postMessage / window.onmessage.
 */

interface RGBColor {
  r: number;
  g: number;
  b: number;
}

interface UIConfig {
  color: RGBColor;
  paddingX: number;
  paddingY: number;
  rowGap: number;
  cornerRadius: number;
  version: 1;
}

const colorInput = document.getElementById("color") as HTMLInputElement;
const padXInput = document.getElementById("paddingX") as HTMLInputElement;
const padYInput = document.getElementById("paddingY") as HTMLInputElement;
const rowGapInput = document.getElementById("rowGap") as HTMLInputElement;
const radiusInput = document.getElementById(
  "cornerRadius"
) as HTMLInputElement;
const applyBtn = document.getElementById("apply") as HTMLButtonElement;
const closeBtn = document.getElementById("close") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;

function rgbToHex(c: RGBColor): string {
  const to = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

function hexToRgb(hex: string): RGBColor {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return { r: 1, g: 1, b: 1 };
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255
  };
}

function readForm(): UIConfig {
  return {
    color: hexToRgb(colorInput.value),
    paddingX: Math.max(0, Number(padXInput.value) || 0),
    paddingY: Math.max(0, Number(padYInput.value) || 0),
    rowGap: Math.max(0, Number(rowGapInput.value) || 0),
    cornerRadius: Math.max(0, Number(radiusInput.value) || 0),
    version: 1
  };
}

function writeForm(cfg: UIConfig): void {
  colorInput.value = rgbToHex(cfg.color);
  padXInput.value = String(cfg.paddingX);
  padYInput.value = String(cfg.paddingY);
  rowGapInput.value = String(cfg.rowGap ?? 0);
  radiusInput.value = String(cfg.cornerRadius);
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

applyBtn.addEventListener("click", () => {
  const cfg = readForm();
  parent.postMessage({ pluginMessage: { type: "apply", config: cfg } }, "*");
  setStatus("Applying\u2026");
});

closeBtn.addEventListener("click", () => {
  parent.postMessage({ pluginMessage: { type: "close" } }, "*");
});

[colorInput, padXInput, padYInput, rowGapInput, radiusInput].forEach((el) => {
  el.addEventListener("change", () => {
    const cfg = readForm();
    parent.postMessage({ pluginMessage: { type: "live", config: cfg } }, "*");
  });
});

window.addEventListener("message", (event: MessageEvent) => {
  const msg = event.data?.pluginMessage;
  if (!msg) return;
  if (msg.type === "init") {
    writeForm(msg.config as UIConfig);
    setStatus(
      msg.hasTarget
        ? "Editing the selected highlight."
        : "Defaults shown. Select a text node and click Apply."
    );
  } else if (msg.type === "applied") {
    const count = typeof msg.count === "number" ? msg.count : "";
    setStatus(`Applied. ${count} updated.`.trim());
  } else if (msg.type === "error") {
    setStatus(String(msg.message));
  }
});
