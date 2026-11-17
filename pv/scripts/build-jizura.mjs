// Concatenate the JIZURA engine (https://github.com/852wa/JIZURA, MIT) into one classic script.
// usage: node scripts/build-jizura.mjs <path-to-JIZURA-checkout>
// The editor UI and MP4 exporter are left out: this project only needs J.plan() and J.Renderer.
import { readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) { console.error("usage: node scripts/build-jizura.mjs <JIZURA checkout>"); process.exit(1); }
const here = dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(["12_ui.js", "11_export.js"]);
const files = readdirSync(join(root, "src")).filter((f) => f.endsWith(".js") && !SKIP.has(f)).sort();
const version = readFileSync(join(root, "VERSION"), "utf8").trim();
const banner = `/*! JIZURA engine v${version} | MIT License | (c) 2026 hakoniwa | https://github.com/852wa/JIZURA\n    Built from src/ without the editor UI and exporter. See JIZURA-LICENSE.txt. */\n`;
const js = banner + files.map((f) => readFileSync(join(root, "src", f), "utf8")).join("\n").replaceAll("@VERSION@", version);
writeFileSync(join(here, "../public/jizura-engine.js"), js);
copyFileSync(join(root, "LICENSE"), join(here, "../public/JIZURA-LICENSE.txt"));
console.log(`jizura-engine.js: ${files.length} files, ${(js.length / 1024).toFixed(0)} KB, v${version}`);
