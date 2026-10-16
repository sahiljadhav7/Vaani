const OTHER = { customer: 'agent', agent: 'customer' };

// The one Call: its two Seats and when it started. Knows nothing about Socket.io.
export function createCall() {
  const seats = { customer: null, agent: null }; // role -> { sessionId, online } of the Participant holding it
  let callStartedAt = null;

  function join(role, sessionId) {
    if (typeof role !== 'string' || !Object.hasOwn(seats, role) || typeof sessionId !== 'string' || !sessionId || sessionId.length > 100) {
      return { ok: false, error: 'invalid' };
    }
    if (seats[role] && seats[role].sessionId !== sessionId) return { ok: false, error: 'seat-taken' };
    if (seats[OTHER[role]]?.sessionId === sessionId) return { ok: false, error: 'invalid' };

    // A rejoin with the same sessionId takes the Seat back, even if its old connection still looks online.
    seats[role] = { sessionId, online: true };
    const other = seats[OTHER[role]];
    if (other && callStartedAt === null) callStartedAt = Date.now();
    return { ok: true, peerPresent: !!other?.online, callStartedAt, transcript: [] };
  }

  // The Seat stays reserved for the same sessionId. Returns true if this Participant held it.
  function disconnect(role, sessionId) {
    if (!Object.hasOwn(seats, role) || seats[role]?.sessionId !== sessionId) return false;
    seats[role].online = false;
    return true;
  }

  return { join, disconnect };
}
