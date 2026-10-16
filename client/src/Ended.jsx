import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Container, List, ListItem, Paper, Stack, Typography } from '@mui/material'
import AddIcCall from '@mui/icons-material/AddIcCall'
import { Label, Transcript } from './Call.jsx'

const panel = { p: 2, borderRadius: '16px' }

// The Summary is made from this tab's own Transcript and shown only here, never sent to the other side.
export default function Ended({ reason, transcript, names, onStartNew }) {
  const [summary, setSummary] = useState({ state: 'idle' }) // idle | loading | done | error
  const introRef = useRef(null)
  // The call screen's focused button is gone, so a screen reader starts from the heading and reason.
  useEffect(() => introRef.current.focus(), [])

  async function summarise() {
    setSummary({ state: 'loading' })
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transcript),
      })
      if (!res.ok) throw new Error(`summary ${res.status}`)
      setSummary({ state: 'done', bullets: (await res.json()).bullets })
    } catch {
      setSummary({ state: 'error' })
    }
  }

  return (
    <Container sx={{ py: 6, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 4, alignItems: 'start' }}>
      <Box>
        <Box ref={introRef} tabIndex={-1} role="group" aria-labelledby="ended-heading ended-reason" sx={{ outline: 'none' }}>
          <Typography id="ended-heading" variant="h4" component="h1">Call Ended</Typography>
          <Typography id="ended-reason" sx={{ color: 'text.secondary', mt: 1 }}>{reason}</Typography>
        </Box>
        <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
          <Button variant="outlined" startIcon={<AddIcCall />} onClick={onStartNew}>Start new call</Button>
          <Button variant="contained" onClick={summarise} disabled={!transcript.length || summary.state === 'loading'}>Summarise</Button>
        </Stack>
      </Box>
      <Stack spacing={2}>
        {summary.state !== 'idle' && (
          <Paper variant="outlined" sx={panel} aria-live="polite">
            <Label>Summary · only you see this</Label>
            {summary.state === 'loading' && <CircularProgress size={24} aria-label="Summarising" sx={{ mt: 2 }} />}
            {summary.state === 'error' && <Alert severity="error" sx={{ mt: 1 }}>Couldn't make a Summary. Try again.</Alert>}
            {summary.state === 'done' && (
              <List dense sx={{ listStyleType: 'disc', pl: 2.5 }}>
                {summary.bullets.map((bullet, i) => (
                  <ListItem key={i} disableGutters sx={{ display: 'list-item' }}>
                    <Typography variant="body2">{bullet}</Typography>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        )}
        <Paper variant="outlined" sx={panel}>
          <Label>Transcript · {transcript.length} lines</Label>
          <Transcript entries={transcript} names={names} />
        </Paper>
      </Stack>
    </Container>
  )
}
