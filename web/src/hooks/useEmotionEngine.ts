import { useEffect, useRef, useState } from "react";
import type { BlendshapeMap } from "../lib/blendshapes";
import { EmotionEngine } from "../lib/emotionEngine";
import type { EmotionSnapshot } from "../types";

interface UseEmotionEngineResult {
  engine: EmotionEngine;
  snapshot: EmotionSnapshot & { calibrating: boolean };
}

export function useEmotionEngine(blendshapes: BlendshapeMap | null): UseEmotionEngineResult {
  const engineRef = useRef<EmotionEngine>();
  if (!engineRef.current) engineRef.current = new EmotionEngine();

  const [snapshot, setSnapshot] = useState(() => engineRef.current!.getSnapshot());

  useEffect(() => {
    const now = performance.now();
    engineRef.current!.update(blendshapes, now);
    setSnapshot(engineRef.current!.getSnapshot());
  }, [blendshapes]);

  return { engine: engineRef.current, snapshot };
}
