import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createCalls } from './calls.js';
import { isSignal } from './signal.js';
import { isMute } from './mute.js';

const app = express();
const httpServer = createServer(app);
// An array (not a string) so other origins get no Access-Control-Allow-Origin header at all.
const io = new Server(httpServer, {
  cors: { origin: [process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'] },
});

const calls = createCalls();

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function') return;
    if (socket.data.role) return ack({ ok: false, error: 'invalid' }); // this socket already holds a Seat
    const result = calls.join(data?.callId, data?.role, data?.sessionId);
    console.log('[join]', socket.id, data?.role, result.ok ? result.callId : result.error);
    if (!result.ok) return ack(result);

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

  socket.on('end-call', () => {
    const { callId, role } = socket.data;
    if (!role) return;
    calls.end(callId);
    io.to(callId).emit('call-ended', { reason: 'ended', by: role });
    // After the emit, or it reaches nobody. Copied because leave() changes the room's Set.
    for (const id of [...(io.sockets.adapter.rooms.get(callId) ?? [])]) {
      const s = io.sockets.sockets.get(id);
      s.leave(callId);
      s.data = {};
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('disconnected', socket.id, reason);
    if (socket.data.role) calls.leave(socket.data.callId, socket.data.role, socket.data.sessionId);
  });
});

const port = process.env.PORT ?? 3001;
httpServer.listen(port, () => console.log(`server on :${port}`));
