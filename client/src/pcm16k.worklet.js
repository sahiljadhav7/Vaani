const RATE = 16000
const CHUNK = 1600 // 100 ms at 16 kHz, what Sarvam's examples send

// Turns the mic into 16 kHz mono Int16 PCM (Sarvam's linear16) and posts it in 100 ms chunks.
// Each output sample averages the input samples it covers, a cheap low-pass that keeps speech clear.
class Pcm16k extends AudioWorkletProcessor {
  step = sampleRate / RATE
  pos = 0
  sum = 0
  count = 0
  out = new Int16Array(CHUNK)
  length = 0

  process([input]) {
    const samples = input[0]
    if (!samples) return true
    for (const sample of samples) {
      this.sum += sample
      this.count++
      if (++this.pos < this.step) continue
      this.pos -= this.step
      this.out[this.length++] = Math.max(-1, Math.min(1, this.sum / this.count)) * 0x7fff
      this.sum = 0
      this.count = 0
      if (this.length < CHUNK) continue
      this.port.postMessage(this.out.buffer, [this.out.buffer])
      this.out = new Int16Array(CHUNK)
      this.length = 0
    }
    return true
  }
}

registerProcessor('pcm16k', Pcm16k)
