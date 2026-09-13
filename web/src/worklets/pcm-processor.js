// AudioWorkletProcessor: buffers incoming mono audio and posts ~100ms
// Float32 chunks back to the main thread for PCM16 encoding + upload.
const CHUNK_SIZE = 1600; // 100ms @ 16kHz

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK_SIZE);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channel = input[0];
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.offset++] = channel[i];
        if (this.offset >= CHUNK_SIZE) {
          this.port.postMessage(this.buffer.slice(0));
          this.offset = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
