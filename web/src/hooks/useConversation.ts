import { useCallback, useRef, useState } from "react";
import { debugLog } from "../lib/debugLog";
import type { EmotionEngine, ReactionContext } from "../lib/emotionEngine";
import { BARGE_IN_NOTE, SYSTEM_PROMPT } from "../lib/systemPrompt";
import type { ChatMessage, TranscriptEntry } from "../types";
import { useTtsPlayback } from "./useTtsPlayback";

const SENTENCE_BREAK = /(?<=[.!?।\n])\s+/;

const ACKNOWLEDGEMENT_PHRASES = [
  "Got it — telling your agent now.",
  "Okay, passing that along to your agent.",
  "Samajh gaya, agent ko bata raha hoon.",
];

// Used on hosts with no local VS Code to actually type into (e.g. the
// hosted web demo) — honest about it being a demo rather than pretending.
const MOCK_ACKNOWLEDGEMENT_PHRASES = [
  "Got it — on the desktop app, this would go straight to your agent now.",
  "Noted — in the real app this gets typed into your coding agent for you.",
];

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `t${idCounter}`;
}

interface UseConversationResult {
  transcript: TranscriptEntry[];
  aiCaption: string;
  speaking: boolean;
  ttsConnected: boolean;
  /** Records a final user transcript into history/UI without starting a reply yet. */
  recordUserTranscript: (text: string) => void;
  /** Runs the normal conversational reply for whatever's been recorded so far. */
  runNormalTurn: () => void;
  triggerBargeIn: () => void;
  /** Speaks a short, fixed acknowledgement instead of a full LLM reply — used
   * when the user's message is being forwarded to their coding agent instead
   * of answered directly. Bypasses the LLM so it can't ignore the "don't try
   * to fix it yourself" instruction and improvise an apology instead. `mock`
   * is true when there was no real VS Code to inject into (e.g. the hosted
   * web demo) — the phrase says so honestly instead of claiming it worked. */
  runAcknowledgement: (instruction: string, mock: boolean) => void;
  /** Has the AI comment on a sustained facial expression — either a reaction
   * to its own last answer ("post-ai") or unprompted/ambient. */
  runReaction: (state: "happy" | "sad" | "confused", context: ReactionContext) => void;
  getAmplitude: () => number;
}

export function useConversation(enabled: boolean, engine: EmotionEngine): UseConversationResult {
  const historyRef = useRef<ChatMessage[]>([{ role: "system", content: SYSTEM_PROMPT }]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [aiCaption, setAiCaption] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const { speaking, connected: ttsConnected, startTurn, sendText, endTurn, stopTurn, getAmplitude } = useTtsPlayback(
    enabled,
    () => engine.setAiSpeaking(false),
  );

  const runTurn = useCallback(
    async (extraSystemNote?: string) => {
      debugLog("[conversation] runTurn starting, note:", extraSystemNote, "ttsConnected:", ttsConnected);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const messages = [...historyRef.current];
      if (extraSystemNote) messages.push({ role: "system", content: extraSystemNote });

      engine.setAiSpeaking(true);
      startTurn();
      setAiCaption("");

      let full = "";
      let sentenceBuffer = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
          signal: controller.signal,
        });
        debugLog("[conversation] /api/chat responded:", res.status, "hasBody:", Boolean(res.body));
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const delta: string | undefined = json.choices?.[0]?.delta?.content;
              if (delta) {
                full += delta;
                sentenceBuffer += delta;
                setAiCaption(full);

                const parts = sentenceBuffer.split(SENTENCE_BREAK);
                if (parts.length > 1) {
                  sentenceBuffer = parts.pop() ?? "";
                  const ready = parts.join(" ").trim();
                  if (ready) sendText(ready);
                }
              }
            } catch {
              // ignore malformed SSE line
            }
          }
        }

        if (sentenceBuffer.trim()) sendText(sentenceBuffer.trim());
        endTurn();

        if (full.trim()) {
          historyRef.current.push({ role: "assistant", content: full.trim() });
          setTranscript((t) => [...t, { id: nextId(), speaker: "ai", text: full.trim(), final: true }]);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error("chat turn failed", err);
      }
    },
    [engine, startTurn, sendText, endTurn, ttsConnected],
  );

  const recordUserTranscript = useCallback(
    (text: string) => {
      const tag = engine.getCurrentTag();
      const content = tag !== "neutral" ? `${text} [facial expression while speaking: ${tag}]` : text;
      historyRef.current.push({ role: "user", content });
      setTranscript((t) => [...t, { id: nextId(), speaker: "user", text, final: true }]);
    },
    [engine],
  );

  const runNormalTurn = useCallback(() => {
    runTurn();
  }, [runTurn]);

  const triggerBargeIn = useCallback(() => {
    abortRef.current?.abort();
    stopTurn();
    engine.setAiSpeaking(false);
    runTurn(BARGE_IN_NOTE);
  }, [engine, stopTurn, runTurn]);

  const runAcknowledgement = useCallback(
    (instruction: string, mock: boolean) => {
      abortRef.current?.abort();
      stopTurn();
      debugLog("[bridge] forwarding to agent:", instruction, "mock:", mock);

      const pool = mock ? MOCK_ACKNOWLEDGEMENT_PHRASES : ACKNOWLEDGEMENT_PHRASES;
      const phrase = pool[Math.floor(Math.random() * pool.length)];
      engine.setAiSpeaking(true);
      startTurn();
      setAiCaption(phrase);
      sendText(phrase);
      endTurn();

      historyRef.current.push({ role: "assistant", content: phrase });
      setTranscript((t) => [...t, { id: nextId(), speaker: "ai", text: phrase, final: true }]);
    },
    [engine, stopTurn, startTurn, sendText, endTurn],
  );

  const runReaction = useCallback(
    (state: "happy" | "sad" | "confused", context: ReactionContext) => {
      const feeling = state === "sad" ? "sadness" : state === "confused" ? "confusion" : "happiness";
      const note =
        context === "post-ai"
          ? state === "happy"
            ? `[The user's face showed happiness/satisfaction right after your last answer — they seem pleased with it. Briefly and warmly acknowledge that in ONE short natural sentence before continuing. Do not mention cameras or emotion detection mechanically — react like an attentive human would.]`
            : `[The user's face showed ${feeling} in reaction to your last answer. They may be dissatisfied or lost. Acknowledge it naturally, then simplify or change approach. Do not mention cameras or emotion detection mechanically — react like an attentive human would.]`
          : `[The user's face just showed ${feeling}, unprompted — no one said anything. Comment on it briefly and warmly in ONE short natural sentence, like an attentive friend noticing, matching their usual language style (English/Hindi/Hinglish). Do not mention cameras or emotion detection mechanically.]`;
      runTurn(note);
    },
    [runTurn],
  );

  return {
    transcript,
    aiCaption,
    speaking,
    ttsConnected,
    recordUserTranscript,
    runNormalTurn,
    triggerBargeIn,
    runAcknowledgement,
    runReaction,
    getAmplitude,
  };
}
