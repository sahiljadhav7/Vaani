import { io } from 'socket.io-client'

// Created once at module level; a socket made inside a component reconnects on every render.
export const socket = io(import.meta.env.VITE_SERVER_URL)
