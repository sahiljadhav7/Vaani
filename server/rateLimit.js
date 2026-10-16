// A fixed-window counter: allow() is true for the first `limit` calls in each `windowMs`.
export function createRateLimit(limit, windowMs) {
  let windowStart = -Infinity;
  let count = 0;
  return function allow() {
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }
    return ++count <= limit;
  };
}
