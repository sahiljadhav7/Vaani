const OTHER = { customer: 'agent', agent: 'customer' };
export const TRANSCRIPT_MAX = 200;
export const TEXT_MAX = 1000; // longest Message, Utterance or Subtitle

// The one Call: its two Seats and when it started. Knows nothing about Socket.io.
export function createCall() {
  const seats = { customer: null, agent: null }; // role -> { sessionId, online, fellBack } of the Participant holding it
  let callStartedAt = null;
  let offerer = null; // the role that got peer-joined and sends every offer, including Retry audio's
  const transcript = []; // the last TRANSCRIPT_MAX Messages and Utterances, oldest first
  let nextId = 1;

  function join(role, sessionId) {
    if (typeof role !== 'string' || !Object.hasOwn(seats, role) || typeof sessionId !== 'string' || !sessionId || sessionId.length > 100) {
      return { ok: false, error: 'invalid' };
    }
    if (seats[role] && seats[role].sessionId !== sessionId) return { ok: false, error: 'seat-taken' };
    if (seats[OTHER[role]]?.sessionId === sessionId) return { ok: false, error: 'invalid' };

    // A rejoin with the same sessionId takes the Seat back, even if its old connection still looks online.
    seats[role] = { ...seats[role], sessionId, online: true };
    const other = seats[OTHER[role]];
    if (other && callStartedAt === null) callStartedAt = Date.now();
    if (other?.online) offerer = OTHER[role];
    return { ok: true, peerPresent: !!other?.online, callStartedAt, transcript: transcript.slice() };
  }

  // The Seat stays reserved for the same sessionId. Returns true if this Participant held it.
  function disconnect(role, sessionId) {
    if (!Object.hasOwn(seats, role) || seats[role]?.sessionId !== sessionId) return false;
    seats[role].online = false;
    return true;
  }

  // A typed Message or a spoken Utterance from the Participant in `role`; null when the text isn't worth keeping.
  function addEntry(kind, role, text) {
    if (typeof text !== 'string') return null;
    text = text.trim();
    if (!text || text.length > TEXT_MAX) return null;
    const entry = { id: nextId++, kind, from: role, text, at: Date.now() };
    transcript.push(entry);
    if (transcript.length > TRANSCRIPT_MAX) transcript.shift();
    return entry;
  }

  // Sarvam failed for this Participant: browser speech for the rest of the Call, refreshes included.
  function fallBack(role) {
    if (seats[role]) seats[role].fellBack = true;
  }

  function hasFallenBack(role) {
    return !!seats[role]?.fellBack;
  }

  return { join, disconnect, addEntry, fallBack, hasFallenBack, get offerer() { return offerer; } };
}
