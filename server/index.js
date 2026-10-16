import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
// An array (not a string) so other origins get no Access-Control-Allow-Origin header at all.
const io = new Server(httpServer, {
  cors: { origin: [process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'] },
});

io.on('connection', (socket) => {
  console.log('connected', socket.id);
  socket.on('disconnect', (reason) => console.log('disconnected', socket.id, reason));
});

const port = process.env.PORT ?? 3001;
httpServer.listen(port, () => console.log(`server on :${port}`));
