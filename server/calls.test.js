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

test('a Customer needs a link, and a link cannot take the Agent Seat', () => {
  const calls = createCalls();
  assert.deepEqual(calls.join(undefined, 'customer', 'tab-1'), { ok: false, error: 'invalid' });
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  calls.leave(callId, 'agent', 'tab-1');
  const again = calls.join(undefined, 'agent', 'tab-2').callId;
  calls.join(again, 'customer', 'tab-3');
  calls.leave(again, 'agent', 'tab-2'); // the Agent Seat is empty, the Customer still holds theirs
  assert.deepEqual(calls.join(again, 'agent', 'tab-4'), { ok: false, error: 'invalid' });
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

test('once both Seats are empty the Call is gone and its link stops working', () => {
  const calls = createCalls();
  const { callId } = calls.join(undefined, 'agent', 'tab-1');
  calls.join(callId, 'customer', 'tab-2');
  calls.leave(callId, 'agent', 'tab-1');
  assert.equal(calls.join(callId, 'customer', 'tab-3').error, 'seat-taken'); // still alive: the Customer is in it
  calls.leave(callId, 'customer', 'tab-2');
  assert.deepEqual(calls.join(callId, 'customer', 'tab-3'), { ok: false, error: 'call-not-found' });
});

test('a failed start leaves no Call behind', () => {
  const calls = createCalls();
  assert.deepEqual(calls.join(undefined, 'agent', ''), { ok: false, error: 'invalid' });
  assert.equal(calls.size, 0);
});
