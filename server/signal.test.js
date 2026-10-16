import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSignal } from './signal.js';

test('a real offer, answer or ICE candidate is a signal', () => {
  for (const data of [
    { description: { type: 'offer', sdp: 'v=0..' } },
    { description: { type: 'answer', sdp: 'v=0..' } },
    { candidate: { candidate: 'candidate:1 1 udp ...', sdpMid: '0', sdpMLineIndex: 0 } },
  ]) {
    assert.equal(isSignal(data), true, JSON.stringify(data));
  }
});

test('anything else is not a signal', () => {
  for (const data of [
    null, undefined, 'x', 42, [], {},
    { description: { type: 'offer', sdp: 'v=0' }, candidate: { candidate: '' } }, // both keys
    { description: { type: 'hack', sdp: '' } }, // wrong type
    { description: { type: 'offer' } }, // no sdp
    { description: null },
    { candidate: null },
    { candidate: { candidate: 42 } },
    JSON.parse('{"__proto__": {"description": 1}}'), // inherited key, not its own
  ]) {
    assert.equal(isSignal(data), false, JSON.stringify(data));
  }
});
