import { Router } from "express";
import { injectIntoVSCode } from "../lib/terminalInjector.js";

export const injectRouter = Router();

injectRouter.post("/api/inject", async (req, res) => {
  const text = req.body?.text as string | undefined;
  if (!text || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    console.log(`[inject] typing into VS Code: "${text}"`);
    await injectIntoVSCode(text);
    console.log("[inject] done");
    res.json({ ok: true });
  } catch (err) {
    console.error("inject failed", err);
    res.status(500).json({ error: (err as Error).message });
  }
});
