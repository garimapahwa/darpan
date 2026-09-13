import { useState } from "react";
import { BubbleCallScreen } from "./components/BubbleCallScreen";
import { CallScreen } from "./components/CallScreen";

const IS_ELECTRON = navigator.userAgent.toLowerCase().includes("electron");

export default function App() {
  const [inCall, setInCall] = useState(false);

  if (IS_ELECTRON) {
    // Overlay mode: opens straight into the floating bubble, no lobby gate.
    return <BubbleCallScreen />;
  }

  if (!inCall) {
    return (
      <div className="lobby">
        <div className="lobby__card">
          <h1>Darpan</h1>
          <p>An AI video call that notices how you're feeling — and adapts.</p>
          <button className="lobby__join" onClick={() => setInCall(true)}>
            Start call
          </button>
          <p className="lobby__hint">You'll be asked for camera and microphone access.</p>
        </div>
      </div>
    );
  }

  return <CallScreen onEndCall={() => setInCall(false)} />;
}
