import { useEffect, useState } from 'react'
import { Avatar, Card, Chip, Stack, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import MicOff from '@mui/icons-material/MicOff'

// True while the stream is louder than background noise.
function useSpeaking(stream) {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    if (!stream) return
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    // Into the analyser only, never ctx.destination, which would play the audio a second time.
    ctx.createMediaStreamSource(stream).connect(analyser)
    // A context made without a click (after a reload) starts suspended; the next click wakes it.
    const resume = () => ctx.resume()
    window.addEventListener('pointerdown', resume)
    const samples = new Float32Array(analyser.fftSize)
    let loudAt = 0
    const id = setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length)
      // shortcut: fixed threshold tuned for a typical laptop mic; calibrate per device if quiet mics never glow.
      if (rms > 0.02) loudAt = Date.now()
      setSpeaking(Date.now() - loudAt < 300) // held briefly so the glow doesn't flicker between words
    }, 100)
    return () => {
      clearInterval(id)
      window.removeEventListener('pointerdown', resume)
      ctx.close()
    }
  }, [stream])
  return !!stream && speaking
}

export function Tile({ role, name, you, present, reconnecting, muted, stream }) {
  const speaking = useSpeaking(present ? stream : null)
  const tint = (theme, a) => alpha(theme.palette[role].main, a)
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: '22px', minHeight: 260, p: 3, gap: 1.5,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backgroundImage: (t) => `radial-gradient(ellipse at top, ${tint(t, 0.12)}, transparent 70%)`,
        opacity: present && !reconnecting ? 1 : 0.6,
      }}
    >
      <Avatar
        sx={{
          width: 96, height: 96, fontSize: 40, bgcolor: `${role}.main`, color: 'background.default',
          transition: 'box-shadow 0.2s',
          boxShadow: (t) => speaking ? `0 0 0 8px ${tint(t, 0.25)}, 0 0 0 16px ${tint(t, 0.1)}, 0 0 48px ${tint(t, 0.5)}` : 'none',
        }}
      >
        {name[0]}
      </Avatar>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="h6">{name}</Typography>
        {you && <Chip label="You" size="small" />}
      </Stack>
      {!present && <Typography sx={{ color: 'text.secondary' }}>Waiting for {name}…</Typography>}
      {reconnecting && <Typography sx={{ color: 'text.secondary' }}>Reconnecting…</Typography>}
      {present && muted && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'error.main' }}>
          <MicOff fontSize="small" />
          <Typography variant="body2">Muted</Typography>
        </Stack>
      )}
    </Card>
  )
}

// shortcut: assumes the browsers' clocks match the server's; send the server's time in the ack if devices drift.
export function Duration({ startedAt }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    // Several ticks a second so both screens roll over to the next second together.
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [startedAt])
  const secs = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  return (
    <Stack sx={{ alignItems: 'center' }}>
      <Typography sx={{ fontSize: 56, fontWeight: 300, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{mmss}</Typography>
      <Label>Call duration</Label>
    </Stack>
  )
}

export function Label({ children }) {
  return (
    <Typography sx={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled' }}>
      {children}
    </Typography>
  )
}
