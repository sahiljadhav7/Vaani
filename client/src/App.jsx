import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Alert, Box, Button, Chip, Container, Paper, Stack, TextField, Typography } from '@mui/material'
import Mic from '@mui/icons-material/Mic'
import MicOff from '@mui/icons-material/MicOff'
import CallEnd from '@mui/icons-material/CallEnd'
import { socket } from './socket.js'
import Landing from './Landing.jsx'
import { Duration, Label, Tile } from './Call.jsx'

const ROLE_NAME = { customer: 'Customer', agent: 'Agent' }
const STATUS_TEXT = { waiting: 'Waiting', connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting…' }

// The Call this tab is in, as { callId, role, sessionId, muted }. sessionStorage is per tab and survives a reload.
function loadCall() {
  return JSON.parse(sessionStorage.getItem('call') ?? 'null')
}
function saveCall(value) {
  if (value) sessionStorage.setItem('call', JSON.stringify(value))
  else sessionStorage.removeItem('call')
}

const linkCallId = new URLSearchParams(location.search).get('call')
const savedOnLoad = loadCall()

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
  // idle | joining | waiting | connecting | connected | reconnecting | ended
  const [status, setStatus] = useState(savedOnLoad ? 'joining' : 'idle')
  const [role, setRole] = useState(null) // set by a successful join
  const [callId, setCallId] = useState(null)
  const [callStartedAt, setCallStartedAt] = useState(null)
  const [mic, setMic] = useState(null) // your mic stream
  const [peerStream, setPeerStream] = useState(null) // the other Participant's audio
  const [muted, setMuted] = useState(false)
  const [peerMuted, setPeerMuted] = useState(false)
  const [ended, setEnded] = useState(null) // { reason, by } from call-ended; empty when you came back too late
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const pcRef = useRef(null) // the RTCPeerConnection for this Call
  const audioRef = useRef(null) // the <audio> element that plays the other Participant
  const seatSocketRef = useRef(null) // the socket.id that joined, so one connection never joins twice

  // On every (re)connect: a reload or a dropped network left a saved Call, so take its Seat back.
  const rejoin = useEffectEvent(() => {
    const saved = loadCall()
    if (saved && seatSocketRef.current !== socket.id) join(saved)
  })
  // The side already in the Call makes the offer; the newcomer only answers.
  const onPeerJoined = useEffectEvent(async ({ callStartedAt }) => {
    setCallStartedAt(callStartedAt)
    setStatus('connecting')
    setPeerMuted(false)
    socket.emit('mute', { muted })
    // The newcomer's side of any old connection is gone, so start a fresh one.
    pcRef.current?.close()
    const pc = createPeer(mic)
    await pc.setLocalDescription(await pc.createOffer())
    socket.emit('signal', { description: pc.localDescription })
  })
  const onCallEnded = useEffectEvent((data) => finish(data))
  const onTakenOver = useEffectEvent(() => finish({ reason: 'moved' }))

  useEffect(() => {
    const onConnect = () => {
      setServer('up')
      rejoin()
    }
    const onDisconnect = (reason) => {
      setServer('pending')
      // Only a takeover disconnects from the server side: another tab with this tab's sessionId took the Seat.
      if (reason === 'io server disconnect') onTakenOver()
    }
    const onConnectError = () => setServer('down')
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
    const onJoined = (data) => {
      signals = signals.then(() => onPeerJoined(data)).catch((err) => console.error('[peer-joined]', err))
    }
    const onPeerMuted = ({ muted }) => setPeerMuted(muted)
    const onPeerReconnecting = () => setStatus('reconnecting')
    const onEnded = (data) => onCallEnded(data)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('peer-joined', onJoined)
    socket.on('signal', onSignal)
    socket.on('peer-muted', onPeerMuted)
    socket.on('peer-reconnecting', onPeerReconnecting)
    socket.on('call-ended', onEnded)
    if (socket.connected) onConnect() // it may have connected before we subscribed
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('peer-joined', onJoined)
      socket.off('signal', onSignal)
      socket.off('peer-muted', onPeerMuted)
      socket.off('peer-reconnecting', onPeerReconnecting)
      socket.off('call-ended', onEnded)
    }
  }, [])

  // The <audio> element only exists on the call screen, which may render after the track arrives.
  useEffect(() => {
    const el = audioRef.current
    if (!el || !peerStream || el.srcObject === peerStream) return
    el.srcObject = peerStream
    // After a reload there was no click yet, so the browser may refuse to play sound.
    el.play().then(() => setAudioBlocked(false), () => setAudioBlocked(true))
  }, [peerStream, status])

  function createPeer(stream) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('signal', { candidate: event.candidate })
    }
    pc.ontrack = (event) => setPeerStream(event.streams[0])
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('connected')
    }
    pcRef.current = pc
    return pc
  }

  async function join(target) {
    seatSocketRef.current = socket.id
    setError(null)
    let stream = mic // still live after a dropped network; gone after a reload
    if (!stream) {
      setStatus('joining')
      try {
        // The mic comes first: someone who denies it must not hold a Seat.
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        saveCall(null)
        setStatus('idle')
        setError(micError(err))
        return
      }
    }

    const { callId, role, sessionId = crypto.randomUUID(), muted: wasMuted = false } = target
    let res
    try {
      res = await socket.timeout(5000).emitWithAck('join', { callId, role, sessionId })
    } catch {
      // Forget the saved Call first, or the reconnect below would rejoin it again.
      saveCall(null)
      // The server may have seated us after all; reconnecting frees that Seat.
      socket.disconnect().connect()
      res = { ok: false, error: 'unreachable' }
    }
    if (!res.ok) {
      hangUp(pcRef.current)
      stream.getTracks().forEach((track) => track.stop())
      setMic(null)
      saveCall(null)
      // Only a rejoin has a Call to come back to; a fresh link to an ended Call is just a dead link.
      if (res.error === 'call-ended' && target.sessionId) {
        setEnded({})
        setStatus('ended')
        return
      }
      setStatus('idle')
      const deadLink = "This Call link isn't valid, or the Call has ended."
      setError({
        'seat-taken': `${ROLE_NAME[role]} already connected`,
        'call-not-found': deadLink,
        'call-ended': deadLink,
        ...(callId && { invalid: deadLink }),
        unreachable: "Can't reach the server. Try again.",
      }[res.error] ?? "Couldn't join the Call. Try again.")
      return
    }

    // A reload brings the mic back live, so restore the mute from before it.
    stream.getAudioTracks().forEach((track) => { track.enabled = !wasMuted })
    setMuted(wasMuted)
    setMic(stream)
    // A dropped network left the old connection behind; the other side starts a fresh one too.
    pcRef.current?.close()
    // Before the status changes: the newcomer's connection must exist when the offer arrives.
    createPeer(stream)
    if (role === 'customer' && !linkCallId) history.replaceState(null, '', `?call=${res.callId}`)
    setRole(role)
    saveCall({ callId: res.callId, role, sessionId, muted: wasMuted })
    setCallId(res.callId)
    setCallStartedAt(res.callStartedAt)
    // callStartedAt is set once both Seats were filled, so an absent Participant is in a Grace Period.
    setStatus(res.peerPresent ? 'connecting' : res.callStartedAt ? 'reconnecting' : 'waiting')
    // After the server's peer-joined, so the other side's reset of the muted icon comes first.
    if (wasMuted) socket.emit('mute', { muted: true })
  }

  // Mute sends silence and keeps the connection; stop() would need a new getUserMedia to unmute.
  function toggleMute() {
    const next = !muted
    mic.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMuted(next)
    saveCall({ ...loadCall(), muted: next })
    socket.emit('mute', { muted: next })
  }

  function finish({ reason, by }) {
    hangUp(pcRef.current)
    saveCall(null)
    setEnded({ reason, by })
    setStatus('ended')
  }

  function endCall() {
    socket.emit('end-call')
    finish({ reason: 'ended', by: role })
  }

  function resumeAudio() {
    audioRef.current.play().then(() => setAudioBlocked(false), () => {})
  }

  const callLink = `${location.origin}${location.pathname}?call=${callId}`
  function copyLink() {
    // If the clipboard is blocked, the link is still there to select by hand.
    navigator.clipboard?.writeText(callLink).then(() => setCopied(true), () => {})
  }

  if (status === 'idle' || status === 'joining') {
    return (
      <Landing
        invited={!!linkCallId}
        onStart={() => join({ role: 'agent' })}
        onJoin={(callId = linkCallId) => join({ role: 'customer', callId })}
        joining={status === 'joining'}
        server={server}
        error={error}
      />
    )
  }

  if (status === 'ended') {
    const who = ended.by === role ? 'You' : ROLE_NAME[ended.by]
    return (
      <Container maxWidth="sm" sx={{ py: 10 }}>
        <Typography variant="h4" component="h1" role="status">Call Ended</Typography>
        <Typography sx={{ color: 'text.secondary', mt: 1 }}>
          {{
            ended: `${who} ended the call`,
            'grace-expired': `${who} lost connection`,
            moved: 'The Call continued in another tab.',
          }[ended.reason] ?? 'The Call ended while you were away.'}
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
        reconnecting={!you && status === 'reconnecting'}
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
      {audioBlocked && (
        <Alert severity="info" sx={{ mt: 3 }} action={<Button color="inherit" onClick={resumeAudio}>Resume audio</Button>}>
          The browser paused the call audio after the reload.
        </Alert>
      )}
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
      <audio ref={audioRef} />
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
