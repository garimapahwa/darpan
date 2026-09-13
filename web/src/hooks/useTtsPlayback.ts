import { useCallback, useEffect, useRef, useState } from "react";
import { AudioStreamPlayer } from "../lib/audioQueue";

interface TtsMessage {
  type: "audio" | "event" | string;
  data?: { content_type?: string; audio?: string; event_type?: string };
}

interface UseTtsPlaybackResult {
  speaking: boolean;
  connected: boolean;
  startTurn: () => void;
  sendText: (text: string) => void;
  endTurn: () => void;
  stopTurn: () => void;
  getAmplitude: () => number;
}

export function useTtsPlayback(enabled: boolean, onTurnEnded?: () => void): UseTtsPlaybackResult {
  const [speaking, setSpeaking] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<AudioStreamPlayer | null>(null);
  const onTurnEndedRef = useRef(onTurnEnded);
  onTurnEndedRef.current = onTurnEnded;

  useEffect(() => {
    if (!enabled) return;
    const player = new AudioStreamPlayer();
    player.onEnded = () => {
      setSpeaking(false);
      onTurnEndedRef.current?.();
    };
    playerRef.current = player;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/tts`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      let msg: TtsMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "audio" && msg.data?.audio) {
        playerRef.current?.pushChunk(msg.data.audio);
      } else if (msg.type === "event" && msg.data?.event_type === "final") {
        playerRef.current?.finish();
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      player.stop();
      playerRef.current = null;
      setConnected(false);
      setSpeaking(false);
    };
  }, [enabled]);

  const startTurn = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    playerRef.current?.start();
    setSpeaking(true);
    ws.send(JSON.stringify({ type: "config", data: { language_code: "en-IN", speaker: "shubh" } }));
  }, []);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return;
    ws.send(JSON.stringify({ type: "text", data: { text } }));
  }, []);

  const endTurn = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "flush" }));
  }, []);

  const stopTurn = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
    playerRef.current?.stop();
    setSpeaking(false);
  }, []);

  const getAmplitude = useCallback(() => playerRef.current?.getAmplitude() ?? 0, []);

  return { speaking, connected, startTurn, sendText, endTurn, stopTurn, getAmplitude };
}
