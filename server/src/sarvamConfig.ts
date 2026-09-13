export const SARVAM_HTTP_BASE = "https://api.sarvam.ai";
export const SARVAM_WS_BASE = "wss://api.sarvam.ai";

export const SARVAM_STT_MODEL = "saaras:v3-realtime";
// v2/chat/completions (glm5.2, gemma4) is beta-gated and not enabled on all accounts;
// v1/chat/completions with sarvam-105b is generally available and used instead.
export const SARVAM_CHAT_ENDPOINT = "/v1/chat/completions";
export const SARVAM_CHAT_MODEL = "sarvam-105b";
export const SARVAM_TTS_MODEL = "bulbul:v3";
export const SARVAM_TTS_SPEAKER = "shubh";

/** Read lazily (not at import time) so it reflects .env loading, which happens
 * after this module is evaluated due to ES module import hoisting. */
export function requireApiKey(): string {
  const key = process.env.SARVAM_API_KEY ?? "";
  if (!key) {
    throw new Error("SARVAM_API_KEY is not set. Copy .env.example to .env and fill it in.");
  }
  return key;
}
