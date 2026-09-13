// Optionally bakes a Sarvam API key into the packaged app so every install
// uses it automatically with no first-run prompt, instead of each person
// entering their own. Only runs if SARVAM_API_KEY is set in the environment
// when packaging — otherwise the app falls back to the normal per-user
// first-run key screen (see main.js's readConfig()).
//
// IMPORTANT: this key ships inside the .dmg/.app in plain text. Anyone who
// has the installer can extract it and use it on your account. Only do this
// for a small, trusted distribution — not a public release.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outfile = path.resolve(__dirname, "../src/default-key.json");

const key = process.env.SARVAM_API_KEY;

if (!key) {
  // No key provided at build time — remove any stale baked key from a
  // previous build so we don't accidentally ship an old one.
  fs.rmSync(outfile, { force: true });
  console.log("No SARVAM_API_KEY set — packaging without a baked-in key (per-user prompt stays).");
} else {
  fs.writeFileSync(outfile, JSON.stringify({ sarvamApiKey: key }, null, 2));
  console.log(`Baked API key into ${outfile} — every install will skip the key prompt.`);
}
