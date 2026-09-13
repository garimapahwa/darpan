import type { RefObject } from "react";
import type { EmotionState } from "../types";

interface BubbleViewProps {
  videoRef: RefObject<HTMLVideoElement>;
  emotion: EmotionState;
  calibrating: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onQuit: () => void;
  cameraError: string | null;
}

const RING_COLOR: Record<EmotionState, string> = {
  neutral: "#3fb950",
  happy: "#3fb950",
  sad: "#f0883e",
  confused: "#f85149",
};

export function BubbleView({ videoRef, emotion, calibrating, muted, onToggleMute, onQuit, cameraError }: BubbleViewProps) {
  const ringColor = calibrating ? "#8b949e" : RING_COLOR[emotion];

  return (
    <div className="bubble" style={{ boxShadow: `0 0 0 3px ${ringColor}, 0 4px 16px rgba(0,0,0,0.4)` }}>
      {cameraError ? (
        <div className="bubble__fallback">🎙️</div>
      ) : (
        <video ref={videoRef} className="bubble__video" muted playsInline />
      )}

      <button className="bubble__quit" onClick={onQuit} title="Quit Darpan">
        ×
      </button>

      <button
        className={`bubble__mute ${muted ? "bubble__mute--active" : ""}`}
        onClick={onToggleMute}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🎤"}
      </button>
    </div>
  );
}
