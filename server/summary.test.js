import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTranscript, summarise } from './summary.js';

const entry = (over) => ({ id: 1, kind: 'message', from: 'customer', text: 'my order is late', at: 1700000000000, ...over });

test('a Transcript is a non-empty array of transcript-entry objects', () => {
  for (const data of [
    [entry()],
    [entry(), entry({ id: 2, kind: 'utterance', from: 'agent', text: 'मैं देखता हूँ' })],
    Array.from({ length: 200 }, (_, i) => entry({ id: i, text: 'x'.repeat(1000) })),
  ]) {
    assert.equal(isTranscript(data), true);
  }
});

test('anything else is not a Transcript', () => {
  for (const data of [
    null, undefined, 'hello', 42, {}, [],
    [null], ['hello'], [[]],
    [entry({ kind: 'note' })],
    [entry({ from: 'admin' })],
    [entry({ text: 42 })],
    [entry({ text: 'x'.repeat(1001) })],
    [entry({ at: 'yesterday' })],
    Array.from({ length: 201 }, () => entry()),
  ]) {
    assert.equal(isTranscript(data), false, JSON.stringify(data)?.slice(0, 80));
  }
});

function fakeFetch(reply, status = 200) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: status === 200, status, json: async () => reply };
  };
  return { fetch, calls };
}

const geminiReply = (bullets) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(bullets) }] } }] });

test('summarise sends the Transcript to Gemini with the key and an English-only instruction', async () => {
  const { fetch, calls } = fakeFetch(geminiReply(['Order late', 'Agent checked', 'Refund next']));
  await summarise([entry(), entry({ kind: 'utterance', from: 'agent', text: 'I will check' })], { key: 'k', fetch });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/);
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'k');
  const prompt = calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Customer: my order is late/);
  assert.match(prompt, /Agent: I will check/);
  assert.match(calls[0].body.systemInstruction.parts[0].text, /English/);
});

test('summarise returns 3 to 5 bullets', async () => {
  const { fetch } = fakeFetch(geminiReply(['a', 'b', 'c', 'd', 'e', 'f']));
  assert.deepEqual(await summarise([entry()], { key: 'k', fetch }), ['a', 'b', 'c', 'd', 'e']);
});

test('summarise throws when Gemini fails or replies with something unusable', async () => {
  for (const [reply, status] of [
    [{ error: { message: 'quota' } }, 429],
    [{ candidates: [] }, 200],
    [{ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }, 200],
    [geminiReply(['only one']), 200],
    [geminiReply(['a', 'b', 42]), 200],
  ]) {
    const { fetch } = fakeFetch(reply, status);
    await assert.rejects(summarise([entry()], { key: 'k', fetch }));
  }
});
