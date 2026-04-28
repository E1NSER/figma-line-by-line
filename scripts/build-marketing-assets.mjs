#!/usr/bin/env node
/**
 * Render every SVG in `assets/marketing/` to PNG using @resvg/resvg-js.
 *
 * Run with:   node scripts/build-marketing-assets.mjs
 * (or:        npm run assets)
 *
 * Local Space Mono fonts (~/Library/Fonts/SpaceMono-{Regular,Bold}.ttf on
 * macOS) are picked up automatically via resvg's `font.fontDirs` setting
 * to keep the rendered text on-brand.
 */
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { Resvg } from "@resvg/resvg-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const inputDir = path.join(root, "assets", "marketing");
const outputDir = inputDir;

const FONT_DIRS = [
  path.join(os.homedir(), "Library", "Fonts"),
  "/Library/Fonts",
  "/System/Library/Fonts",
  "/usr/share/fonts",
  "/usr/local/share/fonts"
].filter((dir) => existsSync(dir));

const sizeOverrides = {
  "icon.svg": { width: 128, height: 128 }
};

async function render(svgPath, outPath, override) {
  const svg = await readFile(svgPath, "utf8");
  const opts = {
    background: "rgba(0,0,0,0)",
    font: {
      fontDirs: FONT_DIRS,
      defaultFontFamily: "Space Mono",
      loadSystemFonts: true
    }
  };
  if (override?.width) opts.fitTo = { mode: "width", value: override.width };
  const resvg = new Resvg(svg, opts);
  const png = resvg.render().asPng();
  await writeFile(outPath, png);
  return png.byteLength;
}

async function main() {
  if (!existsSync(outputDir)) await mkdir(outputDir, { recursive: true });
  const files = (await readdir(inputDir)).filter((f) => f.endsWith(".svg"));
  if (files.length === 0) {
    console.log("No SVGs found in", inputDir);
    return;
  }
  for (const file of files) {
    const inPath = path.join(inputDir, file);
    const outPath = path.join(outputDir, file.replace(/\.svg$/, ".png"));
    const bytes = await render(inPath, outPath, sizeOverrides[file]);
    console.log(`  ${file.padEnd(28)} -> ${path.basename(outPath)}  ${(bytes / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
