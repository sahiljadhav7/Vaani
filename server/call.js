// The one Call: its two Seats and when it started. Knows nothing about Socket.io.
export function createCall() {
  const seats = { customer: null, agent: null }; // role -> sessionId of the Participant holding it
  let callStartedAt = null;

  function join(role, sessionId) {
    if (typeof role !== 'string' || !Object.hasOwn(seats, role) || typeof sessionId !== 'string' || !sessionId || sessionId.length > 100) {
      return { ok: false, error: 'invalid' };
    }
    if (seats[role]) return { ok: false, error: 'seat-taken' };
    if (Object.values(seats).includes(sessionId)) return { ok: false, error: 'invalid' };

    seats[role] = sessionId;
    const peerPresent = Object.values(seats).every(Boolean);
    if (peerPresent && callStartedAt === null) callStartedAt = Date.now();
    return { ok: true, peerPresent, callStartedAt, transcript: [] };
  }

  // shortcut: frees the Seat at once, and a new Participant can take it mid-Call (keeping callStartedAt);
  // ticket 05 replaces this with the Grace Period.
  // Returns true once both Seats are empty.
  function disconnect(role, sessionId) {
    if (seats[role] !== sessionId) return false;
    seats[role] = null;
    const empty = !seats.customer && !seats.agent;
    if (empty) callStartedAt = null;
    return empty;
  }

  return { join, disconnect };
}
