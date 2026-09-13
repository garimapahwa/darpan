import { useCallback, useEffect, useRef, useState } from "react";
import { debugLog } from "../lib/debugLog";
import { useConversation } from "../hooks/useConversation";
import { useEmotionEngine } from "../hooks/useEmotionEngine";
import { useFaceLandmarker } from "../hooks/useFaceLandmarker";
import { useFrustrationBridge, INJECTION_COUNTDOWN_MS } from "../hooks/useFrustrationBridge";
import { useMicStream } from "../hooks/useMicStream";
import { useSttSocket } from "../hooks/useSttSocket";
import { AvatarCanvas } from "./AvatarCanvas";
import { CallControls } from "./CallControls";
import { Captions } from "./Captions";
import { DebugPanel } from "./DebugPanel";
import { InjectionToast } from "./InjectionToast";
import { MockAgentPanel } from "./MockAgentPanel";
import { SelfView } from "./SelfView";

interface CallScreenProps {
  onEndCall: () => void;
}

export function CallScreen({ onEndCall }: CallScreenProps) {
  const [debugVisible, setDebugVisible] = useState(false);

  const { videoRef, error: faceError, blendshapes } = useFaceLandmarker(true);
  const { engine, snapshot } = useEmotionEngine(blendshapes);

  const conversation = useConversation(true, engine);
  const bridge = useFrustrationBridge(true, conversation.runAcknowledgement);

  const { ready: micReady, error: micError, muted, setMuted, onChunk } = useMicStream(true);

  const handleFinalTranscript = useCallback(
    (text: string) => {
      conversation.recordUserTranscript(text);
      bridge.handleTranscript(text, conversation.runNormalTurn);
    },
    [conversation, bridge],
  );

  const { partial, sendAudio } = useSttSocket(micReady, handleFinalTranscript);

  useEffect(() => {
    if (!micReady) return;
    return onChunk((base64) => {
      if (!muted) sendAudio(base64);
    });
  }, [micReady, muted, onChunk, sendAudio]);

  // See BubbleCallScreen for why this uses a ref instead of depending on the
  // whole `conversation` object directly.
  const latestRef = useRef({ speaking: conversation.speaking, partial, conversation });
  latestRef.current = { speaking: conversation.speaking, partial, conversation };

  useEffect(() => {
    engine.onBargeIn = () => latestRef.current.conversation.triggerBargeIn();
    engine.onReaction = (state, context) => {
      const { speaking, partial } = latestRef.current;
      debugLog("[bridge] onReaction fired:", state, context, "gate:", { speaking, partial });
      if (speaking || partial) return;
      latestRef.current.conversation.runReaction(state, context);
    };
    return () => {
      engine.onBargeIn = null;
      engine.onReaction = null;
    };
  }, [engine]);

  return (
    <div className="call-screen">
      <div className="call-screen__stage">
        <AvatarCanvas getAmplitude={conversation.getAmplitude} speaking={conversation.speaking} emotion={snapshot.state} />
        <SelfView videoRef={videoRef} emotion={snapshot.state} calibrating={snapshot.calibrating} faceError={faceError} />
      </div>

      <Captions userPartial={partial} aiCaption={conversation.aiCaption} speaking={conversation.speaking} />

      {micError && <div className="call-screen__banner">Mic unavailable: {micError}. Voice features are disabled.</div>}
      {faceError && <div className="call-screen__banner">Camera unavailable: {faceError}. Continuing voice-only.</div>}

      {bridge.pending && (
        <InjectionToast instruction={bridge.pending.instruction} countdownMs={INJECTION_COUNTDOWN_MS} onCancel={bridge.cancel} />
      )}

      <MockAgentPanel entries={bridge.agentLog} />

      <DebugPanel visible={debugVisible} scores={snapshot.scores} state={snapshot.state} calibrating={snapshot.calibrating} />

      <CallControls
        muted={muted}
        onToggleMute={() => setMuted(!muted)}
        onEndCall={onEndCall}
        onToggleDebug={() => setDebugVisible((v) => !v)}
        debugVisible={debugVisible}
      />
    </div>
  );
}
