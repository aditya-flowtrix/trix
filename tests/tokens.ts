#!/usr/bin/env node
/**
 * The token generator follows what a project adds to tokens.css: new text
 * styles, font families and components, without code changes. Each case
 * generates into a temporary copy and checks the result.
 *
 * Usage
 *   npm run test:tokens
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "../scripts/tokens.ts";

const tokens = readFileSync("src/styles/tokens.css", "utf8");
const themes = readFileSync("src/styles/themes.css", "utf8");

/** Generates `tokens.css` with `extra` added at the end of `:root`. */
function run(extra: string, edit = (css: string) => css) {
  const root = mkdtempSync(join(tmpdir(), "trix-tokens-"));
  mkdirSync(join(root, "src/styles"), { recursive: true });
  writeFileSync(
    join(root, "src/styles/tokens.css"),
    edit(tokens).replace(/\}\s*$/, `${extra}\n}\n`),
  );
  writeFileSync(join(root, "src/styles/themes.css"), themes);
  generate(root);
  return (file: string) => readFileSync(join(root, file), "utf8");
}

// A `-font-family` token outside a Text style group is not a text style.
let out = run(
  "  /* Components — badge */\n  --badge-font-family: var(--primary-family);",
);
assert.doesNotMatch(out("src/styles/generated/tokens.ts"), /"badge"/);
assert.doesNotMatch(out("src/styles/generated/text-styles.css"), /badge/);

// A new Text style group is one.
out = run(
  [
    "  /* Text style — cta */",
    "  --cta-min: 14;",
    "  --cta-max: 16;",
    "  --cta-font-family: var(--mono-family);",
  ].join("\n"),
  (css) =>
    css.replace(
      /(--primary-family:[^;]+;)/,
      '$1\n  --mono-family: "Chivo Mono", monospace;',
    ),
);
assert.match(out("src/styles/generated/tokens.ts"), /"cta"/);
assert.match(out("src/styles/generated/text-styles.css"), /\.text-style-cta/);

// A third font family reaches Figma, and the styles set in it alias it.
const prim = JSON.parse(out("design/tokens/Primitives.Value.tokens.json"));
assert.deepEqual(prim.font.family.mono.$value, ["Chivo Mono", "monospace"]);
const styles = JSON.parse(out("design/tokens/Text Styles.Value.tokens.json"));
assert.equal(styles.cta["font-family"].$value, "{font.family.mono}");

// A multi-word component keeps its name in Figma.
out = run(
  "  /* Components — content-wrapper */\n  --content-wrapper-gap: 1rem;",
);
const comp = JSON.parse(out("design/tokens/Components.Value.tokens.json"));
assert.equal(comp["content-wrapper"].gap.$value.value, 16);

// `--grey` next to `--grey-10` (here --trix-test) can't both be Figma variables: fail, don't overwrite.
assert.throws(
  () =>
    run("", (css) =>
      css.replace(
        /(\/\*\s*Color[^*]*\*\/)/,
        "$1\n  --trix-test: #888888;\n  --trix-test-10: #eeeeee;",
      ),
    ),
  /collides/,
);

// A Text style heading with extra words fails instead of dropping the style.
assert.throws(
  () =>
    run(
      "  /* Text style — cta (from the design) */\n  --cta-font-family: var(--primary-family);",
    ),
  /not a text style heading/,
);

// A note on the heading's next line is fine.
out = run(
  "  /* Text style — cta\n     from the design */\n  --cta-min: 14;\n  --cta-max: 16;\n  --cta-font-family: var(--primary-family);",
);
assert.match(out("src/styles/generated/text-styles.css"), /\.text-style-cta/);

console.log("Token generator OK.");
