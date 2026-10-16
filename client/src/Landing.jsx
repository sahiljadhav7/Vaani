import { useState } from 'react'
import { Alert, Avatar, Box, Button, Container, Link, Paper, Stack, TextField, Typography } from '@mui/material'
import FlipText from './FlipText.jsx'

// The id from a pasted Call Link (with or without https://), or the text itself when it is a bare id.
function callIdFrom(text) {
  try {
    return new URL(text, location.href).searchParams.get('call') ?? text
  } catch {
    return text
  }
}

function RoleAvatar({ role, size = 44 }) {
  return (
    <Avatar aria-hidden sx={{ width: size, height: size, fontSize: size * 0.42, bgcolor: `${role}.main`, color: 'background.default' }}>
      {role === 'agent' ? 'A' : 'C'}
    </Avatar>
  )
}

const card = { p: 3, borderRadius: '22px', display: 'flex', flexDirection: 'column', gap: 3 }
const roleButton = (role) => ({ bgcolor: `${role}.main`, color: 'background.default', '&:hover': { bgcolor: `${role}.main`, filter: 'brightness(1.1)' } })

export default function Landing({ invited, onStart, onJoin, joining, server, error }) {
  const [action, setAction] = useState(null) // 'start' | 'join': which card a returned error belongs to
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState(null)
  const disabled = joining || server !== 'up'
  const serverAlert = server === 'down' && <Alert severity="warning" sx={{ mt: 3 }}>Can't reach the server. Retrying…</Alert>

  if (invited) {
    return (
      <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}><RoleAvatar role="customer" size={104} /></Box>
        <Typography variant="h3" component="h1" sx={{ mt: 4 }}>You've been invited to a Call.</Typography>
        <Typography sx={{ color: 'text.secondary', mt: 2 }}>
          You'll join as the Customer. Your Agent is on the other end.
        </Typography>
        <Typography sx={{ color: 'text.secondary', mt: 1 }}>
          We'll ask for your microphone first. Headphones avoid echo.
        </Typography>
        <Button variant="contained" size="large" disabled={disabled} onClick={() => onJoin()} sx={{ mt: 4, px: 5, ...roleButton('customer') }}>
          Join the Call
        </Button>
        {serverAlert}
        {error && <Alert severity="error" sx={{ mt: 3, textAlign: 'left' }}>{error}</Alert>}
        <Typography sx={{ color: 'text.secondary', mt: 3 }}>
          Not expecting a call? <Link href={location.pathname} sx={{ color: 'text.primary' }}>Start your own</Link>
        </Typography>
      </Container>
    )
  }

  function start() {
    setAction('start')
    onStart()
  }

  function join(e) {
    e.preventDefault()
    setAction('join')
    const callId = callIdFrom(link.trim())
    setLinkError(callId ? null : 'Paste the Call Link your Agent sent.')
    if (callId) onJoin(callId)
  }

  const joinError = linkError ?? (action === 'join' ? error : null)
  return (
    <Container maxWidth="md" sx={{ py: 10 }}>
      <Typography variant="h3" component="h1" sx={{ textAlign: 'center' }}><FlipText>Start a Call, or join one.</FlipText></Typography>
      <Typography sx={{ color: 'text.secondary', mt: 2, textAlign: 'center' }}>
        A voice Call between an Agent and a Customer. We'll ask for your microphone first.
      </Typography>
      <Box sx={{ mt: 6, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <Paper variant="outlined" sx={card}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <RoleAvatar role="agent" />
            <Box>
              <Typography variant="h6" component="h2">Start a Call</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>You'll be the Agent, and get a Call Link to send.</Typography>
            </Box>
          </Stack>
          <Button variant="contained" size="large" disabled={disabled} onClick={start} sx={{ mt: 'auto', ...roleButton('agent') }}>
            Start a Call
          </Button>
          {action === 'start' && error && <Alert severity="error">{error}</Alert>}
        </Paper>
        <Paper variant="outlined" component="form" onSubmit={join} sx={card}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <RoleAvatar role="customer" />
            <Box>
              <Typography variant="h6" component="h2">Join a Call</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>You'll be the Customer. Paste the link your Agent sent.</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              label="Call Link"
              value={link}
              onChange={(e) => { setLink(e.target.value); setLinkError(null) }}
              error={!!joinError}
              helperText={joinError}
              fullWidth
              size="small"
              slotProps={{ formHelperText: { role: 'alert' } }}
            />
            <Button type="submit" variant="contained" disabled={disabled} sx={{ flexShrink: 0, height: 40, ...roleButton('customer') }}>
              Join
            </Button>
          </Stack>
        </Paper>
      </Box>
      {serverAlert}
      {/* A failed automatic rejoin after a reload belongs to neither card. */}
      {!action && error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
    </Container>
  )
}
