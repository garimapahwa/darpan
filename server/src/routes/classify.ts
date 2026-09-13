import { Router } from "express";
import { SARVAM_CHAT_ENDPOINT, SARVAM_CHAT_MODEL, SARVAM_HTTP_BASE, requireApiKey } from "../sarvamConfig.js";

export const classifyRouter = Router();

const CLASSIFIER_PROMPT = `You detect whether a message (spoken aloud, possibly in English, Hindi, or Hinglish) is the user expressing frustration or disappointment directed at work an AI coding agent just produced (e.g. a website, code, a design) — as opposed to general chit-chat, a question, or a neutral statement.

Reply with ONLY strict JSON, no other text, in this exact shape:
{"isFrustration": boolean, "instruction": string}

If isFrustration is true, "instruction" must be a short, clear, direct instruction rewriting their complaint as feedback for the coding agent, in English, e.g. "The layout looks broken and the colors are bad, please fix the visual design." If isFrustration is false, "instruction" must be an empty string.`;

interface ClassifyResult {
  isFrustration: boolean;
  instruction: string;
}

function safeParse(raw: string): ClassifyResult {
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return { isFrustration: false, instruction: "" };
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      isFrustration: Boolean(parsed.isFrustration),
      instruction: typeof parsed.instruction === "string" ? parsed.instruction : "",
    };
  } catch {
    return { isFrustration: false, instruction: "" };
  }
}

classifyRouter.post("/api/classify-frustration", async (req, res) => {
  const text = req.body?.text as string | undefined;
  if (!text || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  let apiKey: string;
  try {
    apiKey = requireApiKey();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  try {
    const upstream = await fetch(`${SARVAM_HTTP_BASE}${SARVAM_CHAT_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey,
      },
      body: JSON.stringify({
        model: SARVAM_CHAT_MODEL,
        messages: [
          { role: "system", content: CLASSIFIER_PROMPT },
          { role: "user", content: text },
        ],
        stream: false,
        temperature: 0.1,
        max_tokens: 150,
        reasoning_effort: null,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      res.status(upstream.status || 502).json({ error: "classification failed", detail });
      return;
    }

    const json = (await upstream.json()) as { choices?: { message?: { content?: string } }[] };
    const content: string = json.choices?.[0]?.message?.content ?? "";
    const result = safeParse(content);
    console.log(`[classify] "${text}" ->`, result);
    res.json(result);
  } catch (err) {
    console.error("classify-frustration error", err);
    res.status(502).json({ error: (err as Error).message });
  }
});
