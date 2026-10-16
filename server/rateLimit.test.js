import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimit } from './rateLimit.js';

test('allows up to the limit in a window, then refuses until the window ends', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const allow = createRateLimit(3, 1000);
  assert.deepEqual([allow(), allow(), allow(), allow()], [true, true, true, false]);
  t.mock.timers.tick(999);
  assert.equal(allow(), false);
  t.mock.timers.tick(1);
  assert.deepEqual([allow(), allow(), allow(), allow()], [true, true, true, false]);
});
