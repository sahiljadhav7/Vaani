import { Alert, Button, Container, Stack, Typography } from '@mui/material'

export default function Landing({ onJoin, joining, server, error }) {
  const disabled = joining || server !== 'up'
  return (
    <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
      <Typography variant="h3" component="h1" gutterBottom>Voice Chat</Typography>
      <Stack direction="row" spacing={2} justifyContent="center" sx={{ my: 4 }}>
        <Button variant="contained" size="large" disabled={disabled} onClick={() => onJoin('customer')}>
          Join as Customer
        </Button>
        <Button variant="contained" size="large" disabled={disabled} onClick={() => onJoin('agent')}>
          Join as Agent
        </Button>
      </Stack>
      {server === 'down' && <Alert severity="warning">Can't reach the server. Retrying…</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
    </Container>
  )
}
