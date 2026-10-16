import { randomUUID } from 'node:crypto';
import { createCall } from './call.js';

// Every live Call by its id (ADR 0002). A Call is deleted once both Seats are empty.
export function createCalls() {
  const calls = new Map(); // a Map, not an object, so an id like '__proto__' is just an unknown key

  function join(callId, role, sessionId) {
    if (callId === undefined) {
      // No link: an Agent starts a new Call and takes its Seat in the same step, so no empty Call is left behind.
      if (role !== 'agent') return { ok: false, error: 'invalid' };
      const id = randomUUID();
      const call = createCall();
      const result = call.join(role, sessionId);
      if (!result.ok) return result;
      calls.set(id, call);
      return { ...result, callId: id };
    }
    if (typeof callId !== 'string') return { ok: false, error: 'invalid' };
    // shortcut: a link only takes the Customer Seat, so an Agent who refreshes loses the Call; ticket 05 adds rejoin by sessionId.
    if (role !== 'customer') return { ok: false, error: 'invalid' };
    const call = calls.get(callId);
    if (!call) return { ok: false, error: 'call-not-found' };
    const result = call.join(role, sessionId);
    return result.ok ? { ...result, callId } : result;
  }

  function leave(callId, role, sessionId) {
    if (calls.get(callId)?.disconnect(role, sessionId)) calls.delete(callId);
  }

  function end(callId) {
    calls.delete(callId);
  }

  return { join, leave, end, get size() { return calls.size; } };
}
