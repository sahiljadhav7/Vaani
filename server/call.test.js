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

test('a disconnected Seat stays reserved for its Participant', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  assert.equal(call.disconnect('agent', 'tab-1'), true);
  assert.deepEqual(call.join('agent', 'tab-2'), { ok: false, error: 'seat-taken' });
  assert.equal(call.join('agent', 'tab-1').ok, true);
});

test('a disconnect from someone not holding the Seat changes nothing', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  assert.equal(call.disconnect('agent', 'tab-2'), false);
  assert.equal(call.disconnect('admin', 'tab-1'), false);
  assert.deepEqual(call.join('agent', 'tab-2'), { ok: false, error: 'seat-taken' });
});

test('a rejoin keeps callStartedAt, and peerPresent means the other side is online', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const call = createCall();
  call.join('agent', 'tab-1');
  call.join('customer', 'tab-2');
  t.mock.timers.tick(5000);
  call.disconnect('customer', 'tab-2');
  call.disconnect('agent', 'tab-1');
  assert.deepEqual(call.join('agent', 'tab-1'), { ok: true, peerPresent: false, callStartedAt: 1000, transcript: [] });
  assert.deepEqual(call.join('customer', 'tab-2'), { ok: true, peerPresent: true, callStartedAt: 1000, transcript: [] });
});

test('the same Participant joining while still online takes the Seat over', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  assert.equal(call.join('agent', 'tab-1').ok, true);
});

test('a Message is trimmed and stamped with id, sender and time', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const call = createCall();
  assert.deepEqual(call.addEntry('message', 'agent', '  hello  '), { id: 1, kind: 'message', from: 'agent', text: 'hello', at: 1000 });
  assert.equal(call.addEntry('message', 'customer', 'hi').id, 2);
});

test('an empty, too long or non-text Message is dropped', () => {
  const call = createCall();
  for (const text of [undefined, null, 42, ['hi'], {}, '', '   ', 'x'.repeat(1001)]) {
    assert.equal(call.addEntry('message', 'agent', text), null, JSON.stringify(text));
  }
  const longest = call.addEntry('message', 'agent', 'x'.repeat(1000));
  assert.deepEqual(call.join('agent', 'tab-1').transcript, [longest]);
});

test('the Transcript keeps only the last 200 entries', () => {
  const call = createCall();
  for (let i = 1; i <= 201; i++) call.addEntry('message', 'agent', `line ${i}`);
  const { transcript } = call.join('agent', 'tab-1');
  assert.equal(transcript.length, 200);
  assert.equal(transcript[0].text, 'line 2');
  assert.equal(transcript.at(-1).text, 'line 201');
});

test('a Participant who rejoins during the Grace Period gets the whole Transcript back', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  call.join('customer', 'tab-2');
  const first = call.addEntry('message', 'customer', 'my order is late');
  call.disconnect('customer', 'tab-2');
  const second = call.addEntry('message', 'agent', 'are you there?');
  assert.deepEqual(call.join('customer', 'tab-2').transcript, [first, second]);
});

test('the Participant already in the Call is the offerer', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  assert.equal(call.offerer, null);
  call.join('customer', 'tab-2');
  assert.equal(call.offerer, 'agent');
});

test('after a refresh the side that stayed is the offerer', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  call.join('customer', 'tab-2');
  call.disconnect('agent', 'tab-1');
  call.join('agent', 'tab-1');
  assert.equal(call.offerer, 'customer');
});

test('a rejoin while the other side is in its Grace Period leaves the offerer alone', () => {
  const call = createCall();
  call.join('agent', 'tab-1');
  call.join('customer', 'tab-2');
  call.disconnect('customer', 'tab-2');
  call.disconnect('agent', 'tab-1');
  call.join('customer', 'tab-2');
  assert.equal(call.offerer, 'agent');
  call.join('agent', 'tab-1');
  assert.equal(call.offerer, 'customer');
});

test('an Utterance joins the same Transcript as a Message, in time order', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const call = createCall();
  const typed = call.addEntry('message', 'customer', 'my order is late');
  t.mock.timers.tick(500);
  const spoken = call.addEntry('utterance', 'agent', ' aapka order kal tak aa jayega ');
  assert.deepEqual(spoken, { id: 2, kind: 'utterance', from: 'agent', text: 'aapka order kal tak aa jayega', at: 1500 });
  assert.deepEqual(call.join('agent', 'tab-1').transcript, [typed, spoken]);
});
