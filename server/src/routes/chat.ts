import { Router } from "express";
import { SARVAM_CHAT_ENDPOINT, SARVAM_CHAT_MODEL, SARVAM_HTTP_BASE, requireApiKey } from "../sarvamConfig.js";

export const chatRouter = Router();

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

chatRouter.post("/api/chat", async (req, res) => {
  const messages = req.body?.messages as ChatMessage[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  let apiKey: string;
  try {
    apiKey = requireApiKey();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  const upstream = await fetch(`${SARVAM_HTTP_BASE}${SARVAM_CHAT_ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
    },
    body: JSON.stringify({
      model: SARVAM_CHAT_MODEL,
      messages,
      stream: true,
      temperature: 0.6,
      reasoning_effort: null,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    res.status(upstream.status || 502).json({ error: "Sarvam chat completions failed", detail: text });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  req.on("close", () => {
    reader.cancel().catch(() => {});
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    console.error("chat stream error", err);
  } finally {
    res.end();
  }
});
