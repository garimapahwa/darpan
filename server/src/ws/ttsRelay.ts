import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { SARVAM_TTS_MODEL, SARVAM_TTS_SPEAKER, SARVAM_WS_BASE, requireApiKey } from "../sarvamConfig.js";

/**
 * Bridges a browser WebSocket to Sarvam's Bulbul v3 streaming TTS WebSocket.
 * The browser sends {type:"config"} to (re)open a synthesis session,
 * {type:"text"} / {type:"flush"} to stream text, and {type:"stop"} to
 * immediately terminate synthesis (used for face-triggered barge-in).
 */
export function attachTtsRelay(wss: WebSocketServer, req: IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) {
  wss.handleUpgrade(req, socket, head, (client) => {
    let upstream: WebSocket | null = null;
    let apiKey: string;
    try {
      apiKey = requireApiKey();
    } catch (err) {
      client.close(1011, (err as Error).message);
      return;
    }

    // terminate() on a still-CONNECTING socket can itself emit an 'error'
    // event; stripping all listeners (including 'error') before calling it
    // leaves that error with no handler, which crashes the whole process.
    // Always leave a no-op 'error' listener attached through the teardown.
    function closeUpstream(ws: WebSocket) {
      ws.removeAllListeners("open");
      ws.removeAllListeners("message");
      ws.removeAllListeners("close");
      ws.removeAllListeners("error");
      ws.on("error", () => {});
      ws.terminate();
    }

    function openUpstream(cfg: Record<string, unknown>) {
      if (upstream) closeUpstream(upstream);

      const upstreamUrl = new URL(`${SARVAM_WS_BASE}/text-to-speech/ws`);
      upstreamUrl.searchParams.set("model", SARVAM_TTS_MODEL);

      const ws = new WebSocket(upstreamUrl, {
        headers: { "Api-Subscription-Key": apiKey },
      });
      upstream = ws;

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "config",
            data: {
              model: SARVAM_TTS_MODEL,
              language_code: cfg.language_code ?? "en-IN",
              speaker: cfg.speaker ?? SARVAM_TTS_SPEAKER,
              pace: cfg.pace ?? 1.0,
              temperature: cfg.temperature ?? 0.6,
              speech_sample_rate: "24000",
              output_audio_codec: "mp3",
              output_audio_bitrate: "128k",
            },
          }),
        );
      });

      ws.on("message", (data) => {
        if (client.readyState === WebSocket.OPEN) client.send(data.toString());
      });

      ws.on("close", () => {
        if (upstream === ws) upstream = null;
      });

      ws.on("error", (err) => {
        console.error("TTS upstream error", err.message);
      });
    }

    client.on("message", (data) => {
      let msg: { type?: string; data?: Record<string, unknown> };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "config") {
        openUpstream(msg.data ?? {});
        return;
      }

      if (msg.type === "stop") {
        if (upstream) {
          closeUpstream(upstream);
          upstream = null;
        }
        return;
      }

      if ((msg.type === "text" || msg.type === "flush") && upstream?.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify(msg));
      }
    });

    client.on("close", () => {
      if (upstream) {
        closeUpstream(upstream);
        upstream = null;
      }
    });

    client.on("error", () => {
      if (upstream) closeUpstream(upstream);
    });
  });
}
