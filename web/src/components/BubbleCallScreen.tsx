import { useCallback, useEffect, useRef } from "react";
import { debugLog } from "../lib/debugLog";
import { useConversation } from "../hooks/useConversation";
import { useEmotionEngine } from "../hooks/useEmotionEngine";
import { useFaceLandmarker } from "../hooks/useFaceLandmarker";
import { useFrustrationBridge, INJECTION_COUNTDOWN_MS } from "../hooks/useFrustrationBridge";
import { useMicStream } from "../hooks/useMicStream";
import { useSttSocket } from "../hooks/useSttSocket";
import { BubbleView } from "./BubbleView";
import { Captions } from "./Captions";
import { InjectionToast } from "./InjectionToast";

/**
 * The Loom-style floating bubble: just the user's own webcam in a small
 * always-on-top circle. All the STT / LLM / TTS / emotion-detection /
 * agent-bridge logic from CallScreen still runs underneath — only the
 * visible UI is reduced to the bubble.
 */
export function BubbleCallScreen() {
  const { videoRef, error: faceError, blendshapes } = useFaceLandmarker(true);
  const { engine, snapshot } = useEmotionEngine(blendshapes);

  const conversation = useConversation(true, engine);
  const bridge = useFrustrationBridge(true, conversation.runAcknowledgement);

  const { muted, setMuted, onChunk } = useMicStream(true);

  const handleFinalTranscript = useCallback(
    (text: string) => {
      conversation.recordUserTranscript(text);
      bridge.handleTranscript(text, conversation.runNormalTurn);
    },
    [conversation, bridge],
  );

  const { partial, sendAudio } = useSttSocket(true, handleFinalTranscript);

  useEffect(() => {
    return onChunk((base64) => {
      if (!muted) sendAudio(base64);
    });
  }, [muted, onChunk, sendAudio]);

  // Engine callbacks are set up once per engine instance (not re-subscribed
  // every render) and read fresh state via a ref — re-subscribing on every
  // render (e.g. depending on the whole `conversation` object, which is a
  // new object literal each render) creates a window, within the same React
  // commit, where the callback is briefly null right as the engine's own
  // update effect runs — which is exactly what silently dropped every
  // spontaneous-reaction and barge-in firing before this fix.
  const latestRef = useRef({ speaking: conversation.speaking, partial, conversation });
  latestRef.current = { speaking: conversation.speaking, partial, conversation };

  useEffect(() => {
    engine.onBargeIn = () => latestRef.current.conversation.triggerBargeIn();
    engine.onReaction = (state, context) => {
      const { speaking, partial } = latestRef.current;
      debugLog("[bridge] onReaction fired:", state, context, "gate:", { speaking, partial });
      // Don't interrupt an in-progress reply, and don't jump in mid-sentence.
      if (speaking || partial) return;
      latestRef.current.conversation.runReaction(state, context);
    };
    return () => {
      engine.onBargeIn = null;
      engine.onReaction = null;
    };
  }, [engine]);

  const handleQuit = useCallback(() => {
    window.close();
  }, []);

  return (
    <div className="bubble-root">
      <BubbleView
        videoRef={videoRef}
        emotion={snapshot.state}
        calibrating={snapshot.calibrating}
        muted={muted}
        onToggleMute={() => setMuted(!muted)}
        onQuit={handleQuit}
        cameraError={faceError}
      />
      {bridge.pending ? (
        <InjectionToast instruction={bridge.pending.instruction} countdownMs={INJECTION_COUNTDOWN_MS} onCancel={bridge.cancel} />
      ) : (
        <Captions userPartial={partial} aiCaption={conversation.aiCaption} speaking={conversation.speaking} />
      )}
    </div>
  );
}
