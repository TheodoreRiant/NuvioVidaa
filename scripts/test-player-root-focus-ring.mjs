// When player controls hide, focus moves to the full-screen player root
// (#playerUiRoot, tabindex=-1). Without a rule removing its outline, Chromium
// draws its default focus ring (outline: auto) along the screen edges: the
// thin white frame seen around the picture on VIDAA. The root's focus is an
// invisible input sink, so it must never be outlined.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const cssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "css",
  "components-29.css"
);
const root = postcss.parse(await readFile(cssPath, "utf8"));

function outlineFor(selector) {
  let value = null;
  root.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls("outline", (decl) => {
      value = decl.value;
    });
  });
  return value;
}

for (const selector of [".player-ui-root:focus", ".player-ui-root:focus-visible"]) {
  assert.match(
    String(outlineFor(selector)),
    /^none(\s*!important)?$/,
    `${selector} has no outline`
  );
}

console.log("Player root focus ring passed (no outline on the hidden-controls focus target).");
