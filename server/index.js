import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createCalls } from './calls.js';
import { isSignal } from './signal.js';
import { isMute } from './mute.js';
import { isSubtitle } from './subtitle.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // A dead network is noticed in about 10 s instead of about 45 s, well inside the Grace Period.
  pingInterval: 5000,
  pingTimeout: 5000,
  // An array (not a string) so other origins get no Access-Control-Allow-Origin header at all.
  cors: { origin: [process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'] },
});

const calls = createCalls((callId, role) => closeCall(callId, 'grace-expired', role));

function roomSockets(callId) {
  return [...(io.sockets.adapter.rooms.get(callId) ?? [])].map((id) => io.sockets.sockets.get(id));
}

function release(s, callId) {
  s.data = {};
  s.leave(callId);
}

// The emit comes before release, or it reaches nobody.
function closeCall(callId, reason, by) {
  io.to(callId).emit('call-ended', { reason, by });
  for (const s of roomSockets(callId)) release(s, callId);
}

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function') return;
    if (socket.data.role) return ack({ ok: false, error: 'invalid' }); // this socket already holds a Seat
    const result = calls.join(data?.callId, data?.role, data?.sessionId);
    console.log('[join]', socket.id, data?.role, result.ok ? result.callId : result.error);
    if (!result.ok) return ack(result);

    // The same Participant on a new connection (the client noticed a dropped network before the server did):
    // forget the old socket first, so its disconnect doesn't start a Grace Period on the Seat just taken back.
    for (const s of roomSockets(result.callId)) {
      if (s.data.sessionId !== data.sessionId) continue;
      release(s, result.callId);
      s.disconnect(true);
    }
    // From here on, the Call comes from the socket, never from a payload.
    socket.data.callId = result.callId;
    socket.data.role = data.role;
    socket.data.sessionId = data.sessionId;
    // One room per Call, holding only its Seat holders, so tabs still on the landing page get no Call events.
    socket.join(result.callId);
    // shortcut: always the browser speech path; ticket 09 sends 'sarvam' when the key works.
    ack({ ...result, stt: 'browser' });
    if (result.peerPresent) socket.to(result.callId).emit('peer-joined', { callStartedAt: result.callStartedAt });
  });

  // Offer / answer / ICE, passed on unchanged to the other Participant.
  socket.on('signal', (data) => {
    if (!socket.data.role || !isSignal(data)) return; // only Seat holders, only valid signals
    socket.to(socket.data.callId).emit('signal', data);
  });

  // Muting is local (track.enabled); this only tells the other side to show the muted icon.
  socket.on('mute', (data) => {
    if (!socket.data.role || !isMute(data)) return;
    socket.to(socket.data.callId).emit('peer-muted', { muted: data.muted });
  });

  socket.on('chat-message', (data) => {
    if (!socket.data.role) return;
    const entry = calls.addEntry(socket.data.callId, 'message', socket.data.role, data?.text);
    if (entry) io.to(socket.data.callId).emit('transcript-entry', entry);
  });

  // Browser speech path: interim text is the other side's live Subtitle, a final one becomes an Utterance.
  socket.on('subtitle', (data) => {
    const { callId, role } = socket.data;
    if (!role || !isSubtitle(data)) return;
    if (!data.final) return socket.to(callId).emit('subtitle', { from: role, text: data.text });
    const entry = calls.addEntry(callId, 'utterance', role, data.text);
    if (entry) io.to(callId).emit('transcript-entry', entry);
  });

  // Only the offerer restarts ICE, so two offers never cross; if it pressed Retry itself, it gets this back.
  socket.on('retry-audio', () => {
    const { callId, role } = socket.data;
    if (!role) return;
    const offerer = calls.offerer(callId);
    roomSockets(callId).find((s) => s.data.role === offerer)?.emit('retry-audio');
  });

  socket.on('end-call', () => {
    const { callId, role } = socket.data;
    if (!role) return;
    calls.end(callId);
    closeCall(callId, 'ended', role);
  });

  socket.on('disconnect', (reason) => {
    console.log('disconnected', socket.id, reason);
    const { callId, role, sessionId } = socket.data;
    if (role && calls.leave(callId, role, sessionId)) socket.to(callId).emit('peer-reconnecting');
  });
});

const port = process.env.PORT ?? 3001;
httpServer.listen(port, () => console.log(`server on :${port}`));
