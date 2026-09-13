import { useCallback, useEffect, useRef, useState } from "react";
import { float32ToInt16, int16ToBase64 } from "../lib/pcm";

const SAMPLE_RATE = 16000;
const WORKLET_URL = new URL("../worklets/pcm-processor.js", import.meta.url);

interface UseMicStreamResult {
  ready: boolean;
  error: string | null;
  muted: boolean;
  setMuted: (m: boolean) => void;
  /** Subscribe to base64-encoded 16kHz PCM16 mono chunks (~100ms each). */
  onChunk: (cb: (base64: string) => void) => () => void;
}

export function useMicStream(enabled: boolean): UseMicStreamResult {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const listenersRef = useRef(new Set<(base64: string) => void>());
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
        contextRef.current = ctx;
        await ctx.audioWorklet.addModule(WORKLET_URL);

        if (ctx.state === "suspended") await ctx.resume();

        const source = ctx.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(ctx, "pcm-processor");
        node.port.onmessage = (event: MessageEvent<Float32Array>) => {
          if (mutedRef.current) return;
          const base64 = int16ToBase64(float32ToInt16(event.data));
          for (const cb of listenersRef.current) cb(base64);
        };
        source.connect(node);

        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    setup();

    return () => {
      cancelled = true;
      contextRef.current?.close();
      contextRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  const onChunk = useCallback((cb: (base64: string) => void) => {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }, []);

  return { ready, error, muted, setMuted, onChunk };
}
