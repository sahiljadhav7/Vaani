import { useEffect, useRef, useState } from 'react'
import { Button, Container, Stack, TextField, Typography } from '@mui/material'
import { socket } from './socket.js'
import Landing from './Landing.jsx'

const ROLE_NAME = { customer: 'Customer', agent: 'Agent' }
const OTHER = { customer: 'agent', agent: 'customer' }
// Opened from a Call Link: you join that Call as the Customer. Otherwise you start one as the Agent.
const linkCallId = new URLSearchParams(location.search).get('call')

function micError(err) {
  if (err.name === 'NotAllowedError') return 'Microphone access was denied. Allow it in your browser to join.'
  if (err.name === 'NotFoundError') return 'No microphone found. Connect one and try again.'
  return "The microphone couldn't be started. Try again."
}

export default function App() {
  const [server, setServer] = useState(socket.connected ? 'up' : 'pending') // up | pending | down
  const [status, setStatus] = useState('idle') // idle | joining | waiting | connecting | connected
  const [role, setRole] = useState(null)
  const [callId, setCallId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const micRef = useRef(null) // the mic stream, kept for the voice call
  const pcRef = useRef(null) // the RTCPeerConnection for this Call
  const audioRef = useRef(null) // the <audio> element that plays the other Participant

  useEffect(() => {
    const onConnect = () => setServer('up')
    const onDisconnect = () => setServer('pending')
    const onConnectError = () => setServer('down')
    // The side already waiting makes the offer; the newcomer only answers.
    const onPeerJoined = async () => {
      setStatus('connecting')
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
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('peer-joined', onPeerJoined)
    socket.on('signal', onSignal)
    if (socket.connected) onConnect() // it may have connected before we subscribed
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('peer-joined', onPeerJoined)
      socket.off('signal', onSignal)
    }
  }, [])

  function createPeer() {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    micRef.current.getTracks().forEach((track) => pc.addTrack(track, micRef.current))
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('signal', { candidate: event.candidate })
    }
    pc.ontrack = (event) => {
      audioRef.current.srcObject = event.streams[0]
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('connected')
    }
    pcRef.current = pc
  }

  async function join() {
    const wanted = linkCallId ? 'customer' : 'agent'
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
      res = await socket.timeout(5000).emitWithAck('join', { callId: linkCallId ?? undefined, role: wanted, sessionId })
    } catch {
      // The server may have seated us after all; reconnecting frees that Seat.
      socket.disconnect().connect()
      res = { ok: false, error: 'unreachable' }
    }
    if (!res.ok) {
      stream.getTracks().forEach((track) => track.stop())
      setStatus('idle')
      setError({
        'seat-taken': `${ROLE_NAME[wanted]} already connected`,
        'call-not-found': "This Call link isn't valid, or the Call has ended.",
        unreachable: "Can't reach the server. Try again.",
      }[res.error] ?? "Couldn't join the Call. Try again.")
      return
    }

    micRef.current = stream
    // Before the status changes: the newcomer's connection must exist when the offer arrives.
    createPeer()
    sessionStorage.setItem('call', JSON.stringify({ callId: res.callId, role: wanted, sessionId }))
    setRole(wanted)
    setCallId(res.callId)
    setStatus(res.peerPresent ? 'connecting' : 'waiting')
  }

  const callLink = `${location.origin}${location.pathname}?call=${callId}`
  function copyLink() {
    // If the clipboard is blocked, the link is still there to select by hand.
    navigator.clipboard?.writeText(callLink).then(() => setCopied(true), () => {})
  }

  if (status === 'idle' || status === 'joining') {
    return <Landing invited={!!linkCallId} onJoin={join} joining={status === 'joining'} server={server} error={error} />
  }

  return (
    <Container sx={{ py: 6 }}>
      <Typography color="text.secondary">You are the {ROLE_NAME[role]}</Typography>
      <Typography variant="h5" role="status" aria-live="polite" sx={{ mt: 1 }}>
        {status === 'waiting'
          ? `Waiting for ${ROLE_NAME[OTHER[role]]}…`
          : status === 'connected' ? 'Connected' : 'Connecting…'}
      </Typography>
      {role === 'agent' && status === 'waiting' && <CallLink link={callLink} copied={copied} onCopy={copyLink} />}
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
