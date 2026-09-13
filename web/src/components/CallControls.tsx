interface CallControlsProps {
  muted: boolean;
  onToggleMute: () => void;
  onEndCall: () => void;
  onToggleDebug: () => void;
  debugVisible: boolean;
}

export function CallControls({ muted, onToggleMute, onEndCall, onToggleDebug, debugVisible }: CallControlsProps) {
  return (
    <div className="call-controls">
      <button className={`call-controls__btn ${muted ? "call-controls__btn--active" : ""}`} onClick={onToggleMute}>
        {muted ? "Unmute" : "Mute"}
      </button>
      <button className="call-controls__btn call-controls__btn--end" onClick={onEndCall}>
        End call
      </button>
      <button
        className={`call-controls__btn ${debugVisible ? "call-controls__btn--active" : ""}`}
        onClick={onToggleDebug}
      >
        Debug
      </button>
    </div>
  );
}
