import { useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, Container, Paper, Stack, TextField, Typography } from '@mui/material'
import Mic from '@mui/icons-material/Mic'
import MicOff from '@mui/icons-material/MicOff'
import CallEnd from '@mui/icons-material/CallEnd'
import { socket } from './socket.js'
import Landing from './Landing.jsx'
import { Duration, Label, Tile } from './Call.jsx'

const ROLE_NAME = { customer: 'Customer', agent: 'Agent' }
const STATUS_TEXT = { waiting: 'Waiting', connecting: 'Connecting…', connected: 'Connected' }
// Opened from a Call Link: you join that Call as the Customer. Otherwise you start one as the Agent.
const linkCallId = new URLSearchParams(location.search).get('call')
const role = linkCallId ? 'customer' : 'agent'

function micError(err) {
  if (err.name === 'NotAllowedError') return 'Microphone access was denied. Allow it in your browser to join.'
  if (err.name === 'NotFoundError') return 'No microphone found. Connect one and try again.'
  return "The microphone couldn't be started. Try again."
}

// Stops the mic (the browser's mic indicator turns off) and closes the connection. Safe to call twice.
function hangUp(pc) {
  pc?.getSenders().forEach((sender) => sender.track?.stop())
  pc?.close()
}

export default function App() {
  const [server, setServer] = useState(socket.connected ? 'up' : 'pending') // up | pending | down
  const [status, setStatus] = useState('idle') // idle | joining | waiting | connecting | connected | ended
  const [callId, setCallId] = useState(null)
  const [callStartedAt, setCallStartedAt] = useState(null)
  const [mic, setMic] = useState(null) // your mic stream
  const [peerStream, setPeerStream] = useState(null) // the other Participant's audio
  const [muted, setMuted] = useState(false)
  const [peerMuted, setPeerMuted] = useState(false)
  const [endedBy, setEndedBy] = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const pcRef = useRef(null) // the RTCPeerConnection for this Call
  const audioRef = useRef(null) // the <audio> element that plays the other Participant

  useEffect(() => {
    const onConnect = () => setServer('up')
    const onDisconnect = () => setServer('pending')
    const onConnectError = () => setServer('down')
    // The side already waiting makes the offer; the newcomer only answers.
    const onPeerJoined = async ({ callStartedAt }) => {
      setCallStartedAt(callStartedAt)
      setStatus('connecting')
      setPeerMuted(false)
      // A mute made while Waiting reached nobody, so tell the newcomer.
      socket.emit('mute', { muted: pcRef.current.getSenders().some((s) => s.track && !s.track.enabled) })
      const offer = await pcRef.current.createOffer()
      await pcRef.current.setLocalDescription(offer)
      socket.emit('signal', { description: pcRef.current.localDescription })
    }
    const handleSignal = async ({ description, candidate }) => {
      const pc = pcRef.current
      if (description) {
        await pc.setRemoteDescription(description)
        if (description.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer())
          socket.emit('signal', { description: pc.localDescription })
        }
      } else if (candidate) {
        await pc.addIceCandidate(candidate)
      }
    }
    // One signal at a time, in arrival order: a candidate must wait until the remote description is set.
    let signals = Promise.resolve()
    const onSignal = (data) => {
      signals = signals.then(() => handleSignal(data)).catch((err) => console.error('[signal]', err))
    }
    const onPeerMuted = ({ muted }) => setPeerMuted(muted)
    const onCallEnded = ({ by }) => {
      hangUp(pcRef.current)
      setEndedBy(by)
      setStatus('ended')
    }
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('peer-joined', onPeerJoined)
    socket.on('signal', onSignal)
    socket.on('peer-muted', onPeerMuted)
    socket.on('call-ended', onCallEnded)
    if (socket.connected) onConnect() // it may have connected before we subscribed
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('peer-joined', onPeerJoined)
      socket.off('signal', onSignal)
      socket.off('peer-muted', onPeerMuted)
      socket.off('call-ended', onCallEnded)
    }
  }, [])

  function createPeer(stream) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('signal', { candidate: event.candidate })
    }
    pc.ontrack = (event) => {
      audioRef.current.srcObject = event.streams[0]
      setPeerStream(event.streams[0])
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('connected')
    }
    pcRef.current = pc
  }

  async function join() {
    setError(null)
    setStatus('joining')
    let stream
    try {
      // The mic comes first: someone who denies it must not hold a Seat.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setStatus('idle')
      setError(micError(err))
      return
    }

    const sessionId = crypto.randomUUID()
    let res
    try {
      res = await socket.timeout(5000).emitWithAck('join', { callId: linkCallId ?? undefined, role, sessionId })
    } catch {
      // The server may have seated us after all; reconnecting frees that Seat.
      socket.disconnect().connect()
      res = { ok: false, error: 'unreachable' }
    }
    if (!res.ok) {
      stream.getTracks().forEach((track) => track.stop())
      setStatus('idle')
      setError({
        'seat-taken': `${ROLE_NAME[role]} already connected`,
        'call-not-found': "This Call link isn't valid, or the Call has ended.",
        unreachable: "Can't reach the server. Try again.",
      }[res.error] ?? "Couldn't join the Call. Try again.")
      return
    }

    setMic(stream)
    // Before the status changes: the newcomer's connection must exist when the offer arrives.
    createPeer(stream)
    sessionStorage.setItem('call', JSON.stringify({ callId: res.callId, role, sessionId }))
    setCallId(res.callId)
    setCallStartedAt(res.callStartedAt)
    setStatus(res.peerPresent ? 'connecting' : 'waiting')
  }

  // Mute sends silence and keeps the connection; stop() would need a new getUserMedia to unmute.
  function toggleMute() {
    const next = !muted
    mic.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMuted(next)
    socket.emit('mute', { muted: next })
  }

  function endCall() {
    socket.emit('end-call')
    hangUp(pcRef.current)
    setEndedBy(role)
    setStatus('ended')
  }

  const callLink = `${location.origin}${location.pathname}?call=${callId}`
  function copyLink() {
    // If the clipboard is blocked, the link is still there to select by hand.
    navigator.clipboard?.writeText(callLink).then(() => setCopied(true), () => {})
  }

  if (status === 'idle' || status === 'joining') {
    return <Landing invited={!!linkCallId} onJoin={join} joining={status === 'joining'} server={server} error={error} />
  }

  if (status === 'ended') {
    return (
      <Container maxWidth="sm" sx={{ py: 10 }}>
        <Typography variant="h4" component="h1" role="status">Call Ended</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {endedBy === role ? 'You' : ROLE_NAME[endedBy]} ended the call
        </Typography>
      </Container>
    )
  }

  const tile = (tileRole) => {
    const you = tileRole === role
    return (
      <Tile
        role={tileRole}
        name={ROLE_NAME[tileRole]}
        you={you}
        present={you || status !== 'waiting'}
        muted={you ? muted : peerMuted}
        stream={you ? mic : peerStream}
      />
    )
  }

  return (
    <Container sx={{ py: 4 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
        <Box />
        <Duration startedAt={callStartedAt} />
        <Chip
          label={STATUS_TEXT[status]}
          variant="outlined"
          role="status"
          aria-live="polite"
          color={status === 'connected' ? 'success' : 'default'}
          sx={{ justifySelf: 'end' }}
        />
      </Box>
      {role === 'agent' && status === 'waiting' && <CallLink link={callLink} copied={copied} onCopy={copyLink} />}
      {/* The Agent is always on the left, so neither side's layout flips. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 3 }}>
        {tile('agent')}
        {tile('customer')}
      </Box>
      <Paper variant="outlined" sx={{ mt: 2, p: 2, minHeight: 160, borderRadius: '16px' }}>
        <Label>Transcript</Label>
      </Paper>
      <Stack direction="row" spacing={2} sx={{ mt: 2, justifyContent: 'flex-end' }}>
        <Button variant="outlined" size="large" onClick={toggleMute} startIcon={muted ? <MicOff /> : <Mic />}>
          {muted ? 'Unmute' : 'Mute'}
        </Button>
        <Button variant="contained" size="large" color="error" onClick={endCall} startIcon={<CallEnd />}>
          End call
        </Button>
      </Stack>
      <audio ref={audioRef} autoPlay />
    </Container>
  )
}

function CallLink({ link, copied, onCopy }) {
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 3, maxWidth: 640 }}>
      <TextField
        label="Call link: send this to the Customer"
        value={link}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { readOnly: true }, inputLabel: { shrink: true } }}
        onFocus={(e) => e.target.select()}
      />
      <Button variant="outlined" onClick={onCopy} sx={{ flexShrink: 0 }}>{copied ? 'Copied' : 'Copy link'}</Button>
    </Stack>
  )
}
