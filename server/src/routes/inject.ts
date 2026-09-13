import { Router } from "express";
import { injectIntoVSCode } from "../lib/terminalInjector.js";

export const injectRouter = Router();

injectRouter.post("/api/inject", async (req, res) => {
  const text = req.body?.text as string | undefined;
  if (!text || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  // The hosted web demo runs on a remote Linux server with no local VS Code
  // to type into — a website can't reach into a visitor's desktop apps
  // regardless of OS. Rather than silently failing (or pretending it
  // worked), say so explicitly so the frontend can be honest about it.
  if (process.platform !== "darwin") {
    console.log(`[inject] mock (non-macOS host): "${text}"`);
    res.json({ ok: true, mock: true });
    return;
  }

  try {
    console.log(`[inject] typing into VS Code: "${text}"`);
    await injectIntoVSCode(text);
    console.log("[inject] done");
    res.json({ ok: true, mock: false });
  } catch (err) {
    console.error("inject failed", err);
    res.status(500).json({ error: (err as Error).message });
  }
});
