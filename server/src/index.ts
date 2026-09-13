import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { config as loadEnv } from "dotenv";
import express from "express";
import { WebSocketServer } from "ws";
import { chatRouter } from "./routes/chat.js";
import { classifyRouter } from "./routes/classify.js";
import { injectRouter } from "./routes/inject.js";
import { attachSttRelay } from "./ws/sttRelay.js";
import { attachTtsRelay } from "./ws/ttsRelay.js";

// `import.meta.url` doesn't exist once esbuild bundles this to CJS for the
// packaged Electron app (see desktop/scripts/bundle-server.mjs) — but that
// path never needs __dirname anyway, since Electron sets DARPAN_WEB_DIST and
// SARVAM_API_KEY directly before requiring this bundle. Only plain `npm run
// dev`/`tsx watch` (real ESM) needs it, so fall back harmlessly otherwise.
let __dirname = process.cwd();
try {
  __dirname = path.dirname(fileURLToPath(import.meta.url));
} catch {
  // bundled/CJS context — __dirname stays process.cwd(), unused in practice
}
loadEnv({ path: path.resolve(__dirname, "../../.env") });

const PORT = Number(process.env.PORT ?? 8787);

const app = express();
app.use(cors());
app.use(express.json());
app.use(chatRouter);
app.use(classifyRouter);
app.use(injectRouter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.SARVAM_API_KEY) });
});

// Serves the built frontend (web/dist) from this same server/origin when
// present, so a packaged app (Electron pointing loadURL at this server) gets
// the whole thing from one place — and every existing relative fetch("/api/…")
// / WebSocket(".../ws/…") call in the frontend keeps working unchanged.
// In plain `npm run dev`, web/dist normally doesn't exist (Vite serves it
// separately with its own dev-proxy) so this quietly does nothing.
const webDistPath = process.env.DARPAN_WEB_DIST ?? path.resolve(__dirname, "../../web/dist");
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  console.log(`Serving built frontend from ${webDistPath}`);
}

// Temporary debug sink: lets the browser mirror console.log lines into this
// terminal, since DevTools inside the small bubble window is painful to
// read/copy from.
app.post("/api/debug-log", (req, res) => {
  console.log("[browser]", ...(Array.isArray(req.body?.args) ? req.body.args : [req.body]));
  res.json({ ok: true });
});

const server = createServer(app);

const sttWss = new WebSocketServer({ noServer: true });
const ttsWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/ws/stt") {
    attachSttRelay(sttWss, req, socket, head);
  } else if (url.pathname === "/ws/tts") {
    attachTtsRelay(ttsWss, req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Darpan server listening on http://localhost:${PORT}`);
  if (!process.env.SARVAM_API_KEY) {
    console.warn("WARNING: SARVAM_API_KEY is not set. Copy .env.example to .env and fill it in.");
  }
});
