import { useCallback, useEffect, useRef, useState } from "react";

interface SttEvent {
  event: "transcript.partial" | "transcript.final" | string;
  text?: string;
}

interface UseSttSocketResult {
  connected: boolean;
  partial: string;
  sendAudio: (base64: string) => void;
}

export function useSttSocket(enabled: boolean, onFinal: (text: string) => void): UseSttSocketResult {
  const [connected, setConnected] = useState(false);
  const [partial, setPartial] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    if (!enabled) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/stt?language_code=en-IN`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      let msg: SttEvent;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.event === "transcript.partial" && typeof msg.text === "string") {
        setPartial(msg.text);
      } else if (msg.event === "transcript.final" && typeof msg.text === "string") {
        setPartial("");
        if (msg.text.trim()) onFinalRef.current(msg.text.trim());
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
      setPartial("");
    };
  }, [enabled]);

  const sendAudio = useCallback((base64: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: "audio_input", audio: base64 }));
    }
  }, []);

  return { connected, partial, sendAudio };
}
