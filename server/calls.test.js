import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalls } from './calls.js';

test('an Agent without a callId starts a new Call and waits in it', () => {
  const calls = createCalls();
  const res = calls.join(undefined, 'agent', 'tab-1');
  assert.equal(res.ok, true);
  assert.match(res.callId, /^[0-9a-f-]{36}$/);
  assert.equal(res.peerPresent, false);
});

test('the Customer joins by the Call Link and the Call starts', () => {
  const calls = createCalls();
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  const res = calls.join(callId, 'customer', 'tab-2');
  assert.equal(res.ok, true);
  assert.equal(res.callId, callId);
  assert.equal(res.peerPresent, true);
});

test('an unknown callId is call-not-found, a non-string one is invalid', () => {
  const calls = createCalls();
  assert.deepEqual(calls.join('00000000-0000-0000-0000-000000000000', 'customer', 'tab-1'), { ok: false, error: 'call-not-found' });
  assert.deepEqual(calls.join('__proto__', 'customer', 'tab-1'), { ok: false, error: 'call-not-found' });
  for (const callId of [42, null, ['x'], {}]) {
    assert.deepEqual(calls.join(callId, 'customer', 'tab-1'), { ok: false, error: 'invalid' }, String(callId));
  }
});

test('a Customer needs a link, and nobody else can take a reserved Seat', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = createCalls();
  assert.deepEqual(calls.join(undefined, 'customer', 'tab-1'), { ok: false, error: 'invalid' });
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  calls.join(callId, 'customer', 'tab-2');
  calls.leave(callId, 'agent', 'tab-1');
  assert.deepEqual(calls.join(callId, 'agent', 'tab-3'), { ok: false, error: 'seat-taken' });
  calls.leave(callId, 'customer', 'tab-2');
  assert.deepEqual(calls.join(callId, 'customer', 'tab-3'), { ok: false, error: 'seat-taken' });
});

test('the Agent rejoins their own Call by link and sessionId', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = createCalls();
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  calls.leave(callId, 'agent', 'tab-1');
  assert.equal(calls.join(callId, 'agent', 'tab-1').ok, true);
});

test('two Calls are kept apart', () => {
  const calls = createCalls();
  const a = calls.join(undefined, 'agent', 'tab-1').callId;
  const b = calls.join(undefined, 'agent', 'tab-2').callId;
  assert.notEqual(a, b);
  assert.equal(calls.join(a, 'customer', 'tab-3').ok, true);
  assert.equal(calls.join(b, 'customer', 'tab-4').ok, true);
  assert.deepEqual(calls.join(a, 'customer', 'tab-5'), { ok: false, error: 'seat-taken' });
});

test('a rejoin within the Grace Period cancels its timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const expired = [];
  const calls = createCalls((...args) => expired.push(args));
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  calls.join(callId, 'customer', 'tab-2');
  calls.leave(callId, 'customer', 'tab-2');
  t.mock.timers.tick(14999);
  assert.equal(calls.join(callId, 'customer', 'tab-2').ok, true);
  t.mock.timers.tick(60000);
  assert.deepEqual(expired, []);
  assert.equal(calls.size, 1);
});

test('when the Grace Period runs out the Call ends, and a late return sees call-ended', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const expired = [];
  const calls = createCalls((...args) => expired.push(args));
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  calls.join(callId, 'customer', 'tab-2');
  calls.leave(callId, 'customer', 'tab-2');
  t.mock.timers.tick(15000);
  assert.deepEqual(expired, [[callId, 'customer']]);
  assert.equal(calls.size, 0);
  assert.deepEqual(calls.join(callId, 'customer', 'tab-2'), { ok: false, error: 'call-ended' });
  assert.deepEqual(calls.join(callId, 'agent', 'tab-1'), { ok: false, error: 'call-ended' });
});

test('when both drop, the first expiry ends the Call and clears the other timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const expired = [];
  const calls = createCalls((...args) => expired.push(args));
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  calls.join(callId, 'customer', 'tab-2');
  calls.leave(callId, 'agent', 'tab-1');
  t.mock.timers.tick(5000);
  calls.leave(callId, 'customer', 'tab-2');
  t.mock.timers.tick(60000);
  assert.deepEqual(expired, [[callId, 'agent']]);
});

test('ending a Call clears its timers, so a stale one cannot fire later', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const expired = [];
  const calls = createCalls((...args) => expired.push(args));
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  calls.join(callId, 'customer', 'tab-2');
  calls.leave(callId, 'customer', 'tab-2');
  calls.end(callId);
  t.mock.timers.tick(60000);
  assert.deepEqual(expired, []);
});

test('a failed start leaves no Call behind', () => {
  const calls = createCalls();
  assert.deepEqual(calls.join(undefined, 'agent', ''), { ok: false, error: 'invalid' });
  assert.equal(calls.size, 0);
});

test('an ended Call is gone for both and its link stops working', () => {
  const calls = createCalls();
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  calls.join(callId, 'customer', 'tab-2');
  calls.end(callId);
  assert.equal(calls.size, 0);
  assert.deepEqual(calls.join(callId, 'customer', 'tab-3'), { ok: false, error: 'call-ended' });
  calls.end(callId);
  calls.end('00000000-0000-0000-0000-000000000000');
  assert.equal(calls.join(undefined, 'agent', 'tab-1').ok, true); // a new pair can start
});

test('a Message lands only in its own Call, and an ended Call takes none', () => {
  const calls = createCalls();
  const a = calls.join(undefined, 'agent', 'tab-1').callId;
  const b = calls.join(undefined, 'agent', 'tab-2').callId;
  const entry = calls.addMessage(a, 'agent', 'hello');
  assert.equal(entry.text, 'hello');
  assert.deepEqual(calls.join(a, 'customer', 'tab-3').transcript, [entry]);
  assert.deepEqual(calls.join(b, 'customer', 'tab-4').transcript, []);
  calls.end(a);
  assert.equal(calls.addMessage(a, 'agent', 'too late'), null);
  assert.equal(calls.addMessage('nope', 'agent', 'hi'), null);
});
