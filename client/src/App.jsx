import { useEffect, useState } from 'react'
import { Container, Typography } from '@mui/material'
import { socket } from './socket.js'

export default function App() {
  const [connected, setConnected] = useState(socket.connected)

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  return (
    <Container sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>Voice Chat</Typography>
      <Typography role="status" color={connected ? 'success.main' : 'text.secondary'}>
        {connected ? 'socket connected' : 'socket connecting…'}
      </Typography>
    </Container>
  )
}
