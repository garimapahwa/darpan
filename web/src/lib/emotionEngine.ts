import { emptyBaseline, scoreFrame, type BlendshapeMap } from "./blendshapes";
import { debugLog, verboseLog } from "./debugLog";
import type { EmotionScores, EmotionSnapshot, EmotionState } from "../types";

const CALIBRATION_MS = 5000;
const ROLLING_WINDOW_MS = 2500;
const STATE_DEBOUNCE_MS = 800;
const STATE_THRESHOLD = 0.35;

// Barge-in needs to react within a ~3-5s reply, not average over the full
// 2.5s ambient window (which would dilute a frown started mid-answer down
// to a fraction of its real value for over a second). It gets its own short
// window instead. Threshold is also lower than the 0.6 originally guessed —
// mouthFrown blendshapes run weaker than mouthSmile ones in practice.
const BARGE_IN_WINDOW_MS = 500;
const BARGE_IN_THRESHOLD = 0.4;
const BARGE_IN_DEBOUNCE_MS = 350;
const BARGE_IN_COOLDOWN_MS = 20000;

const POST_AI_WINDOW_MS = 3000;

const REACTION_COOLDOWN_MS = 20000;

export type ReactionContext = "post-ai" | "ambient";

function dominantState(scores: EmotionScores): EmotionState {
  const candidates: [EmotionState, number][] = [
    ["sad", scores.sad],
    ["confused", scores.confused],
    ["happy", scores.happy],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  const [top, topScore] = candidates[0];
  return topScore >= STATE_THRESHOLD ? top : "neutral";
}

export class EmotionEngine {
  private baseline: BlendshapeMap = emptyBaseline();
  private baselineSamples: BlendshapeMap[] = [];
  private calibrationStart: number | null = null;
  private calibrating = true;

  private buffer: { t: number; scores: EmotionScores }[] = [];
  private firedState: EmotionState = "neutral";
  private candidateState: EmotionState | null = null;
  private candidateSince = 0;

  private bargeCandidateSince: number | null = null;
  private lastBargeInAt = -Infinity;

  private aiSpeaking = false;
  private aiSpeakingEndedAt: number | null = null;
  private lastReactionAt = -Infinity;

  onBargeIn: (() => void) | null = null;
  /** Fired immediately when a sustained happy/sad/confused expression shows
   * up — either right after/during the AI's own answer ("post-ai", a signal
   * about that answer) or with no AI turn involved at all ("ambient"). */
  onReaction: ((state: "happy" | "sad" | "confused", context: ReactionContext) => void) | null = null;

  private lastDebugLogAt = -Infinity;
  private lastBargeDebugAt = -Infinity;

  update(map: BlendshapeMap | null, now: number) {
    if (this.calibrationStart === null) this.calibrationStart = now;

    if (this.calibrating) {
      if (map) this.baselineSamples.push(map);
      if (now - this.calibrationStart >= CALIBRATION_MS) {
        this.finalizeBaseline();
        debugLog("[emotion] calibration done");
        verboseLog("[emotion] baseline:", this.baseline);
      }
      return;
    }

    if (!map) {
      if (now - this.lastDebugLogAt > 1000) {
        this.lastDebugLogAt = now;
        verboseLog("[emotion] no face detected this frame");
      }
      return;
    }

    const raw = scoreFrame(map, this.baseline);
    this.buffer.push({ t: now, scores: raw });
    while (this.buffer.length && now - this.buffer[0].t > ROLLING_WINDOW_MS) {
      this.buffer.shift();
    }

    const smoothed = this.smoothedScores();
    const candidate = dominantState(smoothed);

    if (now - this.lastDebugLogAt > 1000) {
      this.lastDebugLogAt = now;
      verboseLog("[emotion] smoothed:", smoothed, "candidate:", candidate, "fired:", this.firedState);
    }

    if (candidate !== this.candidateState) {
      this.candidateState = candidate;
      this.candidateSince = now;
    } else if (candidate !== this.firedState && now - this.candidateSince >= STATE_DEBOUNCE_MS) {
      this.firedState = candidate;
      debugLog("[emotion] state changed ->", candidate);

      if (candidate !== "neutral") {
        const context: ReactionContext = this.isInPostAiWindow(now) ? "post-ai" : "ambient";
        const cooledDown = now - this.lastReactionAt >= REACTION_COOLDOWN_MS;
        debugLog("[emotion] reaction check:", context, "cooledDown =", cooledDown, "hasHandler =", Boolean(this.onReaction));
        if (cooledDown) {
          this.lastReactionAt = now;
          this.onReaction?.(candidate, context);
        }
      }
    }

    this.checkBargeIn(this.shortSmoothedScores(now), now);
  }

  private finalizeBaseline() {
    this.calibrating = false;
    if (this.baselineSamples.length === 0) return;
    const keys = Object.keys(this.baselineSamples[0]);
    const avg: BlendshapeMap = {};
    for (const k of keys) {
      avg[k] = this.baselineSamples.reduce((sum, s) => sum + (s[k] ?? 0), 0) / this.baselineSamples.length;
    }
    this.baseline = avg;
    this.baselineSamples = [];
  }

  private smoothedScores(): EmotionScores {
    if (this.buffer.length === 0) return { sad: 0, confused: 0, happy: 0 };
    const sum = this.buffer.reduce(
      (acc, b) => ({
        sad: acc.sad + b.scores.sad,
        confused: acc.confused + b.scores.confused,
        happy: acc.happy + b.scores.happy,
      }),
      { sad: 0, confused: 0, happy: 0 },
    );
    const n = this.buffer.length;
    return { sad: sum.sad / n, confused: sum.confused / n, happy: sum.happy / n };
  }

  /** Same as smoothedScores() but over BARGE_IN_WINDOW_MS instead of the
   * full 2.5s ambient window — barge-in needs to react within seconds of a
   * reply starting, not average a frown down across the whole buffer. */
  private shortSmoothedScores(now: number): EmotionScores {
    const recent = this.buffer.filter((b) => now - b.t <= BARGE_IN_WINDOW_MS);
    if (recent.length === 0) return { sad: 0, confused: 0, happy: 0 };
    const sum = recent.reduce(
      (acc, b) => ({
        sad: acc.sad + b.scores.sad,
        confused: acc.confused + b.scores.confused,
        happy: acc.happy + b.scores.happy,
      }),
      { sad: 0, confused: 0, happy: 0 },
    );
    const n = recent.length;
    return { sad: sum.sad / n, confused: sum.confused / n, happy: sum.happy / n };
  }

  private checkBargeIn(smoothed: EmotionScores, now: number) {
    if (!this.aiSpeaking) {
      this.bargeCandidateSince = null;
      return;
    }
    const negative = Math.max(smoothed.sad, smoothed.confused);

    // Bounded to AI-speaking stretches only, so it's quiet at idle but still
    // shows the real numbers needed to tune BARGE_IN_THRESHOLD.
    if (now - this.lastBargeDebugAt > 1000) {
      this.lastBargeDebugAt = now;
      debugLog(
        "[emotion] (ai speaking) negative:",
        negative.toFixed(2),
        "threshold:",
        BARGE_IN_THRESHOLD,
        "sad:",
        smoothed.sad.toFixed(2),
        "confused:",
        smoothed.confused.toFixed(2),
      );
    }

    if (negative >= BARGE_IN_THRESHOLD) {
      if (this.bargeCandidateSince === null) {
        this.bargeCandidateSince = now;
        debugLog("[emotion] barge-in candidate, negative score:", negative.toFixed(2));
      }
      const sustained = now - this.bargeCandidateSince >= BARGE_IN_DEBOUNCE_MS;
      const cooledDown = now - this.lastBargeInAt >= BARGE_IN_COOLDOWN_MS;
      if (sustained && cooledDown) {
        this.lastBargeInAt = now;
        this.bargeCandidateSince = null;
        debugLog("[emotion] BARGE-IN firing, hasHandler =", Boolean(this.onBargeIn));
        this.onBargeIn?.();
      }
    } else {
      this.bargeCandidateSince = null;
    }
  }

  private isInPostAiWindow(now: number): boolean {
    if (this.aiSpeaking) return true;
    if (this.aiSpeakingEndedAt === null) return false;
    return now - this.aiSpeakingEndedAt < POST_AI_WINDOW_MS;
  }

  setAiSpeaking(speaking: boolean, now = performance.now()) {
    if (this.aiSpeaking && !speaking) this.aiSpeakingEndedAt = now;
    this.aiSpeaking = speaking;
  }

  /** Emotion state to tag onto the user's just-finished utterance. */
  getCurrentTag(): EmotionState {
    return this.firedState;
  }

  getSnapshot(): EmotionSnapshot & { calibrating: boolean } {
    return {
      state: this.firedState,
      scores: this.smoothedScores(),
      calibrating: this.calibrating,
    };
  }
}
