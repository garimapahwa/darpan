import type { EmotionScores, EmotionState } from "../types";

interface DebugPanelProps {
  visible: boolean;
  scores: EmotionScores;
  state: EmotionState;
  calibrating: boolean;
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="debug-bar">
      <span className="debug-bar__label">{label}</span>
      <div className="debug-bar__track">
        <div className="debug-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="debug-bar__value">{value.toFixed(2)}</span>
    </div>
  );
}

export function DebugPanel({ visible, scores, state, calibrating }: DebugPanelProps) {
  if (!visible) return null;
  return (
    <div className="debug-panel">
      <div className="debug-panel__header">
        <strong>emotion debug</strong>
        <span>{calibrating ? "calibrating" : `state: ${state}`}</span>
      </div>
      <Bar label="sad" value={scores.sad} />
      <Bar label="confused" value={scores.confused} />
      <Bar label="happy" value={scores.happy} />
    </div>
  );
}
