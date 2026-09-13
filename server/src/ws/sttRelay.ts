import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { SARVAM_STT_MODEL, SARVAM_WS_BASE, requireApiKey } from "../sarvamConfig.js";

/**
 * Bridges a browser WebSocket (raw JSON audio_input/transcript events) to
 * Sarvam's realtime STT WebSocket. One upstream connection per browser
 * connection; both are torn down together.
 */
export function attachSttRelay(wss: WebSocketServer, req: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) {
  wss.handleUpgrade(req, socket, head, (client) => {
    const url = new URL(req.url ?? "/ws/stt", "http://localhost");
    const languageCode = url.searchParams.get("language_code") ?? "en-IN";

    let apiKey: string;
    try {
      apiKey = requireApiKey();
    } catch (err) {
      client.close(1011, (err as Error).message);
      return;
    }

    const upstreamUrl = new URL(`${SARVAM_WS_BASE}/speech-to-text-realtime/ws`);
    upstreamUrl.searchParams.set("language_code", languageCode);
    upstreamUrl.searchParams.set("model", SARVAM_STT_MODEL);
    upstreamUrl.searchParams.set("stream_type", "balanced");
    upstreamUrl.searchParams.set("endpointing", "vad");

    const upstream = new WebSocket(upstreamUrl, {
      headers: { "api-subscription-key": apiKey },
    });

    const pending: string[] = [];
    let upstreamOpen = false;

    upstream.on("open", () => {
      upstreamOpen = true;
      for (const msg of pending.splice(0)) upstream.send(msg);
    });

    upstream.on("message", (data) => {
      if (client.readyState === WebSocket.OPEN) client.send(data.toString());
    });

    upstream.on("close", () => {
      if (client.readyState === WebSocket.OPEN) client.close();
    });

    upstream.on("error", (err) => {
      console.error("STT upstream error", err.message);
      if (client.readyState === WebSocket.OPEN) client.close(1011, "upstream error");
    });

    client.on("message", (data) => {
      const msg = data.toString();
      if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
        upstream.send(msg);
      } else {
        pending.push(msg);
      }
    });

    client.on("close", () => {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close();
      }
    });

    client.on("error", () => {
      upstream.close();
    });
  });
}
