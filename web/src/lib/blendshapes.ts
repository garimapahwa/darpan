import type { EmotionScores } from "../types";

export type BlendshapeMap = Record<string, number>;

const TRACKED = [
  "mouthFrownLeft",
  "mouthFrownRight",
  "browDownLeft",
  "browDownRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "mouthSmileLeft",
  "mouthSmileRight",
] as const;

export function toBlendshapeMap(categories: { categoryName: string; score: number }[]): BlendshapeMap {
  const map: BlendshapeMap = {};
  for (const c of categories) {
    if ((TRACKED as readonly string[]).includes(c.categoryName)) {
      map[c.categoryName] = c.score;
    }
  }
  return map;
}

export function emptyBaseline(): BlendshapeMap {
  return Object.fromEntries(TRACKED.map((k) => [k, 0]));
}

/** Raw (un-smoothed, baseline-subtracted) emotion scores for a single frame. */
export function scoreFrame(map: BlendshapeMap, baseline: BlendshapeMap): EmotionScores {
  const g = (k: string) => Math.max(0, (map[k] ?? 0) - (baseline[k] ?? 0));

  const frown = g("mouthFrownLeft") + g("mouthFrownRight");
  const browDown = g("browDownLeft") + g("browDownRight");
  const squint = g("eyeSquintLeft") + g("eyeSquintRight");
  const smile = g("mouthSmileLeft") + g("mouthSmileRight");

  const sad = 0.6 * frown + 0.4 * browDown;
  const confused = Math.max(0, 0.5 * browDown + 0.5 * squint - 0.6 * smile);
  const happy = smile;

  return { sad, confused, happy };
}

export const TRACKED_BLENDSHAPES: readonly string[] = TRACKED;
