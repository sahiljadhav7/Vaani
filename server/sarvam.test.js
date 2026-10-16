import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSarvamStream, isAudioChunk } from './sarvam.js';

class FakeSocket extends EventEmitter {
  static OPEN = 1;
  static opened = [];
  constructor(url, options) {
    super();
    Object.assign(this, { url, options, sent: [], readyState: 0 });
    FakeSocket.opened.push(this);
  }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() { this.closedByUs = true; }
  open() { this.readyState = 1; this.emit('open'); }
  receive(msg) { this.emit('message', Buffer.from(JSON.stringify(msg))); }
  drop(code) { this.readyState = 3; this.emit('close', code, Buffer.from('')); }
}

function setup() {
  FakeSocket.opened = [];
  const seen = { text: [], failed: 0 };
  const stream = createSarvamStream({
    key: 'k',
    Socket: FakeSocket,
    onText: (text, final) => seen.text.push([text, final]),
    onFail: () => seen.failed++,
  });
  return { stream, seen, sockets: FakeSocket.opened };
}

const chunk = Buffer.from(new Int16Array([1, -1, 300]).buffer);

test('the first audio opens one socket in English with the key, and audio sent while opening is not lost', () => {
  const { stream, sockets } = setup();
  stream.send(chunk);
  stream.send(chunk);
  assert.equal(sockets.length, 1);
  assert.match(sockets[0].url, /speech-to-text-realtime\/ws\?.*language_code=en-IN/);
  assert.equal(sockets[0].options.headers['Api-Subscription-Key'], 'k');
  sockets[0].open();
  stream.send(chunk);
  assert.deepEqual(sockets[0].sent, Array(3).fill({ event: 'audio_input', audio: chunk.toString('base64') }));
});

test('a partial is a live Subtitle and a final is an Utterance', () => {
  const { stream, seen, sockets } = setup();
  stream.send(chunk);
  sockets[0].open();
  sockets[0].receive({ event: 'session.begin' });
  sockets[0].receive({ event: 'transcript.partial', text: 'मेरा नाम', language: 'hi-IN' });
  sockets[0].receive({ event: 'transcript.final', text: 'मेरा नाम सहिल है', language: 'hi-IN' });
  sockets[0].receive({ event: 'transcript.partial', text: 'x'.repeat(1500) });
  sockets[0].receive({ event: 'transcript.final', text: 'y'.repeat(1500) });
  assert.deepEqual(seen.text, [['मेरा नाम', false], ['मेरा नाम सहिल है', true], ['x'.repeat(1000), false], ['y'.repeat(1000), true]]);
});

test('a rejected key fails once, and audio after that opens nothing', () => {
  const { stream, seen, sockets } = setup();
  stream.send(chunk);
  sockets[0].open();
  sockets[0].receive({ event: 'error', code: 'invalid_subscription_key', is_fatal: true, status_code: 401 });
  sockets[0].drop(1003);
  stream.send(chunk);
  assert.equal(seen.failed, 1);
  assert.equal(sockets.length, 1);
});

test('a socket that never opens is a failure too', () => {
  const { stream, seen } = setup();
  stream.send(chunk);
  FakeSocket.opened[0].drop(1006);
  assert.equal(seen.failed, 1);
});

test('a non-fatal error carries on', () => {
  const { stream, seen, sockets } = setup();
  stream.send(chunk);
  sockets[0].open();
  sockets[0].receive({ event: 'error', code: 'invalid_config', is_fatal: false });
  assert.equal(seen.failed, 0);
});

test('a long Mute times the socket out quietly, and the next audio opens a new one', () => {
  const { stream, seen, sockets } = setup();
  stream.send(chunk);
  sockets[0].open();
  sockets[0].receive({ event: 'error', code: 'inactivity_timeout', is_fatal: true, status_code: 408 });
  sockets[0].drop(1008);
  stream.send(chunk);
  assert.equal(seen.failed, 0);
  assert.equal(sockets.length, 2);
});

test('a session Sarvam ends normally is reopened by the next audio', () => {
  const { stream, seen, sockets } = setup();
  stream.send(chunk);
  sockets[0].open();
  sockets[0].drop(1000);
  stream.send(chunk);
  assert.equal(seen.failed, 0);
  assert.equal(sockets.length, 2);
});

test('closing on leave is not a failure, and nothing arrives after it', () => {
  const { stream, seen, sockets } = setup();
  stream.send(chunk);
  sockets[0].open();
  stream.close();
  assert.equal(sockets[0].closedByUs, true);
  sockets[0].receive({ event: 'transcript.final', text: 'late' });
  sockets[0].drop(1000);
  stream.send(chunk);
  stream.close();
  assert.deepEqual(seen, { text: [], failed: 0 });
  assert.equal(sockets.length, 1);
});

test('stt-audio must be a whole number of 16-bit samples, at most a second long', () => {
  assert.equal(isAudioChunk(Buffer.alloc(3200)), true);
  for (const bad of [Buffer.alloc(0), Buffer.alloc(3), Buffer.alloc(32002), 'abcd', [1, 2], { length: 2 }, null]) {
    assert.equal(isAudioChunk(bad), false, String(bad?.length));
  }
});
