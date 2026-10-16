import { Alert, Button, Container, Typography } from '@mui/material'

export default function Landing({ invited, onJoin, joining, server, error }) {
  const disabled = joining || server !== 'up'
  return (
    <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
      <Typography variant="h3" component="h1" gutterBottom>Voice Chat</Typography>
      <Button variant="contained" size="large" disabled={disabled} onClick={onJoin} sx={{ my: 4 }}>
        {invited ? 'Join the Call' : 'Start a Call'}
      </Button>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {invited ? "You've been invited to a Call. You'll join as the Customer." : "You'll join as the Agent and get a link to send the Customer."}
      </Typography>
      {server === 'down' && <Alert severity="warning">Can't reach the server. Retrying…</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
    </Container>
  )
}
