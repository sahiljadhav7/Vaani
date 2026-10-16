import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSubtitle } from './subtitle.js';

test('a subtitle payload is { text, final }, and empty text clears a Subtitle', () => {
  for (const data of [{ text: 'hello', final: false }, { text: 'hello.', final: true }, { text: '', final: false }, { text: 'x'.repeat(1000), final: true }]) {
    assert.equal(isSubtitle(data), true, JSON.stringify(data));
  }
});

test('anything else is not a subtitle', () => {
  for (const data of [
    null, undefined, 'hello', 42, [], {},
    { text: 'hello' }, { final: true },
    { text: 42, final: false }, { text: 'hello', final: 'yes' },
    { text: 'x'.repeat(1001), final: false },
    JSON.parse('{"__proto__": {"text": "hi", "final": true}}'),
  ]) {
    assert.equal(isSubtitle(data), false, JSON.stringify(data));
  }
});
