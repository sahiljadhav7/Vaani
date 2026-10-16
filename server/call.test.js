import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCall } from './call.js';

test('the first Participant takes a Seat and waits', () => {
  const call = createCall();
  assert.deepEqual(call.join('customer', 'tab-1'), {
    ok: true, peerPresent: false, callStartedAt: null, transcript: [],
  });
});

test('a taken Seat is turned away, even for a second tab', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  assert.deepEqual(call.join('agent', 'tab-2'), { ok: false, error: 'seat-taken' });
});

test('a bad role or sessionId is invalid', () => {
  const call = createCall();
  for (const [role, sessionId] of [
    ['admin', 'tab-1'], [undefined, 'tab-1'], ['__proto__', 'tab-1'], [['agent'], 'tab-1'],
    ['agent', ''], ['agent', 42], ['agent', 'x'.repeat(101)],
  ]) {
    assert.deepEqual(call.join(role, sessionId), { ok: false, error: 'invalid' }, `${role} / ${sessionId}`);
  }
});

test('one Participant cannot hold both Seats', () => {
  const call = createCall();
  call.join('customer', 'tab-1');
  assert.deepEqual(call.join('agent', 'tab-1'), { ok: false, error: 'invalid' });
});

test('the second Participant starts the Call', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const call = createCall();
  call.join('agent', 'tab-1');
  assert.deepEqual(call.join('customer', 'tab-2'), {
    ok: true, peerPresent: true, callStartedAt: 1000, transcript: [],
  });
});

test('a disconnect frees the Seat', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  call.disconnect('agent', 'tab-1');
  assert.equal(call.join('agent', 'tab-2').ok, true);
});

test('a disconnect from someone not holding the Seat changes nothing', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  call.disconnect('agent', 'tab-2');
  assert.deepEqual(call.join('agent', 'tab-2'), { ok: false, error: 'seat-taken' });
});

test('once both Seats empty, the next pair starts a fresh Call', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const call = createCall();
  call.join('agent', 'tab-1');
  call.join('customer', 'tab-2');
  call.disconnect('agent', 'tab-1');
  call.disconnect('customer', 'tab-2');
  assert.equal(call.join('agent', 'tab-3').callStartedAt, null);
  t.mock.timers.setTime(5000);
  assert.equal(call.join('customer', 'tab-4').callStartedAt, 5000);
});
