// Bundles server/src/index.ts (+ its deps: express, ws, cors, dotenv) into a
// single dependency-free CommonJS file. Electron's main process can then
// `require()` it directly with no node_modules alongside it needed — npm
// workspaces hoist server's actual deps to the repo root, which a packaged
// app can't rely on being present, so bundling sidesteps that entirely.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(__dirname, "../../server/src/index.ts");
const outfile = path.resolve(__dirname, "../../server/dist-bundle/server.cjs");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: [],
  logLevel: "info",
});

console.log(`Bundled server -> ${outfile}`);
