import type { RefObject } from "react";
import type { EmotionState } from "../types";

interface SelfViewProps {
  videoRef: RefObject<HTMLVideoElement>;
  emotion: EmotionState;
  calibrating: boolean;
  faceError: string | null;
}

const RING_COLOR: Record<EmotionState, string> = {
  neutral: "#3fb950",
  happy: "#3fb950",
  sad: "#f0883e",
  confused: "#f85149",
};

export function SelfView({ videoRef, emotion, calibrating, faceError }: SelfViewProps) {
  return (
    <div className="self-view" style={{ boxShadow: `0 0 0 3px ${RING_COLOR[emotion]}` }}>
      <video ref={videoRef} className="self-view__video" muted playsInline />
      {calibrating && <div className="self-view__badge">Calibrating…</div>}
      {faceError && <div className="self-view__badge self-view__badge--error">Camera unavailable</div>}
    </div>
  );
}
