// Bundles the app with esbuild against the stand-ins in shim/ instead of the real remotion packages.
// Only for environments where `pnpm install` is not possible; `pnpm build` is the real build.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-demo");
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(root, "src/main.tsx")], bundle: true, minify: true, format: "iife", target: "es2022",
  outfile: join(out, "app.js"), jsx: "automatic", loader: { ".css": "css" }, define: { "process.env.NODE_ENV": '"production"' },
  alias: { remotion: join(root, "shim/remotion.tsx"), "@remotion/player": join(root, "shim/remotion-player.tsx") },
});
writeFileSync(join(out, "index.html"), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VRC Recap PV</title><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>`);
for (const f of ["jizura-engine.js", "JIZURA-LICENSE.txt"]) copyFileSync(join(root, "public", f), join(out, f));
console.log("dist-demo ready");
