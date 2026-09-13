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

interface UseFrustrationBridgeResult {
  pending: PendingInjection | null;
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
 * letting the normal conversational reply run.
 */
export function useFrustrationBridge(
  enabled: boolean,
  runAcknowledgement: (instruction: string) => void,
): UseFrustrationBridgeResult {
  const [pending, setPending] = useState<PendingInjection | null>(null);
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

        try {
          const res = await fetch("/api/inject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: data.instruction }),
          });
          if (!res.ok) {
            console.error("inject failed", await res.text().catch(() => ""));
          }
        } catch (err) {
          console.error("inject failed", err);
        }

        runAcknowledgement(data.instruction);
      }, INJECTION_COUNTDOWN_MS);
    },
    [enabled, runAcknowledgement],
  );

  return { pending, cancel, handleTranscript };
}
