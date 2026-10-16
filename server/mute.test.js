import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMute } from './mute.js';

test('a mute payload is { muted: boolean }', () => {
  assert.equal(isMute({ muted: true }), true);
  assert.equal(isMute({ muted: false }), true);
  for (const data of [null, undefined, 'x', [], {}, { muted: 'true' }, { muted: 1 }, JSON.parse('{"__proto__": {"muted": true}}')]) {
    assert.equal(isMute(data), false, JSON.stringify(data));
  }
});
