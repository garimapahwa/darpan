import { base64ToArrayBuffer } from "./pcm";

const MIME = "audio/mpeg";

/**
 * Streams base64 mp3 chunks (as they arrive from Bulbul TTS) into an
 * <audio> element via MediaSource Extensions, and exposes a live amplitude
 * reading (via an AnalyserNode) for driving the avatar's mouth animation.
 */
export class AudioStreamPlayer {
  private audioEl: HTMLAudioElement;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private pendingChunks: ArrayBuffer[] = [];
  private ended = false;
  private objectUrl: string | null = null;

  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private amplitudeData: Uint8Array | null = null;

  onEnded: (() => void) | null = null;

  constructor() {
    this.audioEl = new Audio();
    this.audioEl.autoplay = true;
    this.audioEl.addEventListener("ended", () => this.onEnded?.());
  }

  /** Begin a new synthesis turn: fresh MediaSource, ready to receive chunks. */
  start() {
    this.teardown();
    this.ended = false;
    this.mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    this.audioEl.src = this.objectUrl;

    this.mediaSource.addEventListener("sourceopen", () => {
      if (!this.mediaSource) return;
      const sb = this.mediaSource.addSourceBuffer(MIME);
      sb.mode = "sequence";
      sb.addEventListener("updateend", () => this.flushPending());
      this.sourceBuffer = sb;
      this.flushPending();
    });

    this.ensureAnalyser();
    if (this.audioCtx?.state === "suspended") this.audioCtx.resume().catch(() => {});
    this.audioEl.play().catch((err) => console.error("TTS playback blocked:", err.message));
  }

  pushChunk(base64: string) {
    const buf = base64ToArrayBuffer(base64);
    this.pendingChunks.push(buf);
    this.flushPending();
  }

  /** No more chunks coming for this turn; end the MediaSource once drained. */
  finish() {
    this.ended = true;
    this.flushPending();
  }

  /** Hard stop for barge-in: cut audio immediately. */
  stop() {
    this.teardown();
  }

  getAmplitude(): number {
    if (!this.analyser || !this.amplitudeData) return 0;
    this.analyser.getByteTimeDomainData(this.amplitudeData as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.amplitudeData.length; i++) {
      const v = (this.amplitudeData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.amplitudeData.length);
  }

  private ensureAnalyser() {
    if (this.audioCtx) return;
    this.audioCtx = new AudioContext();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.amplitudeData = new Uint8Array(this.analyser.fftSize);
    this.sourceNode = this.audioCtx.createMediaElementSource(this.audioEl);
    this.sourceNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
  }

  private flushPending() {
    const sb = this.sourceBuffer;
    if (!sb || sb.updating) return;
    if (this.pendingChunks.length > 0) {
      const chunk = this.pendingChunks.shift()!;
      try {
        sb.appendBuffer(chunk);
      } catch {
        // MediaSource likely closed mid-append (e.g. stop() raced this call); drop it.
      }
      return;
    }
    if (this.ended && this.mediaSource?.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // ignore
      }
    }
  }

  private teardown() {
    this.audioEl.pause();
    this.pendingChunks = [];
    this.sourceBuffer = null;
    if (this.mediaSource && this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // ignore
      }
    }
    this.mediaSource = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
