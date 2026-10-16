import { randomUUID } from 'node:crypto';
import { createCall } from './call.js';

const GRACE_PERIOD_MS = 15_000;

// Every live Call by its id (ADR 0002). onGraceExpired(callId, role) runs after a Grace Period ends the Call.
export function createCalls(onGraceExpired = () => {}) {
  const calls = new Map(); // callId -> { call, timers: role -> Grace Period timer }; a Map, so '__proto__' is just an unknown key
  // shortcut: ended ids are kept for the life of the process; prune them by age if the server runs for weeks.
  const ended = new Set();

  function join(callId, role, sessionId) {
    if (callId === undefined) {
      // No link: an Agent starts a new Call and takes its Seat in the same step, so no empty Call is left behind.
      if (role !== 'agent') return { ok: false, error: 'invalid' };
      const id = randomUUID();
      const call = createCall();
      const result = call.join(role, sessionId);
      if (!result.ok) return result;
      calls.set(id, { call, timers: {} });
      return { ...result, callId: id };
    }
    if (typeof callId !== 'string') return { ok: false, error: 'invalid' };
    const entry = calls.get(callId);
    if (!entry) return { ok: false, error: ended.has(callId) ? 'call-ended' : 'call-not-found' };
    const result = entry.call.join(role, sessionId);
    if (!result.ok) return result;
    clearTimeout(entry.timers[role]);
    delete entry.timers[role];
    return { ...result, callId };
  }

  function leave(callId, role, sessionId) {
    const entry = calls.get(callId);
    if (!entry?.call.disconnect(role, sessionId)) return false;
    clearTimeout(entry.timers[role]);
    entry.timers[role] = setTimeout(() => {
      end(callId);
      onGraceExpired(callId, role);
    }, GRACE_PERIOD_MS);
    return true;
  }

  function end(callId) {
    const entry = calls.get(callId);
    if (!entry) return;
    Object.values(entry.timers).forEach(clearTimeout); // so a stale timer can't end a later Call
    calls.delete(callId);
    ended.add(callId);
  }

  function addEntry(callId, kind, role, text) {
    return calls.get(callId)?.call.addEntry(kind, role, text) ?? null;
  }

  function offerer(callId) {
    return calls.get(callId)?.call.offerer ?? null;
  }

  return { join, leave, end, addEntry, offerer, get size() { return calls.size; } };
}
