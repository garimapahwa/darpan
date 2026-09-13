import { useCallback, useRef, useState } from "react";

const COOLDOWN_MS = 20000;
export const INJECTION_COUNTDOWN_MS = 1500;

interface ClassifyResponse {
  isFrustration: boolean;
  instruction: string;
}

interface PendingInjection {
  instruction: string;
}

export interface AgentLogEntry {
  id: string;
  text: string;
  mock: boolean;
  at: number;
}

let logIdCounter = 0;

interface UseFrustrationBridgeResult {
  pending: PendingInjection | null;
  /** Instructions that have been sent (or, on a non-macOS host, would have
   * been sent) to the coding agent, newest last — for the on-page mock
   * "agent" panel so the feature is demoable without a real VS Code. */
  agentLog: AgentLogEntry[];
  cancel: () => void;
  /** Classifies a final transcript. Calls onNotFrustration() itself (not the
   * normal reply) whenever this turn should fall back to a normal
   * conversational reply — not frustration, disabled, on cooldown, a failed
   * classify call, or the user hitting Cancel on the countdown toast. */
  handleTranscript: (text: string, onNotFrustration: () => void) => void;
}

/**
 * Listens to final user transcripts, asks the backend whether the user just
 * vented frustration at their coding agent, and — after a short cancelable
 * on-screen countdown — forwards it into VS Code via /api/inject instead of
 * letting the normal conversational reply run. On a non-macOS host (e.g. the
 * hosted web demo, which has no local VS Code to reach into), /api/inject
 * returns `mock: true` instead of actually typing anything — passed through
 * so runAcknowledgement can say so honestly instead of pretending it worked,
 * and recorded in agentLog for the on-page mock agent panel.
 */
export function useFrustrationBridge(
  enabled: boolean,
  runAcknowledgement: (instruction: string, mock: boolean) => void,
): UseFrustrationBridgeResult {
  const [pending, setPending] = useState<PendingInjection | null>(null);
  const [agentLog, setAgentLog] = useState<AgentLogEntry[]>([]);
  const lastInjectedAtRef = useRef(-Infinity);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const pendingFallbackRef = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setPending(null);
    pendingFallbackRef.current?.();
    pendingFallbackRef.current = null;
  }, []);

  const handleTranscript = useCallback(
    async (text: string, onNotFrustration: () => void) => {
      if (!enabled || Date.now() - lastInjectedAtRef.current < COOLDOWN_MS) {
        onNotFrustration();
        return;
      }

      let data: ClassifyResponse;
      try {
        const res = await fetch("/api/classify-frustration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          onNotFrustration();
          return;
        }
        data = await res.json();
      } catch (err) {
        console.error("classify-frustration failed", err);
        onNotFrustration();
        return;
      }

      if (!data.isFrustration || !data.instruction.trim()) {
        onNotFrustration();
        return;
      }

      cancelledRef.current = false;
      pendingFallbackRef.current = onNotFrustration;
      setPending({ instruction: data.instruction });

      timerRef.current = window.setTimeout(async () => {
        if (cancelledRef.current) return;
        pendingFallbackRef.current = null;
        setPending(null);
        lastInjectedAtRef.current = Date.now();

        let mock = true;
        try {
          const res = await fetch("/api/inject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: data.instruction }),
          });
          if (res.ok) {
            const body = await res.json();
            mock = Boolean(body.mock);
          } else {
            console.error("inject failed", await res.text().catch(() => ""));
          }
        } catch (err) {
          console.error("inject failed", err);
        }

        logIdCounter += 1;
        setAgentLog((log) => [...log, { id: `a${logIdCounter}`, text: data.instruction, mock, at: Date.now() }]);
        runAcknowledgement(data.instruction, mock);
      }, INJECTION_COUNTDOWN_MS);
    },
    [enabled, runAcknowledgement],
  );

  return { pending, agentLog, cancel, handleTranscript };
}
