import { build, context } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const watch = process.argv.includes("--watch");

const outdir = "dist";
if (!existsSync(outdir)) {
  await mkdir(outdir, { recursive: true });
}

const codeOptions = {
  entryPoints: ["src/code.ts"],
  outfile: "dist/code.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2017",
  logLevel: "info",
  legalComments: "none"
};

const uiOptions = {
  entryPoints: ["src/ui.ts"],
  outfile: "dist/ui.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2017",
  logLevel: "info",
  legalComments: "none"
};

async function buildHtml() {
  const html = await readFile(path.resolve("src/ui.html"), "utf8");
  const js = await readFile(path.resolve("dist/ui.js"), "utf8");
  const inlined = html.replace(
    "<!-- INJECT_SCRIPT -->",
    `<script>${js}</script>`
  );
  await writeFile(path.resolve("dist/ui.html"), inlined, "utf8");
  console.log("[ui] dist/ui.html written");
}

if (watch) {
  const codeCtx = await context(codeOptions);
  const uiCtx = await context({
    ...uiOptions,
    plugins: [
      {
        name: "html-inline",
        setup(b) {
          b.onEnd(async (result) => {
            if (result.errors.length === 0) {
              try {
                await buildHtml();
              } catch (err) {
                console.error("[ui] failed to inline html:", err);
              }
            }
          });
        }
      }
    ]
  });
  await Promise.all([codeCtx.watch(), uiCtx.watch()]);
  console.log("watching for changes\u2026");
} else {
  await build(codeOptions);
  await build(uiOptions);
  await buildHtml();
}
