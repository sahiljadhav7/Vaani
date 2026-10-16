import WebSocket from 'ws';
import { TEXT_MAX } from './call.js';

const SARVAM_URL = 'wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=en-IN&sample_rate=16000&encoding=linear16';
const CHUNK_MAX = 32000; // one second of 16 kHz Int16; the client sends about 100 ms

// An `stt-audio` payload per Events.md: raw Int16 PCM, which Socket.io hands over as a Buffer.
export function isAudioChunk(data) {
  return Buffer.isBuffer(data) && data.length > 0 && data.length % 2 === 0 && data.length <= CHUNK_MAX;
}

// One Participant's Sarvam realtime socket (ADR 0001), opened by their first audio. A fatal error or an
// unexpected close calls onFail once and drops all later audio; the server then moves them to browser speech.
export function createSarvamStream({ key, onText, onFail, Socket = WebSocket }) {
  let ws = null;
  let pending = []; // audio that arrived while the socket was still opening
  let done = false;

  function fail(reason) {
    if (done) return;
    done = true;
    console.warn('[sarvam] failed:', reason);
    ws?.close();
    onFail();
  }

  function open() {
    const s = new Socket(SARVAM_URL, { headers: { 'Api-Subscription-Key': key }, handshakeTimeout: 10_000 });
    s.on('open', () => {
      pending.forEach((msg) => s.send(msg));
      pending = [];
    });
    s.on('message', (data) => {
      if (done) return;
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (typeof msg.text === 'string' && msg.event === 'transcript.partial') onText(msg.text.slice(-TEXT_MAX), false);
      if (typeof msg.text === 'string' && msg.event === 'transcript.final') onText(msg.text.slice(0, TEXT_MAX), true);
      if (msg.event === 'error' && msg.is_fatal && msg.code !== 'inactivity_timeout') fail(msg.message);
    });
    s.on('error', (err) => console.warn('[sarvam]', err.message)); // a close always follows
    s.on('close', (code, reason) => {
      ws = null;
      // 1008: no audio for 60 s, as during a long Mute; 1000: Sarvam ended the session. The next chunk opens a new one.
      if (code !== 1008 && code !== 1000) fail(`closed ${code} ${reason}`);
    });
    return s;
  }

  function send(chunk) {
    if (done) return;
    ws ??= open();
    const msg = JSON.stringify({ event: 'audio_input', audio: chunk.toString('base64') });
    if (ws.readyState === Socket.OPEN) ws.send(msg);
    else pending.push(msg);
  }

  // The Participant left or the Call ended. Safe to call twice.
  function close() {
    done = true;
    ws?.close();
  }

  return { send, close };
}
