import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createCall } from './call.js';

const app = express();
const httpServer = createServer(app);
// An array (not a string) so other origins get no Access-Control-Allow-Origin header at all.
const io = new Server(httpServer, {
  cors: { origin: [process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'] },
});

const call = createCall();

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function') return;
    if (socket.data.role) return ack({ ok: false, error: 'invalid' }); // this socket already holds a Seat
    const result = call.join(data?.role, data?.sessionId);
    console.log('[join]', socket.id, data?.role, result.ok ? 'ok' : result.error);
    if (!result.ok) return ack(result);

    socket.data.role = data.role;
    socket.data.sessionId = data.sessionId;
    // The room holds only Seat holders, so tabs still on the landing page get no Call events.
    socket.join('call');
    // shortcut: always the browser speech path; ticket 09 sends 'sarvam' when the key works.
    ack({ ...result, stt: 'browser' });
    if (result.peerPresent) socket.to('call').emit('peer-joined', { callStartedAt: result.callStartedAt });
  });

  socket.on('disconnect', (reason) => {
    console.log('disconnected', socket.id, reason);
    if (socket.data.role) call.disconnect(socket.data.role, socket.data.sessionId);
  });
});

const port = process.env.PORT ?? 3001;
httpServer.listen(port, () => console.log(`server on :${port}`));
