export type EmotionState = "neutral" | "happy" | "sad" | "confused";

export interface EmotionScores {
  sad: number;
  confused: number;
  happy: number;
}

export interface EmotionSnapshot {
  state: EmotionState;
  scores: EmotionScores;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TranscriptEntry {
  id: string;
  speaker: "user" | "ai";
  text: string;
  final: boolean;
}
