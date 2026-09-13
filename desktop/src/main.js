const { app, BrowserWindow, screen, session, ipcMain } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

// The bubble opens straight into a live session with no "Start call" click,
// so there's never a user gesture for Chromium's autoplay policy to latch
// onto. Without this, both mic capture (AudioContext) and TTS playback
// (<audio>.play()) can silently stay blocked/suspended forever.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Dev mode (npm run dev:desktop) points this at the Vite dev server and
// expects `server/` to already be running separately via concurrently.
// Packaged/standalone mode (no env var) starts the embedded server itself.
const DEV_URL = process.env.DARPAN_WEB_URL || null;
const SERVER_PORT = Number(process.env.PORT ?? 8787);

// The window is taller than the visible bubble circle (108px, set in CSS):
// the extra space stays transparent and invisible until a countdown toast
// needs room to appear below the bubble, avoiding a runtime resize.
const WINDOW_WIDTH = 200;
const WINDOW_HEIGHT = 300;

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
// Present only if `SARVAM_API_KEY` was set when this build was packaged (see
// scripts/bake-key.mjs). When present, every install uses this key with no
// first-run prompt — otherwise each person enters their own, stored here.
const DEFAULT_KEY_PATH = path.join(__dirname, "default-key.json");

function readBakedDefaultKey() {
  try {
    return JSON.parse(fs.readFileSync(DEFAULT_KEY_PATH, "utf8")).sarvamApiKey || null;
  } catch {
    return null;
  }
}

function readConfig() {
  let userConfig = {};
  try {
    userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    // no per-user config saved yet
  }
  if (!userConfig.sarvamApiKey) {
    const baked = readBakedDefaultKey();
    if (baked) userConfig.sarvamApiKey = baked;
  }
  return userConfig;
}

function writeConfig(partial) {
  const next = { ...readConfig(), ...partial };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

let bubbleWindow = null;
let settingsWindow = null;

function createBubbleWindow(url) {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: screenWidth - WINDOW_WIDTH - 24,
    y: 40,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL(url);
  return win;
}

function createSettingsWindow() {
  const win = new BrowserWindow({
    width: 380,
    height: 380,
    resizable: false,
    title: "Darpan Setup",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadFile(path.join(__dirname, "settings.html"));
  return win;
}

/** Starts the bundled Express/WS server in-process. Bundled with esbuild so
 * it has no external node_modules to resolve (see scripts/bundle-server.mjs)
 * — workspace-hoisted deps like express/ws live in the repo root's
 * node_modules, which a packaged app can't rely on being alongside it. */
function startEmbeddedServer(apiKey) {
  process.env.SARVAM_API_KEY = apiKey;
  process.env.PORT = String(SERVER_PORT);
  process.env.DARPAN_WEB_DIST = app.isPackaged
    ? path.join(process.resourcesPath, "web-dist")
    : path.resolve(__dirname, "../../web/dist");

  const bundlePath = app.isPackaged
    ? path.join(process.resourcesPath, "server-bundle", "server.cjs")
    : path.resolve(__dirname, "../../server/dist-bundle/server.cjs");

  require(bundlePath);
}

function waitForServer(url, attemptsLeft = 30) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (attemptsLeft <= 0) {
          reject(new Error("Server did not start in time."));
          return;
        }
        attemptsLeft -= 1;
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

async function launchBubble() {
  if (DEV_URL) {
    bubbleWindow = createBubbleWindow(DEV_URL);
    return;
  }

  const config = readConfig();
  startEmbeddedServer(config.sarvamApiKey);
  const healthUrl = `http://localhost:${SERVER_PORT}/api/health`;
  await waitForServer(healthUrl);
  bubbleWindow = createBubbleWindow(`http://localhost:${SERVER_PORT}`);
}

function launchOrPromptForKey() {
  if (DEV_URL) {
    launchBubble();
    return;
  }
  const config = readConfig();
  if (config.sarvamApiKey) {
    launchBubble();
  } else {
    settingsWindow = createSettingsWindow();
  }
}

app.whenReady().then(() => {
  // Electron denies camera/mic permission requests by default; the bubble
  // is the whole point of this app, so auto-grant them (macOS still gates
  // this behind its own system-level TCC camera/mic permission prompt).
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  ipcMain.handle("darpan:save-api-key", async (_event, key) => {
    writeConfig({ sarvamApiKey: key });
    try {
      await launchBubble();
      settingsWindow?.close();
      settingsWindow = null;
    } catch (err) {
      throw new Error(err.message || "Failed to start Darpan.");
    }
  });

  launchOrPromptForKey();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) launchOrPromptForKey();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
