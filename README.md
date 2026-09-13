# Darpan (दर्पण — "mirror")

An emotion-aware AI video call. You talk to an animated avatar over a video-call-style UI; it
hears you via Sarvam speech-to-text, replies via a Sarvam LLM, and speaks back via Sarvam Bulbul
v3 text-to-speech. Meanwhile, your webcam is analyzed fully in-browser (MediaPipe Face Landmarker)
to detect sadness/confusion/happiness in your expression — no video ever leaves your device, only
short derived text notes do. If you look lost or unhappy while the AI is talking, it notices and
adapts; a strong enough reaction mid-answer interrupts the AI so it can immediately try again.

## Stack

- **Frontend**: React + Vite + TypeScript (`web/`)
- **Backend**: Node + Express + `ws` (`server/`) — holds the Sarvam API key, proxies chat
  completions (SSE) and relays two WebSocket streams (STT, TTS) so the key never reaches the
  browser.
- **Face analysis**: `@mediapipe/tasks-vision` Face Landmarker with blendshapes, entirely
  client-side.
- **Voice + language AI**: [Sarvam AI](https://docs.sarvam.ai) — `saaras:v3-realtime` for
  streaming STT, `/v1/chat/completions` (model `sarvam-105b`) for the LLM, Bulbul v3 for streaming
  TTS. (`/v2/chat/completions`, which serves `glm5.2`, is beta-gated and may not be enabled on
  your account — swap `SARVAM_CHAT_ENDPOINT`/`SARVAM_CHAT_MODEL` in `server/src/sarvamConfig.ts`
  if you have access.)

## Setup

```bash
npm install
cp .env.example .env   # then fill in SARVAM_API_KEY
```

## Run

```bash
npm run dev
```

This starts the backend on `http://localhost:8787` and the frontend on `http://localhost:5173`
(Vite proxies `/api` and `/ws` to the backend). Open the frontend URL, click **Start call**, and
grant camera + microphone permissions.

- Deny the camera and the call still works as a voice-only conversation.
- Deny the microphone and you'll see an inline error; the avatar and camera view still load.

## How the emotion loop works

1. The first 5 seconds of a call establish a neutral-face baseline per user (some people have a
   resting frown/squint) — blendshape scores are measured relative to that baseline afterward.
2. Blendshape scores (`mouthFrown*`, `browDown*`, `eyeSquint*`, `mouthSmile*`) are smoothed over a
   rolling ~2.5s window and only produce a state change (`sad` / `confused` / `happy` / `neutral`)
   after it's sustained for ~800ms — this avoids reacting to single-frame jitter.
3. Whatever emotion state is active when you finish speaking gets appended to your transcript as a
   short tag, e.g. `"I'm fine." [facial expression while speaking: sad]`.
4. If any of sadness/confusion/happiness fires while the AI is talking or within 3 seconds after
   ("post-ai"), Darpan immediately speaks up about it unprompted — acknowledging dissatisfaction
   and adjusting its approach for sad/confused, or warmly noting you seem pleased for happy.
5. If a happy/sad/confused expression fires with *no* AI turn recently in play ("ambient" — you're
   just sitting there), Darpan spontaneously comments on it too, e.g. "you look happy!" Both (4)
   and (5) share a 20s cooldown so it can't comment back-to-back.
6. If the reaction is strong enough *mid-answer* (a higher bar than (4)/(5)), the AI's speech is
   cut immediately and it's asked to try again with a different explanation — with its own 20s
   cooldown, separate from (4)/(5)'s.

Toggle the **Debug** button (browser-tab mode only) to see live blendshape-derived scores. In
either mode, low-frequency diagnostic events (state changes, reactions, turns) are mirrored to the
backend terminal as `[browser] [...]` lines via `POST /api/debug-log` — handy since DevTools inside
the small bubble window is painful to read from. High-frequency per-frame logging is off by default;
enable it from the bubble's own DevTools console with `localStorage.setItem("darpan:verbose", "1")`
then reload.

## Overlay mode (Loom-style floating bubble + Claude Code bridge)

Darpan can also run as a small, always-on-top, draggable circular bubble — like Loom's camera
bubble — that sits over your other apps while you work. It shows just your live webcam (click the
🎤/🔇 icon that appears on hover to mute, the × to quit); underneath, the same STT/emotion/LLM
pipeline from the full call view keeps running silently. If you verbally vent frustration at your
coding agent's output — in English, Hindi, or Hinglish, e.g. "what the hell have you made" or
"kitna bura lag raha hai" — Darpan detects it, shows a ~1.5s cancelable countdown toast beneath the
bubble, and (if not canceled) types a cleaned-up version of your complaint into **VS Code's
integrated terminal** and presses Enter, as if you'd sent it to your Claude Code session yourself,
then has the avatar speak a one-line acknowledgement (audio only — no avatar is shown in this mode).

```bash
npm run dev:desktop
```

This starts the backend, the Vite dev server, waits for it to be ready, then launches the Electron
overlay window straight into the bubble (no "Start call" step — it opens and starts immediately).
The regular browser-tab flow (`npm run dev` → open `http://localhost:5173` → "Start call") still
shows the full call UI (avatar, captions, controls, debug panel) and is unaffected by this mode.

**Requirements (macOS only):**
- The injection mechanism uses AppleScript (`System Events keystroke`) to activate VS Code and
  type into whatever's currently focused there — it does **not** know whether VS Code's terminal
  is actually focused, so make sure it is before relying on this.
- The first time it runs, macOS will prompt for **Accessibility permission** for whichever process
  is running the dev command (usually your terminal app, e.g. Terminal/iTerm/VS Code itself). Grant
  it via **System Settings → Privacy & Security → Accessibility**, then try again.
- This is inherently fragile: if the wrong window is focused, or VS Code isn't running, the
  keystrokes go wherever focus happens to be. There's no target-app picker in v1 — it's hardcoded
  to VS Code.

Regular browser-tab mode (`npm run dev`) still works independently and is unaffected by this.

## Project layout

- `server/src/routes/chat.ts` — proxies `POST /api/chat` to Sarvam chat completions, streaming SSE
  straight through to the browser.
- `server/src/routes/classify.ts` — `POST /api/classify-frustration`, an LLM classifier that
  decides whether a transcript is frustration directed at a coding agent's work, in any language.
- `server/src/routes/inject.ts` + `server/src/lib/terminalInjector.ts` — `POST /api/inject`, which
  runs the AppleScript that types into VS Code.
- `server/src/ws/sttRelay.ts` — bridges `/ws/stt` to Sarvam's realtime STT WebSocket.
- `server/src/ws/ttsRelay.ts` — bridges `/ws/tts` to Sarvam's Bulbul v3 streaming TTS WebSocket,
  and supports a `{"type":"stop"}` control message for face-triggered barge-in.
- `web/src/lib/emotionEngine.ts` — the debounced, baseline-calibrated facial emotion state machine;
  fires `onReaction(state, "post-ai" | "ambient")` and `onBargeIn()`.
- `web/src/lib/debugLog.ts` — mirrors low-frequency diagnostic logs to the backend terminal.
- `web/src/hooks/useConversation.ts` — the turn loop: transcript → chat completions (SSE) → TTS →
  playback, plus emotion-reaction and barge-in handling.
- `web/src/hooks/useFrustrationBridge.ts` — the verbal-frustration → countdown toast → `/api/inject`
  pipeline described above.
- `desktop/src/main.js` — the Electron main process for the floating always-on-top window.
